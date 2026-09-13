/**
 * Authored content and authoritative runtime state for the M3 shoplifting wing.
 *
 * Everything here is plain data: no Phaser, no DOM, and no shopping rule that
 * branches on an item name. A wing definition owns bounds, collision geometry,
 * the player spawn, the mall exit, the store definitions, and starting cash.
 * Runtime state adds availability, provenance, Heat, and suspicion on top of
 * that immutable content without widening the combat `RunState`.
 */
import type { ItemDefinition, ItemId } from '../items/types';
import type { Rect, Vec2 } from '../model';

/** The M3 player keeps the M1 radius and movement speed. */
export const WING_PLAYER_RADIUS = 10;
/** World units per second, matching the M1 player. */
export const WING_PLAYER_SPEED = 210;

/** Security Heat is an integer in this inclusive range and never decays. */
export const MAX_SECURITY_HEAT = 100;
/** Suspicion is clamped to this inclusive range. */
export const MAX_SUSPICION = 100;
/** Heat added when a carried theft is secured by leaving its source store. */
export const SECURED_THEFT_HEAT = 15;
/** Heat added when security confiscates a carried theft. */
export const CONFISCATION_HEAT = 25;
/** Distance in world units at which a contextual shopping action is offered. */
export const WING_INTERACTION_RANGE = 42;

export type StoreId = string;
export type ShopOfferId = string;

/**
 * One deterministic, visibly rendered security sweep.
 *
 * The range, arc, centerline, sweep width, and timing are store-authored data,
 * so the central tick never carries a mall-wide security constant.
 */
export type StoreSightZone = {
  readonly origin: Vec2;
  /** Sight distance in world units. */
  readonly range: number;
  /** Full cone width in degrees. */
  readonly arcDegrees: number;
  /** Inward-facing centerline of the sweep, in radians. */
  readonly centerRadians: number;
  /** Sweep offset to either side of the centerline, in radians. */
  readonly sweepRadians: number;
  /** Ticks to travel from one sweep endpoint to the other. */
  readonly sweepTicksPerEndpoint: number;
};

/** The public threshold a stolen item must be carried across to be secured. */
export type StoreExitDefinition = {
  readonly id: string;
  readonly label: string;
  readonly bounds: Rect;
};

export type StoreDefinition = {
  readonly id: StoreId;
  readonly name: string;
  readonly bounds: Rect;
  /** Where the player is placed after confiscation, outside the storefront. */
  readonly resetPoint: Vec2;
  readonly exit: StoreExitDefinition;
  readonly sightZone: StoreSightZone;
  readonly offerIds: readonly ShopOfferId[];
};

export type ShopOfferDefinition = {
  readonly id: ShopOfferId;
  readonly storeId: StoreId;
  readonly itemDefinitionId: ItemId;
  readonly position: Vec2;
  /** Price belongs to this store offer, never to the reused combat item. */
  readonly price: number;
};

export type MallExitDefinition = {
  readonly id: string;
  readonly label: string;
  readonly bounds: Rect;
};

export type WingDefinition = {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly startingCash: number;
  readonly bounds: Rect;
  readonly playerSpawn: Vec2;
  readonly walls: readonly Rect[];
  readonly mallExit: MallExitDefinition;
  readonly stores: readonly StoreDefinition[];
  readonly offers: readonly ShopOfferDefinition[];
};

/** A store offer can be on the shelf, temporarily carried, or gone for good. */
export type ShopOfferRuntimeStatus = 'available' | 'carried' | 'consumed';

/**
 * Runtime availability of one authored offer: the authored data plus the one
 * mutable field the shopping commands own.
 */
export type ShopOfferRuntime = ShopOfferDefinition & {
  status: ShopOfferRuntimeStatus;
};

/** How an owned instance was acquired. Provenance is history, not power. */
export type AcquisitionKind = 'purchased' | 'stolen';

