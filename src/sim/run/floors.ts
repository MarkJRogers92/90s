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
import { FINAL_FLOOR, floorNumberOf, floorSpec, type FloorNumber } from '../wing/floorSpecs';

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

export function canAscend(state: MvpRunState): boolean {
  return state.status === 'won' && floorOf(state) < FINAL_FLOOR;
}

/** Up one floor: the next wing, carrying gear, cash, stats and perks. */
export function ascend(state: MvpRunState): MvpRunState {
  if (!canAscend(state)) throw new Error('The escalator only opens after a floor boss falls.');
  const floor = (floorOf(state) + 1) as FloorNumber;
  const next = createMvpRun(floorSpec(floor).seedFrom(state.seed), {
    floor,
    carry: { inventory: cloneFusionInventory(state.inventory), cash: state.cash, stats: { ...state.stats }, heat: state.heat },
    perks: state.perks,
  });
  refreshRunLoadout(next);
  syncRunCarrier(next);
  return next;
}

export function ascendToFloorTwo(state: MvpRunState): MvpRunState {
  if (floorOf(state) !== 1) throw new Error('Floor 2 is reached from Floor 1.');
  return ascend(state);
}
