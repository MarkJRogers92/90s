/**
 * Deterministic room building for the M5 MVP run.
 *
 * A room is always built from authored wing data plus the run's fusion
 * inventory: walls are cloned, the player starts at the room's entry anchor for
 * the side they came in from, and enemies are re-created from the authored
 * spawn slots. Enemies, projectiles, surfaces, and event queues never carry
 * between rooms.
 */
import {
  BOSS_CONFIGS,
  type BossKind,
  BOSS_MAX_HEALTH,
  BOSS_PURSUE_TICKS,
  BOSS_RADIUS,
  BOSS_VOLLEY_CADENCE_PHASE2,
} from '../combat/boss';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, circleIntersectsRect } from '../core/geometry';
import { createEnemyStatusState } from '../effects/statuses';
import type { FusionInventoryState } from '../fusion/types';
import type { EliteTrait, EnemyState, MallProp, RunState } from '../model';
import { createProp, propWalls } from '../combat/props';
import type { GeneratedWing, WingEnemySpawn, WingRoomDefinition } from '../wing/types';
import { floorNumberOf, floorSpec } from '../wing/floorSpecs';
import { compileRunLoadout } from './loadout';
import type { MvpRoomEntryFrom } from './types';
import { ELITE_CHANCE, ELITE_HEALTH_MULTIPLIER, luck } from './luck';
import { rollEliteTrait } from '../combat/eliteTraits';
import { MANNEQUIN_HEALTH, MANNEQUIN_RADIUS } from '../combat/mannequin';
import { STATIC_DRIFT_TICKS, STATIC_HEALTH, STATIC_RADIUS } from '../combat/staticEnemy';
import { SHOPPER_HEALTH, SHOPPER_RADIUS } from '../combat/shopper';
import { MASCOT_HEALTH, MASCOT_RADIUS } from '../combat/mascot';
import { ROOFER_HEALTH, ROOFER_RADIUS } from '../combat/roofer';
import { LOCKDOWN_SIZE } from '../wing/floorSpecs';
import { createWingRng } from '../wing/rng';
import { wingEventFor } from './wingEvents';
import { calmWalker, spawnWalker } from '../combat/walker';
import { ELF_HEALTH, ELF_RADIUS, GOON_HEALTH, GOON_RADIUS, POODLE_HEALTH, POODLE_RADIUS, SPRITZER_HEALTH, SPRITZER_RADIUS } from '../combat/districtEnemies';
import { districtSpec } from '../wing/districts';

/** The M1 player and enemy stats, reused unchanged by every M5 room. */
export const PLAYER_MAX_HEALTH = 6;
/**
 * Authored recovery for clearing a room that actually authored a fight.
 *
 * Six health across two combat rooms and a sixty-health boss left optimal play
 * as "take no damage or lose", and a shift chipped down at a checkpoint was
 * stuck retrying from behind. This is deliberately small: the player still ends
 * every fight worse than they entered it, so attrition remains the tension, but
 * a chipped run is no longer arithmetically unwinnable. Safe rooms author no
 * spawns and therefore heal nothing, so this is per fight rather than per door.
 */
export const ROOM_CLEAR_HEAL = 2;
const PLAYER_RADIUS = 10;
const HANGER_HEALTH = 12;
const HANGER_RADIUS = 14;
const SPITTER_HEALTH = 12;
const SPITTER_RADIUS = 16;

