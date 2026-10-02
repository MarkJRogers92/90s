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
import { PERFUME_CLOUD_TICKS } from '../../src/sim/combat/perfume';
import { TAR_PUDDLE_TICKS } from '../../src/sim/combat/tar';
import { botInput, newBotMemory, type BotOptions } from './bot';

export type DuelKind = 'mascot' | 'shopper' | 'roofer' | 'spritzer';

/** Health a hit on the janitor takes from each. */
const DAMAGE_PER_HIT: Readonly<Record<DuelKind, number>> = { mascot: 2, shopper: 1, roofer: 1, spritzer: 1 };
const JANITOR = { x: 480, y: 240 };
/** Spawns are pulled inside the room: a monster off the playfield could never be reached. */
const SPAWN_BOUNDS = { minX: 60, maxX: 900, minY: 60, maxY: 420 };
const SPARE_HEALTH = 99;
export const DUEL_TICK_CAP = 60 * 40;
/** How long a crowd duel runs, in ticks (15 s: about six throws). */
export const CROWD_TICKS = 60 * 15;

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

/**
 * A lobber (a Roofer or a Perfume Spritzer) with two bruisers on the janitor, so
 * the bot is busy swinging at something else while the lob is in the air: the
 * situation that actually costs health in a real night, where a lone lobber does
 * not (a bot walking at it leaves the landing spot by accident). Counts only the
 * hits that came with a fresh puddle or cloud under the janitor, so a bruiser's
 * bite is not mistaken for the lob.
 */
export function crowdDuel(kind: 'roofer' | 'spritzer', options: BotOptions, bearing: number, distance: number, seed = 7): { readonly lobHits: number; readonly throws: number } {
  const state = createMvpRun(seed);
  const combat = state.room.combat;
  combat.walls = [];
  combat.projectiles = [];
  combat.player.x = JANITOR.x;
  combat.player.y = JANITOR.y;
  combat.player.health = SPARE_HEALTH;
  const x = Math.min(SPAWN_BOUNDS.maxX, Math.max(SPAWN_BOUNDS.minX, JANITOR.x + Math.cos(bearing) * distance));
  const y = Math.min(SPAWN_BOUNDS.maxY, Math.max(SPAWN_BOUNDS.minY, JANITOR.y + Math.sin(bearing) * distance));
  const lobber = spawnWaveMonster({ slotId: 'lobber', kind, x, y }, 1, 1);
  lobber.health = 9999;
  const bruisers = [0, 1].map((index) => {
    const angle = bearing + Math.PI + (index === 0 ? 0.5 : -0.5);
    const bruiser = spawnWaveMonster({ slotId: `bruiser-${index}`, kind: 'hanger', x: JANITOR.x + Math.cos(angle) * 70, y: JANITOR.y + Math.sin(angle) * 70 }, 2 + index, 1);
    bruiser.health = 9999;
    return bruiser;
  });
  combat.enemies = [lobber, ...bruisers];
  combat.roomWasPopulated = true;
  state.room.cleared = false;
  const memory = newBotMemory();
  let lobHits = 0;
  let throws = 0;
  let previousFresh = 0;
  for (let tick = 0; tick < CROWD_TICKS; tick += 1) {
    const before = combat.player.health;
    tickMvpRun(state, botInput(state, memory, options));
    const fresh = (combat.perfume ?? []).filter((cloud) => cloud.ticks >= PERFUME_CLOUD_TICKS - 1).length + (combat.tar ?? []).filter((puddle) => puddle.ticks >= TAR_PUDDLE_TICKS - 1).length;
    if (fresh > 0 && previousFresh === 0) throws += 1;
    if (fresh > 0 && combat.player.health < before) lobHits += before - combat.player.health;
    previousFresh = fresh;
  }
  return { lobHits, throws };
}

/** `crowdDuel` from `count` bearings spread round the janitor, at each of `distances`. */
export function crowdSweep(kind: 'roofer' | 'spritzer', options: BotOptions, distances: readonly number[] = [200, 260], count = 8): { readonly lobHits: number; readonly throws: number } {
  let lobHits = 0;
  let throws = 0;
  for (const distance of distances) {
    for (let index = 0; index < count; index += 1) {
      const result = crowdDuel(kind, options, (index / count) * Math.PI * 2 + 0.3, distance);
      lobHits += result.lobHits;
      throws += result.throws;
    }
  }
  return { lobHits, throws };
}

/** The same duel from `count` bearings spread round the janitor, at each of `distances`. */
export function duelSweep(kind: DuelKind, options: BotOptions, distances: readonly number[] = [180, 260, 330], count = 8): DuelResult[] {
  const results: DuelResult[] = [];
  for (const distance of distances) {
    for (let index = 0; index < count; index += 1) results.push(duel(kind, options, (index / count) * Math.PI * 2 + 0.3, distance));
  }
  return results;
}
