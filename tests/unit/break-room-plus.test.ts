import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { NO_PERKS, sanitizePerks, snackChance, type ShiftPerks } from '../../src/sim/run/perks';
import { buyRunOffer, runCarryLimit, runOfferPrice } from '../../src/sim/run/economy';
import { alarmTicksFor, stealRunOffer } from '../../src/sim/run/heist';
import { confirmRunFusionPreview, openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { SNACK_CHANCE } from '../../src/sim/run/luck';
import { wingEventFor } from '../../src/sim/run/wingEvents';
import {
  LOCKER_ITEMS,
  PERKS,
  VENDING_ITEMS,
  buyPerk,
  buyVending,
  clockIn,
  newCareer,
  parseCareer,
  perksFor,
  type Career,
} from '../../src/game/career/career';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const perks = (overrides: Partial<ShiftPerks>): ShiftPerks => sanitizePerks({ ...NO_PERKS, ...overrides });

/** Seed 8's Floor 1 boss wing has no floor event, so prices and alarms are plain. */
const run = (overrides: Partial<ShiftPerks> = {}): MvpRunState => {
  const state = createMvpRun(8, { perks: perks(overrides) });
  expect(wingEventFor(state.wing)).toBeNull();
  return state;
};

function rich(state: MvpRunState): MvpRunState {
  state.cash = 500;
  state.inventory = { ...state.inventory, cash: 500 };
  return state;
}

function fuseTwoNewItems(state: MvpRunState): number {
  const offers = state.wing.rooms.flatMap((room) => room.offers)
    .filter((offer) => offer.itemDefinitionId !== 'janitor_mop' && (state.offerStatus[offer.id] ?? 'available') === 'available');
  const [a, b] = [offers[0]!, offers.find((offer) => offer.itemDefinitionId !== offers[0]!.itemDefinitionId)!];
  expect(buyRunOffer(state, a.id).accepted).toBe(true);
  expect(buyRunOffer(state, b.id).accepted).toBe(true);
  const ids = state.inventory.inventory.slice(-2).map((node) => node.instanceId);
  const before = state.cash;
  expect(openRunWorkbench(state).accepted).toBe(true);
  pickWorkbenchItem(state, ids[0]!);
  pickWorkbenchItem(state, ids[1]!);
  const fee = state.preview!.fee;
  expect(confirmRunFusionPreview(state).accepted).toBe(true);
  return before - state.cash - fee; // 0 when the full fee was paid; negative by any rebate
}

describe('new Break Room perks in the run (round 49)', () => {
  it('Lookout lengthens the alarm; Deep Pockets carries one more; Employee Discount marks shelves down', () => {
    expect(alarmTicksFor(run({ alarmBonus: 40 }))).toBe(alarmTicksFor(run()) + 40);
    expect(runCarryLimit(run({ carryBonus: 1 }))).toBe(runCarryLimit(run()) + 1);
    const plain = run();
    const offer = plain.wing.rooms.flatMap((room) => room.offers).find((candidate) => candidate.price > 10)!;
    expect(runOfferPrice(run({ shelfDiscount: 2 }), offer)).toBe(runOfferPrice(plain, offer) - 2);
  });

  it('Bench Technician refunds part of every fusion fee', () => {
    expect(fuseTwoNewItems(rich(run()))).toBe(0);
    expect(fuseTwoNewItems(rich(run({ fusionRebate: 2 })))).toBe(-2);
  });

  it('a Fusion Coupon makes the first fusion of the night free, once', () => {
    const state = rich(run({ freeFusions: 1 }));
    const first = state.cash;
    expect(openRunWorkbench(state).accepted).toBe(false); // only the mop so far
    const paid = fuseTwoNewItems(state);
    expect(paid).toBeLessThan(0); // the whole fee came back
    expect(state.perks.freeFusions).toBe(0);
    expect(state.cash).toBeLessThan(first); // the two items still cost money
    expect(fuseTwoNewItems(state)).toBe(0);
  });

  it('Second Wind turns the first fatal hit of the night into one heart left', () => {
    const state = run({ secondWinds: 1 });
    state.room.combat.player.health = 0;
    tickMvpRun(state, idle);
    expect(state.status).toBe('playing');
    expect(state.room.combat.player.health).toBe(2);
    expect(state.perks.secondWinds).toBe(0);
    state.room.combat.player.health = 0;
    tickMvpRun(state, idle);
    expect(state.status).toBe('dead');
  });

  it('a Fake Mustache lifts the first item of the night without an alarm', () => {
    const state = run({ quietGrabs: 1 });
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(enterStore(state).accepted).toBe(true);
    const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
    const guards = state.room.combat.enemies.length;
    expect(stealRunOffer(state, offer.id).accepted).toBe(true);
    expect(state.alarm).toBeNull();
    expect(state.room.combat.enemies.length).toBe(guards);
    expect(state.perks.quietGrabs).toBe(0);
  });

  it('Lucky Penny drops more pretzels', () => {
    expect(snackChance(run(), false)).toBe(SNACK_CHANCE);
    expect(snackChance(run({ snackBonus: 10 }), false)).toBeCloseTo(SNACK_CHANCE + 0.1, 5);
  });

  it('every new perk and charge survives a checkpoint and the escalator', () => {
    const all = perks({ alarmBonus: 40, carryBonus: 1, shelfDiscount: 2, fusionRebate: 4, snackBonus: 20, secondWinds: 1, freeFusions: 1, quietGrabs: 1 });
    const state = createMvpRun(8, { perks: all });
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).perks).toEqual(all);
    // Out-of-range values clamp.
    expect(sanitizePerks({ alarmBonus: 9999, carryBonus: 50, secondWinds: 7 }).carryBonus).toBeLessThanOrEqual(2);
  });
});

