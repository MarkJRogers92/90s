import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { generateRunWing } from '../../src/sim/run/storeInterior';
import { generateWing } from '../../src/sim/wing/generateWing';
import { validateWingGraph } from '../../src/sim/wing/validateWingGraph';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { moveCircle } from '../../src/sim/combat/movement';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';

const FOOTPRINT = { x: 66, y: 118, width: 36, height: 14 };
const vendingProps = (wing: ReturnType<typeof generateRunWing>) => wing.rooms.flatMap(room =>
  planRoomDressing(room, wing.floor ?? 1, null, wing.part, wing.district).props
    .filter(prop => String(prop.prop) === 'damagedVending').map(prop => ({ room, prop })));

// Removing the scoped furniture entry must fail these real room/physics checks.
describe('one static damaged vending machine in the ground-floor Back Hall', () => {
  it('places one native-sized machine and its shallow base in both seeded layouts', () => {
    const variants = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const wing = generateRunWing(seed);
      const vending = vendingProps(wing);
      expect(vending).toHaveLength(1);
      const { room, prop } = vending[0]!;
      variants.add(room.variantId);
      expect(room.id).toBe('back_hall');
      expect(prop).toMatchObject({ x: 84, y: 132, covers: FOOTPRINT });
      expect(room.walls).toContainEqual(FOOTPRINT);
      expect(prop.covers).toBe(room.walls.find(wall => wall.x === FOOTPRINT.x && wall.y === FOOTPRINT.y));
      // A rendered furniture obstacle, never a combat prop or loot source.
      expect(room.props).toBeUndefined();
      // Validate the changed room with the original M5 store geometry; the
      // run expands shop interiors and is not an input to this older validator.
      const baseWing = generateWing(seed);
      validateWingGraph({ ...baseWing, rooms: baseWing.rooms.map(candidate => candidate.id === room.id ? room : candidate) });
    }
    expect(variants.size).toBe(2);
  });

  it('does not change the older wing generator, other rooms, upstairs, first wings or districts', () => {
    for (let seed = 0; seed < 12; seed++) {
      expect(generateWing(seed).rooms.every(room => !room.walls.some(wall => wall.x === 66 && wall.y === 118))).toBe(true);
      for (const floor of [1, 2, 3, 4] as const) for (const part of [undefined, 1] as const) {
        if (floor === 1 && part === undefined) continue;
        const wing = generateRunWing(seed, floor, part);
        expect(vendingProps(wing)).toHaveLength(0);
        expect(wing.rooms.every(room => !room.walls.some(wall => wall.x === 66 && wall.y === 118))).toBe(true);
      }
    }
  });

  it('blocks only the base, with open travel above, below and through both doors', () => {
    const state = createMvpRun(1);
    moveToRoom(state, 4, 'west');
    const room = state.wing.rooms[4]!, walls = state.room.combat.walls;
    expect(walls).toContainEqual(FOOTPRINT);
    expect(moveCircle({ x: 50, y: 125 }, 10, 10, 0, walls).x).toBeLessThanOrEqual(56);
    expect(moveCircle({ x: 50, y: 100 }, 10, 50, 0, walls).x).toBeCloseTo(100);
    expect(moveCircle({ x: 50, y: 152 }, 10, 50, 0, walls).x).toBeCloseTo(100);
    for (const point of [room.playerEntry, ...room.enemySpawns, room.benchKiosk!]) {
      expect(circleIntersectsRect(point.x, point.y, 16, FOOTPRINT)).toBe(false);
    }
    for (const door of room.doorways) {
      const y = door.rect.y + door.rect.height / 2;
      expect(circleIntersectsRect(door.side === 'west' ? 40 : 920, y, 16, FOOTPRINT)).toBe(false);
    }
  });

  it('rebuilds one matching visual and collision after leaving, returning and restoring a save', () => {
    const state = createMvpRun(7);
    state.clearedRooms.push('food_court'); // A real arrival has cleared the preceding fight.
    moveToRoom(state, 4, 'west');
    moveToRoom(state, 3, 'east');
    moveToRoom(state, 4, 'west');
    const parsed = parseCheckpoint(serializeCheckpoint(state));
    expect(parsed, JSON.stringify(parsed)).toMatchObject({ ok: true });
    if (!parsed.ok) throw new Error('Checkpoint did not parse');
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(vendingProps(restored.wing)).toHaveLength(1);
    expect(restored.room.combat.walls.filter(wall => wall.x === 66 && wall.y === 118)).toEqual([FOOTPRINT]);
    expect(restored.room.combat.props?.some(prop => prop.x === 84 && prop.y === 132)).toBe(false);
  });
});
