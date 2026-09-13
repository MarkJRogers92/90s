/**
 * The five authoritative shopping commands.
 *
 * Each command either applies one rule and publishes an event, or rejects with
 * the reason the HUD should show. A rejected command never touches cash,
 * inventory, offers, Heat, suspicion, position, or status, so callers can retry
 * safely and the UI never infers success from a state delta.
 */
import { freezeDeep } from '../items/types';
import type {
  CarriedTheft,
  OwnedShopItem,
  StoreDefinition,
  WingCommandResult,
  WingEvent,
  WingEventKind,
  WingState,
} from './types';
import {
  CONFISCATION_HEAT,
  SECURED_THEFT_HEAT,
  clampSecurityHeat,
  findOfferDefinition,
  findOfferRuntime,
  findStore,
  itemDefinitionName,
} from './types';

const WING_OVER_REASON = 'The wing is over.';
const PAUSED_REASON = 'The run is paused.';
const NO_SUCH_OFFER_REASON = 'No such offer.';
const OFFER_GONE_REASON = 'That offer is already gone.';
const NOT_ENOUGH_CASH_REASON = 'Not enough cash.';
const CARRYING_REASON = 'Secure the carried item first.';
const NOT_CARRYING_REASON = 'No stolen item is being carried.';
const INSIDE_STORE_REASON = 'Exit the store before securing the item.';
const LEAVE_CARRYING_REASON = 'Secure the carried item before leaving.';

function rejected(reason: string): WingCommandResult {
  return { accepted: false, reason };
}

/** Terminal and paused states reject every shopping rule outright. */
function blockedReason(state: WingState): string | null {
  if (state.status !== 'shopping') {
    return WING_OVER_REASON;
  }
  if (state.paused) {
    return PAUSED_REASON;
  }
  return null;
}

function publish(
  state: WingState,
  kind: WingEventKind,
  description: string,
  refs: { offerId: string | null; storeId: string | null; instanceId: string | null },
): WingEvent {
  const event: WingEvent = {
    id: `wing-event-${state.nextEventId}`,
    kind,
    tick: state.tick,
    description,
    offerId: refs.offerId,
    storeId: refs.storeId,
    instanceId: refs.instanceId,
  };
  state.nextEventId += 1;
  state.recentChange = description;
  state.behaviorTrace.push(`[t${event.tick}] ${description}`);
  return event;
}

function ownedInstance(
  state: WingState,
  acquisitionKind: OwnedShopItem['acquisitionKind'],
  offer: { id: string; itemDefinitionId: string; storeId: string },
): OwnedShopItem {
  const instance: OwnedShopItem = {
    instanceId: `wing-item-${state.nextInstanceId}`,
    itemDefinitionId: offer.itemDefinitionId,
    acquisitionKind,
    sourceStoreId: offer.storeId,
    sourceOfferId: offer.id,
    acquisitionTick: state.tick,
  };
  state.nextInstanceId += 1;
  return instance;
}

/**
 * Securing requires the player to be at or past the storefront threshold, so a
 * theft can never be banked from inside the store it was taken from.
 */
function hasCrossedStoreExit(state: WingState, store: StoreDefinition): boolean {
  return state.player.y >= store.exit.bounds.y;
}

function storeOfCarriedTheft(
  state: WingState,
  carried: CarriedTheft,
): StoreDefinition | undefined {
  return findStore(state.wing, carried.sourceStoreId);
}

/** Buys one available offer when the player can afford it. */
export function buyOffer(state: WingState, offerId: string): WingCommandResult {
  const blocked = blockedReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const runtime = findOfferRuntime(state, offerId);
  const definition = findOfferDefinition(state.wing, offerId);
  const store = definition ? findStore(state.wing, definition.storeId) : undefined;
  if (!runtime || !definition || !store) {
    return rejected(NO_SUCH_OFFER_REASON);
  }
  if (runtime.status !== 'available') {
    return rejected(OFFER_GONE_REASON);
  }
  if (state.cash < definition.price) {
    return rejected(NOT_ENOUGH_CASH_REASON);
  }

  const instance = ownedInstance(state, 'purchased', definition);
  state.inventory.push(instance);
  state.cash = Math.max(0, state.cash - definition.price);
  runtime.status = 'consumed';

  const name = itemDefinitionName(state, definition.itemDefinitionId);
  const event = publish(
    state,
    'purchase',
    `Bought ${name} from ${store.name} for $${definition.price}.`,
    { offerId: definition.id, storeId: store.id, instanceId: instance.instanceId },
  );
  return { accepted: true, event };
}

