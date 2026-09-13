import { circleIntersectsRect } from '../core/geometry';
import { recordBehaviorTrace } from '../effects/events';
import { ITEM_CATALOG } from '../items/catalog';
import { compileLoadout } from '../items/compileLoadout';
import { resolveEmitterMount } from '../fusion/emitterMount';
import { isValidFusionInventoryState, projectFusionInventory } from '../fusion/inventory';
import { commitEmitterMount } from '../fusion/transaction';
import type { InventoryLeaf } from '../fusion/types';
import {
  BENCH_KIOSK,
  doorwayForRoom,
  enemiesForRoom,
  getBenchScenario,
  lateModifierSpec,
  SERVICE_ENTRY_ANCHORS,
  TEST_BAY_ANCHORS,
  wallsForRoom,
} from './scenarios';
import type { BenchRunState } from './types';

function pushTrace(state: BenchRunState, entry: string): void {
  recordBehaviorTrace(state.combat, entry);
}

function definitionHasEmitterCarrier(itemDefinitionId: string): boolean {
  const definition = ITEM_CATALOG.find((entry) => entry.id === itemDefinitionId);
  return definition?.capabilities?.includes('emitter_carrier') === true;
}

function topLevelLeaf(state: BenchRunState, instanceId: string): InventoryLeaf | null {
  const node = state.fusion.inventory.find((entry) => entry.instanceId === instanceId);
  return node?.kind === 'leaf' ? node : null;
}

function findCarrierLeaf(state: BenchRunState): InventoryLeaf | null {
  for (const node of state.fusion.inventory) {
    if (node.kind === 'leaf' && definitionHasEmitterCarrier(node.itemDefinitionId)) {
      return node;
    }
  }
  return null;
}

function isNearKiosk(state: BenchRunState): boolean {
  return (
    Math.hypot(state.combat.player.x - BENCH_KIOSK.x, state.combat.player.y - BENCH_KIOSK.y) <=
    BENCH_KIOSK.range
  );
}

export function refreshCombatLoadout(state: BenchRunState): void {
  const projected = projectFusionInventory(state.fusion);
  state.combat.inventory = [...projected.instances];
  state.combat.selectedPrimaryInstanceId = projected.selectedPrimaryInstanceId;
  state.combat.compiledLoadout = compileLoadout(
    ITEM_CATALOG,
    projected.instances,
    projected.selectedPrimaryInstanceId,
  );
}

export function openFusionPreview(state: BenchRunState): void {
  if (state.preview !== null) {
    state.recentChange = 'A fusion preview is already open.';
    return;
  }
  if (!isNearKiosk(state)) {
    state.recentChange = 'Move closer to the Bench Warrant to preview fusion.';
    return;
  }
  const primary = topLevelLeaf(state, state.fusion.selectedPrimaryInstanceId);
  if (primary === null) {
    state.recentChange = 'Emitter Mount is already complete: no standalone primary remains.';
    return;
  }
  const carrier = findCarrierLeaf(state);
  if (carrier === null) {
    state.recentChange = 'No emitter carrier is available for Emitter Mount fusion.';
    return;
  }
  const resolution = resolveEmitterMount(state.fusion, primary.instanceId, carrier.instanceId, state.tick);
  if (!resolution.accepted) {
    state.recentChange = resolution.message;
    return;
  }
  state.preview = resolution.proposal;
  state.paused = true;
  state.recentChange =
    `Previewing Emitter Mount: ${resolution.proposal.primaryName} + ${resolution.proposal.carrierName} ` +
    `for $${resolution.proposal.fee}.`;
  pushTrace(state, `preview ${resolution.proposal.transactionId}: fee $${resolution.proposal.fee}`);
}

