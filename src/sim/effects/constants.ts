/**
 * Shared M2 interaction constants for the renderer-independent effect modules.
 *
 * The authored item catalog states the same numbers for its content; these are
 * the values the central tick consumes. `tests/unit/statuses.test.ts` asserts the
 * two stay identical, so authored content and simulation rules cannot drift.
 */

/** Simulation rate. Every duration below is authored in ticks at this rate. */
export const TICKS_PER_SECOND = 60;

/** Wet lasts 180 ticks and refreshes to the longer remaining duration. */
export const WET_DURATION_TICKS = 180;

/** Sticky lasts 90 ticks. */
export const STICKY_DURATION_TICKS = 90;

/** Gel Pens movement multiplier while Sticky. */
export const STICKY_SLOW_MULTIPLIER = 0.65;

/** No slow may ever drop movement below half speed. */
export const GENERAL_SLOW_FLOOR = 0.5;

/**
 * A direct (melee) hit leaves its target Wet: the associate-issue mop is soaked.
 * This is a delivery capability rather than an item-ID branch, so any direct
 * primary gets the same rule.
 */
export const DIRECT_HIT_WET_TICKS = WET_DURATION_TICKS;

/** Ticks the player attack stays visibly active after acceptance. */
export const ATTACK_ACTIVE_TICKS = 6;

/** Generation depth cap for gameplay event ancestry; a root action is depth 0. */
export const MAX_GENERATION_DEPTH = 4;

/** One root action may create at most 64 child gameplay events. */
export const MAX_CHILD_EVENTS_PER_ROOT = 64;

/** Bounds for the diagnostics a run keeps and can show the player. */
export const MAX_BEHAVIOR_TRACE_ENTRIES = 32;
export const MAX_LIMIT_DIAGNOSTICS = 24;
