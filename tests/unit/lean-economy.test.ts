import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { generateRunWing, RARE_SHELF_PRICE } from '../../src/sim/run/storeInterior';
import { MALL_TOKEN_VALUE } from '../../src/sim/run/tokens';
import { ELITE_TOKEN_MULTIPLIER } from '../../src/sim/run/luck';
import { RARE_ROSTER } from '../../src/sim/items/storeRoster';
import { bossWingSeed, type FloorNumber } from '../../src/sim/wing/floorSpecs';
import { FLOOR_STORE_IDS } from '../../src/sim/wing/templates';

const RARES = new Set(RARE_ROSTER.map((entry) => entry.definition.id));

/** Every token a wing's monsters carry, if the janitor kills them all. */
function wingPayout(seed: number, floor: FloorNumber, part?: 1): number {
  const state = createMvpRun(seed, { floor, ...(part ? { part } : {}) });
  let total = 0;
  state.wing.rooms.forEach((_, roomIndex) => {
    const combat = buildRoomCombatState(state.wing, roomIndex, 'west', state.inventory, state.seed);
    for (const enemy of combat.enemies) total += MALL_TOKEN_VALUE[enemy.kind] * (enemy.elite ? ELITE_TOKEN_MULTIPLIER : 1);
  });
  return total;
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1]!;

describe('a leaner economy (round 56)', () => {
  it('a floor of fights pays for about three shelf items, not a whole kit', () => {
    for (const floor of [1, 2, 3, 4] as const) {
      const payouts: number[] = [];
      const prices: number[] = [];
      for (let seed = 1; seed <= 40; seed += 1) {
        payouts.push(wingPayout(seed, floor, 1) + wingPayout(bossWingSeed(seed), floor));
        for (const room of generateRunWing(seed, floor).rooms) for (const offer of room.offers) if (!RARES.has(offer.itemDefinitionId)) prices.push(offer.price);
      }
      const items = median(payouts) / median(prices);
      expect(items, `floor ${floor}: $${median(payouts)} buys ${items.toFixed(1)} items`).toBeLessThanOrEqual(4);
      expect(items, `floor ${floor}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('every upstairs floor store shelves a rare, so there is something worth saving for', () => {
    for (const floor of [2, 3, 4] as const) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const wing = generateRunWing(bossWingSeed(seed), floor);
        const own = wing.rooms.flatMap((room) => room.offers).filter((offer) => (FLOOR_STORE_IDS[floor] as readonly string[]).includes(offer.storeId));
        const rares = own.filter((offer) => RARES.has(offer.itemDefinitionId));
        expect(rares, `floor ${floor} seed ${seed}`).toHaveLength(1);
        expect(rares[0]!.price).toBe(RARE_SHELF_PRICE);
      }
    }
  });

  it('floor 1 still shelves no rare', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const part of [1, undefined] as const) {
        expect(generateRunWing(seed, 1, part).rooms.flatMap((room) => room.offers).filter((offer) => RARES.has(offer.itemDefinitionId))).toHaveLength(0);
      }
    }
  });
});
