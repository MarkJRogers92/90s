/**
 * In-run Bench Warrant fusion.
 *
 * The run owns one fusion inventory, so Emitter Mount fusion has to go
 * through the shared M4 resolver and transaction rather than a second rule.
 * This module is the thin run-level wrapper the M5 run was missing: it
 * previews against the run inventory, commits the proposal exactly once, and
 * hands the committed inventory back to the run with the run's cash following
 * the fee, so `state.cash` and `state.inventory.cash` can never disagree.
 */
import { resolveEmitterMount } from '../fusion/emitterMount';
import { commitEmitterMount } from '../fusion/transaction';
import { blockedRunReason, publishRunFeedback } from './economy';
import { refreshRunLoadout } from './loadout';
import type { MvpCommandResult, MvpRunState } from './types';

function rejected(reason: string): MvpCommandResult {
  return { accepted: false, reason };
}

/** The Emitter Mount proposal for two owned run leaves, or null when refused. */
export function previewRunEmitterMount(
  state: MvpRunState,
  primaryInstanceId: string,
  carrierInstanceId: string,
) {
  const resolution = resolveEmitterMount(
    state.inventory,
    primaryInstanceId,
    carrierInstanceId,
    state.tick,
  );
  return resolution.accepted ? resolution.proposal : null;
}

/**
 * Fuses two owned run leaves into one Emitter Mount composite.
 *
 * The shared transaction computes and validates the next inventory; the run
 * then adopts it, deducts the fee from the run cash exactly once, bumps the
 * inventory revision through the returned state, and recompiles the loadout so
 * the next attack uses the fused behaviour. A rejected fusion leaves cash,
 * inventory, revision, and loadout untouched.
 */
export function commitRunEmitterMount(
  state: MvpRunState,
  primaryInstanceId: string,
  carrierInstanceId: string,
): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const resolution = resolveEmitterMount(
    state.inventory,
    primaryInstanceId,
    carrierInstanceId,
    state.tick,
  );
  if (!resolution.accepted) {
    return rejected(resolution.message);
  }

  const committed = commitEmitterMount(state.inventory, {
    primaryInstanceId: resolution.proposal.primaryInstanceId,
    carrierInstanceId: resolution.proposal.carrierInstanceId,
    expectedRevision: resolution.proposal.sourceRevision,
    transactionId: resolution.proposal.transactionId,
    createdTick: state.tick,
  });
  if (!committed.committed) {
    return rejected(committed.message);
  }

  state.inventory = committed.state;
  state.cash = committed.state.cash;
  refreshRunLoadout(state);

  const message =
    `Emitter Mount complete: ${resolution.proposal.primaryName} + ` +
    `${resolution.proposal.carrierName} for $${committed.record.fee}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}
