import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buyRunOffer } from '../../src/sim/run/economy';
import { confirmRunFusionPreview, openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import { isValidFusionInventoryState } from '../../src/sim/fusion/inventory';
import type { MvpRunState } from '../../src/sim/run/types';

function fuse(state: MvpRunState, first: string, second: string) {
  expect(openRunWorkbench(state).accepted).toBe(true);
  pickWorkbenchItem(state, first);
  pickWorkbenchItem(state, second);
  return confirmRunFusionPreview(state);
}

const newest = (state: MvpRunState) => state.inventory.inventory.at(-1)!.instanceId;

describe('the same shelf item in a later wing (2026-10-01 playtest: "it would not let me fuse anymore")', () => {
  it('buying an item you already fused keeps every fusion working', () => {
    const state = createMvpRun(9);
    state.cash = 999;
    state.inventory = { ...state.inventory, cash: 999 };
    const starter = state.inventory.inventory[0]!;
    const offers = state.wing.rooms.flatMap((room) => room.offers);
    const a = offers.find((offer) => offer.itemDefinitionId !== (starter.kind === 'leaf' ? starter.itemDefinitionId : ''))!;
    const b = offers.find((offer) => offer.itemDefinitionId !== a.itemDefinitionId && offer.id !== a.id && offer.itemDefinitionId !== (starter.kind === 'leaf' ? starter.itemDefinitionId : ''))!;

    expect(buyRunOffer(state, a.id).accepted).toBe(true);
    expect(fuse(state, starter.instanceId, newest(state)).accepted).toBe(true);

    // The next wing shelves the same item in the same store: the same offer id.
    state.offerStatus[a.id] = 'available';
    expect(buyRunOffer(state, a.id).accepted).toBe(true);
    const again = newest(state);
    expect(buyRunOffer(state, b.id).accepted).toBe(true);
    expect(isValidFusionInventoryState(state.inventory)).toBe(true);
    const result = fuse(state, again, newest(state));
    expect(result).toMatchObject({ accepted: true });
  });
});