export type OwnedShopItem = {
  readonly instanceId: string;
  readonly itemDefinitionId: ItemId;
  readonly acquisitionKind: AcquisitionKind;
  readonly sourceStoreId: StoreId;
  readonly sourceOfferId: ShopOfferId;
  readonly acquisitionTick: number;
};

/**
 * The single unsecured stolen item the player is carrying. It is not owned
 * inventory until it is secured past its source store's public exit.
 */
export type CarriedTheft = {
  readonly itemDefinitionId: ItemId;
  readonly sourceStoreId: StoreId;
  readonly sourceOfferId: ShopOfferId;
  readonly startedTick: number;
};

export type SecuritySweepState = {
  readonly storeId: StoreId;
  facingRadians: number;
  direction: 1 | -1;
};

export type WingPlayerState = {
  x: number;
  y: number;
  radius: number;
  facing: Vec2;
};

/** Held interaction levels, so a held key cannot retrigger a command. */
export type WingHeldActions = {
  interact: boolean;
  steal: boolean;
};

/** Immutable terminal snapshot, published exactly once when the wing ends. */
export type WingSummary = {
  readonly startingCash: number;
  readonly cash: number;
  readonly purchased: readonly OwnedShopItem[];
  readonly stolen: readonly OwnedShopItem[];
  readonly heat: number;
  readonly leftTick: number;
};

export type WingStatus = 'shopping' | 'left';

export type WingState = {
  readonly seed: number;
  tick: number;
  paused: boolean;
  status: WingStatus;
  readonly wing: WingDefinition;
  /** The validated catalog the run was built from, for names and summaries. */
  readonly itemDefinitions: readonly ItemDefinition[];
  player: WingPlayerState;
  readonly startingCash: number;
  cash: number;
  /** Runtime availability, in authored offer order. */
  offers: ShopOfferRuntime[];
  inventory: OwnedShopItem[];
  carried: CarriedTheft | null;
  heat: number;
  suspicion: number;
  sweeps: SecuritySweepState[];
  nextInstanceId: number;
  nextEventId: number;
  heldActions: WingHeldActions;
  recentChange: string;
  behaviorTrace: string[];
  summary: WingSummary | null;
};

export type WingEventKind =
  | 'purchase'
  | 'theft_begin'
  | 'theft_secured'
  | 'theft_confiscated'
  | 'wing_left';

export type WingEvent = {
  readonly id: string;
  readonly kind: WingEventKind;
  readonly tick: number;
  readonly description: string;
  readonly offerId: ShopOfferId | null;
  readonly storeId: StoreId | null;
  readonly instanceId: string | null;
};

/**
 * Every shopping command reports whether the rule succeeded, so the UI never
 * has to infer the outcome from state deltas.
 */
export type WingCommandResult =
  | { readonly accepted: true; readonly event: WingEvent }
  | { readonly accepted: false; readonly reason: string };

/** Heat is a finite integer in `0..100`; anything else collapses to the range. */
export function clampSecurityHeat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_SECURITY_HEAT, Math.round(value)));
}

export function clampSuspicion(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_SUSPICION, value));
}

export function findStore(
  definition: WingDefinition,
  storeId: StoreId,
): StoreDefinition | undefined {
  return definition.stores.find((store) => store.id === storeId);
}

export function findOfferDefinition(
  definition: WingDefinition,
  offerId: ShopOfferId,
): ShopOfferDefinition | undefined {
  return definition.offers.find((offer) => offer.id === offerId);
}

export function findOfferRuntime(
  state: WingState,
  offerId: ShopOfferId,
): ShopOfferRuntime | undefined {
  return state.offers.find((offer) => offer.id === offerId);
}

export function itemDefinitionName(state: WingState, itemDefinitionId: ItemId): string {
  return (
    state.itemDefinitions.find((definition) => definition.id === itemDefinitionId)?.name ??
    itemDefinitionId
  );
}
