/**
 * Fusion inventory-tree validation and deterministic projection (M4 Task 3).
 *
 * This module owns structural validation of the serializable component forest
 * plus the deterministic projection consumed by the existing loadout compiler.
 * Gameplay rules live here; Phaser only presents them.
 */
import { ITEM_CATALOG } from '../items/catalog';
import type { ItemDefinition, ItemInstance } from '../items/types';
import { hybridDefinitionId, hybridFee, isHybridPair } from './hybrid';
import type {
  FusionPart,
  FusionComposite,
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

/** Every catalog item a node was made from, base first. */
export function compositeLeaves(node: FusionInventoryNode): InventoryLeaf[] {
  if (node.kind === 'leaf') return [node];
  if (node.recipeId === 'emitter_mount') return [node.primary, node.carrier];
  return [...compositeLeaves(node.primary), ...compositeLeaves(node.carrier)];
}

/** How many catalog items a node holds: 1 for an item, up to four for a hybrid. */
export function fusionPartCount(node: FusionInventoryNode): number {
  return compositeLeaves(node).length;
}

/** Nothing in it was stolen: bought, or (round 32) found. */
export function isCleanPart(node: FusionInventoryNode): boolean {
  return compositeLeaves(node).every((leaf) => leaf.acquisitionKind !== 'stolen');
}

/** Every hybrid inside a node (not the node itself). */
function nestedHybrids(node: FusionInventoryNode): FusionComposite[] {
  if (node.kind === 'leaf' || node.recipeId !== 'hybrid') return [];
  return [node.primary, node.carrier].flatMap((part) => (part.kind === 'composite' ? [part, ...nestedHybrids(part)] : []));
}

function expectedFeeFor(composite: FusionComposite): number {
  const bothClean = isCleanPart(composite.primary) && isCleanPart(composite.carrier);
  if (composite.recipeId === 'hybrid') return hybridFee(fusionPartCount(composite), bothClean);
  return bothClean ? 4 : 6;
}

function isValidLeaf(node: FusionInventoryNode): node is InventoryLeaf {
  if (node.kind !== 'leaf') {
    return false;
  }
  return (
    isNonEmptyString(node.instanceId) &&
    DEFINITIONS_BY_ID.has(node.itemDefinitionId) &&
    (node.acquisitionKind === 'purchased' || node.acquisitionKind === 'stolen' || node.acquisitionKind === 'found') &&
    typeof node.sourceLocationId === 'string' &&
    typeof node.sourceStockId === 'string' &&
    isNonNegativeInteger(node.acquisitionTick)
  );
}

function isValidPart(node: FusionPart): boolean {
  return node.kind === 'leaf' ? isValidLeaf(node) : isValidComposite(node);
}

function isValidComposite(node: FusionInventoryNode): node is FusionComposite {
  if (node.kind !== 'composite') {
    return false;
  }
  if (
    !isNonEmptyString(node.instanceId) ||
    (node.recipeId !== 'emitter_mount' && node.recipeId !== 'hybrid') ||
    !isNonNegativeInteger(node.createdTick) ||
    !isNonEmptyString(node.transactionId) ||
    node.primary.instanceId === node.carrier.instanceId
  ) {
    return false;
  }
  if (node.recipeId === 'hybrid') {
    return (
      isValidPart(node.primary) &&
      isValidPart(node.carrier) &&
      isHybridPair(nodeDefinitionId(node.primary), nodeDefinitionId(node.carrier))
    );
  }
  if (!isValidLeaf(node.primary) || !isValidLeaf(node.carrier)) {
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
    (record.recipeId === 'emitter_mount' || record.recipeId === 'hybrid') &&
    isNonEmptyString(record.primaryInstanceId) &&
    isNonEmptyString(record.carrierInstanceId) &&
    isNonEmptyString(record.compositeInstanceId) &&
    isNonNegativeInteger(record.fee) &&
    isNonNegativeInteger(record.committedRevision)
  );
}

/** The number a fusion or its transaction was issued under, e.g. 3 for `hybrid-tx-3`. */
const FUSION_ID = /^(?:hybrid|emitter-mount)(?:-tx)?-(\d+)$/;

/**
 * The next fusion id must be past every one already issued, or a later fusion
 * would reuse an id and two transactions would share it.
 */
function nextCompositeIdIsFresh(state: FusionInventoryState, forestIds: ReadonlySet<string>): boolean {
  const issued = [...forestIds, ...state.committedTransactions.flatMap((record) => [record.transactionId, record.compositeInstanceId])];
  return issued.every((id) => {
    const match = FUSION_ID.exec(id);
    return !match || Number(match[1]) < state.nextCompositeId;
  });
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
  const addParts = (node: FusionInventoryNode): boolean => {
    if (node.kind !== 'composite') {
      return true;
    }
    for (const part of [node.primary, node.carrier]) {
      if (forestIds.has(part.instanceId)) {
        return false;
      }
      forestIds.add(part.instanceId);
      if (!addParts(part)) {
        return false;
      }
    }
    return true;
  };
  for (const node of state.inventory) {
    if (!addParts(node)) {
      return false;
    }
  }
  const transactionIds = new Set<string>();
  // A hybrid fused again is one record's result and the next record's part,
  // so results and parts are each unique, but one id may be both.
  const committedPartIds = new Set<string>();
  const committedResultIds = new Set<string>();
  for (const record of state.committedTransactions) {
    if (!isValidRecord(record)) {
      return false;
    }
    if (transactionIds.has(record.transactionId)) {
      return false;
    }
    transactionIds.add(record.transactionId);
    for (const partId of [record.primaryInstanceId, record.carrierInstanceId]) {
      if (committedPartIds.has(partId)) {
        return false;
      }
      committedPartIds.add(partId);
    }
    if (committedResultIds.has(record.compositeInstanceId) || record.compositeInstanceId === record.primaryInstanceId || record.compositeInstanceId === record.carrierInstanceId) {
      return false;
    }
    committedResultIds.add(record.compositeInstanceId);
  }
  const composites = state.inventory.flatMap((node): FusionComposite[] =>
    node.kind === 'composite' ? [node, ...nestedHybrids(node)] : [],
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
      record.compositeInstanceId !== composite.instanceId ||
      record.recipeId !== composite.recipeId
    ) {
      return false;
    }
    if (record.fee !== expectedFeeFor(composite)) {
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
  return nextCompositeIdIsFresh(state, forestIds);
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
        : { instanceId: node.instanceId, itemId: nodeDefinitionId(node) },
    ),
    selectedPrimaryInstanceId: state.selectedPrimaryInstanceId,
  };
}

/**
 * The definition a top-level node acts as: a leaf is itself, an Emitter Mount
 * is its primary (the car is the firing origin, not an effect), and a hybrid
 * is the definition derived from its two ingredients.
 */
export function nodeDefinitionId(node: FusionInventoryNode): string {
  if (node.kind === 'leaf') return node.itemDefinitionId;
  if (node.recipeId === 'hybrid') return hybridDefinitionId(nodeDefinitionId(node.primary), nodeDefinitionId(node.carrier));
  return node.primary.itemDefinitionId;
}
