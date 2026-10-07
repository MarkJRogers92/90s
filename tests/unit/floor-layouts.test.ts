import { describe, expect, it } from 'vitest';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import type { Rect, Vec2 } from '../../src/sim/model';
import { CONCOURSE_FURNITURE, STORE_ENTRANCE_XS, concourseFurniture, generateRunWing, roomFurniture } from '../../src/sim/run/storeInterior';
import { SECRET_MACHINE } from '../../src/sim/run/secretRoom';
import { SHORTCUT_HATCH } from '../../src/sim/run/shortcut';
import { generateWing } from '../../src/sim/wing/generateWing';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import { COMBAT_ROOM_ROLES, ROOM_VARIANTS, bossArenaFor, findRoomVariant, roomVariantsFor, type AuthoredRoomVariant, type CombatRoomRole } from '../../src/sim/wing/templates';
import { mirrorVariant } from '../../src/sim/wing/generateWing';

/**
 * Round 58: every floor had the same two layouts per room, so the four floors
 * played and looked alike. Floors 2-4 now have their own; floor 1 keeps its two.
 */
const FLOORS: readonly FloorNumber[] = [1, 2, 3, 4];
/** Wide enough for the biggest regular monster (the Mascot Brute, radius 18) and a little room. */
const BODY = 20;
const DOOR_LANE = { top: 192, bottom: 288 };

function walls(variant: AuthoredRoomVariant): Rect[] {
  return [...variant.interiorWalls];
}

/** A coarse flood fill of where a body of `BODY` radius can stand, from the west door. */
function reachable(blockers: readonly Rect[]): (point: Vec2) => boolean {
  const step = 8;
  const columns = Math.floor(960 / step);
  const rows = Math.floor(480 / step);
  const free = (cx: number, cy: number) => {
    const x = cx * step + step / 2;
    const y = cy * step + step / 2;
    return x > BODY && x < 960 - BODY && y > BODY && y < 480 - BODY && !blockers.some((wall) => circleIntersectsRect(x, y, BODY, wall));
  };
  const seen = new Set<number>();
  const start = { cx: Math.floor(30 / step), cy: Math.floor(240 / step) };
  const queue = [start];
  seen.add(start.cy * columns + start.cx);
  while (queue.length > 0) {
    const { cx, cy } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows || seen.has(ny * columns + nx) || !free(nx, ny)) continue;
      seen.add(ny * columns + nx);
      queue.push({ cx: nx, cy: ny });
    }
  }
  return (point) => seen.has(Math.floor(point.y / step) * columns + Math.floor(point.x / step));
}