/** Takes one available offer off the shelf as the single carried theft. */
export function beginTheft(state: WingState, offerId: string): WingCommandResult {
  const blocked = blockedReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const runtime = findOfferRuntime(state, offerId);
  const definition = findOfferDefinition(state.wing, offerId);
  const store = definition ? findStore(state.wing, definition.storeId) : undefined;
  if (!runtime || !definition || !store) {
    return rejected(NO_SUCH_OFFER_REASON);
  }
  if (state.carried) {
    return rejected(CARRYING_REASON);
  }
  if (runtime.status !== 'available') {
    return rejected(OFFER_GONE_REASON);
  }

  const carried: CarriedTheft = {
    itemDefinitionId: definition.itemDefinitionId,
    sourceStoreId: definition.storeId,
    sourceOfferId: definition.id,
    startedTick: state.tick,
  };
  state.carried = carried;
  runtime.status = 'carried';

  const name = itemDefinitionName(state, definition.itemDefinitionId);
  const event = publish(state, 'theft_begin', `Took ${name} from the ${store.name} shelf.`, {
    offerId: definition.id,
    storeId: store.id,
    instanceId: null,
  });
  return { accepted: true, event };
}

/**
 * Secures the carried theft once the player has crossed its source store exit,
 * adding Heat and turning the theft into owned inventory with provenance.
 */
export function secureTheft(state: WingState): WingCommandResult {
  const blocked = blockedReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const carried = state.carried;
  if (!carried) {
    return rejected(NOT_CARRYING_REASON);
  }
  const store = storeOfCarriedTheft(state, carried);
  const runtime = findOfferRuntime(state, carried.sourceOfferId);
  if (!store || !runtime) {
    return rejected(NO_SUCH_OFFER_REASON);
  }
  if (!hasCrossedStoreExit(state, store)) {
    return rejected(INSIDE_STORE_REASON);
  }

  const instance = ownedInstance(state, 'stolen', {
    id: runtime.id,
    itemDefinitionId: runtime.itemDefinitionId,
    storeId: runtime.storeId,
  });
  state.inventory.push(instance);
  runtime.status = 'consumed';
  state.carried = null;
  state.suspicion = 0;
  state.heat = clampSecurityHeat(state.heat + SECURED_THEFT_HEAT);

  const name = itemDefinitionName(state, instance.itemDefinitionId);
  const event = publish(
    state,
    'theft_secured',
    `Secured ${name} past the ${store.name} exit (+${SECURED_THEFT_HEAT} Heat).`,
    { offerId: runtime.id, storeId: store.id, instanceId: instance.instanceId },
  );
  return { accepted: true, event };
}

/**
 * Caught carrying: the offer returns to its shelf, cash is untouched, Heat
 * rises, held input clears, and the player is placed at the store reset point.
 */
export function confiscateTheft(state: WingState): WingCommandResult {
  const blocked = blockedReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const carried = state.carried;
  if (!carried) {
    return rejected(NOT_CARRYING_REASON);
  }
  const store = storeOfCarriedTheft(state, carried);
  const runtime = findOfferRuntime(state, carried.sourceOfferId);
  if (!store || !runtime) {
    return rejected(NO_SUCH_OFFER_REASON);
  }

  runtime.status = 'available';
  state.carried = null;
  state.suspicion = 0;
  state.heat = clampSecurityHeat(state.heat + CONFISCATION_HEAT);
  state.heldActions = { interact: false, steal: false };
  state.player.x = store.resetPoint.x;
  state.player.y = store.resetPoint.y;

  const name = itemDefinitionName(state, runtime.itemDefinitionId);
  const event = publish(
    state,
    'theft_confiscated',
    `${name} was confiscated back to ${store.name} (+${CONFISCATION_HEAT} Heat).`,
    { offerId: runtime.id, storeId: store.id, instanceId: null },
  );
  return { accepted: true, event };
}

/**
 * Ends the wing exactly once and publishes the immutable terminal summary
 * grouped by acquisition kind.
 */
export function leaveWing(state: WingState): WingCommandResult {
  const blocked = blockedReason(state);
  if (blocked) {
    return rejected(blocked);
  }
  if (state.carried) {
    return rejected(LEAVE_CARRYING_REASON);
  }

  const purchased = state.inventory
    .filter((item) => item.acquisitionKind === 'purchased')
    .map((item) => ({ ...item }));
  const stolen = state.inventory
    .filter((item) => item.acquisitionKind === 'stolen')
    .map((item) => ({ ...item }));

  state.status = 'left';
  state.summary = freezeDeep({
    startingCash: state.startingCash,
    cash: state.cash,
    purchased,
    stolen,
    heat: clampSecurityHeat(state.heat),
    leftTick: state.tick,
  });

  const event = publish(
    state,
    'wing_left',
    `Left the wing with ${purchased.length} purchased and ${stolen.length} stolen items.`,
    { offerId: null, storeId: null, instanceId: null },
  );
  return { accepted: true, event };
}
