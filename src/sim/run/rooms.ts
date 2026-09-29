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
import { projectFusionInventory } from '../fusion/inventory';
import type { FusionInventoryState } from '../fusion/types';
import { catalogFor } from '../items/registry';
import { compileLoadout } from '../items/compileLoadout';
import type { EnemyState, RunState } from '../model';
import type { GeneratedWing, WingEnemySpawn, WingRoomDefinition } from '../wing/types';
import { runCompilerInstances } from './loadout';
import type { MvpRoomEntryFrom } from './types';
import { ELITE_CHANCE, ELITE_HEALTH_MULTIPLIER, luck } from './luck';
import { MANNEQUIN_HEALTH, MANNEQUIN_RADIUS } from '../combat/mannequin';
import { STATIC_DRIFT_TICKS, STATIC_HEALTH, STATIC_RADIUS } from '../combat/staticEnemy';
import { SHOPPER_HEALTH, SHOPPER_RADIUS } from '../combat/shopper';

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
};

function spawnEnemy(spawn: WingEnemySpawn, id: number, elite: boolean): EnemyState {
  const stats = SPAWN_STATS[spawn.kind];
  const health = stats.health * (elite ? ELITE_HEALTH_MULTIPLIER : 1);
  return {
    ...(elite ? { elite: true } : {}),
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
  return combat.enemies.some((enemy) => enemy.health > 0);
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
): Array<{ x: number; y: number }> {
  const count = mannequinCount(room, seed, roomIndex);
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
      candidates.push({ x, y, key: luck(seed, 'mannequin-spot', roomIndex, index) });
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
): RunState {
  const room = wing.rooms[roomIndex];
  if (!room) {
    throw new Error(`The M5 wing has no room at index ${String(roomIndex)}.`);
  }

  const projected = projectFusionInventory(inventory);
  const compiledLoadout = compileLoadout(
    catalogFor(projected.instances),
    runCompilerInstances(projected.instances, projected.selectedPrimaryInstanceId),
    projected.selectedPrimaryInstanceId,
  );

  const enemies = room.enemySpawns.map((spawn, index) =>
    spawnEnemy(spawn, index + 1, luck(seed, 'elite', roomIndex, index) < ELITE_CHANCE),
  );
  if (room.bossAnchor) {
    // Loss Prevention downstairs; the Mall Manager runs the upper level.
    enemies.push(spawnBoss(enemies.length + 1, room.bossAnchor.x, room.bossAnchor.y, wing.floor === 2 ? 'manager' : 'lp_manager'));
  }
  for (const spot of displayMannequinSpots(room, seed, roomIndex, enemies)) {
    enemies.push({
      id: enemies.length + 1,
      kind: 'mannequin',
      x: spot.x,
      y: spot.y,
      health: MANNEQUIN_HEALTH,
      radius: MANNEQUIN_RADIUS,
      phase: 'recover',
      phaseTicks: 0,
      cooldownTicks: 0,
      telegraphAimX: 0,
      telegraphAimY: 0,
      statuses: createEnemyStatusState(),
    });
  }

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
    walls: room.walls.map((wall) => ({ ...wall })),
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
