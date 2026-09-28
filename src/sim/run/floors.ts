/**
 * The escalator: beating Loss Prevention opens the upper level.
 *
 * Going up is a new run on floor 2 (its own seeded wing, Statics, Bargain
 * Hunters and the Mall Manager) that carries the janitor's gear, cash and
 * shift stats, with health restored as the reward for the first floor. The
 * floor-2 wing seed is derived from the floor-1 seed, so a seed still names
 * one whole night.
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

export function canAscend(state: MvpRunState): boolean {
  return state.status === 'won' && state.wing.floor !== 2;
}

export function ascendToFloorTwo(state: MvpRunState): MvpRunState {
  if (!canAscend(state)) throw new Error('The escalator only opens after Loss Prevention falls.');
  const next = createMvpRun(floorTwoSeed(state.seed), {
    floor: 2,
    carry: { inventory: cloneFusionInventory(state.inventory), cash: state.cash, stats: { ...state.stats } },
    perks: state.perks,
  });
  refreshRunLoadout(next);
  syncRunCarrier(next);
  return next;
}
