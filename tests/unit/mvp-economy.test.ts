import { describe, expect, it } from 'vitest';
import { securityFacingAtTick } from '../../src/sim/shop/security';
import {
  CONFISCATION_HEAT,
  MAX_SECURITY_HEAT,
  MAX_SUSPICION,
  SECURED_THEFT_HEAT,
  WING_INTERACTION_RANGE,
} from '../../src/sim/shop/types';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import {
  RUN_CONFISCATION_HEAT,
  RUN_INTERACTION_RANGE,
  RUN_MAX_SECURITY_HEAT,
  RUN_MAX_SUSPICION,
  RUN_SECURED_THEFT_HEAT,
  beginRunTheft,
  buyRunOffer,
  runOfferPriceLabel,
  runCarryLimit,
  runOfferPrice,
  runPurchaseDiscount,
  secureRunThefts,
  updateRunSuspicion,
} from '../../src/sim/run/economy';
import { commitRunEmitterMount } from '../../src/sim/run/bench';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { EnemyState } from '../../src/sim/model';
import type { WingDoorSide, WingRoomId } from '../../src/sim/wing/types';
import { bossHudParts } from '../../src/game/ui/MvpRunHud';

const input = (overrides: Partial<MvpInputFrame> = {}): MvpInputFrame => ({
  moveX: 0,
  moveY: 0,
  aimX: 900,
  aimY: 240,
  fire: false,
  interact: false,
  steal: false,
  recall: false,
  ...overrides,
});

function advance(state: MvpRunState, count: number, overrides: Partial<MvpInputFrame> = {}): void {
  for (let index = 0; index < count; index += 1) {
    tickMvpRun(state, input(overrides));
  }
}

function enterStorefront(state: MvpRunState): void {
  const doorway = state.wing.rooms[0]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  const result = enterDoorway(state, 'east');
  if (!result.accepted) {
    throw new Error(`Could not enter the storefront: ${result.reason}`);
  }
}

function walkThrough(state: MvpRunState, side: WingDoorSide): void {
  const doorway = state.wing.rooms[state.roomIndex]!.doorways.find(
    (entry) => entry.side === side,
  )!;
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  const result = enterDoorway(state, side);
  if (!result.accepted) {
    throw new Error(`Could not walk ${side}: ${result.reason}`);
  }
}

function walkEastTo(state: MvpRunState, roomId: WingRoomId): void {
  while (state.wing.rooms[state.roomIndex]?.id !== roomId) {
    if (state.room.combat.enemies.length > 0) {
      state.room.combat.enemies = [];
      advance(state, 1);
    }
    walkThrough(state, 'east');
  }
}

