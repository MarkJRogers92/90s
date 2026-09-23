/**
 * What to draw for a room's static environment, and where — as plain data.
 *
 * This module is the renderer-independent planning layer the environment rewrite
 * hangs off. It imports no Phaser, touches no DOM, reads no clock and draws no
 * random number: the same room always produces deep-equal data, so the whole
 * plan is unit-testable without a canvas. The renderer's only job is to turn
 * these rects into images and to merge the `y-sorted` pieces into its single
 * depth-sorted draw list.
 *
 * Authority for the geometry is `docs/art/PROJECTION.md` and, for what each wall
 * piece *is*, the docstrings in `docs/art/tools/make_walls.py`.
 *
 * ## The wall reconciliation (the hard part)
 *
 * The art is a 32px module. A FACE is 32 wide x 64 tall with its baseboard and
 * floor-contact shadow in the BOTTOM rows, because the base is what touches the
 * floor. A TOP is 32x32 and repeats in both axes. The sim's wall Rects, however,
 * are ten units thick, and several runs are not multiples of 32 (a 140-wide
 * interior wall and the doorway-split segments both really occur).
 *
 * The plan uses one rule to reconcile them, rather than a rule per case:
 *
 *   A wall must account for its whole floor footprint on screen. A run along x
 *   shows its camera-facing face rising from its south edge, which covers the
 *   64-unit band north of that edge — so its footprint is covered by the face as
 *   long as the footprint is no deeper than 64. Whatever the face cannot reach
 *   (footprint depth beyond 64) is the top surface, seen from above. A run along
 *   y has no camera-facing face at all — its east and west faces are edge-on and
 *   occupy zero screen width — so its entire footprint is top surface.
 *
 * Consequences, each of which is asserted in the unit tests:
 *
 *  * a run along x is a FACE run; a run along y is a TOP run. The long axis
 *    decides, so a square footprint (there is one, an 80x80 crate block) falls to
 *    FACE on the `width >= height` tie-break: the face is the only surface that
 *    both reads as a wall and occludes, and a tie-break has to be total.
 *  * a ten-unit-thick wall shows NO top band, and the reason is quantitative
 *    rather than stylistic: ten is less than the 64 the face already covers, so
 *    there is no residual. "Does a thin wall show a top band" is therefore
 *    answered by a rule, not a special case, and the answer stays right for any
 *    future wall deeper than the face — an 80x80 block draws a 16-unit top band
 *    because that is exactly the strip its face cannot reach.
 *  * the face is base-anchored at the wall's NEAR (south) edge, so it occupies
 *    the world band `[southEdge - 64, southEdge]` and occludes what stands in it.
 *    For an interior wall that band is floor north of the wall: the counter hides
 *    the enemy crouched behind it, which is the mechanic PROJECTION.md asks for.
 *    The band is clipped to the room, because a room's bounds are its whole
 *    world: the camera is clamped inside them and nothing exists outside them, so
 *    art emitted outside would be pixels no frame can ever show. At the room's
 *    north edge this means the north boundary wall shows only its top band,
 *    which is the honest reading of "the wall's base is at its south edge and the
 *    room ends above it".
 *  * horizontal surfaces (floor, wall tops) are drawn at their world x/y 1:1 with
 *    no height offset; only a face is offset, by rising from its base line. An
 *    offset top would float detached above the run it caps.
 *
 * A deliberate divergence from the mock scene in `make_walls.py`: that scene
 * hangs the face SOUTH of the wall slab, so the wall's drawn depth is 32+64=96
 * while its plan depth is 32. Copying that here would swallow the top 64 units of
 * every room — the band the sim happily lets the player walk in, which holds the
 * corridor bench kiosk — and hide the player behind their own wall. The mock has
 * no collision, so it can afford the overhang; the game cannot.
 */
