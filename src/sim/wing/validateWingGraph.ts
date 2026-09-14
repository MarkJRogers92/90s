/**
 * Structural, geometric, and content validation for a generated M5 wing.
 *
 * Validation fails closed with a plain Error that names the offending room,
 * doorway, store, offer, or spawn. Reachability uses the same bounded 16-unit
 * grid a later run layer can afford to walk, rather than an unbounded world
 * search.
 */
import { M5_ITEM_CATALOG } from '../items/catalog';
import type { Rect, Vec2 } from '../model';
import {
  AUTHORED_OFFER_BANDS,
  REGULAR_COMBAT_ROOM_ROLES,
  ROOM_VARIANTS,
} from './templates';
import {
  WING_ROOM_COUNT,
  WING_ROOM_ORDER,
} from './types';
import type {
  GeneratedWing,
  WingDoorSide,
  WingRoomDefinition,
  WingRoomId,
  WingStoreInstance,
} from './types';

const CATALOG_DEFINITION_IDS = new Set(
  M5_ITEM_CATALOG.map((definition) => definition.id),
);

const REGULAR_COMBAT_ROOM_SET = new Set<WingRoomId>(
  REGULAR_COMBAT_ROOM_ROLES,
);

const CELL_SIZE = 16;

function fail(message: string): never {
  throw new Error(`Invalid wing graph: ${message}`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidRect(rect: Rect): boolean {
  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isValidPoint(point: Vec2): boolean {
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function pointInRect(point: Vec2, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Edge-touching rectangles are intentionally not an overlap. */
function rectsOverlap(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

function expectedDoorSides(roomId: WingRoomId): readonly WingDoorSide[] {
  if (roomId === 'service_corridor') {
    return ['east'];
  }
  if (roomId === 'security_office') {
    return ['west'];
  }
  return ['west', 'east'];
}

function sameSides(
  actual: readonly WingDoorSide[],
  expected: readonly WingDoorSide[],
): boolean {
  return (
    actual.length === expected.length &&
    expected.every((side) => actual.includes(side))
  );
}

function validateWingHeader(wing: GeneratedWing): void {
  if (wing === null || typeof wing !== 'object' || !Array.isArray(wing.rooms)) {
    fail('wing must contain a rooms array');
  }
  if (wing.rooms.length !== WING_ROOM_COUNT) {
    fail(
      `wrong room count: expected ${WING_ROOM_COUNT}, found ${wing.rooms.length}`,
    );
  }

  const roomIds = wing.rooms.map((room) => room.id);
  const duplicateIds = roomIds.filter(
    (roomId, index) => roomIds.indexOf(roomId) !== index,
  );
  if (duplicateIds.length > 0) {
    fail(`duplicate room ids: ${[...new Set(duplicateIds)].join(', ')}`);
  }

  for (const [index, expectedId] of WING_ROOM_ORDER.entries()) {
    const actualId = wing.rooms[index]?.id;
    if (actualId !== expectedId) {
      fail(
        `room order at index ${index} must be ${expectedId}, found ${String(actualId)}`,
      );
    }
  }
}

function validateRoomGeometry(room: WingRoomDefinition): void {
  if (!isValidRect(room.bounds)) {
    fail(`room ${room.id} bounds must be finite with positive width and height`);
  }

  for (const [index, wall] of room.walls.entries()) {
    if (!isValidRect(wall)) {
      fail(`wall ${index} in room ${room.id} must be a finite positive rectangle`);
    }
    if (!rectContains(room.bounds, wall)) {
      fail(`wall ${index} in room ${room.id} is outside room bounds`);
    }
  }

  if (!sameSides(room.doorways.map((doorway) => doorway.side), expectedDoorSides(room.id))) {
    fail(
      `room ${room.id} doorways must be ${expectedDoorSides(room.id).join(' and ')}, found ${room.doorways
        .map((doorway) => doorway.side)
        .join(' and ')}`,
    );
  }

  for (const doorway of room.doorways) {
    if (!isValidRect(doorway.rect)) {
      fail(`doorway ${doorway.id} in room ${room.id} must be a finite positive rectangle`);
    }
    if (!rectContains(room.bounds, doorway.rect)) {
      fail(`doorway ${doorway.id} in room ${room.id} is outside room bounds`);
    }
    if (room.walls.some((wall) => rectsOverlap(doorway.rect, wall))) {
      fail(`doorway ${doorway.id} in room ${room.id} overlaps a wall`);
    }
  }

  for (let left = 0; left < room.doorways.length; left += 1) {
    for (let right = left + 1; right < room.doorways.length; right += 1) {
      const leftDoorway = room.doorways[left]!;
      const rightDoorway = room.doorways[right]!;
      if (rectsOverlap(leftDoorway.rect, rightDoorway.rect)) {
        fail(
          `doorway ${leftDoorway.id} overlaps doorway ${rightDoorway.id} in room ${room.id}`,
        );
      }
    }
  }

  if (!isValidPoint(room.playerEntry)) {
    fail(`player entry in room ${room.id} must be a finite point`);
  }
  if (!pointInRect(room.playerEntry, room.bounds)) {
    fail(`player entry in room ${room.id} is outside room bounds`);
  }
  if (room.walls.some((wall) => pointInRect(room.playerEntry, wall))) {
    fail(`player entry in room ${room.id} lies inside a wall`);
  }
}

function validateStoreGeometry(
  room: WingRoomDefinition,
  store: WingStoreInstance,
): void {
  if (!isValidRect(store.bounds)) {
    fail(
      `store ${store.templateId} in room ${room.id} must be a finite positive rectangle`,
    );
  }
  if (!rectContains(room.bounds, store.bounds)) {
    fail(`store ${store.templateId} bounds in room ${room.id} are outside room bounds`);
  }
  if (room.walls.some((wall) => rectsOverlap(store.bounds, wall))) {
    fail(`store ${store.templateId} bounds in room ${room.id} overlap a wall`);
  }

  if (!isValidPoint(store.resetPoint)) {
    fail(`store ${store.templateId} reset point must be a finite point`);
  }
  if (!pointInRect(store.resetPoint, room.bounds)) {
    fail(`store ${store.templateId} reset point in room ${room.id} is outside room bounds`);
  }
  if (room.walls.some((wall) => pointInRect(store.resetPoint, wall))) {
    fail(`store ${store.templateId} reset point in room ${room.id} lies inside a wall`);
  }

  if (!isValidRect(store.exit.bounds)) {
    fail(`store exit ${store.exit.id} must be a finite positive rectangle`);
  }
  if (!rectContains(room.bounds, store.exit.bounds)) {
    fail(`store exit ${store.exit.id} in room ${room.id} is outside room bounds`);
  }
  if (room.walls.some((wall) => rectsOverlap(store.exit.bounds, wall))) {
    fail(`store exit ${store.exit.id} in room ${room.id} overlaps a wall`);
  }
}

function validateOffers(
  room: WingRoomDefinition,
  store: WingStoreInstance,
): void {
  const offerIds = room.offers.map((offer) => offer.id);
  const duplicateOfferIds = offerIds.filter(
    (offerId, index) => offerIds.indexOf(offerId) !== index,
  );
  if (duplicateOfferIds.length > 0) {
    fail(
      `duplicate offer ids in room ${room.id}: ${[...new Set(duplicateOfferIds)].join(', ')}`,
    );
  }

  for (const offer of room.offers) {
    if (!CATALOG_DEFINITION_IDS.has(offer.itemDefinitionId)) {
      fail(
        `offer ${offer.id} references unknown item definition ${offer.itemDefinitionId}`,
      );
    }
    const band = AUTHORED_OFFER_BANDS[offer.itemDefinitionId];
    if (!band) {
      fail(
        `offer ${offer.id} item definition ${offer.itemDefinitionId} has no authored price band`,
      );
    }
    if (
      !isFiniteNumber(offer.price) ||
      offer.price < band.min ||
      offer.price > band.max
    ) {
      fail(
        `offer ${offer.id} price ${offer.price} is outside authored band ${band.min}..${band.max}`,
      );
    }
    if (offer.storeId !== store.templateId) {
      fail(
        `offer ${offer.id} belongs to store ${offer.storeId}, but room ${room.id} contains ${store.templateId}`,
      );
    }
    if (!store.offerIds.includes(offer.id)) {
      fail(
        `offer ${offer.id} is not listed by store ${store.templateId} in room ${room.id}`,
      );
    }
  }
}

function coarseCell(
  room: WingRoomDefinition,
  point: Vec2,
): { readonly column: number; readonly row: number } {
  const columns = Math.max(1, Math.ceil(room.bounds.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(room.bounds.height / CELL_SIZE));
  return {
    column: Math.max(
      0,
      Math.min(
        columns - 1,
        Math.floor((point.x - room.bounds.x) / CELL_SIZE),
      ),
    ),
    row: Math.max(
      0,
      Math.min(rows - 1, Math.floor((point.y - room.bounds.y) / CELL_SIZE)),
    ),
  };
}

function cellRect(
  room: WingRoomDefinition,
  column: number,
  row: number,
): Rect {
  return {
    x: room.bounds.x + column * CELL_SIZE,
    y: room.bounds.y + row * CELL_SIZE,
    width: CELL_SIZE,
    height: CELL_SIZE,
  };
}

function buildReachableCells(room: WingRoomDefinition, start: Vec2): Set<number> {
  const columns = Math.max(1, Math.ceil(room.bounds.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(room.bounds.height / CELL_SIZE));
  const startCell = coarseCell(room, start);
  const startIndex = startCell.row * columns + startCell.column;
  const startRect = cellRect(room, startCell.column, startCell.row);
  if (
    !rectContains(room.bounds, startRect) ||
    room.walls.some((wall) => rectsOverlap(startRect, wall))
  ) {
    return new Set<number>();
  }
  const reachable = new Set<number>();
  const queue = [startIndex];
  reachable.add(startIndex);

  while (queue.length > 0) {
    const currentIndex = queue.shift()!;
    const currentColumn = currentIndex % columns;
    const currentRow = Math.floor(currentIndex / columns);
    const neighbours = [
      { column: currentColumn - 1, row: currentRow },
      { column: currentColumn + 1, row: currentRow },
      { column: currentColumn, row: currentRow - 1 },
      { column: currentColumn, row: currentRow + 1 },
    ];

    for (const neighbour of neighbours) {
      if (
        neighbour.column < 0 ||
        neighbour.column >= columns ||
        neighbour.row < 0 ||
        neighbour.row >= rows
      ) {
        continue;
      }
      const neighbourIndex = neighbour.row * columns + neighbour.column;
      if (reachable.has(neighbourIndex)) {
        continue;
      }
      const candidate = cellRect(room, neighbour.column, neighbour.row);
      const blocked =
        !rectContains(room.bounds, candidate) ||
        room.walls.some((wall) => rectsOverlap(candidate, wall));
      if (!blocked) {
        reachable.add(neighbourIndex);
        queue.push(neighbourIndex);
      }
    }
  }

  return reachable;
}

function cellIndexForPoint(
  room: WingRoomDefinition,
  point: Vec2,
): number {
  const columns = Math.max(1, Math.ceil(room.bounds.width / CELL_SIZE));
  const cell = coarseCell(room, point);
  return cell.row * columns + cell.column;
}

function reachabilityErrorMessage(room: WingRoomDefinition): string | null {
  const store = room.store;
  if (!store) {
    return null;
  }
  const westDoorway = room.doorways.find((doorway) => doorway.side === 'west');
  const eastDoorway = room.doorways.find((doorway) => doorway.side === 'east');
  if (!westDoorway || !eastDoorway) {
    return `store exit ${store.exit.id} cannot be checked without west and east doorways in room ${room.id}`;
  }

  const westEntry = {
    x: westDoorway.rect.x + westDoorway.rect.width / 2,
    y: westDoorway.rect.y + westDoorway.rect.height / 2,
  };
  const reachable = buildReachableCells(room, westEntry);
  const exitCentre = {
    x: store.exit.bounds.x + store.exit.bounds.width / 2,
    y: store.exit.bounds.y + store.exit.bounds.height / 2,
  };
  const eastCentre = {
    x: eastDoorway.rect.x + eastDoorway.rect.width / 2,
    y: eastDoorway.rect.y + eastDoorway.rect.height / 2,
  };

  if (!reachable.has(cellIndexForPoint(room, exitCentre))) {
    return `store exit ${store.exit.id} in room ${room.id} is not reachable by a coarse-grid flood fill from the west entry`;
  }
  if (!reachable.has(cellIndexForPoint(room, eastCentre))) {
    return `east doorway ${eastDoorway.id} in room ${room.id} is not reachable from the store exit ${store.exit.id}`;
  }
  return null;
}

function validateStoreRoom(room: WingRoomDefinition): void {
  const isStorefront = room.id === 'storefront_a' || room.id === 'storefront_b';
  if (isStorefront && room.store === null) {
    fail(`storefront room ${room.id} is without a store`);
  }
  if (room.store === null) {
    return;
  }

  validateStoreGeometry(room, room.store);
  validateOffers(room, room.store);
  const reachabilityError = reachabilityErrorMessage(room);
  if (reachabilityError !== null) {
    fail(reachabilityError);
  }
}

function validateSpawnGeometry(room: WingRoomDefinition): void {
  for (const spawn of room.enemySpawns) {
    if (!isFiniteNumber(spawn.x) || !isFiniteNumber(spawn.y)) {
      fail(`spawn slot ${spawn.slotId} in room ${room.id} must be a finite point`);
    }
    const point = { x: spawn.x, y: spawn.y };
    if (!pointInRect(point, room.bounds)) {
      fail(`spawn slot ${spawn.slotId} in room ${room.id} is outside room bounds`);
    }
    if (room.walls.some((wall) => pointInRect(point, wall))) {
      fail(`spawn slot ${spawn.slotId} in room ${room.id} lies inside a wall`);
    }
  }
}

function validateCombatRoom(room: WingRoomDefinition): void {
  validateSpawnGeometry(room);

  if (!REGULAR_COMBAT_ROOM_SET.has(room.id)) {
    return;
  }

  const variant = ROOM_VARIANTS[room.id as keyof typeof ROOM_VARIANTS].find(
    (candidate) => candidate.id === room.variantId,
  );
  if (!variant) {
    fail(
      `combat room ${room.id} references unknown variant ${room.variantId}`,
    );
  }

  /**
   * An authored band that allows zero enemies marks a safe room such as the
   * service corridor: it must carry no spawns. Any other band is a real combat
   * room and must carry at least one.
   */
  if (variant.enemyCount.max === 0) {
    if (room.enemySpawns.length !== 0) {
      fail(`safe room ${room.id} must not carry enemy spawns`);
    }
    return;
  }
  if (room.enemySpawns.length === 0) {
    fail(`combat room ${room.id} must have at least one enemy spawn`);
  }

  if (
    room.enemySpawns.length < variant.enemyCount.min ||
    room.enemySpawns.length > variant.enemyCount.max
  ) {
    fail(
      `combat room ${room.id} enemy count ${room.enemySpawns.length} is outside authored band ${variant.enemyCount.min}..${variant.enemyCount.max}`,
    );
  }

  for (const spawn of room.enemySpawns) {
    const authoredSlot = variant.spawnSlots.find(
      (slot) => slot.slotId === spawn.slotId,
    );
    if (!authoredSlot) {
      fail(
        `spawn slot ${spawn.slotId} in room ${room.id} is not authored by variant ${variant.id}`,
      );
    }
    if (!authoredSlot.kinds.includes(spawn.kind)) {
      fail(
        `spawn slot ${spawn.slotId} in room ${room.id} uses kind ${spawn.kind} outside its authored band`,
      );
    }
  }
}

function validateBossAnchor(room: WingRoomDefinition): void {
  if (room.id === 'security_office') {
    if (room.bossAnchor === null) {
      fail('boss anchor is missing from security office');
    }
    if (!isValidPoint(room.bossAnchor)) {
      fail('boss anchor in security office must be a finite point');
    }
    if (!pointInRect(room.bossAnchor, room.bounds)) {
      fail('boss anchor in security office is outside room bounds');
    }
    if (room.walls.some((wall) => pointInRect(room.bossAnchor!, wall))) {
      fail('boss anchor in security office lies inside a wall');
    }
    return;
  }

  if (room.bossAnchor !== null) {
    fail(
      `boss anchor may appear only in security office; found in ${room.id}`,
    );
  }
}

function validateBenchKiosk(room: WingRoomDefinition): void {
  if (room.id === 'service_corridor') {
    if (room.benchKiosk === null) {
      fail('service corridor is missing its bench kiosk');
    }
    if (!isValidPoint(room.benchKiosk)) {
      fail('bench kiosk in service corridor must be a finite point');
    }
    if (!pointInRect(room.benchKiosk, room.bounds)) {
      fail('bench kiosk in service corridor is outside room bounds');
    }
    if (room.walls.some((wall) => pointInRect(room.benchKiosk!, wall))) {
      fail('bench kiosk in service corridor lies inside a wall');
    }
    return;
  }

  if (room.benchKiosk !== null) {
    fail(`bench kiosk may appear only in service corridor; found in ${room.id}`);
  }
}

export function validateWingGraph(wing: GeneratedWing): void {
  validateWingHeader(wing);

  for (const room of wing.rooms) {
    validateRoomGeometry(room);
    validateStoreRoom(room);
    validateCombatRoom(room);
    validateBossAnchor(room);
    validateBenchKiosk(room);
  }
}
