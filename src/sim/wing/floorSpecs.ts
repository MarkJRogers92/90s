/**
 * The floor table: everything the sim needs to know about one floor of the
 * night, so adding a floor is one entry here instead of a new branch in every
 * module that asks "which floor is this?".
 *
 * Floor 1 is the original wing (its GeneratedWing carries no `floor` flag).
 * Each floor above is reached by the escalator after the floor below's boss
 * falls, and its wing seed is derived from the one below, so a seed still
 * names one whole night. Beating the final floor's boss is the win.
 */
import type { BossKind } from '../combat/boss';
import { nextInt, type createWingRng } from './rng';
import { FLOOR_THREE_ROOM_NAMES, FLOOR_TWO_ROOM_NAMES, ROOF_ROOM_NAMES, ROOM_NAMES } from './templates';
import type { WingEnemySpawn, WingRoomRole } from './types';

export type FloorNumber = 1 | 2 | 3 | 4;

export const FLOOR_NUMBERS: readonly FloorNumber[] = Object.freeze([1, 2, 3, 4]);

/** Beating this floor's boss clocks the janitor out. */
export const FINAL_FLOOR: FloorNumber = 4;

type WingRng = ReturnType<typeof createWingRng>;

export type FloorSpec = {
  readonly roomNames: Readonly<Record<WingRoomRole, string>>;
  readonly bossKind: BossKind;
  /** Every fight at its variant's maximum count instead of a drawn one. */
  readonly fullStrength: boolean;
  /**
   * Swaps an authored spawn kind for this floor's monsters. Draws after the
   * floor-1 draws for the slot, so each floor's sequence is its own and the
   * floors below never change.
   */
  readonly enemyKind: (kind: WingEnemySpawn['kind'], rng: WingRng) => WingEnemySpawn['kind'];
  /** This floor's wing seed from the wing seed of the floor below (floor 1: the night's seed). */
  readonly seedFrom: (seedBelow: number) => number;
};

const FLOOR_SPECS: Readonly<Record<FloorNumber, FloorSpec>> = {
  1: {
    roomNames: ROOM_NAMES,
    bossKind: 'lp_manager',
    fullStrength: false,
    enemyKind: (kind) => kind,
    seedFrom: (seed) => seed,
  },
  // The Upper Level: Hangers give way to the Static, Spitters to Bargain Hunters.
  2: {
    roomNames: FLOOR_TWO_ROOM_NAMES,
    bossKind: 'manager',
    fullStrength: true,
    enemyKind: (kind, rng) => {
      const roll = nextInt(rng, 0, 99);
      if (kind === 'hanger') return roll < 45 ? 'static' : 'hanger';
      if (kind === 'spitter') return roll < 45 ? 'shopper' : 'spitter';
      return kind;
    },
    seedFrom: (seed) => (Math.imul(seed | 0, 31) + 7919) | 0,
  },
  // Food Court After Dark mixes everything, plus Mascot Brutes in place of either familiar monster.
  3: {
    roomNames: FLOOR_THREE_ROOM_NAMES,
    bossKind: 'owner',
    fullStrength: true,
    enemyKind: (kind, rng) => {
      const roll = nextInt(rng, 0, 99);
      if (kind === 'hanger') return roll < 28 ? 'static' : roll < 58 ? 'mascot' : 'hanger';
      if (kind === 'spitter') return roll < 32 ? 'shopper' : roll < 62 ? 'mascot' : 'spitter';
      return kind;
    },
    seedFrom: (seed) => (Math.imul(seed | 0, 37) + 104729) | 0,
  },
  // The Roof: Roofers lob tar from where the Spitters stood; brutes and Statics still come up.
  4: {
    roomNames: ROOF_ROOM_NAMES,
    bossKind: 'developer',
    fullStrength: true,
    enemyKind: (kind, rng) => {
      const roll = nextInt(rng, 0, 99);
      if (kind === 'hanger') return roll < 25 ? 'mascot' : roll < 45 ? 'static' : 'hanger';
      if (kind === 'spitter') return roll < 45 ? 'roofer' : roll < 62 ? 'shopper' : 'spitter';
      return kind;
    },
    seedFrom: (seed) => (Math.imul(seed | 0, 41) + 1299709) | 0,
  },
};

export function floorSpec(floor: FloorNumber): FloorSpec {
  return FLOOR_SPECS[floor];
}

export function isFloorNumber(value: unknown): value is FloorNumber {
  return typeof value === 'number' && (FLOOR_NUMBERS as readonly number[]).includes(value);
}

/** A wing's floor; an absent (or unknown) flag is the ground floor. */
export function floorNumberOf(wing: { readonly floor?: number }): FloorNumber {
  return isFloorNumber(wing.floor) ? wing.floor : 1;
}
