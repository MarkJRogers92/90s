import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { M3_WING } from '../../src/sim/shop/catalog';
import type {
  ShopOfferDefinition,
  StoreDefinition,
  WingDefinition,
} from '../../src/sim/shop/types';
import { validateWing } from '../../src/sim/shop/validateWing';

const M2_ITEM_IDS = [
  'janitor_mop',
  'pump_soaker',
  'bubble_bath',
  'plasma_globe',
  'vhs_rewinder',
  'extension_cord',
  'gel_pens',
  'wide_nozzle',
];

/** Hand-authored merchandise order and prices from the M3 design. */
const AUTHORED_OFFERS: readonly (readonly [string, number])[] = [
  ['janitor_mop', 10],
  ['bubble_bath', 14],
  ['extension_cord', 12],
  ['gel_pens', 8],
  ['pump_soaker', 18],
  ['plasma_globe', 22],
  ['vhs_rewinder', 24],
  ['wide_nozzle', 16],
];

function wingWithOfferOverride(
  overrides: Partial<ShopOfferDefinition>,
  index = 0,
): WingDefinition {
  return {
    ...M3_WING,
    offers: M3_WING.offers.map((offer, offerIndex) =>
      offerIndex === index ? { ...offer, ...overrides } : offer,
    ),
  };
}

function wingWithUnknownItem(itemDefinitionId: string): WingDefinition {
  return wingWithOfferOverride({ itemDefinitionId });
}

function wingWithoutOffer(index: number): WingDefinition {
  return {
    ...M3_WING,
    offers: M3_WING.offers.filter((_, offerIndex) => offerIndex !== index),
  };
}

function wingWithStoreOverride(
  storeId: string,
  overrides: Partial<StoreDefinition>,
): WingDefinition {
  return {
    ...M3_WING,
    stores: M3_WING.stores.map((store) =>
      store.id === storeId ? { ...store, ...overrides } : store,
    ),
  };
}

function wingWithSightZoneOutsideStore(storeId: string): WingDefinition {
  return {
    ...M3_WING,
    stores: M3_WING.stores.map((store) =>
      store.id === storeId
        ? { ...store, sightZone: { ...store.sightZone, range: 400 } }
        : store,
    ),
  };
}

function wingWithSightZoneOriginOutsideStore(storeId: string): WingDefinition {
  return {
    ...M3_WING,
    stores: M3_WING.stores.map((store) =>
      store.id === storeId
        ? { ...store, sightZone: { ...store.sightZone, origin: { x: 900, y: 440 } } }
        : store,
    ),
  };
}

function wingWithExtraWall(rect: { x: number; y: number; width: number; height: number }): WingDefinition {
  return { ...M3_WING, walls: [...M3_WING.walls, rect] };
}

function storeById(storeId: string): StoreDefinition {
  const store = M3_WING.stores.find((candidate) => candidate.id === storeId);
  if (!store) {
    throw new Error(`Missing authored store ${storeId}`);
  }
  return store;
}

