import { beforeEach, describe, expect, it } from 'vitest';
import { M3_WING } from '../../src/sim/shop/catalog';
import {
  beginTheft,
  buyOffer,
  confiscateTheft,
  leaveWing,
  secureTheft,
} from '../../src/sim/shop/commands';
import { createWingRun } from '../../src/sim/shop/createWingRun';
import type { ShopOfferRuntimeStatus, WingState } from '../../src/sim/shop/types';

let state: WingState;

beforeEach(() => {
  state = createWingRun(11);
});

function snapshot(current: WingState = state): string {
  return JSON.stringify(current);
}

function statusOf(offerId: string, current: WingState = state): ShopOfferRuntimeStatus | undefined {
  return current.offers.find((offer) => offer.id === offerId)?.status;
}

/** Places the player in the public corridor past the homestyle storefront. */
function standOutsideHomestyle(): void {
  state.player.x = 240;
  state.player.y = 340;
}

describe('createWingRun', () => {
  it('starts a fresh shopping run with authored cash and no ownership', () => {
    expect(state.seed).toBe(11);
    expect(state.tick).toBe(0);
    expect(state.paused).toBe(false);
    expect(state.status).toBe('shopping');
    expect(state.wing).toBe(M3_WING);
    expect(state.startingCash).toBe(30);
    expect(state.cash).toBe(30);
    expect(state.inventory).toEqual([]);
    expect(state.carried).toBeNull();
    expect(state.heat).toBe(0);
    expect(state.suspicion).toBe(0);
    expect(state.summary).toBeNull();
    expect(state.behaviorTrace).toEqual([]);
    expect(state.offers).toHaveLength(8);
    expect(state.offers.every((offer) => offer.status === 'available')).toBe(true);
    expect(state.sweeps).toHaveLength(2);
    expect(state.heldActions).toEqual({ interact: false, steal: false });
    expect(state.player).toMatchObject({ x: 480, y: 390, radius: 10 });
  });

  it('creates identical runs for the same seed', () => {
    expect(snapshot(createWingRun(1997))).toBe(snapshot(createWingRun(1997)));
  });
});

describe('buyOffer', () => {
  it('deducts exact cash and records complete purchase provenance', () => {
    const bought = buyOffer(state, 'homestyle-mop');

    expect(bought.accepted).toBe(true);
    expect(state.cash).toBe(20);
    expect(state.inventory[0]).toMatchObject({
      instanceId: 'wing-item-1',
      itemDefinitionId: 'janitor_mop',
      acquisitionKind: 'purchased',
      sourceStoreId: 'homestyle',
      sourceOfferId: 'homestyle-mop',
      acquisitionTick: 0,
    });
    expect(statusOf('homestyle-mop')).toBe('consumed');
    expect(state.behaviorTrace).toHaveLength(1);
    expect(state.recentChange).toContain('Associate-Issue Mop');

    if (!bought.accepted) {
      throw new Error('Expected an accepted purchase');
    }
    expect(bought.event).toMatchObject({
      id: 'wing-event-1',
      kind: 'purchase',
      tick: 0,
      offerId: 'homestyle-mop',
      storeId: 'homestyle',
      instanceId: 'wing-item-1',
    });
  });

  it('numbers owned instances in acquisition order', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(buyOffer(state, 'homestyle-gel-pens').accepted).toBe(true);

    expect(state.cash).toBe(12);
    expect(state.inventory.map((item) => item.instanceId)).toEqual([
      'wing-item-1',
      'wing-item-2',
    ]);
  });

  it('records the acquisition tick instead of assuming tick zero', () => {
    state.tick = 7;
    expect(buyOffer(state, 'homestyle-gel-pens').accepted).toBe(true);
    expect(state.inventory[0]).toMatchObject({ instanceId: 'wing-item-1', acquisitionTick: 7 });
  });

  it('rejects a purchase beyond available cash without changing state', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    const afterPurchase = snapshot();

    expect(buyOffer(state, 'future-rewinder')).toEqual({ accepted: false, reason: 'Not enough cash.' });
    expect(snapshot()).toBe(afterPurchase);
    expect(state.cash).toBe(20);
    expect(state.inventory).toHaveLength(1);
  });

  it('rejects an unknown offer', () => {
    const before = snapshot();
    expect(buyOffer(state, 'homestyle-lamp')).toEqual({ accepted: false, reason: 'No such offer.' });
    expect(snapshot()).toBe(before);
  });

  it('rejects buying the same shelf twice', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    const before = snapshot();

    expect(buyOffer(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'That offer is already gone.',
    });
    expect(snapshot()).toBe(before);
    expect(state.cash).toBe(20);
  });

  it('rejects buying an offer that is currently carried', () => {
    expect(beginTheft(state, 'homestyle-mop').accepted).toBe(true);
    const before = snapshot();

    expect(buyOffer(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'That offer is already gone.',
    });
    expect(snapshot()).toBe(before);
  });

  it('never spends below zero on an exact-cash purchase', () => {
    state.cash = 10;
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(state.cash).toBe(0);
    expect(buyOffer(state, 'homestyle-gel-pens')).toEqual({
      accepted: false,
      reason: 'Not enough cash.',
    });
    expect(state.cash).toBe(0);
  });
});

