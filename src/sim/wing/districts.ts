/**
 * Mall districts (round 50): one themed alternate first wing per floor.
 *
 * About half the nights (DISTRICT_CHANCE, rolled per floor from the wing's
 * seed) a floor's first wing is its district instead of the usual one: its
 * own rooms, a district store opening in each storefront, its own monster in
 * the fights, and a mini-boss waiting in the Lockdown room. The boss wings
 * never change. Nothing is stored: the roll is a pure function of the seed,
 * so checkpoints and restores agree automatically, and the regular wings draw
 * exactly as before.
 *
 *   1  Holiday Village  the Santa display that never came down
 *   2  Glamour Row      the glamour photo studio and the salon
 *   3  Pet Paradise     the pet store, the aquarium and the garden centre
 *   4  Skate Arena      the top-floor ice rink
 */
import type { BossKind } from '../combat/boss';
import type { EnemyKind } from '../model';
import type { FloorNumber } from './floorSpecs';
import { createWingRng, nextUnitFloat } from './rng';
import type { WingRoomRole } from './types';

export type DistrictId = 'holiday' | 'glamour' | 'pets' | 'rink';
export const DISTRICT_IDS: readonly DistrictId[] = ['holiday', 'glamour', 'pets', 'rink'];

export type DistrictSpec = {
  readonly id: DistrictId;
  /** As the HUD and the PA say it. */
  readonly name: string;
  readonly roomNames: Readonly<Record<WingRoomRole, string>>;
  /** The district store opening in storefront_a, then storefront_b. */
  readonly stores: readonly [string, string];
  /** The district's own monster, and the share (percent) of fight spawns it takes. */
  readonly enemyKind: Extract<EnemyKind, 'elf' | 'spritzer' | 'poodle' | 'goon'>;
  readonly enemyShare: number;
  /** Who waits in the Lockdown room instead of the elite wave. */
  readonly miniBoss: Extract<BossKind, 'santa' | 'glamour_queen' | 'whiskers' | 'zamboni'>;
};

/** How often a night's first wing on a floor is that floor's district. */
export const DISTRICT_CHANCE = 0.5;

const DISTRICTS: Readonly<Record<DistrictId, DistrictSpec>> = {
  holiday: {
    id: 'holiday',
    name: 'Holiday Village',
    // The night still opens in the Opening Concourse.
    roomNames: { service_corridor: 'Opening Concourse', storefront_a: 'Candy Lane', food_court: 'Carousel Court', storefront_b: 'Gift Wrap Row', back_hall: 'Toy Stockroom', security_office: "Santa's Workshop" },
    stores: ['candy-cauldron', 'novelty-nook'],
    enemyKind: 'elf',
    enemyShare: 40,
    miniBoss: 'santa',
  },
  glamour: {
    id: 'glamour',
    name: 'Glamour Row',
    roomNames: { service_corridor: 'Perfume Hall', storefront_a: 'Salon Strip', food_court: 'Makeup Counters', storefront_b: 'Mirror Mall', back_hall: 'Fitting Rooms', security_office: 'Portrait Studio' },
    stores: ['glam-snaps', 'hair-affair'],
    enemyKind: 'spritzer',
    enemyShare: 40,
    miniBoss: 'glamour_queen',
  },
  pets: {
    id: 'pets',
    name: 'Pet Paradise',
    roomNames: { service_corridor: 'Aquarium Walk', storefront_a: 'Pet Shop Row', food_court: 'Koi Pond', storefront_b: 'Garden Patio', back_hall: 'Kennel Row', security_office: 'The Aviary' },
    stores: ['pet-palace', 'green-thumb'],
    enemyKind: 'poodle',
    enemyShare: 45,
    miniBoss: 'whiskers',
  },
  rink: {
    id: 'rink',
    name: 'Skate Arena',
    roomNames: { service_corridor: 'Skate Rental', storefront_a: 'Rinkside', food_court: 'The Ice Rink', storefront_b: 'Bleachers', back_hall: 'Zamboni Garage', security_office: 'Penalty Box' },
    stores: ['skate-shack', 'cocoa-hut'],
    enemyKind: 'goon',
    enemyShare: 40,
    miniBoss: 'zamboni',
  },
};

export const DISTRICT_FOR_FLOOR: Readonly<Record<FloorNumber, DistrictId>> = { 1: 'holiday', 2: 'glamour', 3: 'pets', 4: 'rink' };

export function districtSpec(id: DistrictId): DistrictSpec {
  return DISTRICTS[id];
}

export function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === 'string' && (DISTRICT_IDS as readonly string[]).includes(value);
}

/** Whether this first wing is its floor's district: one draw of its own, outside the wing's draw order. */
export function districtRoll(seed: number, floor: FloorNumber, part: 1 | undefined): DistrictId | null {
  if (part !== 1) return null;
  const rng = createWingRng((Math.imul((seed | 0) ^ 0x5d157c7, 0x9e3779b1) ^ Math.imul(floor, 0x85ebca6b)) | 0);
  nextUnitFloat(rng);
  return nextUnitFloat(rng) < DISTRICT_CHANCE ? DISTRICT_FOR_FLOOR[floor] : null;
}
