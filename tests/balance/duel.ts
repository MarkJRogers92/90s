/**
 * One monster against the bot in an empty arena: a clean measure of how well a
 * bot answers a single attack pattern, with nothing else in the room.
 *
 * The arena has no walls (the playfield edge still stops everyone), the janitor
 * has health to spare so every hit is counted instead of ending the duel, and
 * the monster starts at a chosen distance and bearing (pulled inside the room). `hits` is health lost
 * divided by the monster's damage per hit.
 */
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { spawnWaveMonster } from '../../src/sim/run/rooms';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { botInput, newBotMemory, type BotOptions } from './bot';

export type DuelKind = 'mascot' | 'shopper';

/** Health a hit on the janitor takes from each. */
const DAMAGE_PER_HIT: Readonly<Record<DuelKind, number>> = { mascot: 2, shopper: 1 };
const JANITOR = { x: 480, y: 240 };
/** Spawns are pulled inside the room: a monster off the playfield could never be reached. */
const SPAWN_BOUNDS = { minX: 60, maxX: 900, minY: 60, maxY: 420 };
const SPARE_HEALTH = 99;
export const DUEL_TICK_CAP = 60 * 40;

export type DuelResult = {
  /** Charges that landed. */
  readonly hits: number;
  readonly ticks: number;
  /** The monster fell before the cap. */
  readonly killed: boolean;
};

/** Plays one duel; `bearing` is the monster's angle from the janitor in radians, `distance` in pixels. */
export function duel(kind: DuelKind, options: BotOptions, bearing: number, distance: number, seed = 7): DuelResult {
  const state = createMvpRun(seed);
  const combat = state.room.combat;
  combat.walls = [];
  combat.projectiles = [];
  combat.player.x = JANITOR.x;
  combat.player.y = JANITOR.y;
  combat.player.health = SPARE_HEALTH;
  const x = Math.min(SPAWN_BOUNDS.maxX, Math.max(SPAWN_BOUNDS.minX, JANITOR.x + Math.cos(bearing) * distance));
  const y = Math.min(SPAWN_BOUNDS.maxY, Math.max(SPAWN_BOUNDS.minY, JANITOR.y + Math.sin(bearing) * distance));
  combat.enemies = [spawnWaveMonster({ slotId: 'duel', kind, x, y }, 1, 1)];
  combat.roomWasPopulated = true;
  state.room.cleared = false;
  const memory = newBotMemory();
  const start = state.tick;
  let killed = false;
  while (state.tick - start < DUEL_TICK_CAP) {
    tickMvpRun(state, botInput(state, memory, options));
    if (!combat.enemies.some((enemy) => enemy.health > 0)) {
      killed = true;
      break;
    }
  }
  return { hits: (SPARE_HEALTH - combat.player.health) / DAMAGE_PER_HIT[kind], ticks: state.tick - start, killed };
}

/**
 * A posed Volatile elite at one hit's health, `distance` from the janitor: the
 * bot has to kill it and then deal with the fuse it leaves. It is dormant so it
 * cannot bite first, which keeps the burst the only thing that can hurt.
 * Returns the health the janitor lost.
 */
export function volatileDuel(options: BotOptions, bearing: number, distance: number, seed = 7): number {
  const state = createMvpRun(seed);
  const combat = state.room.combat;
  combat.walls = [];
  combat.projectiles = [];
  combat.player.x = JANITOR.x;
  combat.player.y = JANITOR.y;
  combat.player.health = SPARE_HEALTH;
  const x = Math.min(SPAWN_BOUNDS.maxX, Math.max(SPAWN_BOUNDS.minX, JANITOR.x + Math.cos(bearing) * distance));
  const y = Math.min(SPAWN_BOUNDS.maxY, Math.max(SPAWN_BOUNDS.minY, JANITOR.y + Math.sin(bearing) * distance));
  const elite = spawnWaveMonster({ slotId: 'volatile', kind: 'hanger', x, y }, 1, 1);
  Object.assign(elite, { elite: true, trait: 'volatile', health: 4, dormant: true });
  combat.enemies = [elite];
  combat.roomWasPopulated = true;
  state.room.cleared = false;
  const memory = newBotMemory();
  let settled = 0;
  // Until it falls, then long enough for any fuse to burn down.
  for (let tick = 0; tick < DUEL_TICK_CAP && settled < 120; tick += 1) {
    tickMvpRun(state, botInput(state, memory, options));
    if (!combat.enemies.some((enemy) => enemy.health > 0)) settled += 1;
  }
  return SPARE_HEALTH - combat.player.health;
}

/** The same duel from `count` bearings spread round the janitor, at each of `distances`. */
export function duelSweep(kind: DuelKind, options: BotOptions, distances: readonly number[] = [180, 260, 330], count = 8): DuelResult[] {
  const results: DuelResult[] = [];
  for (const distance of distances) {
    for (let index = 0; index < count; index += 1) results.push(duel(kind, options, (index / count) * Math.PI * 2 + 0.3, distance));
  }
  return results;
}