function grantItem(state: MvpRunState, itemDefinitionId: string): void {
  const leaf: InventoryLeaf = {
    kind: 'leaf',
    instanceId: `test-${itemDefinitionId}`,
    itemDefinitionId,
    acquisitionKind: 'purchased',
    sourceLocationId: 'test-store',
    sourceStockId: `test-${itemDefinitionId}-offer`,
    acquisitionTick: state.tick,
  };
  state.inventory = {
    ...state.inventory,
    inventory: [...state.inventory.inventory, leaf],
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
}

function currentStore(state: MvpRunState) {
  const store = state.wing.rooms[state.roomIndex]?.store;
  if (!store) {
    throw new Error(`Room ${state.roomIndex} has no store`);
  }
  return store;
}

function walkPastStoreExit(state: MvpRunState): void {
  const store = currentStore(state);
  state.room.combat.player.x = store.exit.bounds.x + store.exit.bounds.width / 2;
  state.room.combat.player.y = store.exit.bounds.y - 2;
  advance(state, 1, { moveY: 1 });
}

describe('authored run constants', () => {
  it('mirrors the M3 shopping constants so the run cannot drift', () => {
    expect(RUN_SECURED_THEFT_HEAT).toBe(SECURED_THEFT_HEAT);
    expect(RUN_CONFISCATION_HEAT).toBe(CONFISCATION_HEAT);
    expect(RUN_MAX_SUSPICION).toBe(MAX_SUSPICION);
    expect(RUN_MAX_SECURITY_HEAT).toBe(MAX_SECURITY_HEAT);
    expect(RUN_INTERACTION_RANGE).toBe(WING_INTERACTION_RANGE);
  });
});

describe('purchase rules', () => {
  it('applies the shop_discount capability with a one-dollar floor', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const cheapOffer = {
      id: 'test-cheap',
      storeId: 'test-store',
      itemDefinitionId: 'janitor_mop',
      position: { x: 0, y: 0 },
      price: 2,
    };
    const fairOffer = { ...cheapOffer, id: 'test-fair', price: 10 };

    expect(runPurchaseDiscount(state)).toBe(0);
    expect(runOfferPrice(state, cheapOffer)).toBe(2);

    grantItem(state, 'receipt_wallet');
    expect(runPurchaseDiscount(state)).toBe(2);
    expect(runOfferPrice(state, cheapOffer)).toBe(1);
    expect(runOfferPrice(state, fairOffer)).toBe(8);
  });

  it('charges the discounted price and records purchased provenance', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    grantItem(state, 'receipt_wallet');
    const store = currentStore(state);
    const offer = state.wing.rooms[1]!.offers.find(
      (candidate) =>
        candidate.itemDefinitionId !== 'receipt_wallet' &&
        candidate.itemDefinitionId !== 'janitor_mop',
    )!;
    const startingCash = state.cash;

    const result = buyRunOffer(state, offer.id);

    expect(result.accepted).toBe(true);
    expect(state.cash).toBe(startingCash - Math.max(1, offer.price - 2));
    expect(state.inventory.cash).toBe(state.cash);
    expect(state.inventory.revision).toBe(2);
    expect(state.offerStatus[offer.id]).toBe('consumed');
    const leaf = state.inventory.inventory.find(
      (node) => node.kind === 'leaf' && node.sourceStockId === offer.id,
    );
    expect(leaf).toBeDefined();
    expect(leaf && leaf.kind === 'leaf' ? leaf.itemDefinitionId : null).toBe(offer.itemDefinitionId);
    expect(leaf && leaf.kind === 'leaf' ? leaf.sourceLocationId : null).toBe(store.templateId);
    expect(leaf && leaf.kind === 'leaf' ? leaf.acquisitionKind : null).toBe('purchased');
    expect(state.room.combat.inventory).toHaveLength(state.inventory.inventory.length);
  });

  it('rejects a purchase without enough cash and leaves state untouched', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    state.cash = 1;
    state.inventory = { ...state.inventory, cash: 1 };

    const result = buyRunOffer(state, offer.id);

    expect(result.accepted).toBe(false);
    expect(state.cash).toBe(1);
    expect(state.offerStatus[offer.id]).toBe('available');
    expect(state.inventory.revision).toBe(0);
  });

  it('rejects a consumed offer', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const offer = state.wing.rooms[1]!.offers[0]!;

    expect(buyRunOffer(state, offer.id).accepted).toBe(true);
    const second = buyRunOffer(state, offer.id);

    expect(second.accepted).toBe(false);
    expect(state.inventory.revision).toBe(1);
  });

  it('rejects an unknown offer id', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    expect(buyRunOffer(state, 'no-such-offer').accepted).toBe(false);
    expect(state.cash).toBe(30);
  });
});

