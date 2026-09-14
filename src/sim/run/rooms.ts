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
  BOSS_MAX_HEALTH,
  BOSS_PURSUE_TICKS,
  BOSS_RADIUS,
  BOSS_VOLLEY_CADENCE_PHASE2,
} from '../combat/boss';
import { PLAYFIELD_WIDTH } from '../core/geometry';
import { createEnemyStatusState } from '../effects/statuses';
import { projectFusionInventory } from '../fusion/inventory';
import type { FusionInventoryState } from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import { compileLoadout } from '../items/compileLoadout';
import type { EnemyState, RunState } from '../model';
import type { GeneratedWing, WingEnemySpawn } from '../wing/types';
import { runCompilerInstances } from './loadout';
import type { MvpRoomEntryFrom } from './types';

/** The M1 player and enemy stats, reused unchanged by every M5 room. */
export const PLAYER_MAX_HEALTH = 6;
const PLAYER_RADIUS = 10;
const HANGER_HEALTH = 8;
const HANGER_RADIUS = 14;
const SPITTER_HEALTH = 8;
const SPITTER_RADIUS = 16;

function spawnEnemy(spawn: WingEnemySpawn, id: number): EnemyState {
  const isSpitter = spawn.kind === 'spitter';
  return {
    id,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    health: isSpitter ? SPITTER_HEALTH : HANGER_HEALTH,
    radius: isSpitter ? SPITTER_RADIUS : HANGER_RADIUS,
    phase: isSpitter ? 'recover' : 'pursue',
    phaseTicks: isSpitter ? 45 : 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    statuses: createEnemyStatusState(),
  };
}

function spawnBoss(id: number, x: number, y: number): EnemyState {
  return {
    id,
    kind: 'lp_manager',
    x,
    y,
    health: BOSS_MAX_HEALTH,
    radius: BOSS_RADIUS,
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
    ITEM_CATALOG,
    runCompilerInstances(projected.instances, projected.selectedPrimaryInstanceId),
    projected.selectedPrimaryInstanceId,
  );

  const enemies = room.enemySpawns.map((spawn, index) => spawnEnemy(spawn, index + 1));
  if (room.bossAnchor) {
    enemies.push(spawnBoss(enemies.length + 1, room.bossAnchor.x, room.bossAnchor.y));
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
