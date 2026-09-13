/**
 * Pure Emitter Mount preview resolver shared by preview rendering and commit.
 *
 * Compatibility derives generically from definition data: the primary leaf
 * must declare a projectile delivery and the carrier leaf must declare the
 * emitter_carrier capability. No branch names an item definition ID.
 *
 * The optional createdTick carries the authoritative non-negative integer
 * creation tick supplied by the future M4 run integration. It defaults to 0
 * so existing three-argument preview calls stay valid and deterministic;
 * commit recomputes through this resolver with the caller-supplied tick.
 */
import { ITEM_CATALOG } from '../items/catalog';
import { freezeDeep } from '../items/types';
import type { ItemDefinition } from '../items/types';
import type {
  EmitterMountProposal,
  EmitterMountResolution,
  FusionInventoryState,
} from './types';

export const EMITTER_MOUNT_BASE_FEE = 6;
export const EMITTER_MOUNT_CLEAN_DISCOUNT = 2;

export const EMITTER_MOUNT_IRREVERSIBILITY_NOTICE =
  'Emitter Mount fusion is permanent and irreversible: both ingredients are ' +
  'consumed into one composite, the composite cannot be dismantled, and no refund is given.';

function definitionById(itemDefinitionId: string): ItemDefinition | undefined {
  return ITEM_CATALOG.find((definition) => definition.id === itemDefinitionId);
}

function isProjectilePrimary(definition: ItemDefinition): boolean {
  return definition.base?.delivery === 'projectile';
}

function isEmitterCarrier(definition: ItemDefinition): boolean {
  return definition.capabilities?.includes('emitter_carrier') === true;
}

function rejected(reason: string, message: string): EmitterMountResolution {
  return { accepted: false, reason, message };
}

export function transactionIdFor(nextCompositeId: number): string {
  return `emitter-mount-tx-${nextCompositeId}`;
}

export function compositeIdFor(nextCompositeId: number): string {
  return `emitter-mount-${nextCompositeId}`;
}

function invalidTickMessage(value: unknown): string {
  return `Emitter Mount creation tick must be a non-negative integer, but received ${String(value)}.`;
}

export function resolveEmitterMount(
  state: FusionInventoryState,
  primaryInstanceId: string,
  carrierInstanceId: string,
  createdTick: number = 0,
): EmitterMountResolution {
  if (
    typeof createdTick !== 'number' ||
    !Number.isInteger(createdTick) ||
    createdTick < 0
  ) {
    return rejected('invalid_created_tick', invalidTickMessage(createdTick));
  }
  if (!state.serviceAvailable) {
    return rejected(
      'service_unavailable',
      'The Bench Warrant fusion service is unavailable, so no proposal is offered.',
    );
  }
  const primaryNode = state.inventory.find((node) => node.instanceId === primaryInstanceId);
  const carrierNode = state.inventory.find((node) => node.instanceId === carrierInstanceId);
  if (!primaryNode || !carrierNode) {
    return rejected(
      'missing_component',
      `Both fusion ingredients must be owned: missing ${!primaryNode ? `"${primaryInstanceId}"` : `"${carrierInstanceId}"`}.`,
    );
  }
  if (primaryInstanceId === carrierInstanceId) {
    return rejected(
      'duplicate_selection',
      'Emitter Mount requires two distinct ingredients: one primary leaf and one carrier leaf.',
    );
  }
  if (primaryNode.kind !== 'leaf' || carrierNode.kind !== 'leaf') {
    return rejected(
      'not_a_leaf',
      'Emitter Mount fuses exactly two standalone leaves; composites cannot be fused again.',
    );
  }
  const primaryDefinition = definitionById(primaryNode.itemDefinitionId);
  const carrierDefinition = definitionById(carrierNode.itemDefinitionId);
  if (!primaryDefinition || !carrierDefinition) {
    return rejected(
      'unknown_definition',
      'Both fusion ingredients must reference known catalog definitions.',
    );
  }
  if (!isProjectilePrimary(primaryDefinition)) {
    return rejected(
      'unsupported_primary',
      `Emitter Mount requires a supported projectile primary, but ${primaryDefinition.name} is not one.`,
    );
  }
  if (!isEmitterCarrier(carrierDefinition)) {
    return rejected(
      'unsupported_carrier',
      `Emitter Mount requires an emitter-carrier ingredient, but ${carrierDefinition.name} is not one.`,
    );
  }
  const stolenIngredient =
    primaryNode.acquisitionKind === 'stolen' || carrierNode.acquisitionKind === 'stolen';
  const cleanDiscount = stolenIngredient ? 0 : EMITTER_MOUNT_CLEAN_DISCOUNT;
  const fee = EMITTER_MOUNT_BASE_FEE - cleanDiscount;
  if (state.cash < fee) {
    return rejected(
      'insufficient_cash',
      `Emitter Mount costs $${fee}, but only $${state.cash} is available.`,
    );
  }
  const transactionId = transactionIdFor(state.nextCompositeId);
  const compositeInstanceId = compositeIdFor(state.nextCompositeId);
  const retainedInstanceIds = state.inventory
    .filter((node) => node.instanceId !== primaryInstanceId && node.instanceId !== carrierInstanceId)
    .map((node) => node.instanceId);
  const proposal: EmitterMountProposal = freezeDeep({
    recipeId: 'emitter_mount',
    transactionId,
    sourceRevision: state.revision,
    primaryInstanceId,
    carrierInstanceId,
    primaryName: primaryDefinition.name,
    carrierName: carrierDefinition.name,
    primaryProvenance: primaryNode.acquisitionKind,
    carrierProvenance: carrierNode.acquisitionKind,
    baseFee: EMITTER_MOUNT_BASE_FEE,
    cleanDiscount,
    fee,
    retainedInstanceIds,
    excludedNotes: [
      `${carrierDefinition.name} (${carrierInstanceId}) no longer acts as an independent support companion after fusion.`,
      'Autonomous seeking and bump damage are lost; the carrier becomes the steered firing origin.',
    ],
    operation: {
      attackOrigin: 'carrier',
      steering: 'pointer',
      recallKey: 'R',
      firingOrigin: `carrier position (${carrierInstanceId})`,
      lostBehavior: 'autonomous seeking and bump damage',
    },
    compositePreview: {
      kind: 'composite',
      instanceId: compositeInstanceId,
      recipeId: 'emitter_mount',
      createdTick,
      transactionId,
      primary: { ...primaryNode },
      carrier: { ...carrierNode },
    },
    selectedCompositeInstanceId: compositeInstanceId,
    irreversibilityNotice: EMITTER_MOUNT_IRREVERSIBILITY_NOTICE,
  });
  return { accepted: true, proposal };
}