import { FLOOR_TILE_SIZE, WALL_FACE_HEIGHT, WALL_TOP_SIZE } from '../assets';
import type { FloorKind } from '../assets';
import type {
  WingDoorway,
  WingRoomDefinition,
  WingRoomId,
  WingRoomRole,
  WingStoreInstance,
} from '../../sim/wing/types';

// The art owns these numbers; re-exported so a renderer or a test can reach
// every geometry constant through this module without a second import path.
export { FLOOR_TILE_SIZE, WALL_FACE_HEIGHT };

/**
 * Width of one wall module, in world units.
 *
 * The single number the renderer, the art kit and the tests share: the face is
 * this wide and 64 tall, the top is this square. Nothing here may assume it
 * anywhere else, so changing the art module is a change to this constant and to
 * nothing else.
 */
export const WALL_MODULE_WIDTH = WALL_TOP_SIZE;

/** Side of a wall top module. It repeats in BOTH axes. */
export const WALL_TOP_MODULE_SIZE = WALL_TOP_SIZE;

/**
 * The draw bands, lowest first — the one sort order in the game.
 *
 * This mirrors the table in PROJECTION.md. The plan only ever emits the first,
 * second and fourth today (floor, floor-level overlays, walls), but the whole
 * vocabulary lives here so every producer sorts with one set of names.
 */
export type DrawBand =
  | 'floor'
  | 'floor-decal'
  | 'flat-prop'
  | 'y-sorted'
  | 'overhead';

export const DRAW_BAND_ORDER: readonly DrawBand[] = [
  'floor',
  'floor-decal',
  'flat-prop',
  'y-sorted',
  'overhead',
];

/**
 * The floor each room role is floored with.
 *
 * THIS TABLE IS THE SINGLE PLACE TO CHANGE A ROOM'S FLOOR. The strings are
 * members of the `FloorKind` union exported by `src/game/assets.ts`, which owns
 * the texture and URL behind each name; this module only decides which one a
 * room gets.
 *
 * The split follows where combat actually happens, not where it looks nicest.
 * Only the food court, the back hall, and the security office spawn anything —
 * the two storefront rooms are built from `AuthoredStoreTemplate`, which has no
 * spawn slots at all. So the two retail storefronts keep the loud patterned
 * carpet, because nothing fights on it, while the floor the player crosses most
 * (the entry corridor) and the floor with enemies on it (the back hall) take the
 * quiet neutral tile.
 *
 * The back hall specifically gave up its damaged carpet: that tile is a busy
 * blue field carrying near-black blotches, which is the one floor where grime can
 * be misread as an enemy shadow. The food court keeps its dark accent tile
 * deliberately — it is a regular grout grid rather than a speckle, so it stays a
 * readable dark zone instead of noise.
 */
export const FLOOR_FOR_ROOM_ROLE: Record<WingRoomRole, FloorKind> = {
  service_corridor: 'floor-tile-beige',
  storefront_a: 'floor-carpet',
  food_court: 'floor-tile-accent',
  storefront_b: 'floor-carpet',
  back_hall: 'floor-tile-beige',
  security_office: 'floor-tile-beige',
};

/** A world-space rectangle. Plain numbers, so the plan is JSON round-trippable. */
export type PlanRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Which axis a wall run travels along. `x` is a FACE run, `y` is a TOP run. */
export type WallRunAxis = 'x' | 'y';

/**
 * The two pieces a wall can be built from.
 *
 * `wall-face` is a 32x64 module tiled along x; `wall-top` is a 32x32 module
 * tiled along both axes.
 */
export type WallPieceKind = 'wall-face' | 'wall-top';

/** One floor rectangle to blit, with its grid coordinates for traceability. */
export type FloorTilePlan = {
  readonly drawBand: 'floor';
  readonly kind: FloorKind;
  readonly column: number;
  readonly row: number;
  readonly rect: PlanRect;
  readonly orderY: number;
};

/**
 * The floor grid of a room.
 *
 * `tiles` is the explicit per-tile list; `columns`, `rows` and `origin` describe
 * the same grid, so a renderer that would rather hand one repeating texture to a
 * tile sprite than blit 450 images can do that without re-deriving the grid.
 */
