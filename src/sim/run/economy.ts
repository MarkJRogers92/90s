/**
 * The M5 run economy: M3 shopping rules layered with the two M5 capabilities.
 *
 * The run reuses the M3 authored constants instead of re-declaring them, so a
 * later tuning pass cannot make the run and the shopping loop disagree. Every
 * command either applies one rule or rejects with the reason the HUD shows, and
 * a rejected command leaves cash, Heat, suspicion, offers, inventory, and the
 * player untouched.
 */
import { definitionFor } from '../items/registry';
import type { InventoryLeaf } from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import type { ItemCapability, ItemDefinition, ItemId } from '../items/types';
import type { Vec2 } from '../model';
import { crossedStoreExit } from '../shop/tickWingRun';
import {
  MAX_SECURITY_HEAT,
  WING_INTERACTION_RANGE,
  clampSecurityHeat,
} from '../shop/types';
import type { CarriedTheft, StoreDefinition } from '../shop/types';
import type { WingOffer, WingRoomDefinition, WingStoreInstance } from '../wing/types';
import { refreshRunLoadout } from './loadout';
import type { MvpCommandResult, MvpRunState } from './types';
import { blueLightOfferId } from './roomEvents';
import { HEAT_PER_STAR, WANTED_SURCHARGE_PER_STAR, applyHeatFloor, wantedStars } from './wanted';

/**
 * One secured theft is one wanted star. The run's theft no longer mirrors the
 * M3 camera loop (see heist.ts); the Heat cap and interaction range still do.
 */
export const RUN_SECURED_THEFT_HEAT = HEAT_PER_STAR;
export const RUN_MAX_SECURITY_HEAT = MAX_SECURITY_HEAT;
export const RUN_INTERACTION_RANGE = WING_INTERACTION_RANGE;

/** Receipt Wallet: each lawful purchase costs this much less, down to the floor. */
export const RUN_SHOP_DISCOUNT = 2;
/** No lawful purchase ever costs less than this. */
export const RUN_PRICE_FLOOR = 1;
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
  return (DEFINITIONS_BY_ID.get(itemDefinitionId) ?? definitionFor(itemDefinitionId))?.name ?? itemDefinitionId;
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

/** True when a hybrid (not an Emitter Mount) has this item fused into it. */
function hybridOwns(state: MvpRunState, itemDefinitionId: ItemId): boolean {
  return state.inventory.inventory.some(
    (node) => node.kind === 'composite' && node.recipeId === 'hybrid'
      && (node.primary.itemDefinitionId === itemDefinitionId || node.carrier.itemDefinitionId === itemDefinitionId),
  );
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
  if (!runOwnsCapability(state, 'shop_discount')) return 0;
  // Fused into anything, the wallet is overclocked: a dollar more off.
  return RUN_SHOP_DISCOUNT + (hybridOwns(state, 'receipt_wallet') ? 1 : 0);
}

/** One unsecured theft, plus one while the smuggle_pouch capability is owned. */
export function runCarryLimit(state: MvpRunState): number {
  return (
    RUN_BASE_CARRY_LIMIT +
    (runOwnsCapability(state, 'smuggle_pouch') ? RUN_SMUGGLE_POUCH_CARRY_BONUS + (hybridOwns(state, 'fanny_pack') ? 1 : 0) : 0)
  );
}

/** The discounted price of one authored offer, never below the floor. */
export function runOfferPrice(state: MvpRunState, offer: WingOffer): number {
  // A wanted janitor pays a surcharge: two dollars a star.
  const price = offer.price + wantedStars(state.heat) * WANTED_SURCHARGE_PER_STAR - runPurchaseDiscount(state);
  // BLUE LIGHT SPECIAL: this shift's one half-price item.
  const special = blueLightOfferId(state) === offer.id;
  return Math.max(RUN_PRICE_FLOOR, special ? Math.ceil(price / 2) : price);
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
    sourceLocationId: offer.storeId,
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
 * player has crossed that store's public exit. Each is one wanted star, and
 * each stolen item held keeps the janitor at least that wanted (hot goods).
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

  const heatPerTheft = RUN_SECURED_THEFT_HEAT;
  state.heat = clampSecurityHeat(state.heat + held.length * heatPerTheft);
  state.suspicion = 0;
  withInventory(state, [...state.inventory.inventory, ...leaves]);
  // Hot goods: each stolen item now held keeps the janitor a star wanted.
  applyHeatFloor(state);

  const message = `Secured ${held.length} item${held.length === 1 ? '' : 's'} past the ${store.name} exit (+${held.length * heatPerTheft} Heat).`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** The carried thefts a store is missing, for summaries and HUDs. */
export function carriedTheftsFrom(state: MvpRunState, storeTemplateId: string): CarriedTheft[] {
  return state.carried.filter((theft) => theft.sourceStoreId === storeTemplateId);
}
