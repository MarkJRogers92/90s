/**
 * The M5 run economy: M3 shopping rules layered with the two M5 capabilities.
 *
 * The run reuses the M3 authored constants instead of re-declaring them, so a
 * later tuning pass cannot make the run and the shopping loop disagree. Every
 * command either applies one rule or rejects with the reason the HUD shows, and
 * a rejected command leaves cash, Heat, suspicion, offers, inventory, and the
 * player untouched.
 */
import { hasLineOfSight } from '../combat/collision';
import type { InventoryLeaf } from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import type { ItemCapability, ItemDefinition, ItemId } from '../items/types';
import type { Vec2 } from '../model';
import { isPointInSightCone, securityFacingAtTick } from '../shop/security';
import { crossedStoreExit } from '../shop/tickWingRun';
import {
  CONFISCATION_HEAT,
  MAX_SECURITY_HEAT,
  MAX_SUSPICION,
  SECURED_THEFT_HEAT,
  WING_INTERACTION_RANGE,
  clampSecurityHeat,
  clampSuspicion,
} from '../shop/types';
import type { CarriedTheft, StoreDefinition } from '../shop/types';
import type { WingOffer, WingRoomDefinition, WingStoreInstance } from '../wing/types';
import { refreshRunLoadout } from './loadout';
import type { MvpCommandResult, MvpRunState } from './types';

/**
 * The run's authored numbers, imported from M3 rather than re-declared. The
 * unit suite asserts each one still equals its M3 definition.
 */
export const RUN_SECURED_THEFT_HEAT = SECURED_THEFT_HEAT;
export const RUN_CONFISCATION_HEAT = CONFISCATION_HEAT;
export const RUN_MAX_SUSPICION = MAX_SUSPICION;
export const RUN_MAX_SECURITY_HEAT = MAX_SECURITY_HEAT;
export const RUN_INTERACTION_RANGE = WING_INTERACTION_RANGE;

/** Receipt Wallet: each lawful purchase costs this much less, down to the floor. */
export const RUN_SHOP_DISCOUNT = 2;
/** No lawful purchase ever costs less than this. */
export const RUN_PRICE_FLOOR = 1;
/** Reinforced Fanny Pack: secures this much less Heat per theft. */
export const RUN_SMUGGLE_POUCH_HEAT_REDUCTION = 5;
/** Unsecured thefts a player may carry without the pouch. */
export const RUN_BASE_CARRY_LIMIT = 1;
/** Extra concurrent thefts the smuggle_pouch capability allows. */
export const RUN_SMUGGLE_POUCH_CARRY_BONUS = 1;

const DEFINITIONS_BY_ID = new Map<ItemId, ItemDefinition>(
  ITEM_CATALOG.map((definition) => [definition.id, definition]),
);

const RUN_OVER_REASON = 'The run is over.';
const PAUSED_REASON = 'The run is paused.';
const NO_SUCH_OFFER_REASON = 'No such offer.';
const OFFER_GONE_REASON = 'That offer is already gone.';
const NOT_ENOUGH_CASH_REASON = 'Not enough cash.';
const CARRY_LIMIT_REASON = 'Hands are full: secure the carried item first.';
const NOT_CARRYING_REASON = 'No stolen item is being carried.';
/** The M3 wording, reused so a run refusal reads exactly like the shop one. */
const INSIDE_STORE_REASON = 'Exit the store before securing the item.';

function rejected(reason: string): MvpCommandResult {
  return { accepted: false, reason };
}

/** Terminal and paused runs reject every shopping rule outright. */
export function blockedRunReason(state: MvpRunState): string | null {
  if (state.status !== 'playing') {
    return RUN_OVER_REASON;
  }
  if (state.paused) {
    return PAUSED_REASON;
  }
  return null;
}

/** Records one readable line in the run's change log and behaviour trace. */
export function publishRunFeedback(
  state: MvpRunState,
  feedback: string,
  updateRecentChange = true,
): void {
  if (updateRecentChange) {
    state.recentChange = feedback;
  }
  state.behaviorTrace.push(`[t${state.tick}] ${feedback}`);
}

