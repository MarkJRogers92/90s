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
import type { InventoryLeaf } from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import { syncRunCarrier } from './carrier';
import { blockedRunReason, publishRunFeedback } from './economy';
import { refreshRunLoadout } from './loadout';
import type { MvpCommandResult, MvpRunState } from './types';

function rejected(reason: string): MvpCommandResult {
  return { accepted: false, reason };
}

function definitionIsEmitterCarrier(itemDefinitionId: string): boolean {
  return (
    ITEM_CATALOG.find((definition) => definition.id === itemDefinitionId)?.capabilities?.includes(
      'emitter_carrier',
    ) === true
  );
}

/** The selected primary while it is still a standalone leaf, else null. */
function selectedPrimaryLeaf(state: MvpRunState): InventoryLeaf | null {
  const node = state.inventory.inventory.find(
    (entry) => entry.instanceId === state.inventory.selectedPrimaryInstanceId,
  );
  return node?.kind === 'leaf' ? node : null;
}

/** The first owned standalone emitter carrier, or null when none is owned. */
function findRunCarrierLeaf(state: MvpRunState): InventoryLeaf | null {
  for (const node of state.inventory.inventory) {
    if (node.kind === 'leaf' && definitionIsEmitterCarrier(node.itemDefinitionId)) {
      return node;
    }
  }
  return null;
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

/**
 * Opens the Bench Warrant preview for the selected primary and the owned car.
 *
 * Opening pauses the run so the proposal is read, not acted past. The preview
 * holds the proposal's own transaction ID and source revision, so a confirm
 * after any intervening purchase or theft fails atomically instead of fusing
 * against state the player never saw.
 */
export function openRunFusionPreview(state: MvpRunState): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }
  if (state.preview !== null) {
    return rejected('A fusion preview is already open.');
  }
  const primary = selectedPrimaryLeaf(state);
  if (primary === null) {
    return rejected('Emitter Mount is already complete: no standalone primary remains.');
  }
  const carrier = findRunCarrierLeaf(state);
  if (carrier === null) {
    return rejected('No emitter carrier is available for Emitter Mount fusion.');
  }
  const resolution = resolveEmitterMount(
    state.inventory,
    primary.instanceId,
    carrier.instanceId,
    state.tick,
  );
  if (!resolution.accepted) {
    return rejected(resolution.message);
  }
  state.preview = resolution.proposal;
  state.paused = true;
  const message =
    `Previewing Emitter Mount: ${resolution.proposal.primaryName} + ` +
    `${resolution.proposal.carrierName} for $${resolution.proposal.fee}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** Closes an open preview and resumes the run without changing the inventory. */
export function cancelRunFusionPreview(state: MvpRunState): MvpCommandResult {
  if (state.preview === null) {
    return rejected('No fusion preview is open.');
  }
  state.preview = null;
  state.paused = false;
  const message = 'Fusion preview cancelled.';
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Commits the open preview exactly once.
 *
 * A rejected commit leaves cash, inventory, revision, loadout, and the open
 * preview untouched, so the player can read the reason and cancel.
 */
export function confirmRunFusionPreview(state: MvpRunState): MvpCommandResult {
  const preview = state.preview;
  if (preview === null) {
    return rejected('No fusion preview is open.');
  }
  // `blockedRunReason` is deliberately not used here: an open preview pauses
  // the run, so confirming and cancelling are exactly the ways out of it.
  if (state.status !== 'playing') {
    return rejected('The shift is over.');
  }
  const committed = commitEmitterMount(state.inventory, {
    primaryInstanceId: preview.primaryInstanceId,
    carrierInstanceId: preview.carrierInstanceId,
    expectedRevision: preview.sourceRevision,
    transactionId: preview.transactionId,
    createdTick: state.tick,
  });
  if (!committed.committed) {
    return rejected(committed.message);
  }
  state.inventory = committed.state;
  state.cash = committed.state.cash;
  state.preview = null;
  state.paused = false;
  // The inventory now holds a composite, so this promotes the owned car from
  // independent companion to the steered firing origin in the same tick.
  syncRunCarrier(state);
  refreshRunLoadout(state);
  const message =
    `Emitter Mount complete: ${preview.primaryName} + ` +
    `${preview.carrierName} for $${committed.record.fee}. The car now carries the shots.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}
