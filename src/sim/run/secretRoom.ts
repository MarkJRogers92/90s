/**
 * The secret back room (round 53). Some nights, one storefront concourse has
 * a suspicious vending machine against the back wall. Jiggle it (E) and it
 * swings open on a service passage: a sealed back room where the wing's own
 * monsters come in waves. Last SECRET_TICKS and the lights come on, they
 * scatter, the door opens, and a rare prize drops with a little cash.
 *
 * One try a wing: the machine is spent the moment it opens (`secretsDone`,
 * checkpointed). Seed-derived, so where it is and what it holds need no save.
 * Inside, the room is an interior with no store (`SECRET_STORE_INDEX`), so
 * the store rules (alarms, twists, shelves) leave it alone.
 */
import { PLAYFIELD_WIDTH } from '../core/geometry';
import type { EnemyState, Vec2 } from '../model';
import type { GeneratedWing, WingEnemySpawn } from '../wing/types';
import { propWalls } from '../combat/props';
import { floorNumberOf, floorSpec } from '../wing/floorSpecs';
import { publishRunFeedback, itemDefinitionName } from './economy';
import { luck } from './luck';
import { RARE_ITEM_IDS } from './drops';
import { spawnWaveMonster } from './rooms';
import { INTERIOR_ARRIVAL, INTERIOR_BOUNDS, INTERIOR_EXIT, interiorWalls } from './storeInterior';
import type { MvpCommandResult, MvpRunState } from './types';

/** How many wings hide one. */
export const SECRET_CHANCE = 0.6;
/** The interior index that means "the back room", not a store. */
export const SECRET_STORE_INDEX = 9;
/** The machine: against the back wall, right of the second shop door. */
export const SECRET_MACHINE: Vec2 = { x: 880, y: 70 };
/** How near the janitor has to be to jiggle it. */
export const SECRET_REACH = 56;
/** Twenty seconds to outlast. */
export const SECRET_TICKS = 1200;
export const SECRET_WAVE_TICKS = 240;
export const SECRET_WAVE_SIZE = 2;
export const SECRET_CASH = 15;
/** New monsters never land this near the janitor. */
const SPAWN_CLEARANCE = 160;

export type SecretSpot = { readonly roomIndex: number; readonly prize: string };

export type SecretRoomState = {
  phase: 'fight' | 'won';
  ticksLeft: number;
  waves: number;
  prize: string;
};

/** Where this wing's secret is and what it holds, or null. */
export function secretFor(wing: Pick<GeneratedWing, 'seed' | 'rooms'>): SecretSpot | null {
  if (luck(wing.seed, 'secret', 0, 0) >= SECRET_CHANCE) return null;
  const roomIndex = wing.rooms.findIndex((room) => room.store !== null && room.enemySpawns.length === 0);
  if (roomIndex < 0) return null;
  const prize = RARE_ITEM_IDS[Math.floor(luck(wing.seed, 'secret-prize', 0, 0) * RARE_ITEM_IDS.length)]!;
  return { roomIndex, prize };
}

const secretKey = (state: MvpRunState): string => `${state.roomIndex}`;

/** The machine is here, unopened, and the janitor is at it. */
export function nearSecretMachine(state: MvpRunState): boolean {
  if (state.room.interior) return false;
  const secret = secretFor(state.wing);
  if (!secret || secret.roomIndex !== state.roomIndex || state.secretsDone.includes(secretKey(state))) return false;
  const player = state.room.combat.player;
  return Math.hypot(player.x - SECRET_MACHINE.x, player.y - SECRET_MACHINE.y) <= SECRET_REACH;
}

/** Whether this room still has an unopened machine (for the view). */
export function secretMachineHere(state: MvpRunState): boolean {
  const secret = secretFor(state.wing);
  return !state.room.interior && secret !== null && secret.roomIndex === state.roomIndex && !state.secretsDone.includes(secretKey(state));
}

