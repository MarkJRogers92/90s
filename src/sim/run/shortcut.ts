/**
 * The staff passage (round 57): the wing's one route choice.
 *
 * Some wings have a STAFF ONLY hatch on a safe storefront concourse. Crawl
 * through it (E) and the next fight room is skipped: the janitor comes out
 * two rooms on, with that room marked cleared. The choice is the old one in a
 * mall: the long way round, through the fight, or the back way, past it.
 *
 * The long way earns its keep. A cleared fight pays tokens, a chance at a
 * drop, the Cleanup Combo and the +2 health a cleared room heals, and it sheds
 * Heat. The passage pays none of it, and security notices: it costs
 * SHORTCUT_HEAT, one wanted star, so shelves are dearer and every later fight
 * has another guard. Skip a light fight at full health and it can be the
 * better road; skip the Back Hall to reach the boss hurt, and it is not.
 *
 * Seed-derived like the secret room, so where it is needs no save. One use a
 * wing: the hatch is spent the moment it is used, recorded in `secretsDone`
 * under `100 + room index` (the checkpoint wants digits, and 100+ cannot clash
 * with a real room index). The skipped room goes in `clearedRooms`, which is
 * what keeps the checkpoint legal ("no fight room behind the janitor is left
 * uncleared").
 */
import type { Vec2 } from '../model';
import { MAX_SECURITY_HEAT } from '../shop/types';
import type { GeneratedWing } from '../wing/types';
import { blockedRunReason, publishRunFeedback } from './economy';
import { luck } from './luck';
import { moveToRoom } from './roomTransition';
import type { MvpCommandResult, MvpRunState } from './types';

/** How many wings have a hatch: about one a floor, as each floor is two wings. */
export const SHORTCUT_CHANCE = 0.5;
/** The hatch: on the back wall of the concourse, left of the first shop door. */
export const SHORTCUT_HATCH: Vec2 = { x: 80, y: 70 };
/** How near the janitor has to be to crawl in. */
export const SHORTCUT_REACH = 56;
/** What security makes of it: one wanted star. */
export const SHORTCUT_HEAT = 20;

export type ShortcutSpot = {
  /** The concourse the hatch is on. */
  readonly from: number;
  /** Where it comes out: past the fight room between. */
  readonly to: number;
};

/** Where this wing's hatch is, or null. */
export function shortcutFor(wing: Pick<GeneratedWing, 'seed' | 'rooms'>): ShortcutSpot | null {
  if (luck(wing.seed, 'shortcut', 0, 0) >= SHORTCUT_CHANCE) return null;
  const spots: ShortcutSpot[] = [1, 3]
    .filter((from) => {
      const concourse = wing.rooms[from];
      const fight = wing.rooms[from + 1];
      return concourse !== undefined && fight !== undefined && wing.rooms[from + 2] !== undefined
        && concourse.store !== null && concourse.enemySpawns.length === 0 && fight.enemySpawns.length > 0;
    })
    .map((from) => ({ from, to: from + 2 }));
  if (spots.length === 0) return null;
  return spots[Math.floor(luck(wing.seed, 'shortcut-spot', 0, 0) * spots.length)]!;
}

const shortcutKey = (roomIndex: number): string => String(100 + roomIndex);

/** The hatch is on this concourse and unused (for the view: it is drawn while this holds). */
export function shortcutHere(state: MvpRunState): boolean {
  if (state.room.interior) return false;
  const spot = shortcutFor(state.wing);
  return spot !== null && spot.from === state.roomIndex && !state.secretsDone.includes(shortcutKey(spot.from));
}

/** The hatch is here, unused, and the janitor is at it. */
export function nearShortcut(state: MvpRunState): boolean {
  if (!shortcutHere(state)) return false;
  const player = state.room.combat.player;
  return Math.hypot(player.x - SHORTCUT_HATCH.x, player.y - SHORTCUT_HATCH.y) <= SHORTCUT_REACH;
}

/** Crawls through: skips the fight room, costs a star, comes out two rooms on. */
export function takeShortcut(state: MvpRunState): MvpCommandResult {
  const spot = shortcutFor(state.wing);
  if (!spot || !nearShortcut(state)) return { accepted: false, reason: 'Nothing happens.' };
  const blocked = blockedRunReason(state);
  if (blocked) return { accepted: false, reason: blocked };
  state.secretsDone.push(shortcutKey(spot.from));
  const skipped = state.wing.rooms[spot.from + 1]!;
  if (!state.clearedRooms.includes(skipped.id)) state.clearedRooms.push(skipped.id);
  // Security notices before the next room is built, so its guards count the new star.
  state.heat = Math.min(MAX_SECURITY_HEAT, state.heat + SHORTCUT_HEAT);
  moveToRoom(state, spot.to, 'west');
  // The pickup log holds two short lines, so this stays brief.
  const message = `Through the staff passage, past the ${skipped.name}. +1 star.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}
