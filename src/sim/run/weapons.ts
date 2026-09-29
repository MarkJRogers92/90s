/**
 * Weapon selection for the Night Shift run.
 *
 * Every owned item is either a weapon (its definition has a base attack, so it
 * can be the selected primary) or a passive modifier that shapes whichever
 * weapon is equipped. Before this module the run had no way to change its
 * primary at all: a Party Popper bought in a store sat in the inventory while
 * the janitor kept swinging the mop. Weapons are numbered 1..n in the order
 * they were acquired; passives are never numbered because they are always on.
 */
import { nodeDefinitionId } from '../fusion/inventory';
import { definitionFor } from '../items/registry';
import { blockedRunReason, itemDefinitionName, publishRunFeedback } from './economy';
import { refreshRunLoadout } from './loadout';
import type { MvpCommandResult, MvpRunState } from './types';

export type RunWeaponSlot = {
  readonly slot: number;
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly fused: boolean;
};

export type RunPassiveItem = {
  readonly instanceId: string;
  readonly itemDefinitionId: string;
};

/** The definition a top-level node acts as (a hybrid is its derived definition). */
const firingDefinition = nodeDefinitionId;

function isWeapon(itemDefinitionId: string): boolean {
  return definitionFor(itemDefinitionId)?.base !== undefined;
}

export function runWeaponSlots(state: MvpRunState): RunWeaponSlot[] {
  return state.inventory.inventory
    .filter((node) => isWeapon(firingDefinition(node)))
    .map((node, index) => ({
      slot: index + 1,
      instanceId: node.instanceId,
      itemDefinitionId: firingDefinition(node),
      fused: node.kind === 'composite',
    }));
}

export function runPassiveItems(state: MvpRunState): RunPassiveItem[] {
  return state.inventory.inventory
    // A fused passive kit is still a passive: listed, never numbered.
    .filter((node) => !isWeapon(firingDefinition(node)) && !(node.kind === 'composite' && node.recipeId === 'emitter_mount'))
    .map((node) => ({ instanceId: node.instanceId, itemDefinitionId: firingDefinition(node) }));
}

function equip(state: MvpRunState, weapon: RunWeaponSlot): MvpCommandResult {
  const name = itemDefinitionName(weapon.itemDefinitionId);
  if (state.inventory.selectedPrimaryInstanceId === weapon.instanceId) {
    const message = `${name} is already equipped.`;
    publishRunFeedback(state, message);
    return { accepted: true, message };
  }
  state.inventory = {
    ...state.inventory,
    selectedPrimaryInstanceId: weapon.instanceId,
    // A new primary changes what a pending Bench Warrant proposal would fuse,
    // so the revision moves and a stale proposal is refused rather than used.
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
  const message = `Equipped ${name}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** Equips weapon number `slot` (1-based, weapons only). */
export function selectRunWeaponSlot(state: MvpRunState, slot: number): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) return { accepted: false, reason: blocked };
  const weapons = runWeaponSlots(state);
  const weapon = weapons.find((candidate) => candidate.slot === slot);
  if (!weapon) {
    const reason = weapons.length <= 1
      ? 'You only have one weapon. Buy or steal another to switch.'
      : `No weapon in slot ${slot}. Weapons are 1-${weapons.length}; passive items are always on.`;
    publishRunFeedback(state, reason);
    return { accepted: false, reason };
  }
  return equip(state, weapon);
}

/** Steps to the next (1) or previous (-1) weapon, wrapping around. */
export function cycleRunWeapon(state: MvpRunState, direction: number): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) return { accepted: false, reason: blocked };
  const weapons = runWeaponSlots(state);
  if (weapons.length <= 1) {
    const reason = 'You only have one weapon. Buy or steal another to switch.';
    publishRunFeedback(state, reason);
    return { accepted: false, reason };
  }
  const current = Math.max(0, weapons.findIndex((weapon) => weapon.instanceId === state.inventory.selectedPrimaryInstanceId));
  const step = direction < 0 ? -1 : 1;
  const next = weapons[(current + step + weapons.length) % weapons.length]!;
  return equip(state, next);
}
