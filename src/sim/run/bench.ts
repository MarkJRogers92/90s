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
import type { FusionInventoryNode, FusionProposal, InventoryLeaf } from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import { syncRunCarrier } from './carrier';
import { blockedRunReason, publishRunFeedback } from './economy';
import { hotItemCount } from './wanted';
import { refreshRunLoadout } from './loadout';
import { hasLivingEnemies } from './rooms';
import type { MvpCommandResult, MvpRunState, MvpWorkbench } from './types';
import { commitFusion, resolveFusion } from '../fusion/fuse';
import { perk, spendCharge } from './perks';

function rejected(reason: string): MvpCommandResult {
  return { accepted: false, reason };
}

/** Anything the bench can put in a fusion: an item or a hybrid, never an Emitter Mount. */
function isFusable(node: FusionInventoryNode): boolean {
  return node.kind === 'leaf' || node.recipeId === 'hybrid';
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
 * Takes a committed fusion's inventory, handing back what the Break Room
 * covers: a Fusion Coupon pays the whole fee once, else the Bench Technician
 * refunds up to `fusionRebate`. Returns the dollars refunded.
 */
function takeFusion(state: MvpRunState, inventory: MvpRunState['inventory'], fee: number): number {
  const refund = fee > 0 && spendCharge(state, 'freeFusions') ? fee : Math.min(fee, perk(state, 'fusionRebate'));
  state.inventory = refund > 0 ? { ...inventory, cash: inventory.cash + refund } : inventory;
  state.cash = state.inventory.cash;
  return refund;
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

  takeFusion(state, committed.state, committed.record.fee);
  // Promote the car here too, so a direct commit agrees with the preview path
  // and an immediate attack fires from the car rather than from the player.
  syncRunCarrier(state);
  refreshRunLoadout(state);

  const message =
    `Emitter Mount complete: ${resolution.proposal.primaryName} + ` +
    `${resolution.proposal.carrierName} for $${committed.record.fee}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Whether the kiosk has anything to fuse, without opening it: two items or
 * hybrids are enough, since almost any pair fuses. The HUD uses this so it never
 * advertises the bench where the sim would refuse to open it.
 */
export function canOpenRunFusionPreview(state: MvpRunState): boolean {
  if (state.status !== 'playing' || state.preview !== null || state.workbench !== null) return false;
  if (hasLivingEnemies(state.room.combat)) return false;
  return state.inventory.inventory.filter(isFusable).length >= 2;
}

function recompute(state: MvpRunState, bench: MvpWorkbench): void {
  state.preview = null;
  if (bench.firstId === null || bench.secondId === null) {
    state.workbench = { ...bench, message: '' };
    return;
  }
  const resolution = resolveFusion(state.inventory, bench.firstId, bench.secondId, state.tick);
  if (resolution.accepted) {
    state.preview = resolution.proposal;
    state.workbench = { ...bench, message: '' };
  } else {
    state.workbench = { ...bench, message: resolution.message };
  }
}

/**
 * Opens the Bench Warrant: the run halts while two items are picked.
 *
 * It opens empty, except when the equipped weapon is a shooter and the RC car
 * is owned: then both are picked, so the classic Emitter Mount is one key
 * press away exactly as before.
 */
export function openRunWorkbench(state: MvpRunState): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) return rejected(blocked);
  if (state.preview !== null || state.workbench !== null) return rejected('The Bench Warrant is already open.');
  // A bench is not a pause button: it opens once the room is safe.
  if (hasLivingEnemies(state.room.combat)) return rejected('Clear the room before using the Bench Warrant.');
  if (state.inventory.inventory.filter(isFusable).length < 2) {
    return rejected('Nothing to fuse: the Bench Warrant needs two things to fuse.');
  }
  const primary = selectedPrimaryLeaf(state);
  const carrier = findRunCarrierLeaf(state);
  const emitterReady = primary !== null && carrier !== null
    && ITEM_CATALOG.find((definition) => definition.id === primary.itemDefinitionId)?.base?.delivery === 'projectile';
  state.paused = true;
  recompute(state, emitterReady
    ? { firstId: primary.instanceId, secondId: carrier.instanceId, message: '' }
    : { firstId: null, secondId: null, message: '' });
  const opened = state.preview as FusionProposal | null;
  const message = opened
    ? `Bench Warrant: ${opened.primaryName} + ${opened.carrierName} for $${opened.fee}.`
    : 'Bench Warrant open: pick two items to fuse.';
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** The legacy name: opening the preview now opens the whole bench. */
export const openRunFusionPreview = openRunWorkbench;

/**
 * Picks (or puts back) one item on the open bench. Picking a third item
 * replaces the second; picking a picked item puts it back.
 */
export function pickWorkbenchItem(state: MvpRunState, instanceId: string): MvpCommandResult {
  const bench = state.workbench;
  if (bench === null) return rejected('The Bench Warrant is not open.');
  const node = state.inventory.inventory.find((candidate) => candidate.instanceId === instanceId);
  if (!node) return rejected('That item is not owned.');
  if (!isFusable(node)) {
    state.workbench = { ...bench, message: 'The RC car is already carrying the shot: an Emitter Mount cannot be fused again.' };
    return rejected(state.workbench.message);
  }
  let next: MvpWorkbench;
  if (bench.firstId === instanceId) next = { firstId: bench.secondId, secondId: null, message: '' };
  else if (bench.secondId === instanceId) next = { ...bench, secondId: null };
  else if (bench.firstId === null) next = { ...bench, firstId: instanceId };
  else next = { ...bench, secondId: instanceId };
  recompute(state, next);
  return { accepted: true, message: state.workbench?.message || 'Picked.' };
}

/** Closes the bench and resumes the run without changing the inventory. */
export function cancelRunFusionPreview(state: MvpRunState): MvpCommandResult {
  if (state.preview === null && state.workbench === null) {
    return rejected('No fusion preview is open.');
  }
  state.preview = null;
  state.workbench = null;
  state.paused = false;
  const message = 'Fusion preview cancelled.';
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Commits the open proposal exactly once.
 *
 * A rejected commit leaves cash, inventory, revision, loadout, and the open
 * bench untouched, so the player can read the reason and cancel.
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
  const hotBefore = hotItemCount(state);
  const committed = commitFusion(state.inventory, preview, state.tick);
  if (!committed.committed) {
    // Publish the refusal so the player sees why the click did nothing; the
    // preview stays open, so the reason can be read and then cancelled.
    publishRunFeedback(state, committed.message);
    return rejected(committed.message);
  }
  const fee = committed.record.fee;
  const refund = takeFusion(state, committed.state, fee);
  state.preview = null;
  state.workbench = null;
  state.paused = false;
  // An Emitter Mount promotes the owned car from independent companion to
  // the steered firing origin in the same tick; a hybrid leaves it alone.
  syncRunCarrier(state);
  refreshRunLoadout(state);
  const message = preview.recipeId === 'emitter_mount'
    ? `Emitter Mount complete: ${preview.primaryName} + ${preview.carrierName} for $${committed.record.fee}. The car now carries the shots.`
    : `Fused ${preview.primaryName} + ${preview.carrierName} into the ${preview.resultName} for $${committed.record.fee}.`;
  // Hot goods fused into something new can no longer be traced: laundered.
  const laundered = hotBefore - hotItemCount(state);
  const refunded = refund === fee && refund > 0 ? `${message} The coupon covered it.` : refund > 0 ? `${message} $${refund} back from the Bench Technician.` : message;
  const fullMessage = laundered > 0 ? `${refunded} Laundered ${laundered === 1 ? 'a hot item' : `${laundered} hot items`}.` : refunded;
  publishRunFeedback(state, fullMessage);
  return { accepted: true, message: fullMessage };
}
