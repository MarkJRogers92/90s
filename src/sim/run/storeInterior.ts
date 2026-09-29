/**
 * Going into the stores.
 *
 * A storefront room used to put its store in the middle of the concourse: a
 * rug with items floating over it and an invisible door on its bottom edge.
 * Now the concourse is just the concourse, and the shop's own door in the
 * back-wall art leads inside. The inside is the whole room: the store's
 * template is scaled up to fill it (`generateRunWing`), walls go up around
 * it, and the only way out is the shop door at the bottom, past the
 * anti-theft gates. Walking out through it secures stolen goods and puts the
 * janitor back on the concourse at the shop's entrance.
 *
 * Because the scaled store is still an ordinary `WingStoreInstance`, the
 * alarm, guard spots, shutter and securing rules in heist.ts and economy.ts
 * all work inside unchanged. The separate M3 Shoplifting Loop mode does not
 * use the run's wing and keeps its original stores.
 *
 * Pure rules over run data; nothing here reads the renderer.
 */
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import type { Rect, Vec2 } from '../model';
import { generateWing } from '../wing/generateWing';
import type { GeneratedWing, WingOffer, WingRoomDefinition, WingStoreInstance } from '../wing/types';
import { DOORWAY_WIDTH, WALL_THICKNESS } from '../wing/templates';
import { publishRunFeedback } from './economy';
import type { MvpCommandResult, MvpRunState } from './types';

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
 * The shop's entrance on the concourse: the door in the back-wall art, which
 * the dressing centres. Walking into the back wall here goes inside.
 */
export const STORE_ENTRANCE: Vec2 = { x: PLAYFIELD_WIDTH / 2, y: 26 };
/** How wide the entrance is, either side of its centre. */
export const STORE_ENTRANCE_HALF_WIDTH = 44;
/** Where the janitor comes back out: in front of the shop, clear of the entrance. */
export const STORE_EXIT_ARRIVAL: Vec2 = { x: PLAYFIELD_WIDTH / 2, y: 64 };

/** Maps a point from a template store's bounds onto the full-room interior. */
function toInterior(point: Vec2, from: Rect): Vec2 {
  return {
    x: Math.round(INTERIOR_BOUNDS.x + ((point.x - from.x) / from.width) * INTERIOR_BOUNDS.width),
    y: Math.round(INTERIOR_BOUNDS.y + ((point.y - from.y) / from.height) * INTERIOR_BOUNDS.height),
  };
}

/** One storefront's store and offers, scaled up to fill the room. */
export function scaleStoreToInterior(room: WingRoomDefinition): WingRoomDefinition {
  const store = room.store;
  if (!store) return room;
  const scaled: WingStoreInstance = {
    ...store,
    bounds: { ...INTERIOR_BOUNDS },
    resetPoint: { x: INTERIOR_ARRIVAL.x, y: INTERIOR_EXIT.y + 20 },
    exit: { ...store.exit, bounds: { ...INTERIOR_EXIT } },
  };
  const offers: WingOffer[] = room.offers.map((offer) => ({ ...offer, position: toInterior(offer.position, store.bounds) }));
  return { ...room, store: scaled, offers };
}

/** The run's wing: the generated wing with every store scaled to a full-room interior. */
export function generateRunWing(seed: number, floor: 1 | 2 | 3 = 1): GeneratedWing {
  const wing = generateWing(seed, floor);
  return { ...wing, rooms: wing.rooms.map(scaleStoreToInterior) };
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

function currentStore(state: MvpRunState): WingStoreInstance | null {
  return state.wing.rooms[state.roomIndex]?.store ?? null;
}

/** True when the janitor is on the concourse close enough to the shop door to go in. */
export function nearStoreEntrance(state: MvpRunState, reach: number): boolean {
  if (state.room.interior || currentStore(state) === null) return false;
  const player = state.room.combat.player;
  return Math.abs(player.x - STORE_ENTRANCE.x) <= STORE_ENTRANCE_HALF_WIDTH + reach
    && player.y - STORE_ENTRANCE.y <= reach;
}

/** Leaves the room-local things behind a doorway: shots, puddles, the car's spot. */
function clearRoomLocal(state: MvpRunState): void {
  const combat = state.room.combat;
  combat.projectiles = [];
  combat.surfaces = [];
  combat.eventQueue = [];
  state.stalker = null;
}

/** Walks through the shop door into the store. */
export function enterStore(state: MvpRunState): MvpCommandResult {
  const store = currentStore(state);
  if (store === null) return { accepted: false, reason: 'There is no store here.' };
  if (state.room.interior) return { accepted: false, reason: `Already inside the ${store.name}.` };
  const combat = state.room.combat;
  state.room.interior = true;
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
 * Back out onto the concourse. Anything the alarm sent stays inside with the
 * shutter: getting out is getting away.
 */
export function leaveStore(state: MvpRunState, announce = true): void {
  const store = currentStore(state);
  if (store === null || !state.room.interior) return;
  const combat = state.room.combat;
  const room = state.wing.rooms[state.roomIndex]!;
  state.room.interior = false;
  combat.walls = room.walls.map((wall) => ({ ...wall }));
  combat.enemies = [];
  combat.player.x = STORE_EXIT_ARRIVAL.x;
  combat.player.y = STORE_EXIT_ARRIVAL.y;
  combat.player.facing = { x: 0, y: 1 };
  state.alarm = null;
  clearRoomLocal(state);
  if (announce) publishRunFeedback(state, `Back out on the concourse from the ${store.name}.`);
}

/**
 * Walking into the shop door on the back wall goes inside, like walking into
 * a doorway at either end of the room.
 */
export function checkStoreEntrance(state: MvpRunState, moveY: number): boolean {
  if (moveY >= 0 || !nearStoreEntrance(state, 0)) return false;
  const player = state.room.combat.player;
  if (player.y - player.radius > STORE_ENTRANCE.y) return false;
  return enterStore(state).accepted;
}
