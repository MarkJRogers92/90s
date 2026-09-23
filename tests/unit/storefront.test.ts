import { describe, expect, it } from 'vitest';
import {
  FLOOR_FOR_STORE_TEMPLATE,
  SIGN_FOR_STORE_TEMPLATE,
  STOREFRONT_FASCIA_HEIGHT,
  STOREFRONT_SIGN_HEIGHT,
  planStorefront,
} from '../../src/game/view/RoomEnvironment';
import type { StorefrontPlan } from '../../src/game/view/RoomEnvironment';
import { STOREFRONT_ART } from '../../src/game/assets';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { generateWing } from '../../src/sim/wing/generateWing';
import type { WingRoomDefinition, WingStoreInstance } from '../../src/sim/wing/types';

/**
 * The storefront planner, checked as pure data.
 *
 * Deliberately no filesystem: `tsconfig` compiles `tests` without Node types, so
 * a `node:fs` import typechecks under vitest but breaks `tsc --noEmit`, which
 * `npm run build` runs first. The file-level half of "this art is usable" lives
 * where the right tools already are — `tests/browser/storefront.spec.ts` fetches
 * and decodes each asset in a real browser, and
 * `docs/art/tools/validate_runtime_tree.py` checks binary alpha and palette.
 */
const SEEDS = [0, 1, 2, 3, 4, 5];

const ROOMS: readonly WingRoomDefinition[] = SEEDS.flatMap((seed) => [
  ...generateWing(seed).rooms,
]);

/** Every shop the wing generator can actually place, across the seeds above. */
const STORES: readonly WingStoreInstance[] = ROOMS.flatMap((room) =>
  room.store === null ? [] : [room.store],
);

/** The authored template ids, so a table entry with no template is caught too. */
const TEMPLATE_IDS: readonly string[] = STORE_TEMPLATES.map((template) => template.id);

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function containsRect(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe('storefront template tables', () => {
  it('covers every authored store template with both a floor and a sign', () => {
    expect(STORE_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of STORE_TEMPLATES) {
      expect(TEMPLATE_IDS).toContain(template.id);
      expect(FLOOR_FOR_STORE_TEMPLATE[template.id]).toBeDefined();
      expect(SIGN_FOR_STORE_TEMPLATE[template.id]).toBeDefined();
    }
  });

  it('names only authored templates, with no extras', () => {
    const authored = STORE_TEMPLATES.map((template) => template.id).sort();
    expect(Object.keys(FLOOR_FOR_STORE_TEMPLATE).sort()).toEqual(authored);
    expect(Object.keys(SIGN_FOR_STORE_TEMPLATE).sort()).toEqual(authored);
  });

  it('sends every sign kind to art that exists', () => {
    for (const kind of Object.values(SIGN_FOR_STORE_TEMPLATE)) {
      expect(STOREFRONT_ART[kind]).toBeDefined();
    }
  });
});

describe('storefront geometry', () => {
  it('reaches every shop the generator places', () => {
    expect(STORES.length).toBeGreaterThan(0);
    for (const store of STORES) {
      expect(planStorefront(store).templateId).toBe(store.templateId);
    }
  });

  it('flanks the doorway with fascia that never covers the opening', () => {
    for (const store of STORES) {
      const plan = planStorefront(store);
      // Two strips for a centred door, and never zero: a shop with frontage on
      // only one side is still a shop.
      expect(plan.fascia.length).toBeGreaterThanOrEqual(1);
      expect(plan.fascia.length).toBeLessThanOrEqual(2);
      for (const band of plan.fascia) {
        expect(rectsOverlap(band.rect, store.exit.bounds)).toBe(false);
      }
    }
  });

  it('stands the fascia on the shopfront edge, inside the shop', () => {
    for (const store of STORES) {
      const plan = planStorefront(store);
      const frontEdge = store.bounds.y + store.bounds.height;
      for (const band of plan.fascia) {
        expect(band.rect.y + band.rect.height).toBe(frontEdge);
        expect(band.rect.height).toBe(STOREFRONT_FASCIA_HEIGHT);
        expect(band.orderY).toBe(frontEdge);
        // It is the shop's own frontage, so it belongs to the shop's rectangle.
        expect(containsRect(store.bounds, band.rect)).toBe(true);
      }
      // Fasciated width plus the doorway spans the whole frontage exactly.
      const covered = plan.fascia.reduce((total, band) => total + band.rect.width, 0);
      expect(covered + store.exit.bounds.width).toBe(store.bounds.width);
    }
  });

  it('hangs the sign over the doorway, flush above the fascia', () => {
    for (const store of STORES) {
      const plan = planStorefront(store);
      const fasciaTop = store.bounds.y + store.bounds.height - STOREFRONT_FASCIA_HEIGHT;
      // Same x-range as the door, so board, opening and gap share one alignment.
      expect(plan.sign.rect.x).toBe(store.exit.bounds.x);
      expect(plan.sign.rect.width).toBe(store.exit.bounds.width);
      // Its bottom edge is the fascia's top edge: no gap, no overlap.
      expect(plan.sign.rect.y + plan.sign.rect.height).toBe(fasciaTop);
      expect(plan.sign.rect.height).toBe(STOREFRONT_SIGN_HEIGHT);
      expect(plan.sign.orderY).toBe(fasciaTop);
    }
  });

  it('floors the whole shop and keeps that floor inside the room', () => {
    for (const room of ROOMS) {
      const store = room.store;
      if (store === null) {
        continue;
      }
      const plan = planStorefront(store);
      expect(plan.floor.rect).toEqual(store.bounds);
      expect(containsRect(room.bounds, plan.floor.rect)).toBe(true);
      expect(containsRect(room.bounds, plan.sign.rect)).toBe(true);
    }
  });

  it('takes its floor and sign from the tables, and defaults for an unknown template', () => {
    for (const store of STORES) {
      const plan = planStorefront(store);
      expect(plan.floor.kind).toBe(FLOOR_FOR_STORE_TEMPLATE[store.templateId]);
      expect(plan.sign.kind).toBe(SIGN_FOR_STORE_TEMPLATE[store.templateId]);
    }
    const unknown: WingStoreInstance = {
      ...STORES[0]!,
      templateId: 'not-an-authored-template',
    };
    const fallback = planStorefront(unknown);
    expect(fallback.floor.kind).toBe('floor-tile-beige');
    expect(fallback.sign.kind).toBe('sign-warm');
  });

  it('plans the same shop twice into deep-equal data', () => {
    for (const store of STORES) {
      const first: StorefrontPlan = planStorefront(store);
      expect(planStorefront(store)).toEqual(first);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    }
  });
});

describe('storefront art agreement', () => {
  it('keeps the planner heights in step with the declared art', () => {
    expect(STOREFRONT_FASCIA_HEIGHT).toBe(STOREFRONT_ART['storefront-fascia'].height);
    expect(STOREFRONT_SIGN_HEIGHT).toBe(STOREFRONT_ART['sign-warm'].height);
    expect(STOREFRONT_SIGN_HEIGHT).toBe(STOREFRONT_ART['sign-cool'].height);
  });

  it('matches the sign board to the doorway width it hangs over', () => {
    for (const store of STORES) {
      const signKind = SIGN_FOR_STORE_TEMPLATE[store.templateId];
      if (signKind === undefined) {
        continue;
      }
      // The board is the door's width, which is what lets the sign be placed by
      // the doorway alone.
      expect(STOREFRONT_ART[signKind].width).toBe(store.exit.bounds.width);
    }
  });
});
