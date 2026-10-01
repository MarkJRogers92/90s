/**
 * Going into the stores.
 *
 * A storefront room used to put its store in the middle of the concourse: a
 * rug with items floating over it and an invisible door on its bottom edge.
 * Now the concourse is just the concourse, with two shops in its back wall,
 * and each shop's own door leads inside. The inside is the whole room: the
 * store's template is scaled up to fill it (`generateRunWing`), walls go up
 * around it, and the only way out is the shop door at the bottom, past the
 * anti-theft gates. Walking out through it secures stolen goods and puts the
 * janitor back on the concourse in front of that shop.
 *
 * Every floor's wing has four store templates and two storefront rooms. The
 * wing gives each room one; the run adds the other two as each room's second
 * shop, with its own seeded window of stock, so a shift visits all four.
 *
 * Because each scaled store is still an ordinary `WingStoreInstance`, the
 * alarm, guard spots, shutter and securing rules in heist.ts and economy.ts
 * all work inside unchanged. The separate M3 Shoplifting Loop mode does not
 * use the run's wing and keeps its original one-store rooms.
 *
 * Pure rules over run data; nothing here reads the renderer.
 */
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import type { Rect, Vec2 } from '../model';
import { generateWing } from '../wing/generateWing';
import type { GeneratedWing, WingOffer, WingRoomDefinition, WingStoreInstance } from '../wing/types';
import type { FloorNumber } from '../wing/floorSpecs';
import { DOORWAY_WIDTH, STORE_TEMPLATES, WALL_THICKNESS, type AuthoredStoreTemplate } from '../wing/templates';
import { publishRunFeedback } from './economy';
import { pairUpStock } from './recipeHints';
import type { MvpCommandResult, MvpRunState } from './types';
import { RARE_ROSTER } from '../items/storeRoster';
import { floorSpec } from '../wing/floorSpecs';

/**
 * The store floor inside: wall to wall, and down to a front wall that clears
 * the bottom HUD panels so the shop door is never hidden behind them.
 */
export const INTERIOR_BOUNDS: Rect = { x: 40, y: 20, width: PLAYFIELD_WIDTH - 80, height: 350 };
/** The shop door: centred on the bottom wall, like every store template's. */
export const INTERIOR_EXIT: Rect = {
  x: PLAYFIELD_WIDTH / 2 - DOORWAY_WIDTH / 2,
  y: INTERIOR_BOUNDS.y + INTERIOR_BOUNDS.height - WALL_THICKNESS,
  width: DOORWAY_WIDTH,
  height: WALL_THICKNESS,
};
/** Where the janitor stands on arrival: just inside the door, facing in. */
export const INTERIOR_ARRIVAL: Vec2 = { x: PLAYFIELD_WIDTH / 2, y: INTERIOR_EXIT.y - 30 };
/**
 * The shops' doors on the concourse, left and right on the back wall, in the
 * order of `roomStores`. The dressing centres each shopfront on its door.
 */
export const STORE_ENTRANCE_XS: readonly number[] = [240, 720];
/** How far down the back wall a shop door reaches. */
export const STORE_ENTRANCE_Y = 26;
/** How wide an entrance is, either side of its centre. */
export const STORE_ENTRANCE_HALF_WIDTH = 44;
/** Where the janitor comes back out: this far in front of the shop door. */
export const STORE_EXIT_ARRIVAL_Y = 64;
/** Stock per shop, like the wing's own storefronts. */
const OFFERS_PER_STORE = 4;

/**
 * What stands on a storefront's concourse now the stores are inside: a
 * seating island, a pretzel cart, massage chairs, a photo booth between the
 * two shop doors, a gumball stand and a pair of sale signs. `x`/`y` is where
 * each stands on the floor; the big pieces have a `footprint` the janitor
 * cannot walk through, kept out of the lane between the two side doors.
 * The dressing places the art from this same list.
 */
