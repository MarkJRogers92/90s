/**
 * Atomic Emitter Mount transaction: recompute-then-commit plus cancellation.
 *
 * Commit re-runs the pure resolver against current state, builds the complete
 * next value, validates it, and only then returns it. Every rejection and
 * cancellation returns the original state reference unchanged.
 */
import { freezeDeep } from '../items/types';
import { resolveEmitterMount } from './emitterMount';
import { isValidFusionInventoryState } from './inventory';
import type {
  CancelResult,
  CommitInput,
  CommitResult,
  FusionInventoryState,
  FusionTransactionRecord,
} from './types';

function rejected(
  state: FusionInventoryState,
  reason: string,
  message: string,
): CommitResult {
  return { committed: false, reason, message, state };
}

export function commitEmitterMount(
  state: FusionInventoryState,
  input: CommitInput,
): CommitResult {
  const createdTick = input.createdTick ?? 0;
  if (
    typeof createdTick !== 'number' ||
    !Number.isInteger(createdTick) ||
    createdTick < 0
  ) {
    return rejected(
      state,
      'invalid_created_tick',
      `Emitter Mount creation tick must be a non-negative integer, but received ${String(createdTick)}.`,
    );
  }
  if (
    state.committedTransactions.some(
      (record) => record.transactionId === input.transactionId,
    )
  ) {
    return rejected(
      state,
      'duplicate_transaction',
      `Transaction "${input.transactionId}" was already committed.`,
    );
  }
  if (input.expectedRevision !== state.revision) {
    return rejected(
      state,
      'stale_revision',
      `Proposal revision ${input.expectedRevision} does not match current revision ${state.revision}.`,
    );
  }
  const resolution = resolveEmitterMount(
    state,
    input.primaryInstanceId,
    input.carrierInstanceId,
    createdTick,
  );
  if (!resolution.accepted) {
    return rejected(state, resolution.reason, resolution.message);
  }
  const proposal = resolution.proposal;
  if (proposal.transactionId !== input.transactionId) {
    return rejected(
      state,
      'invalid_transaction',
      `Transaction "${input.transactionId}" does not match the current proposal "${proposal.transactionId}".`,
    );
  }
  const record: FusionTransactionRecord = freezeDeep({
    transactionId: proposal.transactionId,
    recipeId: 'emitter_mount',
    primaryInstanceId: proposal.primaryInstanceId,
    carrierInstanceId: proposal.carrierInstanceId,
    compositeInstanceId: proposal.selectedCompositeInstanceId,
    fee: proposal.fee,
    committedRevision: state.revision + 1,
  });
  const next: FusionInventoryState = {
    inventory: [
      ...state.inventory.filter(
        (node) =>
          node.instanceId !== proposal.primaryInstanceId &&
          node.instanceId !== proposal.carrierInstanceId,
      ),
      proposal.compositePreview,
    ],
    cash: state.cash - proposal.fee,
    revision: state.revision + 1,
    selectedPrimaryInstanceId: proposal.selectedCompositeInstanceId,
    serviceAvailable: state.serviceAvailable,
    nextCompositeId: state.nextCompositeId + 1,
    committedTransactions: [...state.committedTransactions, record],
  };
  if (!isValidFusionInventoryState(next)) {
    return rejected(state, 'invalid_commit', 'The computed fusion result failed validation.');
  }
  return { committed: true, state: freezeDeep(next), record };
}

export function cancelFusionPreview(state: FusionInventoryState): CancelResult {
  return { cancelled: true, state };
}