describe('round 58: each floor lays its rooms out its own way', () => {
  it('gives floors 2-4 their own two layouts per fight room, and leaves floor 1 alone', () => {
    const seen = new Map<string, FloorNumber>();
    for (const floor of FLOORS) {
      for (const role of COMBAT_ROOM_ROLES) {
        const variants = roomVariantsFor(role, floor);
        expect(variants.length, `f${floor} ${role}`).toBeGreaterThanOrEqual(2);
        if (floor === 1) expect(variants).toBe(ROOM_VARIANTS[role]);
        for (const variant of variants) {
          expect(seen.get(variant.id), `${variant.id} on two floors`).toBeUndefined();
          seen.set(variant.id, floor);
        }
      }
    }
  });

  it('actually rolls each floor its own layouts, both of them over a run of nights', () => {
    for (const floor of FLOORS) {
      for (const role of COMBAT_ROOM_ROLES) {
        const used = new Set<string>();
        for (let seed = 0; seed < 40; seed += 1) {
          used.add(generateWing(seed, floor).rooms.find((room) => room.id === role)!.variantId);
        }
        expect([...used].sort(), `f${floor} ${role}`).toEqual(roomVariantsFor(role, floor).map((variant) => variant.id).sort());
      }
    }
  });

  it('keeps every layout walkable, either way round: doors, monsters, bench and the side-door lane', () => {
    for (const floor of FLOORS) {
      for (const role of COMBAT_ROOM_ROLES) {
        for (const authored of [...roomVariantsFor(role, floor), ...roomVariantsFor(role, floor, 1)]) {
          for (const variant of [authored, mirrorVariant(authored)]) {
            const where = `f${floor} ${variant.id}${variant === authored ? '' : ' (mirrored)'}`;
            const blockers = walls(variant);
            for (const wall of blockers) {
              const nearDoor = wall.x < 90 || wall.x + wall.width > 870;
              const inLane = wall.y < DOOR_LANE.bottom && wall.y + wall.height > DOOR_LANE.top;
              expect(nearDoor && inLane, `${where} blocks a side door ${JSON.stringify(wall)}`).toBe(false);
            }
            const canReach = reachable(blockers);
            expect(canReach({ x: 930, y: 240 }), `${where} east door`).toBe(true);
            expect(canReach(variant.playerEntry), `${where} entry`).toBe(true);
            // A safe room's slots are never filled (floor 1's corridor has one under its fountain).
            for (const slot of variant.enemyCount.max > 0 ? variant.spawnSlots : []) {
              expect(blockers.some((wall) => circleIntersectsRect(slot.x, slot.y, BODY, wall)), `${where} ${slot.slotId} in a wall`).toBe(false);
              expect(canReach(slot), `${where} ${slot.slotId}`).toBe(true);
              expect(Math.hypot(slot.x - variant.playerEntry.x, slot.y - variant.playerEntry.y), `${where} ${slot.slotId} on the entry`).toBeGreaterThanOrEqual(60);
            }
            if (variant.benchKiosk) {
              const kiosk = variant.benchKiosk;
              expect(blockers.some((wall) => circleIntersectsRect(kiosk.x, kiosk.y + 30, 44, wall)), `${where} bench`).toBe(false);
              expect(canReach({ x: kiosk.x, y: kiosk.y + 50 }), `${where} bench`).toBe(true);
            }
            if (role === 'service_corridor') {
              expect(blockers.some((wall) => circleIntersectsRect(SHORTCUT_HATCH.x, SHORTCUT_HATCH.y, 60, wall)), `${where} hatch`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('names each first wing\'s rooms after what is in them, distinct from the boss wing', () => {
    for (const floor of FLOORS) {
      for (const role of COMBAT_ROOM_ROLES) {
        const first = roomVariantsFor(role, floor, 1).map((variant) => variant.id);
        expect(first.length, `f${floor} ${role}`).toBe(2);
        for (const id of first) expect(roomVariantsFor(role, floor).map((variant) => variant.id)).not.toContain(id);
        const used = new Set<string>();
        for (let seed = 0; seed < 40; seed += 1) {
          const wing = generateWing(seed, floor, 1);
          if (wing.district) continue;
          used.add(wing.rooms.find((room) => room.id === role)!.variantId);
        }
        expect([...used].sort(), `f${floor} first ${role}`).toEqual([...first].sort());
      }
    }
  });

  it('flips about half the rooms each night, never a district\'s or the boss room', () => {
    let flipped = 0, total = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      for (const floor of FLOORS) {
        for (const part of [undefined, 1] as const) {
          const wing = generateWing(seed, floor, part);
          for (const room of wing.rooms) {
            if (wing.district || room.id === 'security_office') { expect(room.mirrored, `${seed} ${room.id}`).toBeUndefined(); continue; }
            total += 1;
            if (room.mirrored) flipped += 1;
          }
        }
      }
    }
    expect(flipped / total).toBeGreaterThan(0.4);
    expect(flipped / total).toBeLessThan(0.6);
  });

  it('gives each floor its own boss room and Lockdown room, leaving the boss its ground', () => {
    const ids = new Set<string>();
    for (const floor of FLOORS) {
      for (const part of [undefined, 1] as const) {
        const arena = bossArenaFor(floor, part);
        ids.add(arena.id);
        const where = `f${floor}${part ? ' lockdown' : ''} ${arena.id}`;
        expect(arena.bossAnchor, where).toEqual({ x: 760, y: 240 });
        for (const wall of arena.interiorWalls) expect(wall.x + wall.width, `${where} ${JSON.stringify(wall)}`).toBeLessThanOrEqual(600);
        const canReach = reachable(arena.interiorWalls);
        expect(canReach({ x: 760, y: 240 }), where).toBe(true);
        expect(canReach(arena.playerEntry), where).toBe(true);
        expect(generateWing(5, floor, part).rooms.find((room) => room.id === 'security_office')!.variantId === arena.id || generateWing(5, floor, part).district !== undefined).toBe(true);
      }
    }
    expect(ids.size).toBe(8);
  });

  it('keeps floor 1\'s boss-wing layouts, now always at full strength (round 59)', () => {
    const layouts = [['service-corridor-utility-row', 'storefront-open-plan', 'food-court-scattered-tables', 'storefront-open-plan', 'back-hall-crate-corners', 'security-office-desk-grid'], ['service-corridor-utility-row', 'storefront-open-plan', 'food-court-scattered-tables', 'storefront-open-plan', 'back-hall-pillar-pairs', 'security-office-desk-grid'], ['service-corridor-utility-row', 'storefront-open-plan', 'food-court-scattered-tables', 'storefront-open-plan', 'back-hall-crate-corners', 'security-office-desk-grid']];
    expect([23, 0, 7].map((seed) => generateWing(seed).rooms.map((room) => room.variantId))).toEqual(layouts);
    for (const seed of [23, 0, 7]) {
      for (const room of generateWing(seed).rooms) {
        const variant = findRoomVariant(room.id as CombatRoomRole, room.variantId);
        if (variant && variant.enemyCount.max > 0) expect(room.enemySpawns.length, `${seed} ${room.id}`).toBe(variant.enemyCount.max);
      }
    }
  });
});

describe('round 58: each floor furnishes its storefront concourses its own way', () => {
  it('keeps floor 1 as it was and gives floors 2-4 a different set each', () => {
    expect(concourseFurniture(1)).toBe(CONCOURSE_FURNITURE);
    const sets = FLOORS.map((floor) => concourseFurniture(floor).map((piece) => piece.kind).join(','));
    expect(new Set(sets).size).toBe(4);
  });

  it('keeps every set out of the side-door lane, the shop doors, the hatch and the secret machine, either way round', () => {
    for (const floor of FLOORS) {
      for (const part of [undefined, 1] as const) {
        for (const id of ['storefront_a', 'storefront_b'] as const) {
          for (const mirrored of [undefined, true] as const) {
            for (const piece of roomFurniture({ id, ...(mirrored ? { mirrored } : {}) }, floor, part)) {
              const where = `f${floor}${part ? ' first' : ''} ${id}${mirrored ? ' mirrored' : ''} ${piece.id}`;
              if (!piece.footprint) {
                expect(Math.hypot(piece.x - SECRET_MACHINE.x, piece.y - SECRET_MACHINE.y), `${where} on the secret machine`).toBeGreaterThan(50);
                expect(Math.hypot(piece.x - SHORTCUT_HATCH.x, piece.y - SHORTCUT_HATCH.y), `${where} on the hatch`).toBeGreaterThan(50);
                continue;
              }
              const rect = piece.footprint;
              expect(rect.y < DOOR_LANE.bottom + 8 && rect.y + rect.height > DOOR_LANE.top - 8, `${where} lane`).toBe(false);
              for (const door of STORE_ENTRANCE_XS) {
                expect(circleIntersectsRect(door, 50, 48, rect), `${where} shop door`).toBe(false);
              }
              expect(circleIntersectsRect(SECRET_MACHINE.x, SECRET_MACHINE.y, 60, rect), `${where} secret machine`).toBe(false);
              expect(circleIntersectsRect(SHORTCUT_HATCH.x, SHORTCUT_HATCH.y, 60, rect), `${where} hatch`).toBe(false);
              expect(reachable([rect])({ x: 930, y: 240 }), where).toBe(true);
            }
          }
        }
      }
    }
  });

  it('furnishes each first wing\'s two courts their own way', () => {
    const sets = new Set<string>();
    for (const floor of FLOORS) {
      for (const id of ['storefront_a', 'storefront_b'] as const) sets.add(roomFurniture({ id }, floor, 1).map((piece) => piece.kind).join());
      sets.add(roomFurniture({ id: 'storefront_a' }, floor).map((piece) => piece.kind).join());
    }
    expect(sets.size).toBe(12);
  });

  it('stands the floor\'s own furniture in its storefront rooms', () => {
    for (const floor of FLOORS) {
      const room = generateRunWing(5, floor).rooms.find((candidate) => candidate.id === 'storefront_a')!;
      for (const piece of roomFurniture(room, floor)) {
        if (piece.footprint) expect(room.walls, `f${floor} ${piece.id}`).toContainEqual(piece.footprint);
      }
    }
  });
});
