/**
 * One entry point for every Bench Warrant fusion: two owned items in, the
 * right recipe out (Emitter Mount for the RC car and a shooter, a hybrid for
 * anything else), with the same recompute-then-commit guarantees the Emitter
 * Mount transaction has always had.
 */
import { ITEM_CATALOG } from '../items/catalog';
import { freezeDeep } from '../items/types';
import { resolveEmitterMount } from './emitterMount';
import {
  HYBRID_BASE_FEE,
  HYBRID_CLEAN_DISCOUNT,
  MAX_FUSION_PARTS,
  fusedDefinitionFor,
  fusionPairFor,
  hybridDefinition,
  hybridFee,
  hybridHighlights,
  isSignatureFusion,
} from './hybrid';
import { fusionPartCount, isCleanPart, isValidFusionInventoryState, nodeDefinitionId } from './inventory';
import { commitEmitterMount } from './transaction';
import type {
  CommitResult,
  FusionInventoryState,
  FusionProposal,
  FusionTransactionRecord,
  FusionPart,
  FusionInventoryNode,
  HybridProposal,
  HybridResolution,
} from './types';

export const HYBRID_IRREVERSIBILITY_NOTICE =
  'Fusion is permanent: both items are consumed into one, it cannot be taken apart, and no refund is given.';

type Resolution =
  | { readonly accepted: true; readonly proposal: FusionProposal }
  | { readonly accepted: false; readonly reason: string; readonly message: string };

/** A node that can go into a hybrid: an item, or a hybrid (never an Emitter Mount). */
function asPart(node: FusionInventoryNode | undefined): FusionPart | null {
  if (!node) return null;
  return node.kind === 'leaf' || node.recipeId === 'hybrid' ? node : null;
}

function rejected(reason: string, message: string): { accepted: false; reason: string; message: string } {
  return { accepted: false, reason, message };
}

export function hybridTransactionIdFor(nextCompositeId: number): string {
  return `hybrid-tx-${nextCompositeId}`;
}

export function hybridCompositeIdFor(nextCompositeId: number): string {
  return `hybrid-${nextCompositeId}`;
}

function resolveHybrid(state: FusionInventoryState, baseInstanceId: string, ingredientInstanceId: string, createdTick: number): HybridResolution {
  const base = asPart(state.inventory.find((node) => node.instanceId === baseInstanceId));
  const ingredient = asPart(state.inventory.find((node) => node.instanceId === ingredientInstanceId));
  if (!base || !ingredient) {
    return rejected('not_a_part', 'The RC car is already carrying the shot: an Emitter Mount cannot be fused again.');
  }
  const parts = fusionPartCount(base) + fusionPartCount(ingredient);
  if (parts > MAX_FUSION_PARTS) {
    return rejected('too_many_parts', `Too much warranty to void: one fusion holds at most four items (this would be ${parts}).`);
  }
  const definition = hybridDefinition(nodeDefinitionId(base), nodeDefinitionId(ingredient));
  const clean = isCleanPart(base) && isCleanPart(ingredient);
  const cleanDiscount = clean ? HYBRID_CLEAN_DISCOUNT : 0;
  const fee = hybridFee(parts, clean);
  if (state.cash < fee) {
    return rejected('insufficient_cash', `Fusing costs $${fee}, but only $${state.cash} is available.`);
  }
  const transactionId = hybridTransactionIdFor(state.nextCompositeId);
  const compositeInstanceId = hybridCompositeIdFor(state.nextCompositeId);
  const proposal: HybridProposal = freezeDeep({
    recipeId: 'hybrid',
    transactionId,
    sourceRevision: state.revision,
    primaryInstanceId: base.instanceId,
    carrierInstanceId: ingredient.instanceId,
    primaryName: fusedDefinitionFor(nodeDefinitionId(base))!.name,
    carrierName: fusedDefinitionFor(nodeDefinitionId(ingredient))!.name,
    primaryProvenance: isCleanPart(base) ? 'purchased' : 'stolen',
    carrierProvenance: isCleanPart(ingredient) ? 'purchased' : 'stolen',
    baseFee: fee + cleanDiscount,
    cleanDiscount,
    fee,
    resultDefinitionId: definition.id,
    resultName: definition.name,
    highlights: hybridHighlights(nodeDefinitionId(base), nodeDefinitionId(ingredient)),
    signature: isSignatureFusion(nodeDefinitionId(base), nodeDefinitionId(ingredient)),
    retainedInstanceIds: state.inventory
      .filter((node) => node.instanceId !== base.instanceId && node.instanceId !== ingredient.instanceId)
      .map((node) => node.instanceId),
    compositePreview: {
      kind: 'composite',
      instanceId: compositeInstanceId,
      recipeId: 'hybrid',
      createdTick,
      transactionId,
      primary: { ...base },
      carrier: { ...ingredient },
    },
    selectedCompositeInstanceId: compositeInstanceId,
    selectsResult: definition.base !== undefined,
    irreversibilityNotice: HYBRID_IRREVERSIBILITY_NOTICE,
  });
  return { accepted: true, proposal };
}

/**
 * The proposal for fusing two owned top-level items, in the order they were
 * picked (the recipe decides which becomes the base).
 */
