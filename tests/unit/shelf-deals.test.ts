import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { PAIR_DEAL_SCALE, runOfferPrice } from '../../src/sim/run/economy';
import { RARE_SHELF_PRICE } from '../../src/sim/run/storeInterior';
import { generateRunWing } from '../../src/sim/run/storeInterior';
import { RARE_ROSTER } from '../../src/sim/items/storeRoster';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import { LEFTOVER_CASH_PER_STUB, stubsForShift, type ShiftResult } from '../../src/game/career/career';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { WingOffer } from '../../src/sim/wing/types';
import type { MvpRunState } from '../../src/sim/run/types';

const RARES = new Set(RARE_ROSTER.map((entry) => entry.definition.id));

/** A run whose wing shelves a signature pair, with the janitor in front of one half. */
function pairedRun(): { state: MvpRunState; offer: WingOffer; partner: string } {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = createMvpRun(seed);
    for (const room of state.wing.rooms) {
      const offer = room.offers.find((candidate) => candidate.pairedWith);
      if (offer) return { state, offer, partner: offer.pairedWith! };
    }
  }
  throw new Error('no paired shelf in 400 seeds');
}

const holding = (state: MvpRunState, itemDefinitionId: string): void => {
  const leaf: InventoryLeaf = { kind: 'leaf', instanceId: `held-${itemDefinitionId}`, itemDefinitionId, acquisitionKind: 'purchased', sourceLocationId: 'test', sourceStockId: 'test', acquisitionTick: 0 };
  state.inventory = { ...state.inventory, inventory: [...state.inventory.inventory, leaf] };
};

describe('the pair deal', () => {
  it('the second half of a signature pair is a quarter off once you hold the first', () => {
    const { state, offer, partner } = pairedRun();
    const full = runOfferPrice(state, offer);
    holding(state, partner);
    expect(PAIR_DEAL_SCALE).toBe(0.75);
    expect(runOfferPrice(state, offer)).toBe(Math.ceil(full * PAIR_DEAL_SCALE));
  });

  it('the store card names what the pair makes, and the deal once it applies', () => {
    const { state, offer, partner } = pairedRun();
    // Walk there for real: east through each door (clearing any fight), in through the shop door.
    const room = state.wing.rooms.findIndex((candidate) => candidate.offers.some((other) => other.id === offer.id));
    const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
    while (state.roomIndex < room) {
      state.room.combat.enemies = [];
      tickMvpRun(state, idle);
      const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
      state.room.combat.player.x = door.rect.x + door.rect.width / 2;
      state.room.combat.player.y = door.rect.y + door.rect.height / 2;
      expect(enterDoorway(state, 'east').accepted).toBe(true);
    }
    const store = state.wing.rooms[room]!.stores!.findIndex((candidate) => candidate.templateId === offer.storeId);
    expect(enterStore(state, store).accepted).toBe(true);
    state.room.combat.player.x = offer.position.x;
    state.room.combat.player.y = offer.position.y + 20;
    const detail = () => buildGameHudModel(state).prompt?.detail;
    expect(detail()?.pair).toMatch(/PAIRS WITH .+ -> .+: \+50% DMG/);
    expect(detail()?.pair).not.toMatch(/25% OFF/);
    holding(state, partner);
    expect(detail()?.pair).toMatch(/25% OFF/);
  });
});

describe('rares on the shelves upstairs', () => {
  const rareOffers = (floor: 1 | 2 | 3 | 4, seed: number) => generateRunWing(seed, floor).rooms.flatMap((room) => room.offers).filter((offer) => RARES.has(offer.itemDefinitionId));

  it('floors 2-4 shelve exactly one rare a wing, at the rare price; floor 1 none (round 56: floor 2 too)', () => {
    for (const seed of [1, 7, 42, 99]) {
      expect(rareOffers(1, seed)).toHaveLength(0);
      for (const floor of [2, 3, 4] as const) {
        const rares = rareOffers(floor, seed);
        expect(rares).toHaveLength(1);
        expect(rares[0]!.price).toBe(RARE_SHELF_PRICE);
      }
    }
  });

  it('the same mall shelves the same rare, and a rare never replaces a recipe-hint half', () => {
    expect(rareOffers(3, 7)).toEqual(rareOffers(3, 7));
    const wing = generateRunWing(7, 3);
    for (const room of wing.rooms) {
      for (const offer of room.offers.filter((candidate) => candidate.pairedWith)) {
        expect(room.offers.some((other) => other.itemDefinitionId === offer.pairedWith)).toBe(true);
      }
    }
  });
});

describe('leftover cash at clock-out', () => {
  const base: ShiftResult = { score: 900, won: true, floorCleared: true, floorTwoCleared: true, floorThreeCleared: true, kills: 30, bestCombo: 6, seconds: 600, mall: 3 };

  it('pays a stub for every $20 left when you clock out', () => {
    expect(LEFTOVER_CASH_PER_STUB).toBe(20);
    const pay = stubsForShift({ ...base, cash: 65 });
    expect(pay.lines).toContainEqual({ label: 'LEFTOVER CASH', amount: 3 });
    expect(pay.total).toBe(stubsForShift(base).total + 3);
  });

  it('pays nothing for cash on a shift that did not clock out', () => {
    expect(stubsForShift({ ...base, won: false, cash: 200 }).lines.map((line) => line.label)).not.toContain('LEFTOVER CASH');
  });
});