export type ConcourseFurniture = {
  readonly id: string;
  readonly kind: 'seatingIsland' | 'pretzelCart' | 'massageChairs' | 'photoBooth' | 'gumballStand' | 'saleSign';
  readonly x: number;
  readonly y: number;
  readonly footprint: Rect | null;
};

export const CONCOURSE_FURNITURE: readonly ConcourseFurniture[] = [
  { id: 'island', kind: 'seatingIsland', x: 480, y: 336, footprint: { x: 430, y: 298, width: 100, height: 34 } },
  // Above the bottom HUD panels, so the art is never hidden behind them.
  { id: 'pretzels', kind: 'pretzelCart', x: 250, y: 364, footprint: { x: 224, y: 346, width: 52, height: 16 } },
  { id: 'massage', kind: 'massageChairs', x: 710, y: 364, footprint: { x: 666, y: 342, width: 88, height: 20 } },
  { id: 'photo-booth', kind: 'photoBooth', x: 480, y: 66, footprint: { x: 462, y: 46, width: 36, height: 18 } },
  { id: 'gumballs', kind: 'gumballStand', x: 620, y: 100, footprint: null },
  { id: 'sale-w', kind: 'saleSign', x: 172, y: 110, footprint: null },
  { id: 'sale-e', kind: 'saleSign', x: 788, y: 110, footprint: null },
];

/** Every shop in a room, in back-wall order: the wing's own first, then the run's second. */
export function roomStores(room: WingRoomDefinition): readonly WingStoreInstance[] {
  return room.stores ?? (room.store ? [room.store] : []);
}

/** The concourse door of a room's shop, by its index in `roomStores`. */
export function storeEntrance(index: number): Vec2 {
  return { x: STORE_ENTRANCE_XS[index] ?? PLAYFIELD_WIDTH / 2, y: STORE_ENTRANCE_Y };
}

/** The store the janitor is inside, or null on the concourse. */
export function activeStore(state: MvpRunState): WingStoreInstance | null {
  if (!state.room.interior) return null;
  const room = state.wing.rooms[state.roomIndex];
  return room ? roomStores(room)[state.room.storeIndex] ?? null : null;
}

/** Maps a point from a template store's bounds onto the full-room interior. */
function toInterior(point: Vec2, from: Rect): Vec2 {
  return {
    x: Math.round(INTERIOR_BOUNDS.x + ((point.x - from.x) / from.width) * INTERIOR_BOUNDS.width),
    y: Math.round(INTERIOR_BOUNDS.y + ((point.y - from.y) / from.height) * INTERIOR_BOUNDS.height),
  };
}

/** A store scaled to the full-room interior, with its offers moved to match. */
function scaleStore(store: WingStoreInstance, offers: readonly WingOffer[]): { store: WingStoreInstance; offers: WingOffer[] } {
  return {
    store: {
      ...store,
      bounds: { ...INTERIOR_BOUNDS },
      resetPoint: { x: INTERIOR_ARRIVAL.x, y: INTERIOR_EXIT.y + 20 },
      exit: { ...store.exit, bounds: { ...INTERIOR_EXIT } },
    },
    offers: offers.map((offer) => ({ ...offer, position: toInterior(offer.position, store.bounds) })),
  };
}

/** A stable hash, so the second shops and their stock are seeded without touching the wing's own rolls. */
function hash(seed: number, key: string): number {
  let value = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}

/** A template as a run store: a seeded window of its stock, like the wing's own. */
function instantiate(template: AuthoredStoreTemplate, seed: number): { store: WingStoreInstance; offers: WingOffer[] } {
  const span = Math.max(0, template.offers.length - OFFERS_PER_STORE);
  const start = span === 0 ? 0 : hash(seed, `${template.id}:stock`) % (span + 1);
  const offers: WingOffer[] = template.offers.slice(start, start + OFFERS_PER_STORE).map((offer) => ({
    id: `${template.id}-${offer.itemDefinitionId}`,
    storeId: template.id,
    itemDefinitionId: offer.itemDefinitionId,
    position: { ...offer.position },
    price: offer.price,
  }));
  return {
    store: {
      templateId: template.id,
      name: template.name,
      bounds: { ...template.bounds },
      resetPoint: { ...template.resetPoint },
      exit: { id: template.exit.id, label: template.exit.label, bounds: { ...template.exit.bounds } },
      sightZone: { ...template.sightZone, origin: { ...template.sightZone.origin } },
      offerIds: offers.map((offer) => offer.id),
    },
    offers,
  };
}