export type FloorPlan = {
  readonly kind: FloorKind;
  readonly tileSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly columns: number;
  readonly rows: number;
  readonly tiles: readonly FloorTilePlan[];
};

/**
 * One wall module to draw.
 *
 * `rect` is where the module goes, top-left anchored in world units. `source` is
 * the crop inside the module texture: a module the run's leftover or the room's
 * edge cuts short is drawn cropped, never overflowing into floor it does not own.
 * `orderY` is the world y the renderer sorts this piece by, and is the piece's
 * base line — the south edge of the band it occupies.
 */
export type WallPiecePlan = {
  readonly drawBand: 'y-sorted';
  readonly kind: WallPieceKind;
  readonly axis: WallRunAxis;
  /** Index into `room.walls`, so a piece can always be traced back to its Rect. */
  readonly wallIndex: number;
  readonly moduleIndex: number;
  readonly moduleCount: number;
  readonly rect: PlanRect;
  readonly source: PlanRect;
  readonly orderY: number;
};

/**
 * A doorway's floor-level threshold band.
 *
 * A doorway is a hole in a wall, so what belongs in it is floor, not masonry:
 * this is a flat band in the floor-decal band, drawn under every wall piece, and
 * the player walks over it. Its rect is the doorway Rect exactly, so the two wall
 * segments either side of the opening and this band tile the wall line with no
 * gap and no overlap.
 */
export type DoorwayThresholdPlan = {
  readonly drawBand: 'floor-decal';
  readonly kind: 'doorway-threshold';
  readonly doorwayId: string;
  readonly side: WingDoorway['side'];
  readonly rect: PlanRect;
  readonly orderY: number;
};

/**
 * Everything the renderer needs to draw one room's static environment.
 *
 * Deliberately NOT frozen, unlike the sim's outputs: the renderer merges these
 * pieces into its single depth-sorted list, and freezing would turn an in-place
 * sort of `wallPieces` into a runtime throw.
 */
export type RoomEnvironmentPlan = {
  readonly roomId: WingRoomId;
  readonly bounds: PlanRect;
  readonly floorKind: FloorKind;
  readonly floorTileSize: number;
  readonly wallModuleWidth: number;
  readonly wallFaceHeight: number;
  readonly drawBands: readonly DrawBand[];
  readonly floor: FloorPlan;
  readonly doorwayThresholds: readonly DoorwayThresholdPlan[];
  readonly wallPieces: readonly WallPiecePlan[];
};

type ModuleCell = {
  readonly start: number;
  readonly size: number;
};

/**
 * Lay a run out on a module grid anchored at the run's own start.
 *
 * THE REMAINDER RULE, stated once and implemented here for every wall band: a
 * run needs `ceil(length / module)` modules; the first `n - 1` are whole and the
 * LAST one is cropped to the leftover `length mod 32`. So a leftover is always
 * taken off the far end of the run, never split between the two ends and never
 * allowed to overflow past the run. When the length is an exact multiple of the
 * module there is no cropped module at all, and a run shorter than one module is
 * a single cropped module rather than an empty band.
 *
 * Anchoring at the run's start rather than snapping to the room's 32 grid is what
 * keeps that rule one-sided: a world-grid anchor puts a partial module at BOTH
 * ends of every run whose start is not 32-aligned, and buys nothing here but a
 * two-ended rule to explain. The cost is that an interior wall authored at a
 * non-aligned x (there is one at x=260) has its panel seams four units off the
 * floor grid, which is invisible next to the price of the alternative.
 */
function moduleCells(origin: number, length: number, module: number): readonly ModuleCell[] {
  const count = Math.ceil(length / module);
  const cells: ModuleCell[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = origin + index * module;
    const size = Math.min(module, origin + length - start);
    if (size <= 0) {
      break;
    }
    cells.push({ start, size });
  }
  return cells;
}

function planarRect(x: number, y: number, width: number, height: number): PlanRect {
  return { x, y, width, height };
}

