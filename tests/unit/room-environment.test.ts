import { describe, expect, it } from 'vitest';
import {
  DRAW_BAND_ORDER,
  FLOOR_FOR_ROOM_ROLE,
  FLOOR_TILE_SIZE,
  WALL_FACE_HEIGHT,
  WALL_MODULE_WIDTH,
  WALL_TOP_MODULE_SIZE,
  planRoomEnvironment,
} from '../../src/game/view/RoomEnvironment';
import type {
  PlanRect,
  RoomEnvironmentPlan,
  WallPiecePlan,
} from '../../src/game/view/RoomEnvironment';
import { generateWing } from '../../src/sim/wing/generateWing';
import {
  DOORWAY_WIDTH,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  WALL_THICKNESS,
} from '../../src/sim/wing/templates';
import { WING_ROOM_ORDER } from '../../src/sim/wing/types';
import type { WingRoomDefinition, WingRoomRole } from '../../src/sim/wing/types';

/**
 * Real rooms from the real generator, across enough seeds to reach both authored
 * variants of every combat role, so the wall rules are exercised on the geometry
 * that actually ships rather than on invented rects.
 */
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ROOMS: readonly WingRoomDefinition[] = SEEDS.flatMap((seed) => [
  ...generateWing(seed).rooms,
]);

/** The five names `FloorKind` must contain; the module only decides which one. */
const FLOOR_KINDS: readonly string[] = [
  'floor-terrazzo',
  'floor-carpet',
  'floor-tile-accent',
  'floor-carpet-damaged',
  'floor-tile-beige',
];

/** The product decision, restated so a silent edit to the module fails here. */
const PRODUCT_FLOOR_FOR_ROLE: Record<WingRoomRole, string> = {
  service_corridor: 'floor-tile-beige',
  storefront_a: 'floor-carpet',
  food_court: 'floor-tile-accent',
  storefront_b: 'floor-carpet',
  back_hall: 'floor-tile-beige',
  security_office: 'floor-tile-beige',
};

function planFor(room: WingRoomDefinition): RoomEnvironmentPlan {
  return planRoomEnvironment(room);
}

