import { describe, expect, it } from 'vitest';
import { DECAL_ART, FIXTURE_ART } from '../../src/game/assets';
import { generateWing } from '../../src/sim/wing/generateWing';
import { WING_ROOM_ORDER } from '../../src/sim/wing/types';
import type { Rect } from '../../src/sim/model';
import type { WingDecal, WingFixture, WingRoomDefinition } from '../../src/sim/wing/types';

/** The footprint a base-anchored fixture sprite actually covers on the floor. */
function footprint(fixture: WingFixture): Rect {
  const art = FIXTURE_ART[fixture.kind];
  return {
    x: fixture.x - Math.floor(art.width / 2),
    y: fixture.y - art.height,
    width: art.width,
    height: art.height,
  };
}

/**
 * The footprint a decal covers. Decals are CENTRED rather than base-anchored, so
 * the vertical origin differs from a fixture's and cannot share its helper.
 */
function decalFootprint(decal: WingDecal): Rect {
  const art = DECAL_ART[decal.kind];
  return {
    x: decal.x - Math.floor(art.width / 2),
    y: decal.y - Math.floor(art.height / 2),
    width: art.width,
    height: art.height,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Fixtures and decals are both placed by hand, so the tests below re-derive the
 * two things a human eyeballing coordinates gets wrong: a piece of decoration
 * standing inside a wall, and one standing outside the room.
 */
describe('room fixtures', () => {
  const seeds = Array.from({ length: 120 }, (_, index) => index);
  const wings = seeds.map((seed) => generateWing(seed));
  const rooms: WingRoomDefinition[] = wings.flatMap((wing) => [...wing.rooms]);

  it('gives every fixture kind a sprite', () => {
    for (const fixture of rooms.flatMap((room) => [...room.fixtures])) {
      expect(FIXTURE_ART[fixture.kind]).toBeDefined();
    }
  });

  it('declares a positive sprite size for every kind', () => {
    for (const art of Object.values(FIXTURE_ART)) {
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
      expect(art.url.startsWith('/assets/')).toBe(true);
    }
  });

  it('actually places fixtures, rather than authoring a field nothing fills', () => {
    const placed = rooms.reduce((total, room) => total + room.fixtures.length, 0);
    expect(placed).toBeGreaterThan(0);
  });

  it('exercises every fixture-bearing variant, so placement is not untested', () => {
    // Without this, the overlap checks below could pass while only some of the
    // authored layouts were ever generated -- false confidence rather than
    // coverage. Every combat variant, the boss room and every shop carries
    // dressing as of 2026-09-23, when the mall-prop library was placed.
    //
    // Keyed on the store's template id rather than the room's variant id for the
    // same reason the decal check is: every storefront room shares ONE variant
    // id, so keying on the variant would see a single `storefront-open-plan`
    // entry and stay green while three of the four shops went unauthored.
    const layouts = new Set(
      rooms
        .filter((room) => room.fixtures.length > 0)
        .map((room) => room.store?.templateId ?? room.variantId),
    );
    expect([...layouts].sort()).toEqual([
      'arcade-annex',
      'back-hall-crate-corners',
      'back-hall-pillar-pairs',
      'cinema-snacks',
      'department-outlet',
      'food-court-counter-row',
      'food-court-scattered-tables',
      'mall-mart',
      'security-office-desk-grid',
      'service-corridor-locker-aisles',
      'service-corridor-utility-row',
    ]);
  });

  it('never overlaps two fixtures in the same room', () => {
    // Fixtures have no collision, so an overlap is not a gameplay bug -- it is a
    // layout bug: two objects drawn on top of each other read as one broken
    // thing. Nothing checked this until 2026-09-23, when the dressing went from
    // 6 pieces to 62 and hand-spaced coordinates needed a gate.
    for (const room of rooms) {
      const boxes = room.fixtures.map((fixture) => ({ fixture, box: footprint(fixture) }));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          expect(
            overlaps(a.box, b.box),
            `${a.fixture.kind} at ${a.fixture.x},${a.fixture.y} overlaps ` +
              `${b.fixture.kind} at ${b.fixture.x},${b.fixture.y} in ${room.id}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps every fixture inside its room', () => {
    for (const room of rooms) {
      for (const fixture of room.fixtures) {
        const box = footprint(fixture);
        expect(box.x).toBeGreaterThanOrEqual(room.bounds.x);
        expect(box.y).toBeGreaterThanOrEqual(room.bounds.y);
        expect(box.x + box.width).toBeLessThanOrEqual(room.bounds.x + room.bounds.width);
        expect(box.y + box.height).toBeLessThanOrEqual(room.bounds.y + room.bounds.height);
      }
    }
  });

  it('never stands a fixture inside a wall, including the perimeter', () => {
    for (const room of rooms) {
      for (const fixture of room.fixtures) {
        const box = footprint(fixture);
        const hit = room.walls.find((wall) => overlaps(box, wall));
        expect(
          hit,
          `fixture ${fixture.kind} at ${fixture.x},${fixture.y} overlaps a wall at ` +
            `${hit?.x},${hit?.y} ${hit?.width}x${hit?.height}`,
        ).toBeUndefined();
      }
    }
  });

  it('covers every room in the wing order', () => {
    for (const room of rooms) {
      expect(WING_ROOM_ORDER).toContain(room.id);
    }
  });
});

/**
 * The same checks for decals. Their footprints are derived from `DECAL_ART`, so
 * a size in that table that disagreed with the PNG would let an overlapping
 * decal pass — which is why the size lives in the table rather than the test.
 */
describe('room decals', () => {
  const seeds = Array.from({ length: 120 }, (_, index) => index);
  const rooms: WingRoomDefinition[] = seeds.flatMap((seed) => [
    ...generateWing(seed).rooms,
  ]);

  it('gives every decal kind a sprite', () => {
    for (const decal of rooms.flatMap((room) => [...room.decals])) {
      expect(DECAL_ART[decal.kind]).toBeDefined();
    }
  });

  it('declares a positive sprite size for every kind', () => {
    for (const art of Object.values(DECAL_ART)) {
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
      expect(art.url.startsWith('/assets/')).toBe(true);
    }
  });

  it('actually places decals, rather than authoring a field nothing fills', () => {
    const placed = rooms.reduce((total, room) => total + room.decals.length, 0);
    expect(placed).toBeGreaterThan(0);
  });

  it('exercises every decal-bearing layout, so placement is not untested', () => {
    // Every storefront room shares one variant id, so the store's template id is
    // what actually distinguishes their layouts; without this the check would
    // see one storefront entry and stay green while a store went unauthored.
    const layouts = new Set(
      rooms
        .filter((room) => room.decals.length > 0)
        .map((room) => room.store?.templateId ?? room.variantId),
    );
    expect([...layouts].sort()).toEqual([
      'arcade-annex',
      'back-hall-crate-corners',
      'back-hall-pillar-pairs',
      'cinema-snacks',
      'department-outlet',
      'food-court-counter-row',
      'food-court-scattered-tables',
      'mall-mart',
      'security-office-desk-grid',
      'service-corridor-locker-aisles',
      'service-corridor-utility-row',
    ]);
  });

  it('keeps every decal inside its room', () => {
    for (const room of rooms) {
      for (const decal of room.decals) {
        const box = decalFootprint(decal);
        expect(box.x).toBeGreaterThanOrEqual(room.bounds.x);
        expect(box.y).toBeGreaterThanOrEqual(room.bounds.y);
        expect(box.x + box.width).toBeLessThanOrEqual(room.bounds.x + room.bounds.width);
        expect(box.y + box.height).toBeLessThanOrEqual(room.bounds.y + room.bounds.height);
      }
    }
  });

  it('never lies a decal across a wall, including the perimeter', () => {
    for (const room of rooms) {
      for (const decal of room.decals) {
        const box = decalFootprint(decal);
        const hit = room.walls.find((wall) => overlaps(box, wall));
        expect(
          hit,
          `decal ${decal.kind} at ${decal.x},${decal.y} overlaps a wall at ` +
            `${hit?.x},${hit?.y} ${hit?.width}x${hit?.height}`,
        ).toBeUndefined();
      }
    }
  });
});