export function resolveFusion(
  state: FusionInventoryState,
  firstInstanceId: string,
  secondInstanceId: string,
  createdTick = 0,
): Resolution {
  if (!state.serviceAvailable) {
    return rejected('service_unavailable', 'The Bench Warrant fusion service is unavailable.');
  }
  if (firstInstanceId === secondInstanceId) {
    return rejected('duplicate_selection', 'Pick two different items to fuse.');
  }
  const first = state.inventory.find((node) => node.instanceId === firstInstanceId);
  const second = state.inventory.find((node) => node.instanceId === secondInstanceId);
  if (!first || !second) {
    return rejected('missing_component', 'Both items must be owned.');
  }
  const firstPart = asPart(first);
  const secondPart = asPart(second);
  if (!firstPart || !secondPart) {
    return rejected('not_a_part', 'The RC car is already carrying the shot: an Emitter Mount cannot be fused again.');
  }
  const firstDefinition = fusedDefinitionFor(nodeDefinitionId(firstPart));
  const secondDefinition = fusedDefinitionFor(nodeDefinitionId(secondPart));
  if (!firstDefinition || !secondDefinition) {
    return rejected('unknown_definition', 'Both items must be known catalog items.');
  }
  if (firstDefinition.id === secondDefinition.id) {
    return rejected('same_item', `Two ${firstDefinition.name}s do not make anything new.`);
  }
  const parts = fusionPartCount(firstPart) + fusionPartCount(secondPart);
  if (parts > MAX_FUSION_PARTS) {
    return rejected('too_many_parts', `Too much warranty to void: one fusion holds at most four items (this would be ${parts}).`);
  }
  const pair = fusionPairFor(firstDefinition, secondDefinition);
  if (pair.recipe === null) return rejected('unsupported_pair', pair.reason);
  if (pair.recipe === 'emitter_mount' && (firstPart.kind !== 'leaf' || secondPart.kind !== 'leaf')) {
    return rejected('unsupported_pair', 'The RC Car only carries a single, unfused shooter.');
  }
  const baseInstanceId = pair.baseId === firstDefinition.id ? first.instanceId : second.instanceId;
  const ingredientInstanceId = baseInstanceId === first.instanceId ? second.instanceId : first.instanceId;
  if (pair.recipe === 'emitter_mount') {
    return resolveEmitterMount(state, baseInstanceId, ingredientInstanceId, createdTick);
  }
  return resolveHybrid(state, baseInstanceId, ingredientInstanceId, createdTick);
}

/** Commits a proposal after recomputing it against current state. */
export function commitFusion(
  state: FusionInventoryState,
  proposal: FusionProposal,
  createdTick: number,
): CommitResult {
  const input = {
    primaryInstanceId: proposal.primaryInstanceId,
    carrierInstanceId: proposal.carrierInstanceId,
    expectedRevision: proposal.sourceRevision,
    transactionId: proposal.transactionId,
    createdTick,
  };
  if (proposal.recipeId === 'emitter_mount') return commitEmitterMount(state, input);

  const refuse = (reason: string, message: string): CommitResult => ({ committed: false, reason, message, state });
  if (state.committedTransactions.some((record) => record.transactionId === input.transactionId)) {
    return refuse('duplicate_transaction', `Transaction "${input.transactionId}" was already committed.`);
  }
  if (input.expectedRevision !== state.revision) {
    return refuse('stale_revision', 'Something changed since the preview: pick the items again.');
  }
  const resolution = resolveHybrid(state, input.primaryInstanceId, input.carrierInstanceId, createdTick);
  if (!resolution.accepted) return refuse(resolution.reason, resolution.message);
  const fresh = resolution.proposal;
  if (fresh.transactionId !== input.transactionId) {
    return refuse('invalid_transaction', 'The proposal no longer matches the bench.');
  }
  const record: FusionTransactionRecord = freezeDeep({
    transactionId: fresh.transactionId,
    recipeId: 'hybrid',
    primaryInstanceId: fresh.primaryInstanceId,
    carrierInstanceId: fresh.carrierInstanceId,
    compositeInstanceId: fresh.selectedCompositeInstanceId,
    fee: fresh.fee,
    committedRevision: state.revision + 1,
  });
  const consumed = new Set([fresh.primaryInstanceId, fresh.carrierInstanceId]);
  // A fused weapon goes straight into your hands; a passive kit leaves the
  // equipped weapon alone (unless it was one of the two ingredients).
  const selected = fresh.selectsResult || consumed.has(state.selectedPrimaryInstanceId)
    ? fresh.selectedCompositeInstanceId
    : state.selectedPrimaryInstanceId;
  const next: FusionInventoryState = {
    inventory: [...state.inventory.filter((node) => !consumed.has(node.instanceId)), fresh.compositePreview],
    cash: state.cash - fresh.fee,
    revision: state.revision + 1,
    selectedPrimaryInstanceId: selected,
    serviceAvailable: state.serviceAvailable,
    nextCompositeId: state.nextCompositeId + 1,
    committedTransactions: [...state.committedTransactions, record],
  };
  if (!isValidFusionInventoryState(next)) {
    return refuse('invalid_commit', 'The computed fusion result failed validation.');
  }
  return { committed: true, state: freezeDeep(next), record };
}
