import { describe, expect, it } from 'vitest';
import { M5_ITEM_CATALOG } from '../../src/sim/items/catalog';
import { generateWing } from '../../src/sim/wing/generateWing';
import {
  AUTHORED_OFFER_BANDS,
  DOORWAY_WIDTH,
  ROOM_VARIANTS,
  STORE_TEMPLATES,
  WALL_THICKNESS,
} from '../../src/sim/wing/templates';
import {
  WING_ROOM_COUNT,
  WING_ROOM_ORDER,
} from '../../src/sim/wing/types';
import type {
  GeneratedWing,
  WingRoomDefinition,
  WingRoomId,
  WingRoomRole,
} from '../../src/sim/wing/types';
import { validateWingGraph } from '../../src/sim/wing/validateWingGraph';

const CATALOG_DEFINITION_IDS = new Set(
  M5_ITEM_CATALOG.map((definition) => definition.id),
);

function roomById(wing: GeneratedWing, id: WingRoomId): WingRoomDefinition {
  const room = wing.rooms.find((candidate) => candidate.id === id);
  if (!room) {
    throw new Error(`Generated wing is missing room ${id}`);
  }
  return room;
}

function replaceRoom(
  wing: GeneratedWing,
  id: WingRoomId,
  replace: (room: WingRoomDefinition) => WingRoomDefinition,
): GeneratedWing {
  return {
    ...wing,
    rooms: wing.rooms.map((room) => (room.id === id ? replace(room) : room)),
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function containsPoint(
  rect: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function assertDeepFrozen(value: unknown): void {
  if (Array.isArray(value)) {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of value) {
      assertDeepFrozen(entry);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value)) {
      assertDeepFrozen(entry);
    }
  }
}

describe('seeded wing generation', () => {
  it('is deterministic for identical seeds', () => {
    expect(generateWing(20260913)).toEqual(generateWing(20260913));
  });

  it('varies across a small set of seeds', () => {
    const signatures = new Set(
      [1, 2, 3, 4, 5].map((seed) => JSON.stringify(generateWing(seed))),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('stays valid across a broad deterministic seed sample', () => {
    const enemySignatures = new Set<string>();
    for (let seed = 0; seed < 256; seed += 1) {
      const wing = generateWing(seed);
      expect(() => validateWingGraph(wing)).not.toThrow();
      enemySignatures.add(
        JSON.stringify(
          wing.rooms.map((room) =>
            room.enemySpawns.map((spawn) => [spawn.slotId, spawn.kind]),
          ),
        ),
      );
    }
    expect(enemySignatures.size).toBeGreaterThan(1);
  });

  it('generates the fixed six-room chain in order', () => {
    const wing = generateWing(7);
    expect(WING_ROOM_COUNT).toBe(6);
    expect(WING_ROOM_ORDER).toEqual([
      'service_corridor',
      'storefront_a',
      'food_court',
      'storefront_b',
      'back_hall',
      'security_office',
    ]);
    expect(wing.rooms).toHaveLength(WING_ROOM_COUNT);
    expect(wing.rooms.map((room) => room.id)).toEqual([...WING_ROOM_ORDER]);
    expect(wing.startingCash).toBe(30);
    expect(() => validateWingGraph(wing)).not.toThrow();
  });

  it('lines up the fixed doorway topology without walls or other doors overlapping', () => {
    const wing = generateWing(11);
    for (const room of wing.rooms) {
      const expectedSides =
        room.id === 'service_corridor'
          ? ['east']
          : room.id === 'security_office'
            ? ['west']
            : ['west', 'east'];
      expect(room.doorways.map((doorway) => doorway.side)).toEqual(expectedSides);

      for (const doorway of room.doorways) {
        expect(doorway.rect.width).toBe(WALL_THICKNESS);
        expect(doorway.rect.height).toBe(DOORWAY_WIDTH);
        expect(doorway.rect.y).toBe((room.bounds.height - DOORWAY_WIDTH) / 2);
        expect(
          room.walls.some((wall) => rectsOverlap(wall, doorway.rect)),
        ).toBe(false);
      }
      for (let left = 0; left < room.doorways.length; left += 1) {
        for (let right = left + 1; right < room.doorways.length; right += 1) {
          expect(
            rectsOverlap(
              room.doorways[left]!.rect,
              room.doorways[right]!.rect,
            ),
          ).toBe(false);
        }
      }
      expect(room.playerEntry.x).toBeGreaterThanOrEqual(room.bounds.x);
      expect(room.playerEntry.y).toBeGreaterThanOrEqual(room.bounds.y);
      expect(room.playerEntry.x).toBeLessThanOrEqual(
        room.bounds.x + room.bounds.width,
      );
      expect(room.playerEntry.y).toBeLessThanOrEqual(
        room.bounds.y + room.bounds.height,
      );
      expect(
        room.walls.some((wall) => containsPoint(wall, room.playerEntry)),
      ).toBe(false);
    }
  });

  it('uses two distinct authored storefront templates with four catalogued offers each', () => {
    const wing = generateWing(17);
    const storefronts = wing.rooms.filter(
      (room) => room.id === 'storefront_a' || room.id === 'storefront_b',
    );
    expect(storefronts).toHaveLength(2);
    const templateIds = storefronts.map((room) => room.store?.templateId);
    expect(new Set(templateIds).size).toBe(2);
    for (const templateId of templateIds) {
      expect(STORE_TEMPLATES.some((template) => template.id === templateId)).toBe(
        true,
      );
    }

    for (const room of storefronts) {
      expect(room.store).not.toBeNull();
      expect(room.offers).toHaveLength(4);
      expect(room.store!.offerIds).toEqual(room.offers.map((offer) => offer.id));
      for (const offer of room.offers) {
        const band = AUTHORED_OFFER_BANDS[offer.itemDefinitionId];
        expect(CATALOG_DEFINITION_IDS.has(offer.itemDefinitionId)).toBe(true);
        expect(band).toBeDefined();
        expect(offer.price).toBeGreaterThanOrEqual(band!.min);
        expect(offer.price).toBeLessThanOrEqual(band!.max);
        expect(offer.storeId).toBe(room.store!.templateId);
        expect(containsPoint(room.store!.bounds, offer.position)).toBe(true);
      }
    }
  });

  it('authors at least four complete store templates and two variants per combat role', () => {
    expect(STORE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const template of STORE_TEMPLATES) {
      expect(template.offers).toHaveLength(6);
      for (const offer of template.offers) {
        expect(CATALOG_DEFINITION_IDS.has(offer.itemDefinitionId)).toBe(true);
        const band = AUTHORED_OFFER_BANDS[offer.itemDefinitionId];
        expect(band).toBeDefined();
        expect(offer.price).toBeGreaterThanOrEqual(band!.min);
        expect(offer.price).toBeLessThanOrEqual(band!.max);
        expect(containsPoint(template.bounds, offer.position)).toBe(true);
      }
    }

    for (const role of [
      'service_corridor',
      'food_court',
      'back_hall',
    ] as const) {
      expect(ROOM_VARIANTS[role]).toHaveLength(2);
      for (const variant of ROOM_VARIANTS[role]) {
        expect(variant.spawnSlots.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses seeded combat layouts and bounded authored enemy composition', () => {
    const wing = generateWing(23);
    for (const role of [
      'service_corridor',
      'food_court',
      'back_hall',
    ] as const) {
      const room = roomById(wing, role);
      const variant = ROOM_VARIANTS[role].find(
        (candidate) => candidate.id === room.variantId,
      );
      expect(variant).toBeDefined();
      expect(room.enemySpawns.length).toBeGreaterThanOrEqual(
        variant!.enemyCount.min,
      );
      expect(room.enemySpawns.length).toBeLessThanOrEqual(
        variant!.enemyCount.max,
      );

      const slotById = new Map(
        variant!.spawnSlots.map((slot) => [slot.slotId, slot]),
      );
      for (const spawn of room.enemySpawns) {
        const slot = slotById.get(spawn.slotId);
        expect(slot).toBeDefined();
        expect(slot!.kinds).toContain(spawn.kind);
        expect(containsPoint(room.bounds, spawn)).toBe(true);
        expect(
          room.walls.some((wall) => containsPoint(wall, spawn)),
        ).toBe(false);
      }
    }
  });

  it('places the boss anchor only in the security office', () => {
    const wing = generateWing(29);
    for (const room of wing.rooms) {
      if (room.id === 'security_office') {
        expect(room.bossAnchor).not.toBeNull();
      } else {
        expect(room.bossAnchor).toBeNull();
      }
    }
  });

  it('places the bench kiosk only in the service corridor', () => {
    const wing = generateWing(31);
    for (const room of wing.rooms) {
      if (room.id === 'service_corridor') {
        expect(room.benchKiosk).not.toBeNull();
      } else {
        expect(room.benchKiosk).toBeNull();
      }
    }
  });

  it('returns deep-frozen plain output', () => {
    assertDeepFrozen(generateWing(37));
  });

  it('keeps the service corridor a safe entry room', () => {
    for (const seed of [23, 41, 77, 104]) {
      const corridor = roomById(generateWing(seed), 'service_corridor');
      expect(corridor.enemySpawns).toHaveLength(0);
      expect(corridor.benchKiosk).not.toBeNull();
    }
  });
});

describe('wing graph validation', () => {
  const baseWing = generateWing(41);

  it('rejects a safe room that carries enemy spawns', () => {
    const corrupted = replaceRoom(baseWing, 'service_corridor', (room) => ({
      ...room,
      enemySpawns: [
        { slotId: 'corridor-utility-hanger-west', kind: 'hanger' as const, x: 480, y: 240 },
      ],
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/safe room/i);
  });

  it('rejects the wrong room count', () => {
    const corrupted: GeneratedWing = {
      ...baseWing,
      rooms: baseWing.rooms.slice(0, WING_ROOM_COUNT - 1),
    };
    expect(() => validateWingGraph(corrupted)).toThrow(/room count/i);
  });

  it('rejects the wrong room order', () => {
    const rooms = [...baseWing.rooms];
    const first = rooms[0]!;
    rooms[0] = rooms[1]!;
    rooms[1] = first;
    expect(() => validateWingGraph({ ...baseWing, rooms })).toThrow(/room order/i);
  });

  it('rejects duplicate room ids', () => {
    const rooms = [...baseWing.rooms];
    rooms[1] = rooms[0]!;
    expect(() => validateWingGraph({ ...baseWing, rooms })).toThrow(
      /duplicate room id/i,
    );
  });

  it('rejects a doorway outside its room bounds', () => {
    const corrupted = replaceRoom(baseWing, 'service_corridor', (room) => ({
      ...room,
      doorways: room.doorways.map((doorway) => ({
        ...doorway,
        rect: { ...doorway.rect, x: room.bounds.x + room.bounds.width },
      })),
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/doorway .* outside/i);
  });

  it('rejects a doorway overlapping a wall', () => {
    const corrupted = replaceRoom(baseWing, 'service_corridor', (room) => ({
      ...room,
      doorways: room.doorways.map((doorway) => ({
        ...doorway,
        rect: { ...doorway.rect, y: room.bounds.y },
      })),
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/doorway .* overlap/i);
  });

  it('rejects store bounds outside the room', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => ({
      ...room,
      store: {
        ...room.store!,
        bounds: {
          x: room.bounds.x + room.bounds.width - 20,
          y: 80,
          width: 100,
          height: 200,
        },
      },
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/store .* outside/i);
  });

  it('rejects store bounds overlapping a wall', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => ({
      ...room,
      store: {
        ...room.store!,
        bounds: { x: room.bounds.x, y: room.bounds.y, width: 200, height: 200 },
      },
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/store .* overlap/i);
  });

  it('rejects an offer price outside its authored band', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => {
      const offer = room.offers[0]!;
      const band = AUTHORED_OFFER_BANDS[offer.itemDefinitionId]!;
      return {
        ...room,
        offers: [{ ...offer, price: band.max + 1 }, ...room.offers.slice(1)],
      };
    });
    expect(() => validateWingGraph(corrupted)).toThrow(/offer .* price/i);
  });

  it('rejects an offer referencing an unknown catalog definition', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => ({
      ...room,
      offers: [
        { ...room.offers[0]!, itemDefinitionId: 'unknown_merchandise' },
        ...room.offers.slice(1),
      ],
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(
      /unknown item definition/i,
    );
  });

  it('rejects an enemy spawn inside a wall', () => {
    // A real food_court spawn, moved inside a wall: the service corridor has
    // no spawns, so spreading and mutating its empty list would test nothing.
    const corrupted = replaceRoom(baseWing, 'food_court', (room) => {
      expect(room.enemySpawns.length).toBeGreaterThan(0);
      return {
        ...room,
        enemySpawns: [
          { ...room.enemySpawns[0]!, x: 5, y: 5 },
          ...room.enemySpawns.slice(1),
        ],
      };
    });
    expect(() => validateWingGraph(corrupted)).toThrow(/spawn .* wall/i);
  });

  it('rejects an enemy spawn outside its room bounds', () => {
    const corrupted = replaceRoom(baseWing, 'food_court', (room) => {
      expect(room.enemySpawns.length).toBeGreaterThan(0);
      return {
        ...room,
        enemySpawns: [
          { ...room.enemySpawns[0]!, x: 1200, y: 240 },
          ...room.enemySpawns.slice(1),
        ],
      };
    });
    expect(() => validateWingGraph(corrupted)).toThrow(/spawn .* outside/i);
  });

  it('rejects a storefront without a store', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => ({
      ...room,
      store: null,
      offers: [],
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(
      /storefront .* without a store/i,
    );
  });

  it('rejects a regular combat room without spawns', () => {
    const corrupted = replaceRoom(baseWing, 'food_court', (room) => ({
      ...room,
      enemySpawns: [],
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(
      /combat room .* spawn/i,
    );
  });

  it('rejects a missing security-office boss anchor', () => {
    const corrupted = replaceRoom(baseWing, 'security_office', (room) => ({
      ...room,
      bossAnchor: null,
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(
      /boss anchor .* security office/i,
    );
  });

  it('rejects a boss anchor outside the security office', () => {
    const corrupted = replaceRoom(baseWing, 'service_corridor', (room) => ({
      ...room,
      bossAnchor: { x: 480, y: 240 },
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(
      /boss anchor .* security office/i,
    );
  });

  it('rejects a store exit that is not reachable from the room entry', () => {
    const corrupted = replaceRoom(baseWing, 'storefront_a', (room) => ({
      ...room,
      walls: [
        ...room.walls,
        { x: 700, y: 10, width: 10, height: room.bounds.height - 20 },
      ],
      store: {
        ...room.store!,
        bounds: { x: 760, y: 80, width: 180, height: 220 },
        resetPoint: { x: 850, y: 330 },
        exit: {
          ...room.store!.exit,
          bounds: { x: 800, y: 320, width: DOORWAY_WIDTH, height: 10 },
        },
      },
    }));
    expect(() => validateWingGraph(corrupted)).toThrow(/store exit .* reachable/i);
  });
});