describe('beginTheft and secureTheft', () => {
  it('begins a theft by emptying the shelf and carrying factual provenance', () => {
    const begun = beginTheft(state, 'homestyle-gel-pens');

    expect(begun.accepted).toBe(true);
    expect(statusOf('homestyle-gel-pens')).toBe('carried');
    expect(state.carried).toEqual({
      itemDefinitionId: 'gel_pens',
      sourceStoreId: 'homestyle',
      sourceOfferId: 'homestyle-gel-pens',
      startedTick: 0,
    });
    expect(state.inventory).toEqual([]);
    expect(state.cash).toBe(30);

    if (!begun.accepted) {
      throw new Error('Expected an accepted theft');
    }
    expect(begun.event).toMatchObject({
      id: 'wing-event-1',
      kind: 'theft_begin',
      offerId: 'homestyle-gel-pens',
      storeId: 'homestyle',
      instanceId: null,
    });
  });

  it('enforces one carried item at a time without touching state', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    const before = snapshot();

    expect(beginTheft(state, 'future-soaker')).toEqual({
      accepted: false,
      reason: 'Secure the carried item first.',
    });
    expect(beginTheft(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'Secure the carried item first.',
    });
    expect(snapshot()).toBe(before);
    expect(statusOf('future-soaker')).toBe('available');
  });

  it('rejects beginning a theft on an unknown or consumed offer', () => {
    expect(beginTheft(state, 'homestyle-lamp')).toEqual({
      accepted: false,
      reason: 'No such offer.',
    });

    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    const before = snapshot();
    expect(beginTheft(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'That offer is already gone.',
    });
    expect(snapshot()).toBe(before);
  });

  it('rejects securing while the player is still inside the store', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    state.player.x = 240;
    state.player.y = 200;
    const before = snapshot();

    expect(secureTheft(state)).toEqual({
      accepted: false,
      reason: 'Exit the store before securing the item.',
    });
    expect(snapshot()).toBe(before);
    expect(statusOf('homestyle-gel-pens')).toBe('carried');
  });

  it('secures a theft after the player crosses the store exit', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    standOutsideHomestyle();

    const secured = secureTheft(state);
    expect(secured.accepted).toBe(true);
    expect(statusOf('homestyle-gel-pens')).toBe('consumed');
    expect(state.carried).toBeNull();
    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0]).toMatchObject({
      instanceId: 'wing-item-1',
      itemDefinitionId: 'gel_pens',
      acquisitionKind: 'stolen',
      sourceStoreId: 'homestyle',
      sourceOfferId: 'homestyle-gel-pens',
      acquisitionTick: 0,
    });
    expect(state.heat).toBe(15);
    expect(state.cash).toBe(30);

    if (!secured.accepted) {
      throw new Error('Expected an accepted securing');
    }
    expect(secured.event).toMatchObject({
      kind: 'theft_secured',
      offerId: 'homestyle-gel-pens',
      storeId: 'homestyle',
      instanceId: 'wing-item-1',
    });
  });

  it('rejects securing when nothing is carried', () => {
    const before = snapshot();
    expect(secureTheft(state)).toEqual({
      accepted: false,
      reason: 'No stolen item is being carried.',
    });
    expect(snapshot()).toBe(before);
  });

  it('never secures the same theft twice', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    standOutsideHomestyle();
    expect(secureTheft(state).accepted).toBe(true);
    const before = snapshot();

    expect(secureTheft(state)).toEqual({
      accepted: false,
      reason: 'No stolen item is being carried.',
    });
    expect(snapshot()).toBe(before);
    expect(state.inventory).toHaveLength(1);
    expect(state.heat).toBe(15);
  });

  it('clamps securing Heat at the maximum', () => {
    state.heat = 92;
    expect(beginTheft(state, 'future-soaker').accepted).toBe(true);
    state.player.x = 720;
    state.player.y = 340;

    expect(secureTheft(state).accepted).toBe(true);
    expect(state.heat).toBe(100);
  });

  it('keeps instance ids unique across purchases and secured thefts', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    expect(confiscateTheft(state).accepted).toBe(true);
    expect(beginTheft(state, 'homestyle-bubble-bath').accepted).toBe(true);
    standOutsideHomestyle();
    expect(secureTheft(state).accepted).toBe(true);

    expect(state.inventory.map((item) => item.instanceId)).toEqual([
      'wing-item-1',
      'wing-item-2',
    ]);
    expect(state.inventory.map((item) => item.itemDefinitionId)).toEqual([
      'janitor_mop',
      'bubble_bath',
    ]);
  });
});