const SPAWN_STATS: Readonly<Record<WingEnemySpawn['kind'], { health: number; radius: number; phase: EnemyState['phase']; phaseTicks: number }>> = {
  hanger: { health: HANGER_HEALTH, radius: HANGER_RADIUS, phase: 'pursue', phaseTicks: 0 },
  spitter: { health: SPITTER_HEALTH, radius: SPITTER_RADIUS, phase: 'recover', phaseTicks: 45 },
  static: { health: STATIC_HEALTH, radius: STATIC_RADIUS, phase: 'pursue', phaseTicks: STATIC_DRIFT_TICKS },
  // Like the spitter, a Bargain Hunter needs a beat before its first charge, so
  // one parked by the door can't hit the janitor before the room has been read.
  shopper: { health: SHOPPER_HEALTH, radius: SHOPPER_RADIUS, phase: 'recover', phaseTicks: 50 },
  // A Mascot Brute also waits a beat: its wind-up is the first thing it does.
  mascot: { health: MASCOT_HEALTH, radius: MASCOT_RADIUS, phase: 'recover', phaseTicks: 60 },
  // A Roofer's first bucket waits too, so the Roof's rooms can be read before tar flies.
  roofer: { health: ROOFER_HEALTH, radius: ROOFER_RADIUS, phase: 'recover', phaseTicks: 70 },
  // Round 50: the district monsters each wait a beat too.
  elf: { health: ELF_HEALTH, radius: ELF_RADIUS, phase: 'recover', phaseTicks: 50 },
  spritzer: { health: SPRITZER_HEALTH, radius: SPRITZER_RADIUS, phase: 'recover', phaseTicks: 60 },
  poodle: { health: POODLE_HEALTH, radius: POODLE_RADIUS, phase: 'recover', phaseTicks: 45 },
  goon: { health: GOON_HEALTH, radius: GOON_RADIUS, phase: 'recover', phaseTicks: 60 },
};

/** The Mall Walker (round 48) strolls through this share of Floor 1-2 regular fights. */
export const WALKER_CHANCE = 0.4;
export const WALKER_TOP_FLOOR = 2;

/** `healthScale` toughens a floor's authored monsters (see FloorSpec.enemyHealthScale). */
/** One monster for a wave outside the wing's authored spawns (the secret back room, round 53). */
export function spawnWaveMonster(spawn: WingEnemySpawn, id: number, healthScale = 1): EnemyState {
  return spawnEnemy(spawn, id, false, healthScale);
}

function spawnEnemy(spawn: WingEnemySpawn, id: number, elite: boolean, healthScale = 1, trait?: EliteTrait): EnemyState {
  const stats = SPAWN_STATS[spawn.kind];
  const health = Math.round(stats.health * healthScale) * (elite ? ELITE_HEALTH_MULTIPLIER : 1);
  return {
    ...(elite ? { elite: true } : {}),
    ...(elite && trait ? { trait } : {}),
    id,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    health,
    radius: stats.radius,
    phase: stats.phase,
    phaseTicks: stats.phaseTicks,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    statuses: createEnemyStatusState(),
  };
}

/** A Mannequin standing in its pose, as the rooms and store security place them. */
function spawnMannequin(id: number, x: number, y: number): EnemyState {
  return {
    id,
    kind: 'mannequin',
    x,
    y,
    health: MANNEQUIN_HEALTH,
    radius: MANNEQUIN_RADIUS,
    phase: 'recover',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    statuses: createEnemyStatusState(),
  };
}

/**
 * The Lockdown (round 45): LOCKDOWN_SIZE elites of the floor's own mix in a
 * ring around the room's anchor, pulled in from any wall. Seeded by the wing.
 */
function lockdownWave(wing: GeneratedWing, room: WingRoomDefinition, firstId: number): EnemyState[] {
  const anchor = room.bossAnchor!;
  const floor = floorSpec(floorNumberOf(wing));
  const rng = createWingRng(wing.seed ^ 0x10cd0);
  return Array.from({ length: LOCKDOWN_SIZE }, (_, index) => {
    const kind = floor.enemyKind(index % 2 === 0 ? 'hanger' : 'spitter', rng);
    const angle = (index / LOCKDOWN_SIZE) * Math.PI * 2;
    let reach = 150;
    let x = anchor.x;
    let y = anchor.y;
    for (; reach > 0; reach -= 25) {
      x = Math.max(40, Math.min(PLAYFIELD_WIDTH - 40, anchor.x + Math.cos(angle) * reach));
      y = Math.max(40, Math.min(PLAYFIELD_HEIGHT - 40, anchor.y + Math.sin(angle) * reach * 0.7));
      if (!room.walls.some((wall) => circleIntersectsRect(x, y, 24, wall))) break;
    }
    return spawnEnemy({ slotId: `lockdown-${index}`, kind, x, y }, firstId + index, true, floor.enemyHealthScale, rollEliteTrait(wing.seed, wing.rooms.indexOf(room), index));
  });
}

