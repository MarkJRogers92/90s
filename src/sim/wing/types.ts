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
