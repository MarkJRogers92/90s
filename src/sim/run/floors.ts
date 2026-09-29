/**
 * The escalator: beating a floor's boss opens the next one up.
 *
 * Going up is a new run on the next floor (its own seeded wing) that carries
 * the janitor's gear, cash, shift stats, perks and wanted level (Heat), with health restored as the
 * reward for the floor. Floor 2 (Statics, Bargain Hunters, the Mall Manager)
 * follows Loss Prevention; Floor 3 (Food Court After Dark: Mascot Brutes and
 * the Mall Owner) follows the Mall Manager. Each floor's wing seed is derived
 * from the one below, so a seed still names one whole night.
 */
import { createMvpRun } from './createMvpRun';
import { cloneFusionInventory } from './checkpoint';
import { refreshRunLoadout } from './loadout';
import { syncRunCarrier } from './carrier';
import type { MvpRunState } from './types';

/** The upper level's wing seed for a night that started on `seed`. */
export function floorTwoSeed(seed: number): number {
  return (Math.imul(seed | 0, 31) + 7919) | 0;
}

/** The top floor's wing seed, derived from the floor-2 wing seed. */
export function floorThreeSeed(seed: number): number {
  return (Math.imul(seed | 0, 37) + 104729) | 0;
}

/** 1 for the ground floor (an absent flag), else 2 or 3. */
export function floorOf(state: Pick<MvpRunState, 'wing'>): 1 | 2 | 3 {
  return state.wing.floor === 3 ? 3 : state.wing.floor === 2 ? 2 : 1;
}

export function canAscend(state: MvpRunState): boolean {
  return state.status === 'won' && floorOf(state) !== 3;
}

/** Up one floor: the next wing, carrying gear, cash, stats and perks. */
export function ascend(state: MvpRunState): MvpRunState {
  if (!canAscend(state)) throw new Error('The escalator only opens after a floor boss falls.');
  const floor = floorOf(state) === 1 ? 2 : 3;
  const next = createMvpRun(floor === 2 ? floorTwoSeed(state.seed) : floorThreeSeed(state.seed), {
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