export function itemDefinitionName(itemDefinitionId: ItemId): string {
  return DEFINITIONS_BY_ID.get(itemDefinitionId)?.name ?? itemDefinitionId;
}

/** Every owned definition, including the two halves of an Emitter Mount. */
function ownedDefinitionIds(state: MvpRunState): Set<ItemId> {
  const ids = new Set<ItemId>();
  for (const node of state.inventory.inventory) {
    if (node.kind === 'leaf') {
      ids.add(node.itemDefinitionId);
      continue;
    }
    ids.add(node.primary.itemDefinitionId);
    ids.add(node.carrier.itemDefinitionId);
  }
  return ids;
}

/** True when any owned instance declares the capability. */
export function runOwnsCapability(state: MvpRunState, capability: ItemCapability): boolean {
  for (const itemDefinitionId of ownedDefinitionIds(state)) {
    if (DEFINITIONS_BY_ID.get(itemDefinitionId)?.capabilities?.includes(capability) === true) {
      return true;
    }
  }
  return false;
}

/** Receipt Wallet: two dollars off each lawful purchase. */
export function runPurchaseDiscount(state: MvpRunState): number {
  return runOwnsCapability(state, 'shop_discount') ? RUN_SHOP_DISCOUNT : 0;
}

/** One unsecured theft, plus one while the smuggle_pouch capability is owned. */
export function runCarryLimit(state: MvpRunState): number {
  return (
    RUN_BASE_CARRY_LIMIT +
    (runOwnsCapability(state, 'smuggle_pouch') ? RUN_SMUGGLE_POUCH_CARRY_BONUS : 0)
  );
}

/** The discounted price of one authored offer, never below the floor. */
export function runOfferPrice(state: MvpRunState, offer: WingOffer): number {
  return Math.max(RUN_PRICE_FLOOR, offer.price - runPurchaseDiscount(state));
}

/**
 * The one price string the HUD offer card and the view's world label both
 * render, so the two can never show a different number for the same offer.
 */
export function runOfferPriceLabel(state: MvpRunState, offer: WingOffer): string {
  return `$${runOfferPrice(state, offer)}`;
}

/** The authored offer behind an id, anywhere in the wing. */
export function findWingOffer(state: MvpRunState, offerId: string): WingOffer | undefined {
  for (const room of state.wing.rooms) {
    const offer = room.offers.find((candidate) => candidate.id === offerId);
    if (offer) {
      return offer;
    }
  }
  return undefined;
}

/** The room that authors an offer, so provenance can name its store template. */
export function roomOfOffer(state: MvpRunState, offerId: string): WingRoomDefinition | undefined {
  return state.wing.rooms.find((room) =>
    room.offers.some((offer) => offer.id === offerId),
  );
}

/** The M3 store shape behind a generated M5 storefront. */
export function storeDefinitionOf(store: WingStoreInstance): StoreDefinition {
  return {
    id: store.templateId,
    name: store.name,
    bounds: store.bounds,
    resetPoint: store.resetPoint,
    exit: store.exit,
    sightZone: store.sightZone,
    offerIds: store.offerIds,
  };
}

/** The generated storefront that authored a theft's source store, anywhere in the wing. */
function wingStoreFor(state: MvpRunState, templateId: string): WingStoreInstance | null {
  for (const room of state.wing.rooms) {
    if (room.store !== null && room.store.templateId === templateId) {
      return room.store;
    }
  }
  return null;
}