/** What mall security sends: display Mannequins and rabid Bargain Hunters. */
export type SecurityKind = 'mannequin' | 'shopper';

/**
 * One security guard. A Bargain Hunter waits `beatTicks` before its first
 * wind-up, so a guard that appears next to the janitor can still be read.
 */
export function spawnSecurityGuard(kind: SecurityKind, id: number, x: number, y: number, beatTicks = 50): EnemyState {
  if (kind === 'mannequin') return spawnMannequin(id, x, y);
  return { ...spawnEnemy({ slotId: `security-${id}`, kind: 'shopper', x, y }, id, false), phaseTicks: beatTicks };
}

/** The security a wanted janitor meets in a fight, by star: dummies, then hunters. */
export const WANTED_SECURITY: readonly SecurityKind[] = ['mannequin', 'shopper', 'mannequin', 'shopper'];

function spawnBoss(id: number, x: number, y: number, kind: BossKind = 'lp_manager'): EnemyState {
  const config = BOSS_CONFIGS[kind];
  return {
    id,
    kind,
    x,
    y,
    health: config.maxHealth,
    radius: config.radius,
    phase: 'pursue',
    phaseTicks: BOSS_PURSUE_TICKS,
    cooldownTicks: BOSS_VOLLEY_CADENCE_PHASE2,
    telegraphAimX: 0,
    telegraphAimY: 0,
  };
}

/** True while any enemy in the room still has health. */
export function hasLivingEnemies(combat: RunState): boolean {
  // A calm Mall Walker is not a fight: leave it to its laps, or start one.
  return combat.enemies.some((enemy) => enemy.health > 0 && !calmWalker(enemy));
}

/**
 * Removes every room-local entity from an already-built room, so a cleared
 * room comes back empty instead of re-spawning its authored enemies.
 */
export function clearRoomEnemies(combat: RunState): void {
  combat.enemies = [];
  combat.projectiles = [];
  combat.surfaces = [];
  combat.eventQueue = [];
  combat.nextEntityId = 1;
  combat.roomWasPopulated = false;
  combat.rewardGranted = false;
  combat.status = 'playing';
}

/** Display mannequins per room: the back hall always, the food court sometimes. */
function mannequinCount(room: WingRoomDefinition, seed: number, roomIndex: number): number {
  if (room.id === 'back_hall') return 2;
  if (room.id === 'food_court') return luck(seed, 'mannequin', roomIndex, 0) < 0.4 ? 1 : 0;
  return 0;
}

/**
 * Where the display mannequins stand: seeded picks from an open grid, clear
 * of walls, well away from either doorway entry (so a restore from either
 * side agrees) and from the room's other enemies and each other.
 */
function displayMannequinSpots(
  room: WingRoomDefinition,
  seed: number,
  roomIndex: number,
  enemies: readonly EnemyState[],
  count = mannequinCount(room, seed, roomIndex),
  key = 'mannequin-spot',
): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const entries = [room.playerEntry, { x: PLAYFIELD_WIDTH - room.playerEntry.x, y: room.playerEntry.y }];
  const candidates: Array<{ x: number; y: number; key: number }> = [];
  let index = 0;
  for (let y = 80; y <= PLAYFIELD_HEIGHT - 60; y += 50) {
    for (let x = 120; x <= PLAYFIELD_WIDTH - 120; x += 60) {
      index += 1;
      if (room.walls.some((wall) => circleIntersectsRect(x, y, MANNEQUIN_RADIUS + 8, wall))) continue;
      if (entries.some((entry) => Math.hypot(entry.x - x, entry.y - y) < 230)) continue;
      if (enemies.some((enemy) => Math.hypot(enemy.x - x, enemy.y - y) < 80)) continue;
      candidates.push({ x, y, key: luck(seed, key, roomIndex, index) });
    }
  }
  candidates.sort((a, b) => a.key - b.key);
  const chosen: Array<{ x: number; y: number }> = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (chosen.some((spot) => Math.hypot(spot.x - candidate.x, spot.y - candidate.y) < 160)) continue;
    chosen.push({ x: candidate.x, y: candidate.y });
  }
  return chosen;
}

