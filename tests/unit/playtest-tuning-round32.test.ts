import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { GETAWAY_CASH_PER_ITEM, GETAWAY_HAUL_BONUS, getawayBonus } from '../../src/sim/run/heist';
import { BOSS_CONFIGS } from '../../src/sim/combat/boss';
import { ROOM_VARIANTS } from '../../src/sim/wing/templates';
import { BOSS_INTRO_MS } from '../../src/game/ui/bossIntroModel';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function tick(state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void {
  tickMvpRun(state, { ...idle, ...overrides });
}

function atShelf(seed = 9): MvpRunState {
  const state = createMvpRun(seed);
  state.room.combat.enemies = [];
  tick(state);
  const doorway = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  if (!enterDoorway(state, 'east').accepted) throw new Error('no doorway');
  if (!enterStore(state).accepted) throw new Error('could not enter the store');
  const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
  state.room.combat.player.x = offer.position.x;
  state.room.combat.player.y = offer.position.y + 20;
  return state;
}

describe('round 32 playtest tuning', () => {
  it('Floor 1 fights start at three enemies or more (the log showed 1-5 hits a shift)', () => {
    for (const role of ['food_court', 'back_hall'] as const) {
      for (const variant of ROOM_VARIANTS[role]) {
        expect(variant.enemyCount.min, variant.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the Mall Manager volleys five shots, not seven, and a little slower', () => {
    expect(BOSS_CONFIGS.manager.volleyAngles).toHaveLength(5);
    expect(BOSS_CONFIGS.manager.volleySpeedPerTick).toBeLessThan(2.9);
  });

  it('the Mall Owner is a shorter fight', () => {
    expect(BOSS_CONFIGS.owner.maxHealth).toBe(210);
  });

  it('the boss card plays for two seconds', () => {
    // Round 35 shortened it again (playtest-round35.test.ts).
    expect(BOSS_INTRO_MS).toBeLessThanOrEqual(2000);
  });

  it('a getaway pays per item, with a bonus for a bigger haul', () => {
    expect(getawayBonus(0)).toBe(0);
    expect(getawayBonus(1)).toBe(GETAWAY_CASH_PER_ITEM);
    expect(getawayBonus(2)).toBe(2 * GETAWAY_CASH_PER_ITEM + GETAWAY_HAUL_BONUS);
  });

  it('walking out with the goods before the shutter pays the getaway bonus in cash', () => {
    const state = atShelf();
    tick(state, { steal: true });
    tick(state);
    expect(state.alarm).not.toBeNull();
    const cashBefore = state.cash;
    const exit = state.wing.rooms[state.roomIndex]!.store!.exit.bounds;
    state.room.combat.enemies = [];
    state.room.combat.player.x = exit.x + exit.width / 2;
    state.room.combat.player.y = exit.y - 2;
    tick(state, { moveY: 1 });
    for (let step = 0; step < 20 && state.room.interior; step += 1) tick(state, { moveY: 1 });
    expect(state.cash).toBe(cashBefore + getawayBonus(1));
    expect(state.inventory.cash).toBe(state.cash);
  });
});