/**
 * The run's wing: the generated wing, with every storefront given a second
 * shop from the templates the wing left unused, and every shop scaled to a
 * full-room interior.
 */
/** What a rare costs on the shelf: late-floor cash finally has a target. */
export const RARE_SHELF_PRICE = 45;

/**
 * Floors with `rareOnShelf`: one store, picked by the seed, swaps its last
 * offer that is not a recipe-hint half for a seeded rare at RARE_SHELF_PRICE.
 * It buys, steals and checkpoints like any other shelf item.
 */
function shelveRare(rooms: WingRoomDefinition[], seed: number): WingRoomDefinition[] {
  const stores = rooms.flatMap((room, roomIndex) => (room.stores ?? []).map((store) => ({ roomIndex, storeId: store.templateId })));
  if (stores.length === 0) return rooms;
  const pick = stores[hash(seed, 'rare-store') % stores.length]!;
  const rare = RARE_ROSTER[hash(seed, 'rare-item') % RARE_ROSTER.length]!.definition;
  return rooms.map((room, roomIndex) => {
    if (roomIndex !== pick.roomIndex) return room;
    const index = room.offers.map((offer, at) => ({ offer, at })).filter(({ offer }) => offer.storeId === pick.storeId && !offer.pairedWith).at(-1)?.at;
    if (index === undefined) return room;
    const replaced = room.offers[index]!;
    const offers = [...room.offers];
    offers[index] = { id: `${replaced.storeId}-${rare.id}`, storeId: replaced.storeId, itemDefinitionId: rare.id, position: { ...replaced.position }, price: RARE_SHELF_PRICE };
    const stores = room.stores?.map((store) => (store.templateId === pick.storeId ? { ...store, offerIds: store.offerIds.map((id) => (id === replaced.id ? offers[index]!.id : id)) } : store));
    const store = room.store && room.store.templateId === pick.storeId ? stores?.find((candidate) => candidate.templateId === pick.storeId) ?? room.store : room.store;
    return { ...room, offers, ...(stores ? { stores } : {}), store };
  });
}

export function generateRunWing(seed: number, floor: FloorNumber = 1): GeneratedWing {
  const wing = generateWing(seed, floor);
  const used = new Set(wing.rooms.flatMap((room) => (room.store ? [room.store.templateId] : [])));
  const spare = STORE_TEMPLATES
    .filter((template) => !used.has(template.id))
    .sort((first, second) => hash(seed, first.id) - hash(seed, second.id));
  let nextSpare = 0;
  const furniture = CONCOURSE_FURNITURE.flatMap((piece) => (piece.footprint ? [{ ...piece.footprint }] : []));
  const rooms = wing.rooms.map((room): WingRoomDefinition => {
    if (!room.store) return room;
    const first = pairUpStock(scaleStore(room.store, room.offers), seed);
    // The concourse furniture stands in the way, like any wall.
    room = { ...room, walls: [...room.walls, ...furniture] };
    const template = spare[nextSpare];
    nextSpare += 1;
    if (!template) return { ...room, store: first.store, stores: [first.store], offers: first.offers };
    const extra = instantiate(template, seed);
    const second = pairUpStock(scaleStore(extra.store, extra.offers), seed);
    return {
      ...room,
      store: first.store,
      stores: [first.store, second.store],
      offers: [...first.offers, ...second.offers],
    };
  });
  return { ...wing, rooms: floorSpec(floor).rareOnShelf ? shelveRare(rooms, seed) : rooms };
}

