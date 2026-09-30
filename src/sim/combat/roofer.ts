/**
 * The Roofer (Floor 4): a contractor still on the job at 3 a.m.
 *
 * It keeps its distance and lobs buckets of hot tar at where the janitor is
 * standing when it throws. The landing spot is locked at the throw and drawn
 * as a ring for the whole flight, so moving out of it dodges the splash. The
 * bucket leaves a tar puddle that slows walking (see tar.ts), so the roof
 * fills up with ground to avoid. Between throws it backs away from a janitor
 * who closes in: chase it down through the tar, or dash.
 */
import { normalizedDirection } from '../core/geometry';
import type { EnemyState, RunState } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { playerDashing } from './dash';
import { moveCircle, scaleMovementDelta } from './movement';
import { spillTar } from './tar';

export { TAR_PUDDLE_TICKS, TAR_SLOW, inTar } from './tar';

export const ROOFER_HEALTH = 20;
export const ROOFER_RADIUS = 15;
/** The bucket's flight: the landing ring shows this long before the splash. */
export const ROOFER_LOB_TICKS = 54;
export const ROOFER_RECOVER_TICKS = 80;
export const ROOFER_THROW_RANGE = 380;
/** Closer than this between throws, it backs off. */
export const ROOFER_FLEE_RANGE = 200;
export const TAR_SPLASH_RADIUS = 36;
export const TAR_SPLASH_DAMAGE = 1;
const ROOFER_WALK_SPEED_PER_TICK = 55 / 60;
const PLAYER_INVULNERABILITY_TICKS = 60;

function walk(state: RunState, enemy: EnemyState, towardX: number, towardY: number, sign: 1 | -1): void {
  const direction = normalizedDirection(towardX - enemy.x, towardY - enemy.y);
  const movement = scaleMovementDelta(
    sign * direction.x * ROOFER_WALK_SPEED_PER_TICK,
    sign * direction.y * ROOFER_WALK_SPEED_PER_TICK,
    effectiveSpeedMultiplier(enemy),
  );
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
}

/** The bucket lands: splash whoever is under it, and leave the tar. */
function land(state: RunState, x: number, y: number): void {
  const player = state.player;
  if (Math.hypot(player.x - x, player.y - y) <= TAR_SPLASH_RADIUS && player.invulnerableTicks <= 0 && !playerDashing(state)) {
    player.health -= TAR_SPLASH_DAMAGE;
    player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
  }
  spillTar(state, x, y);
}

export function updateRoofer(state: RunState, enemy: EnemyState): void {
  const player = state.player;
  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      land(state, enemy.lobX ?? player.x, enemy.lobY ?? player.y);
      enemy.phase = 'recover';
      enemy.phaseTicks = ROOFER_RECOVER_TICKS;
    }
    return;
  }
  if (enemy.phase === 'recover') {
    enemy.phaseTicks -= 1;
    if (distance < ROOFER_FLEE_RANGE) walk(state, enemy, player.x, player.y, -1);
    if (enemy.phaseTicks <= 0) enemy.phase = 'pursue';
    return;
  }
  if (distance <= ROOFER_THROW_RANGE) {
    enemy.phase = 'telegraph';
    enemy.phaseTicks = ROOFER_LOB_TICKS;
    enemy.lobX = player.x;
    enemy.lobY = player.y;
    const aim = normalizedDirection(player.x - enemy.x, player.y - enemy.y);
    enemy.telegraphAimX = aim.x === 0 && aim.y === 0 ? 1 : aim.x;
    enemy.telegraphAimY = aim.x === 0 && aim.y === 0 ? 0 : aim.y;
    return;
  }
  walk(state, enemy, player.x, player.y, 1);
}
