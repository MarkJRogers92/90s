/**
 * Floor events (round 47): a twist for a whole wing, so the eight wings of a
 * night stop feeling alike.
 *
 *   outage      — the power is out: every room but the stores and the boss
 *                 room is a blackout (see roomEvents.ts), and the store
 *                 cameras run on backup, so alarms give OUTAGE_ALARM_BONUS more.
 *   sprinklers  — the sprinklers are on: every enemy stays Wet, so anything
 *                 that conducts chains through the whole fight.
 *   clearance   — everything must go: shelves are CLEARANCE_PRICE_SCALE of the
 *                 tag, and a Bargain Hunter joins every regular fight.
 *
 * The night's opening wing never has one. Like room events, it is a pure
 * function of the wing (drawn with `luck`, so the generator's order is
 * untouched); nothing is stored, and checkpoints agree automatically.
 */
import type { GeneratedWing } from '../wing/types';
import { luck } from './luck';

export const WING_EVENTS = ['outage', 'sprinklers', 'clearance'] as const;
export type WingEvent = (typeof WING_EVENTS)[number];

/** How often a wing (other than the night's first) has an event. */
export const WING_EVENT_CHANCE = 0.7;
/** One more second on the store alarm in an outage. */
export const OUTAGE_ALARM_BONUS = 60;
export const CLEARANCE_PRICE_SCALE = 0.7;
/** Re-applied every tick, so Wet never lapses under the sprinklers. */
export const SPRINKLER_WET_TICKS = 30;

export function wingEventFor(wing: Pick<GeneratedWing, 'seed' | 'floor' | 'part'>): WingEvent | null {
  const floor = wing.floor ?? 1;
  if (floor === 1 && wing.part === 1) return null;
  // One draw decides both whether and which, so the three stay evenly spread.
  const roll = luck(wing.seed, 'wing-event', floor, wing.part ?? 2);
  if (roll >= WING_EVENT_CHANCE) return null;
  return WING_EVENTS[Math.min(WING_EVENTS.length - 1, Math.floor((roll / WING_EVENT_CHANCE) * WING_EVENTS.length))]!;
}