function withInventory(
  state: MvpRunState,
  inventory: MvpRunState['inventory']['inventory'],
): void {
  state.inventory = {
    ...state.inventory,
    inventory,
    cash: state.cash,
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
}

/** Keeps the wrapped fusion inventory's cash equal to the run's authoritative cash. */
function syncInventoryCash(state: MvpRunState): void {
  if (state.inventory.cash !== state.cash) {
    state.inventory = { ...state.inventory, cash: state.cash };
  }
}

/** Buys one available offer when the discounted price is affordable. */
export function buyRunOffer(state: MvpRunState, offerId: string): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const offer = findWingOffer(state, offerId);
  if (!offer) {
    return rejected(NO_SUCH_OFFER_REASON);
  }
  if ((state.offerStatus[offer.id] ?? 'available') !== 'available') {
    return rejected(OFFER_GONE_REASON);
  }
  const price = runOfferPrice(state, offer);
  if (state.cash < price) {
    return rejected(NOT_ENOUGH_CASH_REASON);
  }

  const room = roomOfOffer(state, offer.id);
  const leaf: InventoryLeaf = {
    kind: 'leaf',
    instanceId: `mvp-purchased-${offer.id}`,
    itemDefinitionId: offer.itemDefinitionId,
    acquisitionKind: 'purchased',
    sourceLocationId: room?.store?.templateId ?? offer.storeId,
    sourceStockId: offer.id,
    acquisitionTick: state.tick,
  };
  state.cash -= price;
  state.offerStatus[offer.id] = 'consumed';
  withInventory(state, [...state.inventory.inventory, leaf]);

  const message = `Bought ${itemDefinitionName(offer.itemDefinitionId)} for $${price}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** Takes one available offer off the shelf while the carry limit allows it. */
export function beginRunTheft(state: MvpRunState, offerId: string): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const offer = findWingOffer(state, offerId);
  if (!offer) {
    return rejected(NO_SUCH_OFFER_REASON);
  }
  if (state.carried.length >= runCarryLimit(state)) {
    return rejected(CARRY_LIMIT_REASON);
  }
  if ((state.offerStatus[offer.id] ?? 'available') !== 'available') {
    return rejected(OFFER_GONE_REASON);
  }

  state.carried.push({
    itemDefinitionId: offer.itemDefinitionId,
    sourceStoreId: offer.storeId,
    sourceOfferId: offer.id,
    startedTick: state.tick,
  });
  state.offerStatus[offer.id] = 'carried';

  const message = `Took ${itemDefinitionName(offer.itemDefinitionId)} off the shelf.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Secures every carried theft from one store as a `stolen` leaf once the
 * player has crossed that store's public exit. The smuggle_pouch capability
 * shaves five Heat off each secured theft, and Heat never drops below zero.
 *
 * Securing mirrors the M3 `secureTheft` rule: the player must have physically
 * crossed that theft's source store exit this tick, so a carried theft can
 * never be banked from inside the store it was taken from. The crossing uses
 * the shared M3 geometry helper instead of a second exit rule.
 */
export function secureRunThefts(
  state: MvpRunState,
  store: WingStoreInstance,
  previousPosition: Vec2 = state.room.combat.player,
): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const held = state.carried.filter((theft) => theft.sourceStoreId === store.templateId);
  if (held.length === 0) {
    return rejected(NOT_CARRYING_REASON);
  }

  const player = state.room.combat.player;
  if (!crossedStoreExit(previousPosition, player, player.radius, storeDefinitionOf(store))) {
    return rejected(INSIDE_STORE_REASON);
  }

  const leaves: InventoryLeaf[] = held.map((theft) => ({
    kind: 'leaf',
    instanceId: `mvp-stolen-${theft.sourceOfferId}`,
    itemDefinitionId: theft.itemDefinitionId,
    acquisitionKind: 'stolen',
    sourceLocationId: store.templateId,
    sourceStockId: theft.sourceOfferId,
    acquisitionTick: state.tick,
  }));
  for (const theft of held) {
    state.offerStatus[theft.sourceOfferId] = 'consumed';
  }
  state.carried = state.carried.filter((theft) => theft.sourceStoreId !== store.templateId);

  const heatPerTheft = Math.max(
    0,
    RUN_SECURED_THEFT_HEAT -
      (runOwnsCapability(state, 'smuggle_pouch') ? RUN_SMUGGLE_POUCH_HEAT_REDUCTION : 0),
  );
  state.heat = clampSecurityHeat(state.heat + held.length * heatPerTheft);
  state.suspicion = 0;
  withInventory(state, [...state.inventory.inventory, ...leaves]);

  const message = `Secured ${held.length} item${held.length === 1 ? '' : 's'} past the ${store.name} exit (+${held.length * heatPerTheft} Heat).`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Sweep contact: every carried theft from the sweeping store goes back to its
 * shelf, Heat rises, held input clears, and the player is placed at the store
 * reset point.
 */
export function confiscateRunThefts(
  state: MvpRunState,
  store: WingStoreInstance,
): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const held = state.carried.filter((theft) => theft.sourceStoreId === store.templateId);
  if (held.length === 0) {
    return rejected(NOT_CARRYING_REASON);
  }

  for (const theft of held) {
    state.offerStatus[theft.sourceOfferId] = 'available';
  }
  state.carried = state.carried.filter((theft) => theft.sourceStoreId !== store.templateId);
  state.suspicion = 0;
  state.heat = clampSecurityHeat(state.heat + RUN_CONFISCATION_HEAT);
  state.heldActions = { interact: false, steal: false, recall: false };
  state.room.combat.player.x = store.resetPoint.x;
  state.room.combat.player.y = store.resetPoint.y;
  syncInventoryCash(state);

  const message = `Confiscated ${held.length} item${held.length === 1 ? '' : 's'} back to ${store.name} (+${RUN_CONFISCATION_HEAT} Heat).`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** True only when the current store sweep contains an unobstructed player. */
export function canRunSecuritySeePlayer(
  state: MvpRunState,
  store: WingStoreInstance,
): boolean {
  const facingRadians = securityFacingAtTick(store.sightZone, state.tick);
  const { origin, range, arcDegrees } = store.sightZone;
  const player = state.room.combat.player;

  return (
    isPointInSightCone(origin, facingRadians, player, range, arcDegrees) &&
    hasLineOfSight(
      origin.x,
      origin.y,
      player.x,
      player.y,
      state.room.combat.walls,
    )
  );
}

/**
 * Mirrors the M3 sweep inside the run: a seen carried theft raises suspicion
 * toward the authored cap, hiding from the sweep lowers it, and full suspicion
 * confiscates everything the sweeping store is missing.
 *
 * Like M3, the sweep is resolved from the carried theft's source store rather
 * than from the room the player happens to stand in, so a theft carried into
 * another room keeps rising, falling, and confiscating instead of freezing.
 */
export function updateRunSuspicion(
  state: MvpRunState,
  preserveActionFeedback = false,
): void {
  if (state.carried.length === 0) {
    state.suspicion = 0;
    return;
  }
  const currentStore = state.wing.rooms[state.roomIndex]?.store ?? null;
  const store =
    currentStore !== null &&
    state.carried.some((theft) => theft.sourceStoreId === currentStore.templateId)
      ? currentStore
      : wingStoreFor(state, state.carried[0]!.sourceStoreId);
  if (!store) {
    return;
  }

  if (canRunSecuritySeePlayer(state, store)) {
    const gain = 0.5 * (1 + state.heat / 100);
    state.suspicion = clampSuspicion(state.suspicion + gain);
    publishRunFeedback(state, 'Seen by security.', !preserveActionFeedback);
  } else {
    state.suspicion = clampSuspicion(state.suspicion - 0.75);
    publishRunFeedback(state, 'Hidden from security.', !preserveActionFeedback);
  }

  if (state.suspicion >= RUN_MAX_SUSPICION) {
    confiscateRunThefts(state, store);
  }
}

/** The carried thefts a store is missing, for summaries and HUDs. */
export function carriedTheftsFrom(state: MvpRunState, storeTemplateId: string): CarriedTheft[] {
  return state.carried.filter((theft) => theft.sourceStoreId === storeTemplateId);
}
