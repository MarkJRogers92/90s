import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { runOfferPrice } from '../../src/sim/run/economy';
import { blueLightOfferId, roomEventFor } from '../../src/sim/run/roomEvents';
import { wingEventFor } from '../../src/sim/run/wingEvents';

const COMBAT = new Set(['food_court', 'back_hall']);
const STORES = new Set(['storefront_a', 'storefront_b']);

function eventsFor(seed: number) {
  const state = createMvpRun(seed);
  return state.wing.rooms.map((room, index) => ({ id: room.id, event: roomEventFor(state, index) }));
}

describe('room events', () => {
  it('only black out combat rooms and only run specials in stores, at most one of each', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      // A power outage (a floor event, round 47) blacks out the whole wing on purpose.
      if (wingEventFor(createMvpRun(seed).wing) === 'outage') continue;
      const events = eventsFor(seed);
      const blackouts = events.filter((e) => e.event === 'blackout');
      const specials = events.filter((e) => e.event === 'blue_light');
      expect(blackouts.length).toBeLessThanOrEqual(1);
      expect(specials.length).toBeLessThanOrEqual(1);
      for (const e of blackouts) expect(COMBAT.has(e.id)).toBe(true);
      for (const e of specials) expect(STORES.has(e.id)).toBe(true);
    }
  });

  it('happen in some shifts and not others, the same way every time', () => {
    const withBlackout = Array.from({ length: 60 }, (_, i) => eventsFor(i + 1).some((e) => e.event === 'blackout')).filter(Boolean).length;
    expect(withBlackout).toBeGreaterThan(10);
    expect(withBlackout).toBeLessThan(50);
    expect(eventsFor(9)).toEqual(eventsFor(9));
  });

  it('halves the blue-light item, and only that one', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = createMvpRun(seed);
      const id = blueLightOfferId(state);
      if (!id) continue;
      const room = state.wing.rooms.find((r) => r.offers.some((o) => o.id === id))!;
      const special = room.offers.find((o) => o.id === id)!;
      expect(runOfferPrice(state, special)).toBe(Math.max(1, Math.ceil(special.price / 2)));
      for (const other of room.offers.filter((o) => o.id !== id)) expect(runOfferPrice(state, other)).toBe(other.price);
      return;
    }
    throw new Error('no seed produced a blue light special');
  });
});
