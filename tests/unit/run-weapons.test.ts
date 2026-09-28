import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import {
  cycleRunWeapon,
  runPassiveItems,
  runWeaponSlots,
  selectRunWeaponSlot,
} from '../../src/sim/run/weapons';

function leaf(instanceId: string, itemDefinitionId: string): InventoryLeaf {
  return {
    kind: 'leaf', instanceId, itemDefinitionId, acquisitionKind: 'purchased',
    sourceLocationId: 'test', sourceStockId: `test-${itemDefinitionId}`, acquisitionTick: 0,
  };
}

/** A shift that owns the starting mop plus two weapons and one passive. */
function armedRun(): MvpRunState {
  const state = createMvpRun(7);
  state.inventory = {
    ...state.inventory,
    inventory: [
      ...state.inventory.inventory,
      leaf('popper', 'party_popper'),
      leaf('fanny', 'fanny_pack'),
      leaf('soaker', 'pump_soaker'),
    ],
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
  return state;
}

const IDLE: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 200, aimY: 240, fire: false, interact: false, steal: false, recall: false };

describe('weapon slots', () => {
  it('lists only items with an attack as weapons, in the order they were acquired', () => {
    const state = armedRun();
    expect(runWeaponSlots(state).map((slot) => slot.itemDefinitionId)).toEqual(['janitor_mop', 'party_popper', 'pump_soaker']);
    expect(runPassiveItems(state).map((item) => item.itemDefinitionId)).toEqual(['fanny_pack']);
  });

  it('equips a weapon by its slot number and recompiles the attack', () => {
    const state = armedRun();
    const result = selectRunWeaponSlot(state, 2);
    expect(result.accepted).toBe(true);
    expect(state.inventory.selectedPrimaryInstanceId).toBe('popper');
    expect(state.room.combat.compiledLoadout.primary.definitionId).toBe('party_popper');
    expect(state.room.combat.compiledLoadout.primary.delivery).toBe('projectile');
  });

  it('refuses a slot that holds no weapon and says why', () => {
    const state = armedRun();
    const result = selectRunWeaponSlot(state, 7);
    expect(result.accepted).toBe(false);
    expect(state.inventory.selectedPrimaryInstanceId).not.toBe('');
  });

  it('cycles forward and backward, wrapping around', () => {
    const state = armedRun();
    cycleRunWeapon(state, 1);
    expect(state.inventory.selectedPrimaryInstanceId).toBe('popper');
    cycleRunWeapon(state, 1);
    cycleRunWeapon(state, 1);
    expect(state.inventory.selectedPrimaryInstanceId).toBe(runWeaponSlots(state)[0]!.instanceId);
    cycleRunWeapon(state, -1);
    expect(state.inventory.selectedPrimaryInstanceId).toBe('soaker');
  });

  it('switches from real input frames, once per press', () => {
    const state = armedRun();
    tickMvpRun(state, { ...IDLE, selectSlot: 3 });
    expect(state.inventory.selectedPrimaryInstanceId).toBe('soaker');
    expect(state.recentChange.toLowerCase()).toContain('equipped');
    tickMvpRun(state, { ...IDLE, cycleWeapon: 1 });
    expect(state.inventory.selectedPrimaryInstanceId).toBe(runWeaponSlots(state)[0]!.instanceId);
  });

  it('bumps the inventory revision so a stale Bench Warrant proposal is refused', () => {
    const state = armedRun();
    const before = state.inventory.revision;
    selectRunWeaponSlot(state, 2);
    expect(state.inventory.revision).toBe(before + 1);
  });
});
