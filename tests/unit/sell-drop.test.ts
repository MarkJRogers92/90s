import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { hotItemCount } from '../../src/sim/run/wanted';
import { runWeaponSlots } from '../../src/sim/run/weapons';
import { AUTHORED_OFFER_BANDS } from '../../src/sim/wing/templates';
import { DROP_PICKUP_LOCK_TICKS, dropRunWeapon, resaleValue, sellWorkbenchItem } from '../../src/sim/run/resale';
import type { FusionInventoryNode, InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

const leaf = (id: string, kind: InventoryLeaf['acquisitionKind'] = 'purchased'): InventoryLeaf => ({
  kind: 'leaf', instanceId: `t-${id}`, itemDefinitionId: id, acquisitionKind: kind,
  sourceLocationId: 'test', sourceStockId: `test-${id}`, acquisitionTick: 0,
});

function own(state: MvpRunState, ...nodes: FusionInventoryNode[]): void {
  state.inventory = { ...state.inventory, inventory: [...state.inventory.inventory, ...nodes], revision: state.inventory.revision + 1 };
  refreshRunLoadout(state);
}

const mid = (id: string) => { const band = AUTHORED_OFFER_BANDS[id]!; return (band.min + band.max) / 2; };

function atBench(): MvpRunState {
  const state = createMvpRun(5);
  const kiosk = state.wing.rooms[0]!.benchKiosk!;
  state.room.combat.player.x = kiosk.x;
  state.room.combat.player.y = kiosk.y;
  return state;
}

describe('resale value (round 36)', () => {
  it('a clean item fetches half its shelf price, a stolen one a quarter (the fence)', () => {
    expect(resaleValue(leaf('plasma_globe'))).toBe(Math.floor(mid('plasma_globe') / 2));
    expect(resaleValue(leaf('plasma_globe', 'stolen'))).toBe(Math.floor(mid('plasma_globe') / 4));
    expect(resaleValue(leaf('gel_pens', 'found'))).toBe(Math.floor(mid('gel_pens') / 2));
  });

  it('a fusion is worth what its parts are, and nothing sells for less than $1', () => {
    const fused: FusionInventoryNode = { kind: 'composite', instanceId: 'f', recipeId: 'hybrid', createdTick: 0, transactionId: 't', primary: leaf('pump_soaker'), carrier: leaf('plasma_globe') };
    expect(resaleValue(fused)).toBe(resaleValue(leaf('pump_soaker')) + resaleValue(leaf('plasma_globe')));
    expect(resaleValue(leaf('no_such_item'))).toBe(1);
  });
});

describe('selling at the Bench Warrant (round 36)', () => {
  it('pick one item and sell it: the cash comes in and the item is gone', () => {
    const state = atBench();
    own(state, leaf('plasma_globe'));
    const cash = state.cash;
    openRunWorkbench(state);
    pickWorkbenchItem(state, 't-plasma_globe');
    const result = sellWorkbenchItem(state);
    expect(result.accepted).toBe(true);
    expect(state.cash).toBe(cash + resaleValue(leaf('plasma_globe')));
    expect(state.inventory.cash).toBe(state.cash);
    expect(state.inventory.inventory.some((node) => node.instanceId === 't-plasma_globe')).toBe(false);
    expect(state.workbench).toMatchObject({ firstId: null, secondId: null });
  });

  it('selling stolen goods at the fence gets rid of their heat', () => {
    const state = atBench();
    own(state, leaf('pump_soaker', 'stolen'));
    expect(hotItemCount(state)).toBe(1);
    openRunWorkbench(state);
    pickWorkbenchItem(state, 't-pump_soaker');
    expect(sellWorkbenchItem(state).accepted).toBe(true);
    expect(hotItemCount(state)).toBe(0);
  });

  it('will not sell the last weapon, or anything with two picked', () => {
    const state = atBench();
    const onlyWeapon = runWeaponSlots(state)[0]!.instanceId;
    openRunWorkbench(state);
    pickWorkbenchItem(state, onlyWeapon);
    expect(sellWorkbenchItem(state).accepted).toBe(false);
    expect(runWeaponSlots(state)).toHaveLength(1);

    const two = atBench();
    own(two, leaf('plasma_globe'), leaf('gel_pens'));
    openRunWorkbench(two);
    pickWorkbenchItem(two, 't-plasma_globe');
    pickWorkbenchItem(two, 't-gel_pens');
    expect(sellWorkbenchItem(two).accepted).toBe(false);
  });

  it('selling the equipped weapon equips another', () => {
    const state = atBench();
    own(state, leaf('pump_soaker'));
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 't-pump_soaker' };
    refreshRunLoadout(state);
    openRunWorkbench(state);
    pickWorkbenchItem(state, 't-pump_soaker');
    expect(sellWorkbenchItem(state).accepted).toBe(true);
    expect(state.inventory.inventory.some((node) => node.instanceId === state.inventory.selectedPrimaryInstanceId)).toBe(true);
  });
});

describe('dropping the held weapon (round 36)', () => {
  it('drops the equipped weapon at the janitor’s feet, keeping everything about it', () => {
    const state = createMvpRun(5);
    own(state, leaf('pump_soaker', 'stolen'));
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 't-pump_soaker' };
    refreshRunLoadout(state);
    const result = dropRunWeapon(state);
    expect(result.accepted).toBe(true);
    expect(state.inventory.inventory.some((node) => node.instanceId === 't-pump_soaker')).toBe(false);
    const token = state.room.tokens.find((pickup) => pickup.kind === 'item' && pickup.node?.instanceId === 't-pump_soaker');
    expect(token).toBeDefined();
    // Not snatched straight back up, even standing on it.
    state.room.combat.player.x = token!.x;
    state.room.combat.player.y = token!.y;
    for (let i = 0; i < DROP_PICKUP_LOCK_TICKS - 2; i += 1) tickMvpRun(state, idle);
    expect(state.inventory.inventory.some((node) => node.instanceId === 't-pump_soaker')).toBe(false);
    // After the lock it picks back up exactly as it was: still stolen, still hot.
    for (let i = 0; i < 6; i += 1) tickMvpRun(state, idle);
    const back = state.inventory.inventory.find((node) => node.instanceId === 't-pump_soaker');
    expect(back).toMatchObject({ kind: 'leaf', acquisitionKind: 'stolen' });
    expect(hotItemCount(state)).toBe(1);
  });

  it('will not drop the last weapon', () => {
    const state = createMvpRun(5);
    expect(runWeaponSlots(state)).toHaveLength(1);
    expect(dropRunWeapon(state).accepted).toBe(false);
    expect(runWeaponSlots(state)).toHaveLength(1);
  });

  it('says why when X is refused, so the key never feels dead', () => {
    const state = createMvpRun(5);
    tickMvpRun(state, { ...idle, drop: true });
    expect(state.recentChange).toMatch(/last weapon/i);
  });
});

describe('the drop key (round 36)', () => {
  it('a tick with drop set drops the held weapon', () => {
    const state = createMvpRun(5);
    own(state, leaf('pump_soaker'));
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 't-pump_soaker' };
    refreshRunLoadout(state);
    tickMvpRun(state, { ...idle, drop: true });
    expect(state.inventory.inventory.some((node) => node.instanceId === 't-pump_soaker')).toBe(false);
  });
});
