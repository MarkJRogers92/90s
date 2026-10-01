/**
 * Room events: a seeded twist per shift, so no two nights in the mall play
 * quite the same.
 *
 *   blackout    — one combat room's lights are out. The rules are unchanged;
 *                 the renderer shows only the janitor's flashlight and eyes.
 *   blue_light  — a BLUE LIGHT SPECIAL: one item in one store is half price.
 *
 * Pure functions of the seed and the wing, drawn with `luck` so the wing
 * generator's order is untouched; nothing is stored, so checkpoints and
 * restores agree automatically.
 */
import { luck } from './luck';
import { wingEventFor } from './wingEvents';
import type { MvpRunState } from './types';

export type RoomEvent = 'blackout' | 'blue_light';

const BLACKOUT_CHANCE = 0.5;
const BLUE_LIGHT_CHANCE = 0.75;
const COMBAT_ROOMS = new Set(['food_court', 'back_hall']);

function pick<T>(items: readonly T[], roll: number): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(roll * items.length))];
}

function blackoutRoomIndex(state: MvpRunState): number | null {
  if (luck(state.seed, 'blackout', 0, 0) >= BLACKOUT_CHANCE) return null;
  const candidates = state.wing.rooms.map((room, index) => ({ room, index })).filter(({ room }) => COMBAT_ROOMS.has(room.id));
  return pick(candidates, luck(state.seed, 'blackout', 1, 0))?.index ?? null;
}

function blueLightRoomIndex(state: MvpRunState): number | null {
  if (luck(state.seed, 'blue-light', 0, 0) >= BLUE_LIGHT_CHANCE) return null;
  const candidates = state.wing.rooms.map((room, index) => ({ room, index })).filter(({ room }) => room.store !== null && room.offers.length > 0);
  return pick(candidates, luck(state.seed, 'blue-light', 1, 0))?.index ?? null;
}

export function roomEventFor(state: MvpRunState, roomIndex: number): RoomEvent | null {
  // A power outage (a floor event) blacks out every room but the stores and the boss.
  const room = state.wing.rooms[roomIndex];
  if (wingEventFor(state.wing) === 'outage' && room && room.store === null && room.bossAnchor === null) return 'blackout';
  if (blackoutRoomIndex(state) === roomIndex) return 'blackout';
  if (blueLightRoomIndex(state) === roomIndex) return 'blue_light';
  return null;
}

/** The one half-price offer this shift, or null. */
export function blueLightOfferId(state: MvpRunState): string | null {
  const index = blueLightRoomIndex(state);
  if (index === null) return null;
  const offers = state.wing.rooms[index]!.offers;
  return pick(offers, luck(state.seed, 'blue-light', 2, 0))?.id ?? null;
}