describe('theft rules', () => {
  it('allows one concurrent theft, two with the smuggle_pouch capability', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const offers = state.wing.rooms[1]!.offers;

    expect(runCarryLimit(state)).toBe(1);
    expect(beginRunTheft(state, offers[0]!.id).accepted).toBe(true);
    expect(state.carried).toHaveLength(1);
    expect(state.offerStatus[offers[0]!.id]).toBe('carried');
    expect(beginRunTheft(state, offers[1]!.id).accepted).toBe(false);
    expect(state.carried).toHaveLength(1);

    grantItem(state, 'fanny_pack');
    expect(runCarryLimit(state)).toBe(2);
    expect(beginRunTheft(state, offers[1]!.id).accepted).toBe(true);
    expect(state.carried).toHaveLength(2);
    expect(state.offerStatus[offers[1]!.id]).toBe('carried');
  });

  it('secures a carried theft when the player crosses the store exit', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const store = currentStore(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(beginRunTheft(state, offer.id).accepted).toBe(true);
    const revisionBefore = state.inventory.revision;

    walkPastStoreExit(state);

    expect(state.carried).toEqual([]);
    expect(state.offerStatus[offer.id]).toBe('consumed');
    expect(state.heat).toBe(SECURED_THEFT_HEAT);
    expect(state.inventory.revision).toBe(revisionBefore + 1);
    const stolen = state.inventory.inventory.find(
      (node) => node.kind === 'leaf' && node.acquisitionKind === 'stolen',
    );
    expect(stolen).toBeDefined();
    expect(stolen && stolen.kind === 'leaf' ? stolen.itemDefinitionId : null).toBe(
      offer.itemDefinitionId,
    );
    expect(stolen && stolen.kind === 'leaf' ? stolen.sourceLocationId : null).toBe(
      store.templateId,
    );
    expect(stolen && stolen.kind === 'leaf' ? stolen.sourceStockId : null).toBe(offer.id);
  });

  it('reduces secured-theft Heat by five with the smuggle_pouch capability', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    grantItem(state, 'fanny_pack');
    const offers = state.wing.rooms[1]!.offers.filter(
      (offer) =>
        offer.itemDefinitionId !== 'fanny_pack' &&
        offer.itemDefinitionId !== 'janitor_mop',
    );
    expect(beginRunTheft(state, offers[0]!.id).accepted).toBe(true);
    expect(beginRunTheft(state, offers[1]!.id).accepted).toBe(true);

    walkPastStoreExit(state);

    expect(state.carried).toEqual([]);
    expect(state.heat).toBe(2 * (SECURED_THEFT_HEAT - 5));
    const stolen = state.inventory.inventory.filter(
      (node) => node.kind === 'leaf' && node.acquisitionKind === 'stolen',
    );
    expect(stolen).toHaveLength(2);
  });

  it('confiscates carried theft when the sweep reaches full suspicion', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const store = currentStore(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(beginRunTheft(state, offer.id).accepted).toBe(true);

    const facing = securityFacingAtTick(store.sightZone, state.tick + 1);
    state.room.combat.player.x = store.sightZone.origin.x + Math.cos(facing) * 60;
    state.room.combat.player.y = store.sightZone.origin.y + Math.sin(facing) * 60;
    state.suspicion = MAX_SUSPICION - 0.25;

    advance(state, 1);

    expect(state.carried).toEqual([]);
    expect(state.offerStatus[offer.id]).toBe('available');
    expect(state.suspicion).toBe(0);
    expect(state.heat).toBe(CONFISCATION_HEAT);
    expect(state.room.combat.player.x).toBeCloseTo(store.resetPoint.x, 10);
    expect(state.room.combat.player.y).toBeCloseTo(store.resetPoint.y, 10);
  });

  it('raises suspicion while a store sweep sees a carried theft', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const store = currentStore(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(beginRunTheft(state, offer.id).accepted).toBe(true);

    const facing = securityFacingAtTick(store.sightZone, state.tick);
    state.room.combat.player.x = store.sightZone.origin.x + Math.cos(facing) * 60;
    state.room.combat.player.y = store.sightZone.origin.y + Math.sin(facing) * 60;

    updateRunSuspicion(state);

    expect(state.suspicion).toBeGreaterThan(0);
    expect(state.carried).toHaveLength(1);
  });

  it('refuses to bank a carried theft from inside its source store', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const store = currentStore(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(beginRunTheft(state, offer.id).accepted).toBe(true);
    const revisionBefore = state.inventory.revision;

    const result = secureRunThefts(state, store);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toMatch(/exit the store/i);
    }
    expect(state.carried).toHaveLength(1);
    expect(state.offerStatus[offer.id]).toBe('carried');
    expect(state.heat).toBe(0);
    expect(state.inventory.revision).toBe(revisionBefore);
    expect(
      state.inventory.inventory.some(
        (node) => node.kind === 'leaf' && node.acquisitionKind === 'stolen',
      ),
    ).toBe(false);
  });

  it('keeps sweeping a theft carried into another room so it can still be confiscated', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const sourceStore = currentStore(state);
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(beginRunTheft(state, offer.id).accepted).toBe(true);

    walkEastTo(state, 'storefront_b');
    expect(state.room.roomId).toBe('storefront_b');
    expect(currentStore(state).templateId).not.toBe(sourceStore.templateId);

    // Hidden from the source store's sweep, suspicion falls instead of freezing.
    state.room.combat.player.x = 110;
    state.room.combat.player.y = 240;
    state.suspicion = 4;
    advance(state, 1);
    expect(state.suspicion).toBeLessThan(4);
    expect(state.carried).toHaveLength(1);

    // Seen by the source store's sweep, full suspicion still confiscates.
    const facing = securityFacingAtTick(sourceStore.sightZone, state.tick + 1);
    state.room.combat.player.x = sourceStore.sightZone.origin.x + Math.cos(facing) * 60;
    state.room.combat.player.y = sourceStore.sightZone.origin.y + Math.sin(facing) * 60;
    state.suspicion = MAX_SUSPICION - 0.25;

    advance(state, 1);

    expect(state.carried).toEqual([]);
    expect(state.offerStatus[offer.id]).toBe('available');
    expect(state.suspicion).toBe(0);
    expect(state.heat).toBe(CONFISCATION_HEAT);
    expect(state.room.combat.player.x).toBeCloseTo(sourceStore.resetPoint.x, 10);
    expect(state.room.combat.player.y).toBeCloseTo(sourceStore.resetPoint.y, 10);
  });
});

