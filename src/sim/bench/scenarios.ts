import { createEnemyStatusState } from '../effects/statuses';
import { freezeDeep } from '../items/types';
import type { FusionAcquisitionKind } from '../fusion/types';
import type { EnemyState, Rect, Vec2 } from '../model';
import type { BenchRoomId, BenchScenarioId } from './types';

export type BenchLeafSpec = {
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly acquisitionKind: FusionAcquisitionKind;
  readonly sourceLocationId: string;
  readonly sourceStockId: string;
};

export type BenchScenarioDefinition = {
  readonly id: BenchScenarioId;
  readonly cash: number;
  readonly leaves: readonly BenchLeafSpec[];
  readonly selectedPrimaryInstanceId: string;
  readonly lateModifierDefinitionId: string | null;
};

export const BENCH_SCENARIO_IDS: readonly BenchScenarioId[] = freezeDeep([
  'clean-soaker',
  'stolen-popper',
  'unsupported-mop',
]);

const CURATED_SOURCE = 'bench_curated';
const LATE_SOURCE = 'bench_warrant_late';

const CLEAN_SOAKER_LEAVES: readonly BenchLeafSpec[] = freezeDeep([
  { instanceId: 'soaker', itemDefinitionId: 'pump_soaker', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'soaker-stock' },
  { instanceId: 'car', itemDefinitionId: 'rc_car', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'car-stock' },
  { instanceId: 'bubble', itemDefinitionId: 'bubble_bath', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'bubble-stock' },
  { instanceId: 'globe', itemDefinitionId: 'plasma_globe', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'globe-stock' },
  { instanceId: 'rewinder', itemDefinitionId: 'vhs_rewinder', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'rewinder-stock' },
  { instanceId: 'nozzle', itemDefinitionId: 'wide_nozzle', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'nozzle-stock' },
]);

const STOLEN_POPPER_LEAVES: readonly BenchLeafSpec[] = freezeDeep([
  { instanceId: 'popper', itemDefinitionId: 'party_popper', acquisitionKind: 'stolen', sourceLocationId: CURATED_SOURCE, sourceStockId: 'popper-stock' },
  { instanceId: 'car', itemDefinitionId: 'rc_car', acquisitionKind: 'stolen', sourceLocationId: CURATED_SOURCE, sourceStockId: 'car-stock' },
  { instanceId: 'rewinder', itemDefinitionId: 'vhs_rewinder', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'rewinder-stock' },
  { instanceId: 'nozzle', itemDefinitionId: 'wide_nozzle', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'nozzle-stock' },
]);

const UNSUPPORTED_MOP_LEAVES: readonly BenchLeafSpec[] = freezeDeep([
  { instanceId: 'mop', itemDefinitionId: 'janitor_mop', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'mop-stock' },
  { instanceId: 'car', itemDefinitionId: 'rc_car', acquisitionKind: 'purchased', sourceLocationId: CURATED_SOURCE, sourceStockId: 'car-stock' },
]);

const BENCH_SCENARIOS: Record<BenchScenarioId, BenchScenarioDefinition> = freezeDeep({
  'clean-soaker': {
    id: 'clean-soaker',
    cash: 10,
    leaves: CLEAN_SOAKER_LEAVES,
    selectedPrimaryInstanceId: 'soaker',
    lateModifierDefinitionId: 'gel_pens',
  },
  'stolen-popper': {
    id: 'stolen-popper',
    cash: 10,
    leaves: STOLEN_POPPER_LEAVES,
    selectedPrimaryInstanceId: 'popper',
    lateModifierDefinitionId: 'gel_pens',
  },
  'unsupported-mop': {
    id: 'unsupported-mop',
    cash: 10,
    leaves: UNSUPPORTED_MOP_LEAVES,
    selectedPrimaryInstanceId: 'mop',
    lateModifierDefinitionId: null,
  },
});

export function getBenchScenario(scenarioId: BenchScenarioId): BenchScenarioDefinition {
  const scenario = (BENCH_SCENARIOS as Record<string, BenchScenarioDefinition>)[scenarioId];
  if (!scenario) {
    throw new Error(`Unknown bench scenario "${String(scenarioId)}".`);
  }
  return scenario;
}

export function lateModifierLeafId(scenarioId: BenchScenarioId): string {
  return `${scenarioId}-gel-pens-late`;
}

export function lateModifierSpec(scenarioId: BenchScenarioId): BenchLeafSpec {
  return {
    instanceId: lateModifierLeafId(scenarioId),
    itemDefinitionId: 'gel_pens',
    acquisitionKind: 'purchased',
    sourceLocationId: LATE_SOURCE,
    sourceStockId: 'gel-pens-late',
  };
}

export const BENCH_KIOSK: Vec2 & { readonly range: number } = freezeDeep({ x: 240, y: 240, range: 110 });

export const SERVICE_WALLS: readonly Rect[] = freezeDeep([
  { x: 480, y: 90, width: 40, height: 140 },
  { x: 480, y: 300, width: 40, height: 90 },
]);

export const TEST_BAY_WALLS: readonly Rect[] = freezeDeep([
  { x: 300, y: 80, width: 40, height: 180 },
  { x: 620, y: 220, width: 40, height: 180 },
]);

export const SERVICE_DOORWAY: Rect = freezeDeep({ x: 912, y: 200, width: 48, height: 80 });

export const TEST_BAY_DOORWAY: Rect = freezeDeep({ x: 0, y: 200, width: 48, height: 80 });

export function doorwayForRoom(room: BenchRoomId): Rect {
  return room === 'service' ? SERVICE_DOORWAY : TEST_BAY_DOORWAY;
}

export function wallsForRoom(room: BenchRoomId): readonly Rect[] {
  return room === 'service' ? SERVICE_WALLS : TEST_BAY_WALLS;
}

export const SERVICE_ANCHORS: { readonly player: Vec2; readonly carrier: Vec2 } = freezeDeep({
  player: { x: 160, y: 240 },
  carrier: { x: 205, y: 265 },
});

export const SERVICE_ENTRY_ANCHORS: { readonly player: Vec2; readonly carrier: Vec2 } = freezeDeep({
  player: { x: 840, y: 240 },
  carrier: { x: 795, y: 265 },
});

export const TEST_BAY_ANCHORS: { readonly player: Vec2; readonly carrier: Vec2 } = freezeDeep({
  player: { x: 120, y: 240 },
  carrier: { x: 165, y: 265 },
});

function makeHanger(id: number, x: number, y: number): EnemyState {
  return {
    id, kind: 'hanger', x, y, health: 8, radius: 14,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0,
    telegraphAimX: 0, telegraphAimY: 0,
    statuses: createEnemyStatusState(),
  };
}

function makeSpitter(id: number, x: number, y: number): EnemyState {
  return {
    id, kind: 'spitter', x, y, health: 8, radius: 16,
    phase: 'recover', phaseTicks: 45, cooldownTicks: 0,
    telegraphAimX: 0, telegraphAimY: 0,
    statuses: createEnemyStatusState(),
  };
}

export function serviceEnemies(): EnemyState[] {
  return [makeHanger(1, 680, 170), makeSpitter(2, 740, 330)];
}

export function testBayEnemies(): EnemyState[] {
  return [makeHanger(1, 500, 150), makeSpitter(2, 760, 330), makeHanger(3, 450, 350)];
}

export function enemiesForRoom(room: BenchRoomId): EnemyState[] {
  return room === 'service' ? serviceEnemies() : testBayEnemies();
}