/** The walls of a store's inside: everything but its floor, with a gap for the door. */
export function interiorWalls(store: Pick<WingStoreInstance, 'bounds' | 'exit'>): Rect[] {
  const b = store.bounds;
  const door = store.exit.bounds;
  const right = b.x + b.width;
  return [
    { x: 0, y: 0, width: PLAYFIELD_WIDTH, height: b.y },
    { x: 0, y: 0, width: b.x, height: PLAYFIELD_HEIGHT },
    { x: right, y: 0, width: PLAYFIELD_WIDTH - right, height: PLAYFIELD_HEIGHT },
    { x: 0, y: door.y, width: door.x, height: PLAYFIELD_HEIGHT - door.y },
    { x: door.x + door.width, y: door.y, width: PLAYFIELD_WIDTH - door.x - door.width, height: PLAYFIELD_HEIGHT - door.y },
  ];
}

/**
 * The shop whose concourse door the janitor is at (within `reach` of it), as
 * its index in `roomStores`, or null.
 */
export function storeEntranceNear(state: MvpRunState, reach: number): number | null {
  if (state.room.interior) return null;
  const room = state.wing.rooms[state.roomIndex];
  if (!room) return null;
  const player = state.room.combat.player;
  const stores = roomStores(room);
  for (let index = 0; index < stores.length; index += 1) {
    const door = storeEntrance(index);
    if (Math.abs(player.x - door.x) <= STORE_ENTRANCE_HALF_WIDTH + reach && player.y - door.y <= reach) return index;
  }
  return null;
}

/** Leaves the room-local things behind a doorway: shots, puddles, the stalker's position. */
function clearRoomLocal(state: MvpRunState): void {
  const combat = state.room.combat;
  combat.projectiles = [];
  combat.surfaces = [];
  combat.eventQueue = [];
  state.stalker = null;
}

/** Walks through a shop's door into the store. */
export function enterStore(state: MvpRunState, index = 0): MvpCommandResult {
  const room = state.wing.rooms[state.roomIndex];
  const store = room ? roomStores(room)[index] : undefined;
  if (!store) return { accepted: false, reason: 'There is no store here.' };
  if (state.room.interior) return { accepted: false, reason: 'Already inside a store.' };
  const combat = state.room.combat;
  state.room.interior = true;
  state.room.storeIndex = index;
  state.room.twist = null;
  combat.walls = interiorWalls(store);
  combat.player.x = INTERIOR_ARRIVAL.x;
  combat.player.y = INTERIOR_ARRIVAL.y;
  combat.player.facing = { x: 0, y: -1 };
  clearRoomLocal(state);
  const message = `Entered the ${store.name}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Back out onto the concourse, in front of the shop just left. Anything the
 * alarm sent stays inside with the shutter: getting out is getting away.
 */
export function leaveStore(state: MvpRunState, announce = true): void {
  const store = activeStore(state);
  if (store === null) return;
  const combat = state.room.combat;
  const room = state.wing.rooms[state.roomIndex]!;
  const door = storeEntrance(state.room.storeIndex);
  state.room.interior = false;
  state.room.twist = null;
  combat.walls = room.walls.map((wall) => ({ ...wall }));
  combat.enemies = [];
  combat.player.x = door.x;
  combat.player.y = STORE_EXIT_ARRIVAL_Y;
  combat.player.facing = { x: 0, y: 1 };
  state.alarm = null;
  clearRoomLocal(state);
  if (announce) publishRunFeedback(state, `Back out on the concourse from the ${store.name}.`);
}

/**
 * Walking into a shop door on the back wall goes inside, like walking into a
 * doorway at either end of the room.
 */
export function checkStoreEntrance(state: MvpRunState, moveY: number): boolean {
  if (moveY >= 0) return false;
  const index = storeEntranceNear(state, 0);
  if (index === null) return false;
  const player = state.room.combat.player;
  if (player.y - player.radius > STORE_ENTRANCE_Y) return false;
  return enterStore(state, index).accepted;
}