function copyRect(rect: PlanRect): PlanRect {
  return planarRect(rect.x, rect.y, rect.width, rect.height);
}

/**
 * The floor grid for a room, one 32x32 tile per cell of `room.bounds`.
 *
 * Only whole tiles are emitted, and only inside the bounds. Both constraints
 * together force the grid to be `floor(width / 32)` by `floor(height / 32)`
 * cells: rounding up would either emit a partial tile or a tile that hangs
 * outside the room, and both are forbidden. Every room the wing generator builds
 * is 960x480, which is 30x15 cells exactly, so this floor() is a no-op today and
 * a misaligned room would leave a documented uncovered sliver rather than a half
 * tile. `column`/`row` are grid coordinates counted from `bounds.x/y`.
 */
export function planFloor(room: WingRoomDefinition, kind: FloorKind): FloorPlan {
  const { x: originX, y: originY, width, height } = room.bounds;
  const columns = Math.floor(width / FLOOR_TILE_SIZE);
  const rows = Math.floor(height / FLOOR_TILE_SIZE);
  const tiles: FloorTilePlan[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * FLOOR_TILE_SIZE;
      const y = originY + row * FLOOR_TILE_SIZE;
      tiles.push({
        drawBand: 'floor',
        kind,
        column,
        row,
        rect: planarRect(x, y, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE),
        orderY: y + FLOOR_TILE_SIZE,
      });
    }
  }
  return { kind, tileSize: FLOOR_TILE_SIZE, originX, originY, columns, rows, tiles };
}

/**
 * The wall pieces for a room, in `room.walls` order.
 *
 * The array order is NOT the draw order: every piece carries the `orderY` the
 * renderer sorts by, and the renderer merges this list with the room's entities
 * before sorting once. Pieces are grouped by their wall Rect and then by module
 * so a failure can be traced back to the geometry that produced it.
 */
export function planWallPieces(room: WingRoomDefinition): readonly WallPiecePlan[] {
  const bounds = room.bounds;
  const pieces: WallPiecePlan[] = [];

  room.walls.forEach((wall, wallIndex) => {
    const axis: WallRunAxis = wall.width >= wall.height ? 'x' : 'y';

    if (axis === 'x') {
      // FACE run: modules tile along x, base-anchored at the near (south) edge.
      const runStart = wall.x;
      const runLength = wall.width;
      const cells = moduleCells(runStart, runLength, WALL_MODULE_WIDTH);
      const base = wall.y + wall.height;
      const moduleTop = base - WALL_FACE_HEIGHT;

      // Clip the face to the room: the part above the room's north edge is pixels
      // no camera can reach, so it is not planned (see the header note on the mock
      // scene for why the face is not hung south instead).
      const faceTop = Math.max(bounds.y, moduleTop);
      const faceBottom = Math.min(bounds.y + bounds.height, base);
      const faceHeight = faceBottom - faceTop;

      if (faceHeight > 0) {
        cells.forEach((cell, moduleIndex) => {
          pieces.push({
            drawBand: 'y-sorted',
            kind: 'wall-face',
            axis,
            wallIndex,
            moduleIndex,
            moduleCount: cells.length,
            rect: planarRect(cell.start, faceTop, cell.size, faceHeight),
            source: planarRect(0, faceTop - moduleTop, cell.size, faceHeight),
            orderY: base,
          });
        });
      }

      // Whatever the face cannot reach at the back of the footprint is top
      // surface. For every ten- or thirty-thick wall in the wing this is empty,
      // which is the answer to "does a thin wall show a top band": no, because the
      // face already covers it.
      const residualTop = wall.y;
      const residualBottom = Math.min(moduleTop, bounds.y + bounds.height);
      if (residualBottom > residualTop) {
        const rows = moduleCells(residualTop, residualBottom - residualTop, WALL_TOP_MODULE_SIZE);
        rows.forEach((rowCell, rowIndex) => {
          cells.forEach((columnCell, columnIndex) => {
            pieces.push({
              drawBand: 'y-sorted',
              kind: 'wall-top',
              axis,
              wallIndex,
              moduleIndex: rowIndex * cells.length + columnIndex,
              moduleCount: cells.length * rows.length,
              rect: planarRect(columnCell.start, rowCell.start, columnCell.size, rowCell.size),
              source: planarRect(0, 0, columnCell.size, rowCell.size),
              orderY: rowCell.start + rowCell.size,
            });
          });
        });
      }
      return;
    }

    // TOP run: the east/west faces are edge-on, so the top surface is the only
    // surface there is. Modules tile along y, clipped in x to the thickness: a
    // ten-unit-thick wall therefore shows ten columns of a 32-wide slab, not a
    // slab's worth of floor. This is one module column because every authored wall
    // that runs along y is at most 30 thick; the unit test asserts it.
    const runStart = wall.y;
    const runLength = wall.height;
    const cells = moduleCells(runStart, runLength, WALL_MODULE_WIDTH);
    cells.forEach((cell, moduleIndex) => {
      const pieceTop = Math.max(bounds.y, cell.start);
      const pieceBottom = Math.min(bounds.y + bounds.height, cell.start + cell.size);
      const pieceHeight = pieceBottom - pieceTop;
      if (pieceHeight <= 0) {
        return;
      }
      pieces.push({
        drawBand: 'y-sorted',
        kind: 'wall-top',
        axis,
        wallIndex,
        moduleIndex,
        moduleCount: cells.length,
        rect: planarRect(wall.x, pieceTop, wall.width, pieceHeight),
        source: planarRect(0, pieceTop - cell.start, wall.width, pieceHeight),
        orderY: pieceBottom,
      });
    });
  });

  return pieces;
}

