import { describe, expect, it } from 'vitest';
import { FIXTURE_ART } from '../../src/game/assets';
import { generateWing } from '../../src/sim/wing/generateWing';
import { WING_ROOM_ORDER } from '../../src/sim/wing/types';
import type { Rect } from '../../src/sim/model';
import type { WingFixture, WingRoomDefinition } from '../../src/sim/wing/types';

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

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Fixtures are placed by hand, so the tests below re-derive the two things a
 * human eyeballing coordinates gets wrong: a fixture standing inside a wall, and
 * a fixture standing outside the room.
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
    // Without this, the overlap checks below could pass while only one of the
    // two authored layouts was ever generated -- false confidence rather than
    // coverage.
    const variants = new Set(
      rooms.filter((room) => room.fixtures.length > 0).map((room) => room.variantId),
    );
    expect([...variants].sort()).toEqual([
      'service-corridor-locker-aisles',
      'service-corridor-utility-row',
    ]);
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