function rectsOverlap(a: PlanRect, b: PlanRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function containsRect(outer: PlanRect, inner: PlanRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function moduleBox(kind: WallPiecePlan['kind']): { width: number; height: number } {
  return kind === 'wall-face'
    ? { width: WALL_MODULE_WIDTH, height: WALL_FACE_HEIGHT }
    : { width: WALL_TOP_MODULE_SIZE, height: WALL_TOP_MODULE_SIZE };
}

function piecesForWall(
  plan: RoomEnvironmentPlan,
  wallIndex: number,
): readonly WallPiecePlan[] {
  return plan.wallPieces.filter((piece) => piece.wallIndex === wallIndex);
}

/**
 * The pieces that tile a run's own length, in run order: the face band of an
 * x-run, the top band of a y-run. An x-run's residual top band tiles in two axes
 * and is asserted separately.
 */
function runPieces(
  plan: RoomEnvironmentPlan,
  wallIndex: number,
  axis: 'x' | 'y',
): readonly WallPiecePlan[] {
  const wanted = axis === 'x' ? 'wall-face' : 'wall-top';
  return piecesForWall(plan, wallIndex).filter((piece) => piece.kind === wanted);
}

function axisFor(wall: PlanRect): 'x' | 'y' {
  return wall.width >= wall.height ? 'x' : 'y';
}

function runLengthOf(wall: PlanRect, axis: 'x' | 'y'): number {
  return axis === 'x' ? wall.width : wall.height;
}

function roomsWithVariant(variantId: string): readonly WingRoomDefinition[] {
  return ROOMS.filter((room) => room.variantId === variantId);
}

describe('room environment floor mapping', () => {
  it('uses the product floor decision for all six wing room roles', () => {
    expect(WING_ROOM_ORDER).toHaveLength(6);
    for (const role of WING_ROOM_ORDER) {
      expect(FLOOR_FOR_ROOM_ROLE[role]).toBe(PRODUCT_FLOOR_FOR_ROLE[role]);
    }
  });

  it('covers every role with no missing or extra entry and a known floor kind', () => {
    expect(Object.keys(FLOOR_FOR_ROOM_ROLE).sort()).toEqual([...WING_ROOM_ORDER].sort());
    for (const role of WING_ROOM_ORDER) {
      const kind = FLOOR_FOR_ROOM_ROLE[role];
      expect(FLOOR_KINDS).toContain(kind);
    }
    for (const room of ROOMS) {
      expect(planFor(room).floorKind).toBe(PRODUCT_FLOOR_FOR_ROLE[room.id]);
    }
  });
});

describe('room environment floor tiling', () => {
  it('tiles every generated room exactly, with no gap, no overlap and nothing outside bounds', () => {
    expect(ROOMS.length).toBeGreaterThan(0);
    for (const room of ROOMS) {
      const plan = planFor(room);
      const columns = room.bounds.width / FLOOR_TILE_SIZE;
      const rows = room.bounds.height / FLOOR_TILE_SIZE;
      expect(plan.floor.tiles).toHaveLength(columns * rows);

      const seen = new Map<string, number>();
      for (const tile of plan.floor.tiles) {
        expect(tile.rect.width).toBe(FLOOR_TILE_SIZE);
        expect(tile.rect.height).toBe(FLOOR_TILE_SIZE);
        // No tile outside the room bounds, in any direction.
        expect(containsRect(room.bounds, tile.rect)).toBe(true);
        // Grid coordinates are the ones the position implies.
        expect(tile.rect.x).toBe(room.bounds.x + tile.column * FLOOR_TILE_SIZE);
        expect(tile.rect.y).toBe(room.bounds.y + tile.row * FLOOR_TILE_SIZE);
        const key = `${tile.column},${tile.row}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      // Every cell exactly once: no gap and no overlap.
      expect(seen.size).toBe(columns * rows);
      for (const count of seen.values()) {
        expect(count).toBe(1);
      }
    }
  });

  it('uses the role floor kind for every tile', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      const expected = PRODUCT_FLOOR_FOR_ROLE[room.id];
      for (const tile of plan.floor.tiles) {
        expect(tile.drawBand).toBe('floor');
        expect(tile.kind).toBe(expected);
      }
    }
  });

  it('keeps the tile grid description in step with the tiles it emits', () => {
    for (const room of ROOMS) {
      const { floor } = planFor(room);
      expect(floor.tileSize).toBe(FLOOR_TILE_SIZE);
      expect(floor.originX).toBe(room.bounds.x);
      expect(floor.originY).toBe(room.bounds.y);
      expect(floor.columns * FLOOR_TILE_SIZE).toBe(room.bounds.width);
      expect(floor.rows * FLOOR_TILE_SIZE).toBe(room.bounds.height);
      expect(floor.tiles).toHaveLength(floor.columns * floor.rows);
      expect(floor.columns).toBe(ROOM_WIDTH / FLOOR_TILE_SIZE);
      expect(floor.rows).toBe(ROOM_HEIGHT / FLOOR_TILE_SIZE);
    }
  });
});

describe('room environment walls', () => {
  it('emits at least one piece for every wall rect of every generated room', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      const covered = new Set(plan.wallPieces.map((piece) => piece.wallIndex));
      room.walls.forEach((_, wallIndex) => {
        expect(covered.has(wallIndex)).toBe(true);
      });
    }
  });

  it('keeps every wall piece inside its room bounds', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      for (const piece of plan.wallPieces) {
        expect(containsRect(room.bounds, piece.rect)).toBe(true);
      }
    }
  });

  it('keeps every wall piece clear of every doorway opening', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      for (const doorway of room.doorways) {
        for (const piece of plan.wallPieces) {
          expect(rectsOverlap(piece.rect, doorway.rect)).toBe(false);
        }
      }
    }
  });

  it('base-anchors an x-run face on its south edge and lets it occlude the band behind it', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        if (axisFor(wall) !== 'x') {
          return;
        }
        const base = wall.y + wall.height;
        const faces = runPieces(plan, wallIndex, 'x');
        expect(faces.length).toBeGreaterThan(0);
        for (const face of faces) {
          expect(face.kind).toBe('wall-face');
          expect(face.axis).toBe('x');
          // The renderer sorts a face by its base line.
          expect(face.orderY).toBe(base);
          // The face occupies the band ending at its base, so the top of the
          // drawn band is the base minus the face height wherever the room
          // reaches back that far.
          const reach = Math.max(room.bounds.y, base - WALL_FACE_HEIGHT);
          expect(face.rect.y).toBe(reach);
          expect(face.rect.y + face.rect.height).toBe(
            Math.min(room.bounds.y + room.bounds.height, base),
          );
        }
      });
    }
  });

  it('draws a y-run wall as a top band clipped to the wall thickness', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        if (axisFor(wall) !== 'y') {
          return;
        }
        // The plan draws one module column for a y-run, which is only valid
        // while a wall that runs along y is no wider than the module.
        expect(wall.width).toBeLessThanOrEqual(WALL_MODULE_WIDTH);
        const tops = runPieces(plan, wallIndex, 'y');
        expect(tops.length).toBeGreaterThan(0);
        for (const top of tops) {
          expect(top.kind).toBe('wall-top');
          expect(top.axis).toBe('y');
          expect(top.rect.x).toBe(wall.x);
          expect(top.rect.width).toBe(wall.width);
          expect(top.source.x).toBe(0);
          expect(top.source.width).toBe(wall.width);
        }
      });
    }
  });

  it('shows no top band on a ten-unit-thick wall, and one on a footprint deeper than the face', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        if (axisFor(wall) !== 'x' || wall.height > WALL_FACE_HEIGHT) {
          return;
        }
        // The face already covers the whole footprint, so there is no residual.
        expect(piecesForWall(plan, wallIndex).every((piece) => piece.kind === 'wall-face')).toBe(
          true,
        );
      });
    }

    // The 80x80 crate block is the one authored footprint deeper than the face.
    const crateRooms = roomsWithVariant('back-hall-crate-corners');
    expect(crateRooms.length).toBeGreaterThan(0);
    const crateRoom = crateRooms[0]!;
    const crateIndex = crateRoom.walls.findIndex(
      (wall) => wall.width === 80 && wall.height === 80,
    );
    expect(crateIndex).toBeGreaterThanOrEqual(0);
    const crateWall = crateRoom.walls[crateIndex]!;
    const residualHeight = crateWall.height - WALL_FACE_HEIGHT;
    const residualBottom = crateWall.y + crateWall.height - WALL_FACE_HEIGHT;
    const tops = piecesForWall(planFor(crateRoom), crateIndex).filter(
      (piece) => piece.kind === 'wall-top',
    );
    expect(tops.length).toBeGreaterThan(0);
    // One row of the residual band, so every piece spans the same 16px height and
    // ends on the residual edge the face cannot reach.
    for (const top of tops) {
      expect(top.rect.height).toBe(residualHeight);
      expect(top.rect.y + top.rect.height).toBe(residualBottom);
      expect(top.rect.y).toBeGreaterThanOrEqual(crateWall.y);
    }
    // The residual band tiles the whole run width with no gap and no overlap.
    const starts = new Set(tops.map((top) => top.rect.y));
    expect(starts.size).toBe(1);
    const widthsCovered = tops.reduce((total, top) => total + top.rect.width, 0);
    expect(widthsCovered).toBe(crateWall.width);
  });

  it('crops each module inside its own texture', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      for (const piece of plan.wallPieces) {
        const box = moduleBox(piece.kind);
        expect(piece.drawBand).toBe('y-sorted');
        expect(piece.source.x).toBeGreaterThanOrEqual(0);
        expect(piece.source.y).toBeGreaterThanOrEqual(0);
        expect(piece.source.width).toBeGreaterThan(0);
        expect(piece.source.height).toBeGreaterThan(0);
        expect(piece.source.x + piece.source.width).toBeLessThanOrEqual(box.width);
        expect(piece.source.y + piece.source.height).toBeLessThanOrEqual(box.height);
        expect(piece.source.width).toBe(piece.rect.width);
        expect(piece.source.height).toBe(piece.rect.height);
      }
    }
  });
});

describe('room environment wall remainders', () => {
  it('gives the leftover to the last module when a run is not a multiple of 32', () => {
    let checked = 0;
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        const axis = axisFor(wall);
        const runLength = runLengthOf(wall, axis);
        const remainder = runLength % WALL_MODULE_WIDTH;
        if (remainder === 0) {
          return;
        }
        checked += 1;
        const pieces = runPieces(plan, wallIndex, axis);
        // ceil(length / 32) modules, no more and no fewer.
        expect(pieces).toHaveLength(Math.ceil(runLength / WALL_MODULE_WIDTH));
        // Every module but the last is whole; the last carries the leftover.
        for (const piece of pieces.slice(0, -1)) {
          expect(axis === 'x' ? piece.rect.width : piece.rect.height).toBe(WALL_MODULE_WIDTH);
        }
        const last = pieces[pieces.length - 1]!;
        expect(axis === 'x' ? last.rect.width : last.rect.height).toBe(remainder);
        // The leftover is cropped off the module's trailing edge, so the source
        // is the leading part of the module, not a scaled one.
        if (axis === 'x') {
          expect(last.source.x).toBe(0);
          expect(last.source.width).toBe(remainder);
        } else {
          expect(last.source.y).toBe(0);
          expect(last.source.height).toBe(remainder);
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('leaves every module whole when a run is a multiple of 32', () => {
    let checked = 0;
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        const axis = axisFor(wall);
        const runLength = runLengthOf(wall, axis);
        if (runLength % WALL_MODULE_WIDTH !== 0) {
          return;
        }
        checked += 1;
        const pieces = runPieces(plan, wallIndex, axis);
        expect(pieces).toHaveLength(runLength / WALL_MODULE_WIDTH);
        for (const piece of pieces) {
          expect(axis === 'x' ? piece.rect.width : piece.rect.height).toBe(WALL_MODULE_WIDTH);
        }
      });
    }
    // The 960-wide boundary wall is the real case.
    expect(checked).toBeGreaterThan(0);
  });

  it('covers a run with modules that neither gap nor overlap', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      room.walls.forEach((wall, wallIndex) => {
        const axis = axisFor(wall);
        const pieces = runPieces(plan, wallIndex, axis);
        const runStart = axis === 'x' ? wall.x : wall.y;
        let cursor = runStart;
        for (const piece of pieces) {
          const start = axis === 'x' ? piece.rect.x : piece.rect.y;
          const extent = axis === 'x' ? piece.rect.width : piece.rect.height;
          expect(start).toBe(cursor);
          cursor += extent;
        }
        expect(cursor).toBe(runStart + runLengthOf(wall, axis));
      });
    }
  });
});

describe('room environment doorways', () => {
  it('emits one floor-level threshold band per doorway, matching the opening exactly', () => {
    for (const room of ROOMS) {
      const plan = planFor(room);
      expect(plan.doorwayThresholds).toHaveLength(room.doorways.length);
      plan.doorwayThresholds.forEach((threshold, index) => {
        const doorway = room.doorways[index]!;
        expect(threshold.kind).toBe('doorway-threshold');
        expect(threshold.doorwayId).toBe(doorway.id);
        expect(threshold.side).toBe(doorway.side);
        expect(threshold.rect).toEqual(doorway.rect);
        expect(threshold.rect.width).toBe(WALL_THICKNESS);
        expect(threshold.rect.height).toBe(DOORWAY_WIDTH);
        expect(threshold.orderY).toBe(doorway.rect.y + doorway.rect.height);
      });
    }
  });

  it('draws the threshold under the wall band', () => {
    const floorIndex = DRAW_BAND_ORDER.indexOf('floor');
    const decalIndex = DRAW_BAND_ORDER.indexOf('floor-decal');
    const wallIndex = DRAW_BAND_ORDER.indexOf('y-sorted');
    expect(floorIndex).toBeGreaterThanOrEqual(0);
    expect(decalIndex).toBeGreaterThan(floorIndex);
    expect(wallIndex).toBeGreaterThan(decalIndex);

    for (const room of ROOMS) {
      const plan = planFor(room);
      expect(plan.drawBands).toEqual(DRAW_BAND_ORDER);
      for (const threshold of plan.doorwayThresholds) {
        expect(threshold.drawBand).toBe('floor-decal');
      }
      for (const piece of plan.wallPieces) {
        expect(piece.drawBand).toBe('y-sorted');
      }
      for (const tile of plan.floor.tiles) {
        expect(tile.drawBand).toBe('floor');
      }
    }
  });
});

describe('room environment determinism', () => {
  it('plans the same room twice into deep-equal data', () => {
    const first = generateWing(20260913);
    const second = generateWing(20260913);
    for (let index = 0; index < first.rooms.length; index += 1) {
      const a = planFor(first.rooms[index]!);
      const b = planFor(first.rooms[index]!);
      expect(a).toEqual(b);
      // Same room content from a second generator run is the same plan too.
      expect(planFor(second.rooms[index]!)).toEqual(a);
    }
  });

  it('carries the shared band order and module width', () => {
    expect(FLOOR_TILE_SIZE).toBe(32);
    expect(WALL_MODULE_WIDTH).toBe(32);
    expect(WALL_FACE_HEIGHT).toBe(64);
    expect(WALL_TOP_MODULE_SIZE).toBe(32);
    for (const room of ROOMS) {
      const plan = planFor(room);
      expect(plan.floorTileSize).toBe(FLOOR_TILE_SIZE);
      expect(plan.wallModuleWidth).toBe(WALL_MODULE_WIDTH);
      expect(plan.wallFaceHeight).toBe(WALL_FACE_HEIGHT);
    }
  });

  it('is plain JSON data with no renderer or DOM types in it', () => {
    for (const room of ROOMS.slice(0, 6)) {
      const plan = planFor(room);
      const roundTripped: unknown = JSON.parse(JSON.stringify(plan));
      expect(roundTripped).toEqual(plan);
    }
  });
});