describe('confiscateTheft', () => {
  it('returns the offer, preserves cash, raises Heat, and resets the player', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    state.suspicion = 100;
    state.heat = 5;
    state.heldActions = { interact: true, steal: true };
    state.player.x = 300;
    state.player.y = 120;

    const confiscated = confiscateTheft(state);

    expect(confiscated.accepted).toBe(true);
    expect(statusOf('homestyle-gel-pens')).toBe('available');
    expect(state.carried).toBeNull();
    expect(state.cash).toBe(20);
    expect(state.heat).toBe(30);
    expect(state.suspicion).toBe(0);
    expect(state.inventory.map((item) => item.itemDefinitionId)).toEqual(['janitor_mop']);
    expect(state.heldActions).toEqual({ interact: false, steal: false });
    expect(state.player).toMatchObject({ x: 240, y: 340 });

    if (!confiscated.accepted) {
      throw new Error('Expected an accepted confiscation');
    }
    expect(confiscated.event).toMatchObject({
      kind: 'theft_confiscated',
      offerId: 'homestyle-gel-pens',
      storeId: 'homestyle',
      instanceId: null,
    });
  });

  it('rejects confiscation when nothing is carried', () => {
    const before = snapshot();
    expect(confiscateTheft(state)).toEqual({
      accepted: false,
      reason: 'No stolen item is being carried.',
    });
    expect(snapshot()).toBe(before);
  });

  it('clamps confiscation Heat at the maximum', () => {
    state.heat = 90;
    expect(beginTheft(state, 'future-globe').accepted).toBe(true);
    expect(confiscateTheft(state).accepted).toBe(true);
    expect(state.heat).toBe(100);
  });

  it('keeps Heat across attempts without decaying it', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    expect(confiscateTheft(state).accepted).toBe(true);
    expect(state.heat).toBe(25);

    expect(beginTheft(state, 'future-soaker').accepted).toBe(true);
    state.player.x = 720;
    state.player.y = 340;
    expect(secureTheft(state).accepted).toBe(true);
    expect(state.heat).toBe(40);
  });
});

describe('leaveWing', () => {
  it('refuses to leave while an unsecured theft is carried', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    const before = snapshot();

    expect(leaveWing(state)).toEqual({
      accepted: false,
      reason: 'Secure the carried item before leaving.',
    });
    expect(snapshot()).toBe(before);
    expect(state.status).toBe('shopping');
  });

  it('leaves once with an immutable summary grouped by provenance', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    standOutsideHomestyle();
    expect(secureTheft(state).accepted).toBe(true);

    const left = leaveWing(state);
    expect(left.accepted).toBe(true);
    expect(state.status).toBe('left');
    expect(state.summary).toEqual({
      startingCash: 30,
      cash: 20,
      purchased: [state.inventory[0]],
      stolen: [state.inventory[1]],
      heat: 15,
      leftTick: 0,
    });
    expect(state.summary?.purchased.map((item) => item.itemDefinitionId)).toEqual(['janitor_mop']);
    expect(state.summary?.stolen.map((item) => item.itemDefinitionId)).toEqual(['gel_pens']);
    expect(Object.isFrozen(state.summary)).toBe(true);
    expect(Object.isFrozen(state.summary?.purchased)).toBe(true);
  });

  it('leaves an untouched wing with a complete empty summary', () => {
    expect(leaveWing(state).accepted).toBe(true);

    expect(state.summary).toEqual({
      startingCash: 30,
      cash: 30,
      purchased: [],
      stolen: [],
      heat: 0,
      leftTick: 0,
    });
  });

  it('publishes the terminal summary exactly once', () => {
    expect(leaveWing(state).accepted).toBe(true);
    const summary = state.summary;
    const before = snapshot();

    expect(leaveWing(state)).toEqual({ accepted: false, reason: 'The wing is over.' });
    expect(snapshot()).toBe(before);
    expect(state.summary).toBe(summary);
    expect(state.behaviorTrace.filter((entry) => entry.includes('Left the wing'))).toHaveLength(1);
  });
});