/** Through the service passage: the back room seals behind the janitor. */
export function enterSecretRoom(state: MvpRunState): MvpCommandResult {
  const secret = secretFor(state.wing);
  if (!secret || !nearSecretMachine(state)) return { accepted: false, reason: 'Nothing happens.' };
  state.secretsDone.push(secretKey(state));
  const combat = state.room.combat;
  state.room.interior = true;
  state.room.storeIndex = SECRET_STORE_INDEX;
  state.room.twist = null;
  state.room.tokens = [];
  state.room.secret = { phase: 'fight', ticksLeft: SECRET_TICKS, waves: 0, prize: secret.prize };
  combat.walls = [...interiorWalls({ bounds: INTERIOR_BOUNDS, exit: { id: 'secret-exit', label: 'Service passage', bounds: INTERIOR_EXIT } }), { ...INTERIOR_EXIT }];
  combat.enemies = [];
  combat.projectiles = [];
  combat.surfaces = [];
  combat.player.x = INTERIOR_ARRIVAL.x;
  combat.player.y = INTERIOR_ARRIVAL.y;
  state.stalker = null;
  state.alarm = null;
  const message = `The machine swings open: a back room! Last 20 seconds for the ${itemDefinitionName(secret.prize)}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** The back room's turn: waves while the clock runs, then the payoff, then the door. */
export function updateSecretRoom(state: MvpRunState): void {
  const secret = state.room.secret;
  if (!secret) return;
  const combat = state.room.combat;
  if (secret.phase === 'won') {
    // Out through the open door, back by the machine.
    if (combat.player.y - combat.player.radius > INTERIOR_EXIT.y + INTERIOR_EXIT.height) leaveSecretRoom(state);
    return;
  }
  if (secret.ticksLeft % SECRET_WAVE_TICKS === 0) sendWave(state, secret);
  secret.ticksLeft -= 1;
  if (secret.ticksLeft > 0) return;
  secret.phase = 'won';
  combat.enemies = [];
  combat.projectiles = combat.projectiles.filter((shot) => shot.faction === 'player');
  combat.walls = combat.walls.filter((wall) => !(wall.x === INTERIOR_EXIT.x && wall.y === INTERIOR_EXIT.y && wall.width === INTERIOR_EXIT.width && wall.height === INTERIOR_EXIT.height));
  state.cash += SECRET_CASH;
  state.inventory = { ...state.inventory, cash: state.cash };
  state.room.tokens.push({
    id: `secret-prize-${state.roomIndex}`,
    kind: 'item',
    itemDefinitionId: secret.prize,
    rare: true,
    x: PLAYFIELD_WIDTH / 2,
    y: INTERIOR_BOUNDS.y + 120,
    value: 0,
    droppedTick: state.tick,
  });
  publishRunFeedback(state, `The lights come on and they scatter. +$${SECRET_CASH}, and the ${itemDefinitionName(secret.prize)} is yours.`);
}

function sendWave(state: MvpRunState, secret: SecretRoomState): void {
  const combat = state.room.combat;
  const kinds = [...new Set(state.wing.rooms.flatMap((room) => room.enemySpawns.map((spawn) => spawn.kind)))];
  if (kinds.length === 0) return;
  const scale = floorSpec(floorNumberOf(state.wing)).enemyHealthScale;
  const player = combat.player;
  let placed = 0;
  for (let attempt = 0; attempt < 24 && placed < SECRET_WAVE_SIZE; attempt += 1) {
    const x = INTERIOR_BOUNDS.x + 60 + luck(state.seed, 'secret-x', secret.waves, attempt) * (INTERIOR_BOUNDS.width - 120);
    const y = INTERIOR_BOUNDS.y + 50 + luck(state.seed, 'secret-y', secret.waves, attempt) * (INTERIOR_BOUNDS.height - 140);
    if (Math.hypot(x - player.x, y - player.y) < SPAWN_CLEARANCE) continue;
    const kind = kinds[Math.floor(luck(state.seed, 'secret-kind', secret.waves, attempt) * kinds.length)]! as WingEnemySpawn['kind'];
    const enemy: EnemyState = spawnWaveMonster({ slotId: `secret-${secret.waves}-${placed}`, kind, x: Math.round(x), y: Math.round(y) }, combat.nextEntityId, scale);
    combat.nextEntityId += 1;
    combat.enemies.push(enemy);
    placed += 1;
  }
  combat.roomWasPopulated = true;
  secret.waves += 1;
}

/** Back on the concourse in front of the (now spent) machine. */
export function leaveSecretRoom(state: MvpRunState): void {
  const combat = state.room.combat;
  const room = state.wing.rooms[state.roomIndex]!;
  state.room.interior = false;
  state.room.storeIndex = 0;
  state.room.secret = null;
  state.room.tokens = state.room.tokens.filter((token) => token.kind !== 'item');
  combat.walls = [...room.walls.map((wall) => ({ ...wall })), ...propWalls(combat.props ?? [])];
  combat.enemies = [];
  combat.projectiles = [];
  combat.surfaces = [];
  combat.player.x = SECRET_MACHINE.x;
  combat.player.y = SECRET_MACHINE.y + 40;
  combat.player.facing = { x: 0, y: 1 };
  publishRunFeedback(state, 'Back out through the service passage.');
}
