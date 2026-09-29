/**
 * The Loss Prevention stalker: what four stars buys a wanted janitor.
 *
 * Mall security at one to three stars joins the fights. At four stars Loss
 * Prevention sends an agent who cannot be put down. He walks in through the
 * door the janitor came through a few seconds after every room change, and he
 * keeps coming: slower than the janitor, but he never stops. A touch writes
 * the janitor up (one heart), then he steps back to finish the paperwork. A
 * mop swing shoves him back and staggers him; nothing else slows him.
 *
 * The only way to lose him is to lose the Heat: lay low by clearing fights,
 * or launder hot goods at the Bench Warrant, until the janitor is below four
 * stars. He does not follow into a boss room, where the fight is the point.
 *
 * He is run state beside the room, like the car, not an enemy in the room:
 * he never locks a door, never keeps a fight from clearing, and cannot be
 * damaged by anything. Like the store alarm he is room-local and never
 * checkpointed; a restored wanted janitor is simply found again.
 *
 * Pure rules over run data; nothing here reads the renderer.
 */
import { MOP_HALF_ANGLE_RADIANS, MOP_RANGE, inAttackCone } from '../combat/attack';
import { circlesOverlap } from '../combat/collision';
import { playerDashing } from '../combat/dash';
import { moveCircle } from '../combat/movement';
import { PLAYFIELD_WIDTH, normalizedDirection } from '../core/geometry';
import { publishRunFeedback } from './economy';
import type { MvpRunState } from './types';
import { wantedStars } from './wanted';

/** Stars at which Loss Prevention stops sending guards and sends a man. */
export const STALKER_MIN_STARS = 4;
/** Three seconds from a room change to him walking through the door. */
export const STALKER_ARRIVAL_TICKS = 180;
/** 150 px/s: the janitor (210 px/s) can out-walk him, but not forever. */
export const STALKER_SPEED_PER_TICK = 150 / 60;
export const STALKER_RADIUS = 14;
/** After a write-up he steps back for this long before resuming the hunt. */
export const STALKER_WRITE_UP_TICKS = 90;
/** A mop swing staggers him for this long... */
export const STALKER_SHOVE_TICKS = 50;
/** ...and pushes him this far back. */
export const STALKER_SHOVE_DISTANCE = 44;
/** The same post-hit window every other enemy grants. */
const PLAYER_INVULNERABILITY_TICKS = 60;

export type StalkerPhase = 'arriving' | 'hunting' | 'writing_up' | 'shoved';

export type StalkerState = {
  phase: StalkerPhase;
  /** Ticks left in the current phase; unused while hunting. */
  phaseTicks: number;
  x: number;
  y: number;
  readonly radius: number;
  facingX: number;
  facingY: number;
  /** Write-ups this room, for the HUD and PA; resets on a room change. */
  writeUps: number;
};

/** True when a wanted janitor has Loss Prevention on their trail. */
export function stalkerWanted(state: Pick<MvpRunState, 'heat'>): boolean {
  return wantedStars(state.heat) >= STALKER_MIN_STARS;
}

function inBossRoom(state: MvpRunState): boolean {
  return state.wing.rooms[state.roomIndex]!.bossAnchor !== null;
}

/**
 * Where he comes in: just inside the doorway the janitor used, which is the
 * room's authored entry anchor for that side, pushed back against the wall.
 */
export function stalkerEntryPoint(state: MvpRunState): { x: number; y: number } {
  const room = state.wing.rooms[state.roomIndex]!;
  const fromWest = state.room.enteredFrom === 'west';
  const anchor = fromWest
    ? room.playerEntry
    : { x: PLAYFIELD_WIDTH - room.playerEntry.x, y: room.playerEntry.y };
  const edgeX = fromWest ? STALKER_RADIUS + 6 : PLAYFIELD_WIDTH - STALKER_RADIUS - 6;
  // Halfway between the anchor and the wall keeps him clear of door jambs.
  return { x: Math.round((anchor.x + edgeX) / 2), y: anchor.y };
}

