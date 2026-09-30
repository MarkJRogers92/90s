import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { parseCheckpoint, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { confirmRunFusionPreview, openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpRunState } from '../../src/sim/run/types';

/** A save as JSON, the way localStorage hands it back. */
const saved = (state: MvpRunState) => JSON.parse(JSON.stringify(serializeCheckpoint(state))) as Record<string, any>;
const roomIds = (state: MvpRunState) => state.wing.rooms.map((room) => room.id);

describe('checkpoint validation: rooms cleared', () => {
  it('accepts a janitor who walked back west into an earlier room', () => {
    const state = createMvpRun(5);
    const save = saved(state);
    const ids = roomIds(state);
    // Cleared rooms 0-2, standing back in room 1: legal, the doors were open.
    Object.assign(save, { roomIndex: 1, clearedRoomIds: ids.slice(0, 3) });
    expect(parseCheckpoint(save).ok).toBe(true);
  });

  it('rejects a room reached past a fight that was never won', () => {
    const state = createMvpRun(5);
    const fight = state.wing.rooms.findIndex((room, index) => index > 0 && room.enemySpawns.length > 0);
    expect(fight).toBeGreaterThan(0);
    const past = { ...saved(state), roomIndex: fight + 1, clearedRoomIds: [] };
    expect(parseCheckpoint(past).ok).toBe(false);
  });

  it('rejects a cleared room beyond a fight that was never won', () => {
    const state = createMvpRun(5);
    const ids = roomIds(state);
    const fight = state.wing.rooms.findIndex((room, index) => index > 0 && room.enemySpawns.length > 0);
    const beyond = { ...saved(state), roomIndex: 0, clearedRoomIds: [ids[fight + 1]] };
    expect(parseCheckpoint(beyond).ok).toBe(false);
  });
});

describe('checkpoint validation: owned items against the shelves', () => {
  const bought = (state: MvpRunState, offerId: string, itemDefinitionId: string, storeId: string): InventoryLeaf => ({
    kind: 'leaf', instanceId: 'bought-1', itemDefinitionId, acquisitionKind: 'purchased',
    sourceLocationId: storeId, sourceStockId: offerId, acquisitionTick: state.tick,
  });

  it('rejects an item bought from an offer the save still shows on the shelf', () => {
    const state = createMvpRun(5);
    const offer = state.wing.rooms.flatMap((room) => room.offers)[0]!;
    state.inventory = { ...state.inventory, inventory: [...state.inventory.inventory, bought(state, offer.id, offer.itemDefinitionId, offer.storeId)] };
    const save = saved(state);
    expect(save.offerStatus[offer.id]).toBe('available');
    expect(parseCheckpoint(save).ok).toBe(false);
    // The same item with the offer marked sold is a normal purchase.
    expect(parseCheckpoint({ ...save, offerStatus: { ...save.offerStatus, [offer.id]: 'consumed' } }).ok).toBe(true);
  });

  it('accepts a sold or dropped purchase: the shelf stays empty with nothing in hand', () => {
    const state = createMvpRun(5);
    const offer = state.wing.rooms.flatMap((room) => room.offers)[0]!;
    const save = saved(state);
    expect(parseCheckpoint({ ...save, offerStatus: { ...save.offerStatus, [offer.id]: 'consumed' } }).ok).toBe(true);
  });
});

describe('checkpoint validation: fusion ids', () => {
  function fused(): MvpRunState {
    const state = createMvpRun(5);
    const kiosk = state.wing.rooms[0]!.benchKiosk!;
    state.room.combat.player.x = kiosk.x;
    state.room.combat.player.y = kiosk.y;
    const leaf = (id: string): InventoryLeaf => ({ kind: 'leaf', instanceId: `t-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased', sourceLocationId: 'test', sourceStockId: `test-${id}`, acquisitionTick: 0 });
    state.inventory = { ...state.inventory, inventory: [...state.inventory.inventory, leaf('pump_soaker'), leaf('plasma_globe')], cash: 99 };
    state.cash = 99;
    refreshRunLoadout(state);
    openRunWorkbench(state);
    pickWorkbenchItem(state, 't-pump_soaker');
    pickWorkbenchItem(state, 't-plasma_globe');
    expect(confirmRunFusionPreview(state).accepted).toBe(true);
    return state;
  }

  it('accepts a real fusion', () => {
    const state = fused();
    expect(state.inventory.committedTransactions.length).toBe(1);
    expect(parseCheckpoint(saved(state)).ok).toBe(true);
  });

  it('rejects a next fusion id that an existing fusion already used', () => {
    const save = saved(fused());
    const rewound = { ...save, inventory: { ...save.inventory, nextCompositeId: 0 } };
    expect(parseCheckpoint(rewound).ok).toBe(false);
  });
});