describe('run cash invariants', () => {
  it('keeps the run cash and the inventory cash equal through every economy command', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const store = currentStore(state);
    const offers = state.wing.rooms[1]!.offers;

    expect(buyRunOffer(state, offers[0]!.id).accepted).toBe(true);
    expect(state.inventory.cash).toBe(state.cash);

    expect(beginRunTheft(state, offers[1]!.id).accepted).toBe(true);
    walkPastStoreExit(state);
    expect(state.carried).toEqual([]);
    expect(state.inventory.cash).toBe(state.cash);

    expect(beginRunTheft(state, offers[2]!.id).accepted).toBe(true);
    const facing = securityFacingAtTick(store.sightZone, state.tick + 1);
    state.room.combat.player.x = store.sightZone.origin.x + Math.cos(facing) * 60;
    state.room.combat.player.y = store.sightZone.origin.y + Math.sin(facing) * 60;
    state.suspicion = MAX_SUSPICION - 0.25;
    advance(state, 1);
    expect(state.carried).toEqual([]);
    expect(state.inventory.cash).toBe(state.cash);

    grantItem(state, 'party_popper');
    grantItem(state, 'rc_car');
    expect(commitRunEmitterMount(state, 'test-party_popper', 'test-rc_car').accepted).toBe(
      true,
    );
    expect(state.inventory.cash).toBe(state.cash);
  });

  it('charges the Emitter Mount fee once so a later purchase cannot refund it', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    grantItem(state, 'party_popper');
    grantItem(state, 'rc_car');
    const startingCash = state.cash;
    const revisionBefore = state.inventory.revision;

    const fused = commitRunEmitterMount(state, 'test-party_popper', 'test-rc_car');

    expect(fused.accepted).toBe(true);
    const fee = startingCash - state.cash;
    expect(fee).toBeGreaterThan(0);
    expect(state.inventory.cash).toBe(state.cash);
    expect(state.inventory.revision).toBe(revisionBefore + 1);
    expect(state.inventory.inventory).toHaveLength(2);
    expect(state.inventory.inventory.some((node) => node.kind === 'composite')).toBe(true);
    expect(state.room.combat.compiledLoadout.primary.definitionId).toBe('party_popper');
    expect(state.room.combat.inventory).toHaveLength(state.inventory.inventory.length);

    const cheapest = state.wing.rooms[1]!.offers.reduce((lowest, candidate) =>
      candidate.price < lowest.price ? candidate : lowest,
    );
    const price = runOfferPrice(state, cheapest);
    expect(state.cash).toBeGreaterThanOrEqual(price);

    expect(buyRunOffer(state, cheapest.id).accepted).toBe(true);

    expect(state.cash).toBe(startingCash - fee - price);
    expect(state.inventory.cash).toBe(state.cash);
  });

  it('refuses an Emitter Mount the run cannot pay for and leaves cash untouched', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    grantItem(state, 'party_popper');
    grantItem(state, 'rc_car');
    state.cash = 1;
    state.inventory = { ...state.inventory, cash: 1 };

    const result = commitRunEmitterMount(state, 'test-party_popper', 'test-rc_car');

    expect(result.accepted).toBe(false);
    expect(state.cash).toBe(1);
    expect(state.inventory.cash).toBe(1);
    expect(state.inventory.inventory.some((node) => node.kind === 'composite')).toBe(false);
  });
});

describe('run presentation fidelity', () => {
  it('renders the simulated boss phase instead of recomputing it from health', () => {
    const boss: EnemyState = {
      id: 1,
      kind: 'lp_manager',
      x: 760,
      y: 240,
      health: 60,
      radius: 22,
      phase: 'pursue',
      phaseTicks: 60,
      cooldownTicks: 150,
      telegraphAimX: 0,
      telegraphAimY: 0,
      bossPhase: 3,
      bossSummoned: true,
    };

    const parts = bossHudParts(boss);

    expect(parts[0]).toBe('BOSS: phase 3 · HP 60/60');
    expect(parts).toContain('BACKUP CALLED');
  });

  it('labels an offer with the same discounted price the run charges', () => {
    const state = createMvpRun(9);
    enterStorefront(state);
    const offer = state.wing.rooms[1]!.offers.find((candidate) => candidate.price > 3)!;

    expect(runOfferPriceLabel(state, offer)).toBe(`$${offer.price}`);

    grantItem(state, 'receipt_wallet');

    expect(runOfferPrice(state, offer)).toBe(Math.max(1, offer.price - 2));
    expect(runOfferPriceLabel(state, offer)).toBe(`$${Math.max(1, offer.price - 2)}`);
  });
});