describe('M3 wing content', () => {
  it('authors the two-store 960x480 wing with $30 of starting cash', () => {
    expect(M3_WING.id).toBe('orchard-gate-two-store-wing');
    expect(M3_WING.width).toBe(960);
    expect(M3_WING.height).toBe(480);
    expect(M3_WING.startingCash).toBe(30);
    expect(M3_WING.playerSpawn).toEqual({ x: 480, y: 390 });
    expect(M3_WING.bounds).toEqual({ x: 0, y: 0, width: 960, height: 480 });
  });

  it('offers all eight M2 items once each, four per store', () => {
    expect(M3_WING.stores.flatMap((store) => store.offerIds)).toHaveLength(8);
    expect(M3_WING.stores.map((store) => store.id)).toEqual(['homestyle', 'future']);
    for (const store of M3_WING.stores) {
      expect(store.offerIds).toHaveLength(4);
    }
    expect([...M3_WING.offers.map((offer) => offer.itemDefinitionId)].sort()).toEqual(
      [...M2_ITEM_IDS].sort(),
    );
    expect([...ITEM_CATALOG.map((definition) => definition.id)].sort()).toEqual(
      [...M2_ITEM_IDS].sort(),
    );
  });

  it('authors the exact merchandise prices in store order', () => {
    expect(M3_WING.offers.map(({ itemDefinitionId, price }) => [itemDefinitionId, price])).toEqual([
      ['janitor_mop', 10],
      ['bubble_bath', 14],
      ['extension_cord', 12],
      ['gel_pens', 8],
      ['pump_soaker', 18],
      ['plasma_globe', 22],
      ['vhs_rewinder', 24],
      ['wide_nozzle', 16],
    ]);
  });

  it('keeps every authored offer inside its own store and listed by it', () => {
    for (const offer of M3_WING.offers) {
      const store = storeById(offer.storeId);
      expect(store.offerIds).toContain(offer.id);
      expect(offer.position.x).toBeGreaterThan(store.bounds.x);
      expect(offer.position.x).toBeLessThan(store.bounds.x + store.bounds.width);
      expect(offer.position.y).toBeGreaterThan(store.bounds.y);
      expect(offer.position.y).toBeLessThan(store.bounds.y + store.bounds.height);
    }
  });

  it('freezes the wing, its geometry, and every nested content object', () => {
    expect(Object.isFrozen(M3_WING)).toBe(true);
    expect(Object.isFrozen(M3_WING.bounds)).toBe(true);
    expect(Object.isFrozen(M3_WING.playerSpawn)).toBe(true);
    expect(Object.isFrozen(M3_WING.walls)).toBe(true);
    for (const wall of M3_WING.walls) {
      expect(Object.isFrozen(wall)).toBe(true);
    }
    expect(Object.isFrozen(M3_WING.mallExit)).toBe(true);
    expect(Object.isFrozen(M3_WING.mallExit.bounds)).toBe(true);
    expect(Object.isFrozen(M3_WING.stores)).toBe(true);
    for (const store of M3_WING.stores) {
      expect(Object.isFrozen(store)).toBe(true);
      expect(Object.isFrozen(store.bounds)).toBe(true);
      expect(Object.isFrozen(store.resetPoint)).toBe(true);
      expect(Object.isFrozen(store.exit)).toBe(true);
      expect(Object.isFrozen(store.exit.bounds)).toBe(true);
      expect(Object.isFrozen(store.sightZone)).toBe(true);
      expect(Object.isFrozen(store.sightZone.origin)).toBe(true);
      expect(Object.isFrozen(store.offerIds)).toBe(true);
    }
    expect(Object.isFrozen(M3_WING.offers)).toBe(true);
    for (const offer of M3_WING.offers) {
      expect(Object.isFrozen(offer)).toBe(true);
      expect(Object.isFrozen(offer.position)).toBe(true);
    }
  });

  it('authors one security sight zone per store matching the design values', () => {
    for (const store of M3_WING.stores) {
      expect(store.sightZone.range).toBe(180);
      expect(store.sightZone.arcDegrees).toBe(70);
      expect(store.sightZone.sweepRadians).toBeCloseTo((55 * Math.PI) / 180);
      expect(store.sightZone.sweepTicksPerEndpoint).toBe(180);
      expect(store.sightZone.centerRadians).toBeCloseTo(Math.PI / 2);
    }
  });

  it('places a usable public exit on each store front and a mall exit in the wing', () => {
    for (const store of M3_WING.stores) {
      expect(store.exit.bounds.width).toBeGreaterThanOrEqual(20);
      expect(store.exit.bounds.y + store.exit.bounds.height).toBe(
        store.bounds.y + store.bounds.height,
      );
    }
    expect(M3_WING.mallExit.bounds.y + M3_WING.mallExit.bounds.height).toBeLessThanOrEqual(
      M3_WING.height,
    );
  });

  it('matches the Task 1 brief expectations verbatim', () => {
    expect(M3_WING.startingCash).toBe(30);
    expect(M3_WING.stores.flatMap((store) => store.offerIds)).toHaveLength(8);
    expect(M3_WING.offers.map(({ itemDefinitionId, price }) => [itemDefinitionId, price])).toEqual([
      ['janitor_mop', 10], ['bubble_bath', 14], ['extension_cord', 12], ['gel_pens', 8],
      ['pump_soaker', 18], ['plasma_globe', 22], ['vhs_rewinder', 24], ['wide_nozzle', 16],
    ]);
    expect(() => validateWing({ ...M3_WING, offers: [...M3_WING.offers, M3_WING.offers[0]!] }, ITEM_CATALOG)).toThrow(/homestyle-mop/);
    expect(() => validateWing(wingWithUnknownItem('missing-item'), ITEM_CATALOG)).toThrow(/missing-item/);
    expect(() => validateWing(wingWithSightZoneOutsideStore('homestyle'), ITEM_CATALOG)).toThrow(/homestyle/);
  });
});