/** The floor-level threshold band for each doorway in the room. */
export function planDoorwayThresholds(
  room: WingRoomDefinition,
): readonly DoorwayThresholdPlan[] {
  return room.doorways.map((doorway) => ({
    drawBand: 'floor-decal',
    kind: 'doorway-threshold',
    doorwayId: doorway.id,
    side: doorway.side,
    rect: copyRect(doorway.rect),
    orderY: doorway.rect.y + doorway.rect.height,
  }));
}

/**
 * Plan one room's static environment.
 *
 * Pure: the same room always yields deep-equal data, with no Phaser object, no
 * DOM node, no clock and no random source anywhere in it.
 */
export function planRoomEnvironment(room: WingRoomDefinition): RoomEnvironmentPlan {
  const floorKind = FLOOR_FOR_ROOM_ROLE[room.id];
  return {
    roomId: room.id,
    bounds: copyRect(room.bounds),
    floorKind,
    floorTileSize: FLOOR_TILE_SIZE,
    wallModuleWidth: WALL_MODULE_WIDTH,
    wallFaceHeight: WALL_FACE_HEIGHT,
    drawBands: DRAW_BAND_ORDER,
    floor: planFloor(room, floorKind),
    doorwayThresholds: planDoorwayThresholds(room),
    wallPieces: planWallPieces(room),
  };
}

/** Height of the shopfront band along a store's front edge. Matches the art. */
export const STOREFRONT_FASCIA_HEIGHT = 32;

/** Height of a shop's sign board. Matches the art, and the doorway's width. */
export const STOREFRONT_SIGN_HEIGHT = 24;

export type StorefrontSignKind = 'sign-warm' | 'sign-cool';

/**
 * A shopfront band along a store's front edge, on one side of the door.
 *
 * `orderY` is the world y the renderer sorts it by: the front edge, because the
 * band stands on that line.
 */
export type StorefrontBand = {
  readonly rect: PlanRect;
  readonly orderY: number;
};

/**
 * Which floor a shop is floored with, by store template.
 *
 * Kept apart from `FLOOR_FOR_ROOM_ROLE` because a shop's floor is the shop's
 * own, not the room's. The shop is a rectangle inside the room, and changing
 * material at its threshold is most of what makes it read as a separate space
 * rather than a coloured box painted on the mall floor.
 */
