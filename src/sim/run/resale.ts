/**
 * Getting rid of things (round 36): the inventory fills up fast once
 * everything fuses and monsters drop items.
 *
 * - Sell at the Bench Warrant: pick one item and sell it. A clean item pays
 *   half its shelf price, a stolen one a quarter (the fence), and a fusion is
 *   worth what its parts are. Selling stolen goods gets rid of their heat.
 * - Drop the held weapon anywhere: it goes on the floor exactly as it was
 *   held (a stolen item stays stolen), so dropping never launders anything.
 *   It stays in the room like any floor drop, and is only picked back up
 *   once the janitor has stepped away from it and come back.
 *
 * The janitor always keeps at least one weapon. Pure rules over run data.
 */
import { compositeLeaves, nodeDefinitionId } from '../fusion/inventory';
import type { FusionInventoryNode } from '../fusion/types';
import { AUTHORED_OFFER_BANDS } from '../wing/templates';
import { syncRunCarrier } from './carrier';
import { itemDefinitionName, publishRunFeedback } from './economy';
import { refreshRunLoadout } from './loadout';
import { runWeaponSlots } from './weapons';
import type { MvpCommandResult, MvpRunState } from './types';

const rejected = (reason: string): MvpCommandResult => ({ accepted: false, reason });

/** What the bench pays for a node: half the shelf price per clean part, a quarter per stolen one, at least $1. */
export function resaleValue(node: FusionInventoryNode): number {
  return compositeLeaves(node).reduce((sum, leaf) => {
    const band = AUTHORED_OFFER_BANDS[leaf.itemDefinitionId];
    const shelf = band ? (band.min + band.max) / 2 : 0;
    const share = leaf.acquisitionKind === 'stolen' ? 4 : 2;
    return sum + Math.max(1, Math.floor(shelf / share));
  }, 0);
}

/** Takes a node out of the inventory, re-equipping if it was the held weapon. */
function remove(state: MvpRunState, instanceId: string): void {
  const inventory = state.inventory.inventory.filter((node) => node.instanceId !== instanceId);
  state.inventory = { ...state.inventory, inventory, revision: state.inventory.revision + 1 };
  if (state.inventory.selectedPrimaryInstanceId === instanceId) {
    const next = runWeaponSlots(state)[0];
    if (next) state.inventory = { ...state.inventory, selectedPrimaryInstanceId: next.instanceId };
  }
  refreshRunLoadout(state);
  syncRunCarrier(state);
}

function isLastWeapon(state: MvpRunState, instanceId: string): boolean {
  const weapons = runWeaponSlots(state);
  return weapons.length <= 1 && weapons.some((weapon) => weapon.instanceId === instanceId);
}

/** Why this item cannot be sold or dropped, or '' when it can. */
export function keepReason(state: MvpRunState, instanceId: string): string {
  return isLastWeapon(state, instanceId) ? 'You cannot part with your last weapon.' : '';
}

/** Sells the one item picked on the open Bench Warrant. */
export function sellWorkbenchItem(state: MvpRunState): MvpCommandResult {
  const bench = state.workbench;
  if (bench === null) return rejected('The Bench Warrant is not open.');
  if (bench.firstId === null || bench.secondId !== null) return rejected('Pick one item to sell.');
  const node = state.inventory.inventory.find((candidate) => candidate.instanceId === bench.firstId);
  if (!node) return rejected('That item is not owned.');
  if (isLastWeapon(state, node.instanceId)) {
    state.workbench = { ...bench, message: keepReason(state, node.instanceId) };
    return rejected(state.workbench.message);
  }
  const value = resaleValue(node);
  remove(state, node.instanceId);
  state.cash += value;
  state.inventory = { ...state.inventory, cash: state.cash };
  state.workbench = { firstId: null, secondId: null, message: '' };
  const message = `Sold the ${itemDefinitionName(nodeDefinitionId(node))} for $${value}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** Drops the held weapon at the janitor's feet. */
export function dropRunWeapon(state: MvpRunState): MvpCommandResult {
  const id = state.inventory.selectedPrimaryInstanceId;
  const node = state.inventory.inventory.find((candidate) => candidate.instanceId === id);
  if (!node) return rejected('Nothing in hand to drop.');
  if (isLastWeapon(state, node.instanceId)) {
    publishRunFeedback(state, keepReason(state, node.instanceId));
    return rejected(keepReason(state, node.instanceId));
  }
  remove(state, node.instanceId);
  const player = state.room.combat.player;
  state.room.tokens.push({
    id: `dropped-${state.tick}-${node.instanceId}`,
    kind: 'item',
    itemDefinitionId: nodeDefinitionId(node),
    node,
    awaitingStepOff: true,
    x: player.x,
    y: player.y + 18,
    value: 0,
    droppedTick: state.tick,
  });
  const message = `Dropped the ${itemDefinitionName(nodeDefinitionId(node))}. It stays in this room.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}
