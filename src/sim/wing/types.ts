/**
 * Public plain-data contract for one seeded M5 wing.
 *
 * These are renderer-independent definitions only. Runtime state, room
 * transitions, and economy live in later M5 modules and consume this shape
 * without widening it.
 */
import type { Rect, Vec2 } from '../model';
import type { StoreSightZone } from '../shop/types';

export type WingRoomRole =
  | 'service_corridor'
  | 'storefront_a'
  | 'food_court'
  | 'storefront_b'
  | 'back_hall'
  | 'security_office';

export type WingRoomId = WingRoomRole;

export type WingDoorSide = 'west' | 'east';

export type WingDoorway = {
  readonly id: string;
  readonly side: WingDoorSide;
  readonly rect: Rect;
};

export type WingEnemySpawn = {
  readonly slotId: string;
  readonly kind: 'hanger' | 'spitter';
  readonly x: number;
  readonly y: number;
};

export type WingOffer = {
  readonly id: string;
  readonly storeId: string;
  readonly itemDefinitionId: string;
  readonly position: Vec2;
  readonly price: number;
};

export type WingStoreInstance = {
  readonly templateId: string;
  readonly name: string;
  readonly bounds: Rect;
  readonly resetPoint: Vec2;
  readonly exit: {
    readonly id: string;
    readonly label: string;
    readonly bounds: Rect;
  };
  readonly sightZone: StoreSightZone;
  readonly offerIds: readonly string[];
};

/**
 * Mall furniture standing in a room. Purely decorative for now: a fixture has
 * no collision, so it never blocks a path and cannot trap an enemy spawn.
 */
export type WingFixtureKind =
  | 'mall-bench'
  | 'vending-machine'
  | 'store-gondola'
  // Concourse, wayfinding and services. Added 2026-09-23 from the generated
  // mall-prop library (docs/art/work/mall-props-2026-09-22/BATCH.json).
  | 'planter'
  | 'potted-palm'
  | 'rubbish-bin'
  | 'mall-directory'
  | 'poster-stand'
  | 'info-kiosk'
  | 'atm'
  | 'payphone'
  | 'drinking-fountain'
  | 'wet-floor-sign'
  | 'security-turnstile'
  | 'kiddie-ride'
  | 'shopping-cart'
  // Food court.
  | 'food-court-table'
  | 'food-court-chair'
  | 'condiment-stand'
  // Retail fit-out.
  | 'checkout-counter'
  | 'clothing-rack'
  | 'vhs-shelf'
  | 'shoe-bench'
  // Arcade.
  | 'arcade-cabinet'
  | 'claw-machine'
  | 'air-hockey-table'
  | 'arcade-stool';

/** `x, y` is the fixture's BASE, matching the base-anchored sprite convention. */
export type WingFixture = {
  readonly kind: WingFixtureKind;
  readonly x: number;
  readonly y: number;
};

/**
 * Damage and grime lying flat on a floor.
 *
 * Like a fixture, a decal is purely decorative: it has no collision and no
 * gameplay meaning, so it is authored here as room content rather than derived
 * by the view. Unlike a fixture it is not upright, so `x, y` is the decal's
 * CENTRE rather than a base.
 */
export type WingDecalKind =
  | 'blood-drops'
  | 'blood-pool'
  | 'blood-drag'
  | 'blood-splash'
  | 'blood-handprint'
  | 'broken-glass'
  | 'cracked-tile'
  | 'torn-carpet'
  | 'scorch-mark'
  | 'organic-residue';

export type WingDecal = {
  readonly kind: WingDecalKind;
  readonly x: number;
  readonly y: number;
};

export type WingRoomDefinition = {
  readonly id: WingRoomId;
  readonly name: string;
  readonly variantId: string;
  readonly bounds: Rect;
  readonly walls: readonly Rect[];
  readonly doorways: readonly WingDoorway[];
  readonly playerEntry: Vec2;
  readonly bossAnchor: Vec2 | null;
  readonly enemySpawns: readonly WingEnemySpawn[];
  readonly store: WingStoreInstance | null;
  readonly offers: readonly WingOffer[];
  readonly benchKiosk: Vec2 | null;
  readonly fixtures: readonly WingFixture[];
  readonly decals: readonly WingDecal[];
};

export type GeneratedWing = {
  readonly seed: number;
  readonly rooms: readonly WingRoomDefinition[];
  readonly startingCash: number;
};

export const WING_ROOM_COUNT = 6;

export const WING_ROOM_ORDER: readonly WingRoomRole[] = Object.freeze([
  'service_corridor',
  'storefront_a',
  'food_court',
  'storefront_b',
  'back_hall',
  'security_office',
] as const);
