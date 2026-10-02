/**
 * The coach (round 57): an optional guided first shift.
 *
 * A new janitor is shown one short tip at a time, each the first moment it is
 * useful: how to move and swing, which door is the shop, what E and F do on a
 * shelf, what a wind-up ring means, how to switch weapons, what the bench is
 * for, and what a wanted star costs. Every tip is derived from the run's own
 * state, so the coach can never disagree with the game, and each is said once.
 *
 * Presentation only: it reads a `MvpRunState` and never changes one. The view
 * keeps the set of tips already shown; this module just says which comes next.
 * It switches itself off after COACH_SHIFTS nights, and the Settings panel can
 * switch it off at once.
 */
import type { MvpRunState } from '../../sim/run/types';
import { hasLivingEnemies } from '../../sim/run/rooms';
import { activeStore, roomStores } from '../../sim/run/storeInterior';
import { runWeaponSlots } from '../../sim/run/weapons';
import { wantedStars } from '../../sim/run/wanted';

export type CoachTipId = 'move' | 'shop' | 'buy' | 'dodge' | 'weapons' | 'bench' | 'wanted';
export type CoachTip = { readonly id: CoachTipId; readonly text: string };

/** Tips are shown for a janitor's first shifts only. */
export const COACH_SHIFTS = 2;

/** Whether the coach speaks at all: switched on, and a janitor still learning. */
export function coachActive(settings: { readonly coach: boolean }, career: { readonly shifts: number }): boolean {
  return settings.coach && career.shifts < COACH_SHIFTS;
}

/**
 * The nudge for a janitor still in the first room: not in the first nine
 * seconds (the controls card owns those), and not after half a minute.
 */
const MOVE_TIP_FROM = 60 * 9;
const MOVE_TIP_UNTIL = 60 * 30;

const TEXT: Readonly<Record<CoachTipId, string>> = {
  move: 'THE WAY ON IS THE EAST DOOR. WASD TO MOVE, CLICK TO SWING.',
  shop: 'WALK INTO A SHOP DOOR ON THE BACK WALL, OR PRESS E AT IT.',
  buy: 'E BUYS A SHELF ITEM. F GRABS IT FREE BUT TRIPS THE ALARM: GET OUT THE DOOR BEFORE THE SHUTTER.',
  dodge: 'A RING OR LINE WARNS OF AN ATTACK. SIDESTEP IT, OR PRESS SPACE TO DASH.',
  weapons: 'A SECOND WEAPON! PRESS 1-9 OR Q TO SWITCH.',
  bench: 'THE BENCH WARRANT FUSES ANY TWO ITEMS INTO ONE. PRESS E AT THE KIOSK.',
  wanted: 'WANTED: SHELVES COST MORE AND GUARDS JOIN FIGHTS. CLEAR FIGHTS TO LAY LOW.',
};

/** Whether a tip applies to the run as it is right now. */
function applies(id: CoachTipId, state: MvpRunState): boolean {
  const room = state.wing.rooms[state.roomIndex];
  switch (id) {
    case 'move':
      return state.roomIndex === 0 && state.tick >= MOVE_TIP_FROM && state.tick < MOVE_TIP_UNTIL;
    case 'shop':
      return !state.room.interior && room !== undefined && roomStores(room).length > 0;
    case 'buy':
      return activeStore(state) !== null;
    case 'dodge':
      return !state.room.interior && room !== undefined && room.enemySpawns.length > 0 && hasLivingEnemies(state.room.combat);
    case 'weapons':
      return runWeaponSlots(state).length >= 2;
    case 'bench':
      return room?.benchKiosk != null && state.inventory.inventory.length >= 2;
    case 'wanted':
      return wantedStars(state.heat) >= 1;
  }
}

const ORDER: readonly CoachTipId[] = ['move', 'shop', 'buy', 'dodge', 'weapons', 'bench', 'wanted'];

/** The first applicable tip not yet shown, or null (also while the shift is not being played). */
export function nextCoachTip(state: MvpRunState, shown: ReadonlySet<CoachTipId>): CoachTip | null {
  if (state.status !== 'playing') return null;
  const id = ORDER.find((candidate) => !shown.has(candidate) && applies(candidate, state));
  return id === undefined ? null : { id, text: TEXT[id] };
}