export function confirmFusion(state: BenchRunState): void {
  const preview = state.preview;
  if (preview === null) {
    state.recentChange = 'No fusion preview is open.';
    return;
  }
  const result = commitEmitterMount(state.fusion, {
    primaryInstanceId: preview.primaryInstanceId,
    carrierInstanceId: preview.carrierInstanceId,
    expectedRevision: preview.sourceRevision,
    transactionId: preview.transactionId,
    createdTick: state.tick,
  });
  if (!result.committed) {
    state.recentChange = result.message;
    return;
  }
  state.fusion = result.state;
  state.preview = null;
  state.paused = false;
  state.carrier.mode = 'emitter';
  state.carrier.recalling = false;
  refreshCombatLoadout(state);
  state.recentChange = `Emitter Mount complete: firing origin is now the car for $${result.record.fee}.`;
  pushTrace(state, `commit ${result.record.transactionId}: fee $${result.record.fee}`);
}

export function cancelFusion(state: BenchRunState): void {
  if (state.preview === null) {
    state.recentChange = 'No fusion preview is open.';
    return;
  }
  state.preview = null;
  state.paused = false;
  state.recentChange = 'Fusion preview cancelled.';
  pushTrace(state, 'preview cancelled');
}

export function acquireLateModifier(state: BenchRunState): void {
  const scenario = getBenchScenario(state.scenarioId);
  if (scenario.lateModifierDefinitionId === null) {
    state.recentChange = 'No late pickup is available in this scenario.';
    return;
  }
  const fused = state.carrier.mode === 'emitter' && state.fusion.inventory.some((node) => node.kind === 'composite');
  if (!fused) {
    state.recentChange = 'The late Gel Pen Pack is available after Emitter Mount fusion.';
    return;
  }
  const alreadyOwned = state.fusion.inventory.some((node) => {
    if (node.kind === 'leaf') {
      return node.itemDefinitionId === scenario.lateModifierDefinitionId;
    }
    return (
      node.primary.itemDefinitionId === scenario.lateModifierDefinitionId ||
      node.carrier.itemDefinitionId === scenario.lateModifierDefinitionId
    );
  });
  if (alreadyOwned) {
    state.recentChange = 'The late Gel Pen Pack was already acquired.';
    return;
  }
  const spec = lateModifierSpec(state.scenarioId);
  const leaf: InventoryLeaf = {
    kind: 'leaf',
    instanceId: spec.instanceId,
    itemDefinitionId: spec.itemDefinitionId,
    acquisitionKind: spec.acquisitionKind,
    sourceLocationId: spec.sourceLocationId,
    sourceStockId: spec.sourceStockId,
    acquisitionTick: state.tick,
  };
  const next = {
    ...state.fusion,
    inventory: [...state.fusion.inventory, leaf],
    revision: state.fusion.revision + 1,
  };
  if (!isValidFusionInventoryState(next)) {
    state.recentChange = 'The late pickup failed validation; nothing changed.';
    return;
  }
  state.fusion = next;
  refreshCombatLoadout(state);
  state.recentChange = 'Acquired the late Gel Pen Pack; the next attack carries Sticky.';
  pushTrace(state, `late pickup ${spec.instanceId}: revision ${next.revision}`);
}

export function transferBenchRoom(state: BenchRunState): boolean {
  const doorway = doorwayForRoom(state.activeRoom);
  const player = state.combat.player;
  if (!circleIntersectsRect(player.x, player.y, player.radius, doorway)) {
    return false;
  }
  const destination = state.activeRoom === 'service' ? 'test_bay' : 'service';
  const anchors = destination === 'test_bay' ? TEST_BAY_ANCHORS : SERVICE_ENTRY_ANCHORS;
  state.combat.projectiles = [];
  state.combat.surfaces = [];
  state.combat.eventQueue = [];
  state.combat.walls = [...wallsForRoom(destination)];
  state.combat.enemies = enemiesForRoom(destination);
  state.combat.nextEntityId =
    Math.max(0, ...state.combat.enemies.map((enemy) => enemy.id)) + 1;
  state.combat.player.x = anchors.player.x;
  state.combat.player.y = anchors.player.y;
  state.carrier.x = anchors.carrier.x;
  state.carrier.y = anchors.carrier.y;
  state.carrier.recalling = false;
  state.activeRoom = destination;
  state.recentChange = destination === 'test_bay' ? 'Entered the combat test bay.' : 'Returned to the service room.';
  pushTrace(state, `transfer to ${destination}`);
  return true;
}