/** Round 53: how often a regular fight has props to knock over. */
export const PROP_CHANCE = 0.85;
/** A rack needs this much clear floor round it, so a fallen one can never wall a corner off. */
const RACK_CLEARANCE = 120;
/** Every prop keeps a walkway clear round it. */
const PROP_CLEARANCE = 40;

/**
 * The carts, soda machines and racks in a regular fight (round 53): two or
 * three, each kind at most once, on clear floor away from the doors, the
 * store fronts, the bench kiosk and every monster. Seed-derived, so the same
 * night dresses the same way and nothing needs saving.
 */
function mallProps(room: WingRoomDefinition, seed: number, roomIndex: number, enemies: readonly EnemyState[]): MallProp[] {
  if (room.props) return room.props.map((prop, index) => createProp(index + 1, prop.kind, prop.x, prop.y));
  if (room.enemySpawns.length === 0 || room.bossAnchor !== null) return [];
  if (luck(seed, 'props', roomIndex, 0) >= PROP_CHANCE) return [];
  const spots = displayMannequinSpots(room, seed, roomIndex, enemies, 8, 'prop-spot').filter((spot) =>
    !room.walls.some((wall) => circleIntersectsRect(spot.x, spot.y, PROP_CLEARANCE, wall))
    && !(room.store !== null && spot.y < 150)
    && !(room.benchKiosk && Math.hypot(room.benchKiosk.x - spot.x, room.benchKiosk.y - spot.y) < 110));
  const kinds = (['cart', 'soda', 'rack'] as const)
    .map((kind, index) => ({ kind, key: luck(seed, 'prop-kind', roomIndex, index) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.kind)
    .slice(0, luck(seed, 'props', roomIndex, 1) < 0.5 ? 2 : 3);
  const props: MallProp[] = [];
  for (const kind of kinds) {
    const at = spots.findIndex((spot) => kind !== 'rack' || !room.walls.some((wall) => circleIntersectsRect(spot.x, spot.y, RACK_CLEARANCE, wall)));
    if (at < 0) continue;
    const [spot] = spots.splice(at, 1);
    props.push(createProp(props.length + 1, kind, spot!.x, spot!.y));
  }
  return props;
}

/**
 * Builds one room's combat state directly from the wing room data.
 *
 * Entering from the west uses the authored player entry anchor; entering from
 * the east mirrors it across the room so the player always appears just inside
 * the doorway they came through. The security office spawns exactly one
 * `lp_manager` at the room's boss anchor.
 */
export function buildRoomCombatState(
  wing: GeneratedWing,
  roomIndex: number,
  enteringFrom: MvpRoomEntryFrom,
  inventory: FusionInventoryState,
  seed: number,
  /** The janitor's wanted stars: each adds a security guard to a fight. */
  wanted = 0,
): RunState {
  const room = wing.rooms[roomIndex];
  if (!room) {
    throw new Error(`The M5 wing has no room at index ${String(roomIndex)}.`);
  }

  const projected = compileRunLoadout(inventory);
  const compiledLoadout = projected.compiledLoadout;

  const floor = floorSpec(floorNumberOf(wing));
  const enemies = room.enemySpawns.map((spawn, index) => {
    const elite = luck(seed, 'elite', roomIndex, index) < ELITE_CHANCE;
    return spawnEnemy(spawn, index + 1, elite, floor.enemyHealthScale, elite ? rollEliteTrait(seed, roomIndex, index) : undefined);
  });
  if (room.bossAnchor && wing.part === 1 && wing.district) {
    // A district's Lockdown room (round 50) holds its mini-boss instead.
    enemies.push(spawnBoss(enemies.length + 1, room.bossAnchor.x, room.bossAnchor.y, districtSpec(wing.district).miniBoss));
  } else if (room.bossAnchor && wing.part === 1) {
    // A first wing ends in the Lockdown: a ring of elites instead of the boss.
    enemies.push(...lockdownWave(wing, room, enemies.length + 1));
  } else if (room.bossAnchor) {
    // Each floor's own boss (the floor table), at its own config's health.
    enemies.push(spawnBoss(enemies.length + 1, room.bossAnchor.x, room.bossAnchor.y, floor.bossKind));
  }
  for (const spot of displayMannequinSpots(room, seed, roomIndex, enemies)) {
    enemies.push(spawnMannequin(enemies.length + 1, spot.x, spot.y));
  }
  // Floors 1-2: now and then a Mall Walker doing laps through a regular fight.
  if (floorNumberOf(wing) <= WALKER_TOP_FLOOR && room.enemySpawns.length > 0 && room.bossAnchor === null && luck(seed, 'walker', roomIndex, 0) < WALKER_CHANCE) {
    for (const spot of displayMannequinSpots(room, seed, roomIndex, enemies, 1, 'walker-spot')) {
      enemies.push(spawnWalker(enemies.length + 1, spot.x, spot.y));
    }
  }
  // A clearance sale (a floor event) sends a Bargain Hunter into every regular fight.
  if (wingEventFor(wing) === 'clearance' && room.enemySpawns.length > 0 && room.bossAnchor === null) {
    for (const spot of displayMannequinSpots(room, seed, roomIndex, enemies, 1, 'clearance-spot')) {
      enemies.push(spawnSecurityGuard('shopper', enemies.length + 1, spot.x, spot.y, 70));
    }
  }
  // A wanted janitor brings mall security into every fight; safe rooms stay safe.
  const security = room.enemySpawns.length > 0 || room.bossAnchor !== null
    ? WANTED_SECURITY.slice(0, Math.max(0, Math.min(WANTED_SECURITY.length, wanted)))
    : [];
  if (security.length > 0) {
    const spots = displayMannequinSpots(room, seed, roomIndex, enemies, security.length, 'security-spot');
    spots.forEach((spot, index) => {
      enemies.push(spawnSecurityGuard(security[index]!, enemies.length + 1, spot.x, spot.y, 70));
    });
  }

  // Only the actual ground-floor Security Office gets a monitor bank. The
  // other floors and first-wing arenas reuse this room id for different places.
  // Keep authored fixtures authoritative and the west-east combat lane clear.
  const props = room.props === undefined && floorNumberOf(wing) === 1 && wing.part !== 1 && room.id === 'security_office'
    ? [createProp(1, 'monitors', 550, 60)]
    : mallProps(room, seed, roomIndex, enemies);

  const entry =
    enteringFrom === 'west'
      ? { x: room.playerEntry.x, y: room.playerEntry.y }
      : { x: PLAYFIELD_WIDTH - room.playerEntry.x, y: room.playerEntry.y };

  return {
    seed,
    tick: 0,
    paused: false,
    status: 'playing',
    player: {
      x: entry.x,
      y: entry.y,
      health: PLAYER_MAX_HEALTH,
      radius: PLAYER_RADIUS,
      facing: { x: 1, y: 0 },
      attackCooldownTicks: 0,
      attackActiveTicks: 0,
      invulnerableTicks: 0,
    },
    enemies,
    projectiles: [],
    walls: [...room.walls.map((wall) => ({ ...wall })), ...propWalls(props)],
    props,
    nextEntityId: enemies.length + 1,
    roomWasPopulated: enemies.length > 0,
    rewardGranted: false,
    inventory: [...projected.instances],
    selectedPrimaryInstanceId: projected.selectedPrimaryInstanceId,
    compiledLoadout,
    surfaces: [],
    eventQueue: [],
    counters: {
      rootActions: 0,
      gameplayEvents: 0,
      childEventsThisRoot: 0,
      currentRootActionId: null,
      droppedEvents: 0,
      drainedEvents: 0,
    },
    nextEventSequence: 1,
    limitDiagnostics: [],
    recentChange: '',
    behaviorTrace: [],
  };
}