export const FLOOR_FOR_STORE_TEMPLATE: Record<string, FloorKind> = {
  'mall-mart': 'floor-tile-beige',
  'cinema-snacks': 'floor-carpet',
  'arcade-annex': 'floor-tile-accent',
  'department-outlet': 'floor-tile-beige',
};

/**
 * Which sign hangs over a shop, by store template.
 *
 * The two colourways are the mall's own lighting language: the warm board for
 * the soft-goods shops, the cool one for the two that would have run neon.
 */
export const SIGN_FOR_STORE_TEMPLATE: Record<string, StorefrontSignKind> = {
  'mall-mart': 'sign-warm',
  'cinema-snacks': 'sign-cool',
  'arcade-annex': 'sign-cool',
  'department-outlet': 'sign-warm',
};

/**
 * Everything the renderer needs to draw one shop.
 *
 * `floor` covers the shop's whole footprint; `fascia` is the frontage; `sign`
 * hangs over the door. Plain data, like the room plan, so the whole thing is
 * unit-testable without a canvas.
 */
export type StorefrontPlan = {
  readonly templateId: string;
  readonly floor: { readonly kind: FloorKind; readonly rect: PlanRect };
  readonly fascia: readonly StorefrontBand[];
  readonly sign: {
    readonly kind: StorefrontSignKind;
    readonly rect: PlanRect;
    readonly orderY: number;
  };
};

/**
 * Plan a shop's own surfaces: its floor, its shopfront band, and its sign.
 *
 * The band is emitted as TWO strips, one either side of the door, rather than
 * one strip with a hole cut in it. A rect list cannot express a hole, and the
 * difference matters in the direction that hurts: over-covering a strip is a
 * visible bug a test catches, whereas a single strip that covered the door
 * would wall the shop off, and the player would find that, not a test.
 *
 * The sign is the doorway's own width and hangs directly above the band, so the
 * door, the gap in the band and the sign all share one x-range and stay aligned
 * without any of the three being tuned by hand.
 *
 * A template with no entry gets the neutral floor and the warm sign rather than
 * nothing drawn: a store that renders as bare floor is worse than one wearing
 * the default livery, and the fallback keeps a new template shippable before its
 * art exists.
 */
export function planStorefront(store: WingStoreInstance): StorefrontPlan {
  const { bounds, exit } = store;
  const doorLeft = exit.bounds.x;
  const doorRight = exit.bounds.x + exit.bounds.width;
  const frontEdge = bounds.y + bounds.height;
  const fasciaTop = frontEdge - STOREFRONT_FASCIA_HEIGHT;

  const fascia: StorefrontBand[] = [];
  const leftWidth = doorLeft - bounds.x;
  if (leftWidth > 0) {
    fascia.push({
      rect: planarRect(bounds.x, fasciaTop, leftWidth, STOREFRONT_FASCIA_HEIGHT),
      orderY: frontEdge,
    });
  }
  const rightWidth = bounds.x + bounds.width - doorRight;
  if (rightWidth > 0) {
    fascia.push({
      rect: planarRect(doorRight, fasciaTop, rightWidth, STOREFRONT_FASCIA_HEIGHT),
      orderY: frontEdge,
    });
  }

  return {
    templateId: store.templateId,
    floor: {
      kind: FLOOR_FOR_STORE_TEMPLATE[store.templateId] ?? 'floor-tile-beige',
      rect: copyRect(bounds),
    },
    fascia,
    sign: {
      kind: SIGN_FOR_STORE_TEMPLATE[store.templateId] ?? 'sign-warm',
      rect: planarRect(
        doorLeft,
        fasciaTop - STOREFRONT_SIGN_HEIGHT,
        exit.bounds.width,
        STOREFRONT_SIGN_HEIGHT,
      ),
      orderY: fasciaTop,
    },
  };
}
