/**
 * Fusion inventory-tree validation and deterministic projection (M4 Task 3).
 *
 * This module owns structural validation of the serializable component forest
 * plus the deterministic projection consumed by the existing loadout compiler.
 * Gameplay rules live here; Phaser only presents them.
 */
import { ITEM_CATALOG } from '../items/catalog';
import type { ItemDefinition, ItemInstance } from '../items/types';
import type {
  EmitterMountComposite,
  FusionInventoryNode,
  FusionInventoryState,
  FusionTransactionRecord,
  InventoryLeaf,
} from './types';

const DEFINITIONS_BY_ID = new Map<string, ItemDefinition>(
  ITEM_CATALOG.map((definition) => [definition.id, definition]),
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isProjectilePrimary(definition: ItemDefinition): boolean {
  return definition.base?.delivery === 'projectile';
}

function isEmitterCarrier(definition: ItemDefinition): boolean {
  return definition.capabilities?.includes('emitter_carrier') === true;
}

function expectedFeeFor(primary: InventoryLeaf, carrier: InventoryLeaf): number {
  const bothClean =
    primary.acquisitionKind === 'purchased' && carrier.acquisitionKind === 'purchased';
  return bothClean ? 4 : 6;
}

function isValidLeaf(node: FusionInventoryNode): node is InventoryLeaf {
  if (node.kind !== 'leaf') {
    return false;
  }
  return (
    isNonEmptyString(node.instanceId) &&
    DEFINITIONS_BY_ID.has(node.itemDefinitionId) &&
    (node.acquisitionKind === 'purchased' || node.acquisitionKind === 'stolen') &&
    typeof node.sourceLocationId === 'string' &&
    typeof node.sourceStockId === 'string' &&
    isNonNegativeInteger(node.acquisitionTick)
  );
}

function isValidComposite(node: FusionInventoryNode): node is EmitterMountComposite {
  if (node.kind !== 'composite') {
    return false;
  }
  if (
    !isNonEmptyString(node.instanceId) ||
    node.recipeId !== 'emitter_mount' ||
    !isNonNegativeInteger(node.createdTick) ||
    !isNonEmptyString(node.transactionId) ||
    !isValidLeaf(node.primary) ||
    !isValidLeaf(node.carrier) ||
    node.primary.instanceId === node.carrier.instanceId
  ) {
    return false;
  }
  const primaryDefinition = DEFINITIONS_BY_ID.get(node.primary.itemDefinitionId);
  const carrierDefinition = DEFINITIONS_BY_ID.get(node.carrier.itemDefinitionId);
  if (!primaryDefinition || !carrierDefinition) {
    return false;
  }
  if (!isProjectilePrimary(primaryDefinition)) {
    return false;
  }
  if (!isEmitterCarrier(carrierDefinition)) {
    return false;
  }
  return true;
}

function isValidRecord(record: FusionTransactionRecord): boolean {
  return (
    isNonEmptyString(record.transactionId) &&
    record.recipeId === 'emitter_mount' &&
    isNonEmptyString(record.primaryInstanceId) &&
    isNonEmptyString(record.carrierInstanceId) &&
    isNonEmptyString(record.compositeInstanceId) &&
    isNonNegativeInteger(record.fee) &&
    isNonNegativeInteger(record.committedRevision)
  );
}

export function isValidFusionInventoryState(state: FusionInventoryState): boolean {
  if (
    !Array.isArray(state.inventory) ||
    typeof state.cash !== 'number' ||
    !Number.isInteger(state.cash) ||
    state.cash < 0 ||
    !isNonNegativeInteger(state.revision) ||
    !isNonEmptyString(state.selectedPrimaryInstanceId) ||
    typeof state.serviceAvailable !== 'boolean' ||
    !isNonNegativeInteger(state.nextCompositeId) ||
    !Array.isArray(state.committedTransactions)
  ) {
    return false;
  }
  const topLevelIds = new Set<string>();
  for (const node of state.inventory) {
    if (!isNonEmptyString(node.instanceId) || topLevelIds.has(node.instanceId)) {
      return false;
    }
    topLevelIds.add(node.instanceId);
    if (!isValidLeaf(node) && !isValidComposite(node)) {
      return false;
    }
  }
  if (!topLevelIds.has(state.selectedPrimaryInstanceId)) {
    return false;
  }
  const forestIds = new Set<string>(topLevelIds);
  for (const node of state.inventory) {
    if (node.kind !== 'composite') {
      continue;
    }
    for (const componentId of [node.primary.instanceId, node.carrier.instanceId]) {
      if (forestIds.has(componentId)) {
        return false;
      }
      forestIds.add(componentId);
    }
  }
  const transactionIds = new Set<string>();
  const committedComponentIds = new Set<string>();
  for (const record of state.committedTransactions) {
    if (!isValidRecord(record)) {
      return false;
    }
    if (transactionIds.has(record.transactionId)) {
      return false;
    }
    transactionIds.add(record.transactionId);
    for (const committedId of [
      record.primaryInstanceId,
      record.carrierInstanceId,
      record.compositeInstanceId,
    ]) {
      if (committedComponentIds.has(committedId)) {
        return false;
      }
      committedComponentIds.add(committedId);
    }
  }
  const composites = state.inventory.filter(
    (node): node is EmitterMountComposite => node.kind === 'composite',
  );
  const recordsByTransaction = new Map(
    state.committedTransactions.map((record) => [record.transactionId, record]),
  );
  const compositesByTransaction = new Map(
    composites.map((composite) => [composite.transactionId, composite]),
  );
  if (recordsByTransaction.size !== state.committedTransactions.length) {
    return false;
  }
  if (compositesByTransaction.size !== composites.length) {
    return false;
  }
  for (const composite of composites) {
    const record = recordsByTransaction.get(composite.transactionId);
    if (!record) {
      return false;
    }
    if (
      record.primaryInstanceId !== composite.primary.instanceId ||
      record.carrierInstanceId !== composite.carrier.instanceId ||
      record.compositeInstanceId !== composite.instanceId
    ) {
      return false;
    }
    if (record.fee !== expectedFeeFor(composite.primary, composite.carrier)) {
      return false;
    }
    if (record.committedRevision < 1 || record.committedRevision > state.revision) {
      return false;
    }
  }
  for (const record of state.committedTransactions) {
    const composite = compositesByTransaction.get(record.transactionId);
    if (!composite) {
      return false;
    }
    if (
      composite.primary.instanceId !== record.primaryInstanceId ||
      composite.carrier.instanceId !== record.carrierInstanceId ||
      composite.instanceId !== record.compositeInstanceId
    ) {
      return false;
    }
  }
  const committedRevisions = new Set<number>();
  for (const record of state.committedTransactions) {
    if (committedRevisions.has(record.committedRevision)) {
      return false;
    }
    committedRevisions.add(record.committedRevision);
  }
  return true;
}

export type ProjectedFusionInventory = {
  readonly instances: readonly ItemInstance[];
  readonly selectedPrimaryInstanceId: string;
};

/**
 * Deterministic projection from fusion inventory to the existing loadout
 * compiler. A composite contributes its primary definition under the
 * composite instance ID; the integrated carrier never appears as an
 * independent effect. Standalone leaves pass through unchanged.
 */
export function projectFusionInventory(
  state: FusionInventoryState,
): ProjectedFusionInventory {
  return {
    instances: state.inventory.map((node) =>
      node.kind === 'leaf'
        ? { instanceId: node.instanceId, itemId: node.itemDefinitionId }
        : { instanceId: node.instanceId, itemId: node.primary.itemDefinitionId },
    ),
    selectedPrimaryInstanceId: state.selectedPrimaryInstanceId,
  };
}
