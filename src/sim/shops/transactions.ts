/**
 * M3A shop transactions. This pure kernel is not yet wired into the live run.
 * Construct state with createShopState; all returned state is immutable.
 * Prices are integer cents. Item behavior remains owned by the M2 compiler.
 */
export const SHOP_HEAT_CAP = 100;

export type ShopOffer = {
  readonly offerId: string;
  readonly storeId: string;
  readonly itemId: string;
  /** Globally unique authored instance ID, distinct from the starter inventory. */
  readonly instanceId: string;
  readonly priceCents: number;
  readonly heatOnSteal: number;
};

export type AcquisitionMethod = 'purchased' | 'stolen';
export type StockedShopOffer = ShopOffer & {
  readonly status: 'available' | AcquisitionMethod;
};

/** A provenance receipt; instanceId/itemId also identify the inventory grant. */
export type ShopAcquisition = {
  readonly offerId: string;
  readonly storeId: string;
  readonly itemId: string;
  readonly instanceId: string;
  readonly method: AcquisitionMethod;
  readonly pricePaidCents: number;
  /** Actual bounded increase, not the unclamped authored theft cost. */
  readonly heatAdded: number;
};

export type ShopState = {
  readonly cashCents: number;
  readonly securityHeat: number;
  readonly offers: readonly StockedShopOffer[];
  readonly acquisitions: readonly ShopAcquisition[];
};

export type ShopCommand =
  | { readonly kind: 'buy' | 'steal'; readonly offerId: string }
  | { readonly kind: 'leave' };

export type ShopRejection =
  | 'invalid-command'
  | 'unknown-offer'
  | 'offer-unavailable'
  | 'insufficient-cash';

export type ShopResult =
  | { readonly ok: true; readonly state: ShopState; readonly acquisition: ShopAcquisition | null }
  | { readonly ok: false; readonly state: ShopState; readonly reason: ShopRejection };

function requireInteger(value: number, field: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${field} must be an integer from 0 to ${maximum}`);
  }
}

function requireId(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
}

/** Validate authored economy data, copy it, and freeze the initial snapshot. */
export function createShopState(
  cashCents: number,
  offers: readonly ShopOffer[],
  securityHeat = 0,
): ShopState {
  requireInteger(cashCents, 'cashCents');
  requireInteger(securityHeat, 'securityHeat', SHOP_HEAT_CAP);
  const offerIds = new Set<string>();
  const instanceIds = new Set<string>();
  const stock: StockedShopOffer[] = offers.map((offer) => {
    for (const field of ['offerId', 'storeId', 'itemId', 'instanceId'] as const) {
      requireId(offer[field], field);
    }
    requireInteger(offer.priceCents, 'priceCents');
    requireInteger(offer.heatOnSteal, 'heatOnSteal', SHOP_HEAT_CAP);
    if (offerIds.has(offer.offerId)) throw new Error(`Duplicate offer ID: ${offer.offerId}`);
    if (instanceIds.has(offer.instanceId)) throw new Error(`Duplicate instance ID: ${offer.instanceId}`);
    offerIds.add(offer.offerId);
    instanceIds.add(offer.instanceId);
    return Object.freeze({
      offerId: offer.offerId,
      storeId: offer.storeId,
      itemId: offer.itemId,
      instanceId: offer.instanceId,
      priceCents: offer.priceCents,
      heatOnSteal: offer.heatOnSteal,
      status: 'available' as const,
    });
  });
  return Object.freeze({
    cashCents,
    securityHeat,
    offers: Object.freeze(stock),
    acquisitions: Object.freeze([] as ShopAcquisition[]),
  });
}

/**
 * Apply one discrete shop decision. Rejections and Leave return the exact old
 * state. Success returns one immutable receipt and consumes one stock entry.
 * The run adapter must validate/grant inventory and commit this result together;
 * this kernel deliberately does not touch RunState or auto-equip an item.
 */
export function transactShop(state: ShopState, command: ShopCommand): ShopResult {
  const reject = (reason: ShopRejection): ShopResult => Object.freeze({ ok: false, state, reason });
  // Runtime guard as well as a typed boundary: malformed UI input must not steal.
  if (!command || !['buy', 'steal', 'leave'].includes(command.kind)) return reject('invalid-command');
  if (command.kind === 'leave') return Object.freeze({ ok: true, state, acquisition: null });
  if (typeof command.offerId !== 'string' || command.offerId.trim().length === 0) return reject('invalid-command');

  const index = state.offers.findIndex((offer) => offer.offerId === command.offerId);
  const offer = state.offers[index];
  if (!offer) return reject('unknown-offer');
  if (offer.status !== 'available') return reject('offer-unavailable');
  if (command.kind === 'buy' && state.cashCents < offer.priceCents) return reject('insufficient-cash');

  const purchased = command.kind === 'buy';
  const method: AcquisitionMethod = purchased ? 'purchased' : 'stolen';
  const pricePaidCents = purchased ? offer.priceCents : 0;
  const securityHeat = purchased ? state.securityHeat : Math.min(SHOP_HEAT_CAP, state.securityHeat + offer.heatOnSteal);
  const acquisition: ShopAcquisition = Object.freeze({
    offerId: offer.offerId,
    storeId: offer.storeId,
    itemId: offer.itemId,
    instanceId: offer.instanceId,
    method,
    pricePaidCents,
    heatAdded: securityHeat - state.securityHeat,
  });
  const offers = state.offers.map((entry, position) =>
    position === index ? Object.freeze({ ...entry, status: method }) : entry,
  );
  const next: ShopState = Object.freeze({
    cashCents: state.cashCents - pricePaidCents,
    securityHeat,
    offers: Object.freeze(offers),
    acquisitions: Object.freeze([...state.acquisitions, acquisition]),
  });
  return Object.freeze({ ok: true, state: next, acquisition });
}
