/**
 * The escalator: beating a floor's boss opens the next one up.
 *
 * Going up is a new run on the next floor (its own seeded wing) that carries
 * the janitor's gear, cash, shift stats, perks and wanted level (Heat), with health restored as the
 * reward for the floor. Which floors exist, their bosses and how each wing
 * seed derives from the one below live in the floor table (wing/floorSpecs.ts).
 */
import { createMvpRun } from './createMvpRun';
import { cloneFusionInventory } from './checkpoint';
import { refreshRunLoadout } from './loadout';
import { syncRunCarrier } from './carrier';
import type { MvpRunState } from './types';
import { FINAL_FLOOR, bossWingSeed, floorNumberOf, floorSpec, type FloorNumber } from '../wing/floorSpecs';

/** The upper level's wing seed for a night that started on `seed`. */
export function floorTwoSeed(seed: number): number {
  return floorSpec(2).seedFrom(seed);
}

/** The top floor's wing seed, derived from the floor-2 wing seed. */
export function floorThreeSeed(seed: number): number {
  return floorSpec(3).seedFrom(seed);
}

/** The floor a run is on (1 for the ground floor). */
export function floorOf(state: Pick<MvpRunState, 'wing'>): FloorNumber {
  return floorNumberOf(state.wing);
}

/** Whether a won wing leads on: a first wing to its boss wing, a boss wing up a floor. */
export function canAscend(state: MvpRunState): boolean {
  return state.status === 'won' && (state.wing.part === 1 || floorOf(state) < FINAL_FLOOR);
}

/** True when the next wing is the same floor's boss wing (the stairs, not the escalator). */
export function nextIsBossWing(state: MvpRunState): boolean {
  return state.wing.part === 1;
}

/**
 * On to the next wing, carrying gear, cash, stats and perks: a first wing's
 * stairs lead to the same floor's boss wing, a boss wing's escalator to the
 * next floor's first wing (round 45).
 */
export function ascend(state: MvpRunState): MvpRunState {
  if (!canAscend(state)) throw new Error('The escalator only opens after a floor boss falls.');
  const sameFloor = nextIsBossWing(state);
  const floor = (sameFloor ? floorOf(state) : floorOf(state) + 1) as FloorNumber;
  const next = createMvpRun(sameFloor ? bossWingSeed(state.seed) : floorSpec(floor).seedFrom(state.seed), {
    floor,
    ...(sameFloor ? {} : { part: 1 as const }),
    carry: { inventory: cloneFusionInventory(state.inventory), cash: state.cash, stats: { ...state.stats }, heat: state.heat },
    perks: state.perks,
  });
  refreshRunLoadout(next);
  syncRunCarrier(next);
  return next;
}

/**
 * Up to the next floor's boss wing, straight through its first wing: for
 * fixtures and tests that mean "the floor-N boss" (round 45).
 */
export function climbToBossWing(state: MvpRunState): MvpRunState {
  let next = ascend(state);
  if (next.wing.part === 1) {
    next.status = 'won';
    next = ascend(next);
  }
  return next;
}

/** From a won Floor 1 to Floor 2's boss wing (tests and fixtures). */
export function ascendToFloorTwo(state: MvpRunState): MvpRunState {
  if (floorOf(state) !== 1) throw new Error('Floor 2 is reached from Floor 1.');
  return climbToBossWing(state);
}