function beginArrival(state: MvpRunState): StalkerState {
  const entry = stalkerEntryPoint(state);
  return {
    phase: 'arriving',
    phaseTicks: STALKER_ARRIVAL_TICKS,
    x: entry.x,
    y: entry.y,
    radius: STALKER_RADIUS,
    facingX: state.room.enteredFrom === 'west' ? 1 : -1,
    facingY: 0,
    writeUps: 0,
  };
}

function mopShoves(state: MvpRunState, stalker: StalkerState): boolean {
  const player = state.room.combat.player;
  if (player.attackActiveTicks <= 0) return false;
  return inAttackCone(
    player.x,
    player.y,
    player.x + player.facing.x,
    player.y + player.facing.y,
    stalker.x,
    stalker.y,
    stalker.radius,
    MOP_RANGE,
    MOP_HALF_ANGLE_RADIANS,
  );
}

function step(state: MvpRunState, stalker: StalkerState, deltaX: number, deltaY: number): void {
  const next = moveCircle(stalker, stalker.radius, deltaX, deltaY, state.room.combat.walls);
  stalker.x = next.x;
  stalker.y = next.y;
}

/**
 * One tick of Loss Prevention, run after combat so he reads this tick's swing
 * and this tick's janitor position.
 *
 * Presence is derived, never stored in a checkpoint: wanted enough and not in
 * a boss room means he is coming; otherwise he is gone.
 */
export function updateStalker(state: MvpRunState): void {
  if (!stalkerWanted(state) || inBossRoom(state)) {
    if (state.stalker && state.stalker.phase !== 'arriving') {
      publishRunFeedback(state, 'Loss Prevention lost your trail.');
    }
    state.stalker = null;
    return;
  }
  if (!state.stalker) {
    state.stalker = beginArrival(state);
    return;
  }

  const stalker = state.stalker;
  const player = state.room.combat.player;

  if (stalker.phase === 'arriving') {
    stalker.phaseTicks -= 1;
    if (stalker.phaseTicks <= 0) {
      stalker.phase = 'hunting';
      stalker.phaseTicks = 0;
      publishRunFeedback(state, 'Loss Prevention is on the floor. Keep moving.');
    }
    return;
  }

  if (stalker.phase !== 'shoved' && mopShoves(state, stalker)) {
    const away = normalizedDirection(stalker.x - player.x, stalker.y - player.y);
    const pushX = away.x === 0 && away.y === 0 ? player.facing.x : away.x;
    const pushY = away.x === 0 && away.y === 0 ? player.facing.y : away.y;
    step(state, stalker, pushX * STALKER_SHOVE_DISTANCE, pushY * STALKER_SHOVE_DISTANCE);
    stalker.phase = 'shoved';
    stalker.phaseTicks = STALKER_SHOVE_TICKS;
    return;
  }

  if (stalker.phase === 'shoved' || stalker.phase === 'writing_up') {
    stalker.phaseTicks -= 1;
    if (stalker.phaseTicks <= 0) {
      stalker.phase = 'hunting';
      stalker.phaseTicks = 0;
    }
    return;
  }

  // Hunting: walk straight at the janitor, sliding along walls.
  const direction = normalizedDirection(player.x - stalker.x, player.y - stalker.y);
  if (direction.x !== 0 || direction.y !== 0) {
    stalker.facingX = direction.x;
    stalker.facingY = direction.y;
  }
  step(state, stalker, direction.x * STALKER_SPEED_PER_TICK, direction.y * STALKER_SPEED_PER_TICK);

  const touching = circlesOverlap(player.x, player.y, player.radius, stalker.x, stalker.y, stalker.radius);
  if (touching && player.invulnerableTicks <= 0 && !playerDashing(state.room.combat) && player.health > 0) {
    player.health -= 1;
    player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
    stalker.writeUps += 1;
    stalker.phase = 'writing_up';
    stalker.phaseTicks = STALKER_WRITE_UP_TICKS;
    publishRunFeedback(state, 'Written up by Loss Prevention: -1 heart.');
  }
}