describe('terminal and paused state', () => {
  it('rejects every shopping command after the wing is left', () => {
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    standOutsideHomestyle();
    expect(secureTheft(state).accepted).toBe(true);
    expect(buyOffer(state, 'future-nozzle').accepted).toBe(true);
    expect(leaveWing(state).accepted).toBe(true);
    const before = snapshot();

    expect(buyOffer(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'The wing is over.',
    });
    expect(beginTheft(state, 'future-globe')).toEqual({
      accepted: false,
      reason: 'The wing is over.',
    });
    expect(secureTheft(state)).toEqual({ accepted: false, reason: 'The wing is over.' });
    expect(confiscateTheft(state)).toEqual({ accepted: false, reason: 'The wing is over.' });
    expect(leaveWing(state)).toEqual({ accepted: false, reason: 'The wing is over.' });
    expect(snapshot()).toBe(before);
  });

  it('rejects commands while paused without changing state', () => {
    state.paused = true;
    const before = snapshot();

    expect(buyOffer(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'The run is paused.',
    });
    expect(beginTheft(state, 'homestyle-mop')).toEqual({
      accepted: false,
      reason: 'The run is paused.',
    });
    expect(secureTheft(state)).toEqual({ accepted: false, reason: 'The run is paused.' });
    expect(confiscateTheft(state)).toEqual({ accepted: false, reason: 'The run is paused.' });
    expect(leaveWing(state)).toEqual({ accepted: false, reason: 'The run is paused.' });
    expect(snapshot()).toBe(before);
  });
});

describe('offer conservation and provenance', () => {
  it('accounts for all eight offers across a mixed sequence', () => {
    expect(buyOffer(state, 'homestyle-mop').accepted).toBe(true);
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    standOutsideHomestyle();
    expect(secureTheft(state).accepted).toBe(true);
    expect(beginTheft(state, 'future-soaker').accepted).toBe(true);
    expect(confiscateTheft(state).accepted).toBe(true);

    const statuses = state.offers.map((offer) => offer.status);
    expect(statuses).toHaveLength(8);
    expect(statuses.filter((status) => status === 'available')).toHaveLength(6);
    expect(statuses.filter((status) => status === 'consumed')).toHaveLength(2);
    expect(statuses.filter((status) => status === 'carried')).toHaveLength(0);

    for (const item of state.inventory) {
      const offer = state.offers.find((candidate) => candidate.id === item.sourceOfferId);
      expect(offer?.status).toBe('consumed');
      expect(offer?.itemDefinitionId).toBe(item.itemDefinitionId);
      expect(offer?.storeId).toBe(item.sourceStoreId);
    }
  });

  it('keeps a stable ordered trace with one entry per accepted command', () => {
    const first = buyOffer(state, 'homestyle-mop');
    const rejected = buyOffer(state, 'future-rewinder');
    const second = beginTheft(state, 'homestyle-gel-pens');

    expect(rejected.accepted).toBe(false);
    expect(state.behaviorTrace).toHaveLength(2);
    if (!first.accepted || !second.accepted) {
      throw new Error('Expected two accepted commands');
    }
    expect(first.event.id).toBe('wing-event-1');
    expect(second.event.id).toBe('wing-event-2');
    expect(state.behaviorTrace[0]).toContain('Associate-Issue Mop');
    expect(state.behaviorTrace[1]).toContain('Gel Pen Pack');
    expect(new Set(state.behaviorTrace).size).toBe(2);
  });

  it('matches the Task 1 brief purchase and rejection sequence verbatim', () => {
    const bought = buyOffer(state, 'homestyle-mop');
    expect(bought.accepted).toBe(true);
    expect(state.cash).toBe(20);
    expect(state.inventory[0]).toMatchObject({
      instanceId: 'wing-item-1',
      itemDefinitionId: 'janitor_mop',
      acquisitionKind: 'purchased',
      sourceStoreId: 'homestyle',
      sourceOfferId: 'homestyle-mop',
      acquisitionTick: 0,
    });
    expect(buyOffer(state, 'future-rewinder')).toEqual({ accepted: false, reason: 'Not enough cash.' });
    expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
    expect(beginTheft(state, 'future-soaker')).toEqual({ accepted: false, reason: 'Secure the carried item first.' });
    expect(leaveWing(state)).toEqual({ accepted: false, reason: 'Secure the carried item before leaving.' });
  });
});
