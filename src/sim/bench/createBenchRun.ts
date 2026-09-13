import { circleIntersectsRect, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import { ITEM_CATALOG } from '../items/catalog';
import { compileLoadout } from '../items/compileLoadout';
import { projectFusionInventory } from '../fusion/inventory';
import type { FusionInventoryState, InventoryLeaf } from '../fusion/types';
import type { EnemyState, Rect, RunState } from '../model';
import {
  BENCH_KIOSK,
  SERVICE_ANCHORS,
  SERVICE_ENTRY_ANCHORS,
  TEST_BAY_ANCHORS,
  doorwayForRoom,
  enemiesForRoom,
  getBenchScenario,
  wallsForRoom,
} from './scenarios';
import { CAR_LEASH, CAR_RADIUS } from './car';
import type { BenchRoomId, BenchRunState, BenchScenarioId } from './types';

function insideBounds(x: number, y: number, radius: number): boolean {
  return x >= radius && x <= PLAYFIELD_WIDTH - radius && y >= radius && y <= PLAYFIELD_HEIGHT - radius;
}

function outsideWalls(x: number, y: number, radius: number, walls: readonly Rect[]): boolean {
  return !walls.some((wall) => circleIntersectsRect(x, y, radius, wall));
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

function rectInsideBounds(rect: Rect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= PLAYFIELD_WIDTH &&
    rect.y + rect.height <= PLAYFIELD_HEIGHT
  );
}

function rectsOverlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function definitionHasEmitterCarrier(itemDefinitionId: string): boolean {
  return ITEM_CATALOG.find((entry) => entry.id === itemDefinitionId)?.capabilities?.includes('emitter_carrier') === true;
}

function validateRoomGeometry(
  room: BenchRoomId,
  walls: readonly Rect[],
  doorway: Rect,
  anchors: { readonly player: { x: number; y: number }; readonly carrier: { x: number; y: number } },
  enemies: readonly EnemyState[],
  playerRadius: number,
): void {
  for (const wall of walls) {
    if (!rectInsideBounds(wall)) {
      throw new Error(room + ' wall is outside the room bounds.');
    }
  }
  for (let outer = 0; outer < walls.length; outer += 1) {
    for (let inner = outer + 1; inner < walls.length; inner += 1) {
      const first = walls[outer];
      const second = walls[inner];
      if (first && second && rectsOverlap(first, second)) {
        throw new Error(room + ' walls overlap solid geometry.');
      }
    }
  }
  if (!rectInsideBounds(doorway)) {
    throw new Error(room + ' doorway is outside the room bounds.');
  }
  for (const wall of walls) {
    if (rectsOverlap(wall, doorway)) {
      throw new Error(room + ' doorway overlaps solid geometry.');
    }
  }
  if (!insideBounds(anchors.player.x, anchors.player.y, playerRadius)) {
    throw new Error(room + ' player anchor is outside the room bounds.');
  }
  if (!outsideWalls(anchors.player.x, anchors.player.y, playerRadius, walls)) {
    throw new Error(room + ' player anchor is inside solid geometry.');
  }
  if (!insideBounds(anchors.carrier.x, anchors.carrier.y, CAR_RADIUS)) {
    throw new Error(room + ' carrier anchor is outside the room bounds.');
  }
  if (!outsideWalls(anchors.carrier.x, anchors.carrier.y, CAR_RADIUS, walls)) {
    throw new Error(room + ' carrier anchor is inside solid geometry.');
  }
  const anchorDistance = Math.hypot(anchors.player.x - anchors.carrier.x, anchors.player.y - anchors.carrier.y);
  if (anchorDistance > CAR_LEASH) {
    throw new Error(room + ' player/car anchors exceed the carrier leash.');
  }
  for (const enemy of enemies) {
    if (!insideBounds(enemy.x, enemy.y, enemy.radius) || !outsideWalls(enemy.x, enemy.y, enemy.radius, walls)) {
      throw new Error(room + ' enemy ' + enemy.id + ' spawns in an invalid position.');
    }
  }
}

export function createBenchRun(scenarioId: BenchScenarioId, seed = 7): BenchRunState {
  const scenario = getBenchScenario(scenarioId);
  if (!isNonEmptyString(scenario.id) || !isNonEmptyString(scenario.selectedPrimaryInstanceId)) {
    throw new Error('Scenario "' + scenarioId + '" has invalid identifiers.');
  }
  if (!isNonNegativeInteger(scenario.cash)) {
    throw new Error('Scenario "' + scenarioId + '" has invalid cash.');
  }
  if (
    scenario.lateModifierDefinitionId !== null &&
    !isNonEmptyString(scenario.lateModifierDefinitionId)
  ) {
    throw new Error('Scenario "' + scenarioId + '" has an invalid late modifier.');
  }
  if (scenario.lateModifierDefinitionId !== null && !ITEM_CATALOG.some((entry) => entry.id === scenario.lateModifierDefinitionId)) {
    throw new Error('Scenario "' + scenarioId + '" references an unknown late modifier.');
  }
  const seenInstanceIds = new Set<string>();
  for (const leaf of scenario.leaves) {
    if (
      !isNonEmptyString(leaf.instanceId) ||
      !isNonEmptyString(leaf.itemDefinitionId) ||
      !isNonEmptyString(leaf.sourceLocationId) ||
      !isNonEmptyString(leaf.sourceStockId)
    ) {
      throw new Error('Scenario "' + scenarioId + '" has invalid leaf identifiers.');
    }
    if (seenInstanceIds.has(leaf.instanceId)) {
      throw new Error('Scenario "' + scenarioId + '" reuses leaf instance "' + leaf.instanceId + '".');
    }
    seenInstanceIds.add(leaf.instanceId);
    if (!ITEM_CATALOG.some((entry) => entry.id === leaf.itemDefinitionId)) {
      throw new Error('Scenario "' + scenarioId + '" references unknown definition "' + leaf.itemDefinitionId + '".');
    }
  }
  if (!seenInstanceIds.has(scenario.selectedPrimaryInstanceId)) {
    throw new Error('Scenario "' + scenarioId + '" selects an unowned primary.');
  }
  const carrierLeaves = scenario.leaves.filter((leaf) => definitionHasEmitterCarrier(leaf.itemDefinitionId));
  if (carrierLeaves.length !== 1) {
    throw new Error('Scenario "' + scenarioId + '" must own exactly one generic emitter carrier leaf.');
  }

  const leaves: InventoryLeaf[] = scenario.leaves.map((leaf) => ({
    kind: 'leaf',
    instanceId: leaf.instanceId,
    itemDefinitionId: leaf.itemDefinitionId,
    acquisitionKind: leaf.acquisitionKind,
    sourceLocationId: leaf.sourceLocationId,
    sourceStockId: leaf.sourceStockId,
    acquisitionTick: 0,
  }));

  const fusion: FusionInventoryState = {
    inventory: leaves,
    cash: scenario.cash,
    revision: 0,
    selectedPrimaryInstanceId: scenario.selectedPrimaryInstanceId,
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };

  const projected = projectFusionInventory(fusion);
  const compiledLoadout = compileLoadout(ITEM_CATALOG, projected.instances, projected.selectedPrimaryInstanceId);

  const playerRadius = 10;
  validateRoomGeometry('service', wallsForRoom('service'), doorwayForRoom('service'), SERVICE_ANCHORS, enemiesForRoom('service'), playerRadius);
  validateRoomGeometry('test_bay', wallsForRoom('test_bay'), doorwayForRoom('test_bay'), TEST_BAY_ANCHORS, enemiesForRoom('test_bay'), playerRadius);
  validateRoomGeometry('service', wallsForRoom('service'), doorwayForRoom('service'), SERVICE_ENTRY_ANCHORS, enemiesForRoom('service'), playerRadius);
  const walls = [...wallsForRoom('service')];
  const enemies = enemiesForRoom('service');
  for (
    const spawn of [
      { label: 'player', x: SERVICE_ANCHORS.player.x, y: SERVICE_ANCHORS.player.y },
      { label: 'carrier', x: SERVICE_ANCHORS.carrier.x, y: SERVICE_ANCHORS.carrier.y },
    ]
  ) {
    const spawnDistance = Math.hypot(spawn.x - BENCH_KIOSK.x, spawn.y - BENCH_KIOSK.y);
    if (spawnDistance > BENCH_KIOSK.range) {
      throw new Error('Service ' + spawn.label + ' spawn is outside Bench Warrant interaction range.');
    }
  }

  const sharedTrace: string[] = [];
  const combat: RunState = {
    seed,
    tick: 0,
    paused: false,
    status: 'playing',
    player: {
      x: SERVICE_ANCHORS.player.x,
      y: SERVICE_ANCHORS.player.y,
      health: 6,
      radius: playerRadius,
      facing: { x: 1, y: 0 },
      attackCooldownTicks: 0,
      attackActiveTicks: 0,
      invulnerableTicks: 0,
    },
    enemies,
    projectiles: [],
    walls,
    nextEntityId: Math.max(0, ...enemies.map((enemy) => enemy.id)) + 1,
    roomWasPopulated: false,
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
    behaviorTrace: sharedTrace,
  };

  return {
    seed,
    tick: 0,
    paused: false,
    activeRoom: 'service',
    scenarioId,
    fusion,
    combat,
    carrier: {
      mode: 'independent',
      x: SERVICE_ANCHORS.carrier.x,
      y: SERVICE_ANCHORS.carrier.y,
      radius: CAR_RADIUS,
      bumpCooldownTicks: 0,
      recalling: false,
    },
    preview: null,
    heldActions: { interact: false, recall: false },
    recentChange: '',
    behaviorTrace: sharedTrace,
  };
}