describe('the bigger Break Room (round 49)', () => {
  const wealthy = (): Career => ({ ...newCareer(), stubs: 10_000 });

  it('sells eleven perks, ten locker weapons and a vending machine', () => {
    expect(PERKS.length).toBe(11);
    expect(LOCKER_ITEMS.length).toBe(10);
    expect(VENDING_ITEMS.map((item) => item.id).sort()).toEqual(['coupon', 'energy', 'lunch', 'mustache']);
  });

  it('every perk level reaches the run', () => {
    let career = wealthy();
    for (const perk of PERKS) for (let level = 0; level < perk.costs.length; level += 1) {
      const bought = buyPerk(career, perk.id);
      expect(bought.ok, perk.id).toBe(true);
      if (bought.ok) career = bought.career;
    }
    const shift = perksFor(career);
    expect(shift).toMatchObject({ alarmBonus: 40, carryBonus: 1, shelfDiscount: 2, fusionRebate: 4, snackBonus: 20, secondWinds: 1 });
    expect(sanitizePerks(shift)).toEqual(shift);
  });

  it('vending snacks go in the bag and are eaten on the next shift only', () => {
    let career = wealthy();
    for (const id of ['energy', 'lunch', 'coupon', 'mustache'] as const) {
      const bought = buyVending(career, id);
      expect(bought.ok, id).toBe(true);
      if (bought.ok) career = bought.career;
    }
    const first = clockIn(career);
    expect(first.perks).toMatchObject({ bonusHealth: 2, bonusCash: 15, freeFusions: 1, quietGrabs: 1 });
    const second = clockIn(first.career);
    // Nothing else was bought, so the bag was all there was.
    expect(second.perks).toEqual(NO_PERKS);
  });

  it('the clock-in line names the new benefits, and counts the rest past five', async () => {
    const { benefitsLine } = await import('../../src/game/ui/clockInModel');
    expect(benefitsLine(perks({ secondWinds: 1, quietGrabs: 1 }))).toBe('BENEFITS: SECOND WIND - FAKE MUSTACHE');
    const crowded = benefitsLine(perks({ bonusCash: 5, bonusHealth: 2, clearHealBonus: 1, dashCooldownCut: 10, tokenMagnet: 40, alarmBonus: 20, carryBonus: 1 }))!;
    expect(crowded.split(' - ')).toHaveLength(5);
    expect(crowded).toMatch(/\+3 MORE$/);
  });

  it('a saved career keeps the new perks and the bag, and repairs nonsense', () => {
    let career = wealthy();
    const bought = buyVending(career, 'coupon');
    if (bought.ok) career = bought.career;
    const lookout = buyPerk(career, 'lookout');
    if (lookout.ok) career = lookout.career;
    const again = parseCareer(JSON.stringify(career));
    expect(again.perks.lookout).toBe(1);
    expect(again.bag.coupon).toBe(1);
    expect(parseCareer(JSON.stringify({ ...career, bag: { coupon: 999, junk: 3 } })).bag.coupon).toBeLessThanOrEqual(9);
  });
});