describe('validateWing', () => {
  it('accepts the authored wing against the M2 item catalog', () => {
    expect(() => validateWing(M3_WING, ITEM_CATALOG)).not.toThrow();
  });

  it('rejects a duplicate offer id and names it', () => {
    expect(() =>
      validateWing(
        { ...M3_WING, offers: [...M3_WING.offers, M3_WING.offers[0]!] },
        ITEM_CATALOG,
      ),
    ).toThrow(/homestyle-mop/);
  });

  it('rejects an unknown item reference and names it', () => {
    expect(() => validateWing(wingWithUnknownItem('missing-item'), ITEM_CATALOG)).toThrow(
      /missing-item/,
    );
  });

  it('rejects a sight zone that leaves its store and names the store', () => {
    expect(() => validateWing(wingWithSightZoneOutsideStore('homestyle'), ITEM_CATALOG)).toThrow(
      /homestyle/,
    );
  });

  it('rejects a sight zone origin outside its store', () => {
    expect(() =>
      validateWing(wingWithSightZoneOriginOutsideStore('future'), ITEM_CATALOG),
    ).toThrow(/future/);
  });

  it('rejects a duplicate store id', () => {
    expect(() =>
      validateWing(
        {
          ...M3_WING,
          stores: [...M3_WING.stores, { ...storeById('homestyle') }],
        },
        ITEM_CATALOG,
      ),
    ).toThrow(/homestyle/);
  });

  it('rejects a wing that omits an item and names the missing item', () => {
    expect(() => validateWing(wingWithoutOffer(3), ITEM_CATALOG)).toThrow(/gel_pens/);
  });

  it('rejects offering the same item twice', () => {
    expect(() =>
      validateWing(wingWithOfferOverride({ itemDefinitionId: 'janitor_mop' }, 1), ITEM_CATALOG),
    ).toThrow(/janitor_mop/);
  });

  it('rejects an invalid non-positive price', () => {
    expect(() => validateWing(wingWithOfferOverride({ price: 0 }), ITEM_CATALOG)).toThrow(
      /homestyle-mop/,
    );
    expect(() => validateWing(wingWithOfferOverride({ price: Number.NaN }), ITEM_CATALOG)).toThrow(
      /homestyle-mop/,
    );
  });

  it('rejects an offer that references an unknown store', () => {
    expect(() => validateWing(wingWithOfferOverride({ storeId: 'kiosk' }), ITEM_CATALOG)).toThrow(
      /homestyle-mop/,
    );
  });

  it('rejects an offer position outside its store bounds', () => {
    expect(() =>
      validateWing(wingWithOfferOverride({ position: { x: 900, y: 440 } }), ITEM_CATALOG),
    ).toThrow(/homestyle-mop/);
  });

  it('rejects a store that references an unknown offer', () => {
    expect(() =>
      validateWing(
        wingWithStoreOverride('homestyle', {
          offerIds: [...storeById('homestyle').offerIds, 'homestyle-chair'],
        }),
        ITEM_CATALOG,
      ),
    ).toThrow(/homestyle/);
  });

  it('rejects a store that stops listing its own offer', () => {
    expect(() =>
      validateWing(
        wingWithStoreOverride('homestyle', {
          offerIds: storeById('homestyle').offerIds.slice(0, 3),
        }),
        ITEM_CATALOG,
      ),
    ).toThrow(/homestyle-gel-pens/);
  });

  it('rejects a wall outside the wing bounds', () => {
    const walls = [...M3_WING.walls];
    walls[0] = { x: -20, y: 60, width: 40, height: 40 };
    expect(() => validateWing({ ...M3_WING, walls }, ITEM_CATALOG)).toThrow(/wall-0/);
  });

  it('rejects a wall that covers the player spawn', () => {
    expect(() =>
      validateWing(wingWithExtraWall({ x: 470, y: 380, width: 40, height: 40 }), ITEM_CATALOG),
    ).toThrow(/orchard-gate-two-store-wing/);
  });

  it('rejects a store exit blocked by a wall', () => {
    const exit = storeById('homestyle').exit.bounds;
    expect(() => validateWing(wingWithExtraWall({ ...exit }), ITEM_CATALOG)).toThrow(/homestyle/);
  });

  it('rejects a store reset point inside a wall', () => {
    expect(() =>
      validateWing(
        wingWithStoreOverride('homestyle', { resetPoint: { x: 100, y: 65 } }),
        ITEM_CATALOG,
      ),
    ).toThrow(/homestyle/);
  });

  it('rejects a mall exit outside the wing bounds', () => {
    expect(() =>
      validateWing(
        {
          ...M3_WING,
          mallExit: { ...M3_WING.mallExit, bounds: { x: -20, y: 460, width: 100, height: 40 } },
        },
        ITEM_CATALOG,
      ),
    ).toThrow(/orchard-gate-exit/);
  });

  it('rejects invalid wing geometry', () => {
    expect(() => validateWing({ ...M3_WING, width: 0 }, ITEM_CATALOG)).toThrow(/width/);
    expect(() => validateWing({ ...M3_WING, startingCash: -5 }, ITEM_CATALOG)).toThrow(
      /startingCash/,
    );
  });

  it('rejects a wing validated against an empty item catalog', () => {
    expect(() => validateWing(M3_WING, [])).toThrow(/item-catalog/);
  });
});
