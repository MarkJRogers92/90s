import { describe, expect, it } from 'vitest';
import { COACH_SHIFTS, coachActive, nextCoachTip, type CoachTipId } from '../../src/game/ui/coachModel';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/game/settings/settings';

const none = new Set<CoachTipId>();
const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function walkTo(state: MvpRunState, roomIndex: number): void {
  while (state.roomIndex < roomIndex) {
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }
}

describe('the coach (round 57): an optional guided first shift', () => {
  it('nudges a janitor who lingers in the first room, after the controls card has had its say', () => {
    const state = createMvpRun(7, { part: 1 });
    // The controls card owns the first nine seconds.
    state.tick = 60 * 5;
    expect(nextCoachTip(state, none)).toBeNull();
    state.tick = 60 * 11;
    expect(nextCoachTip(state, none)).toMatchObject({ id: 'move' });
    expect(nextCoachTip(state, none)!.text).toMatch(/EAST DOOR/);
    // Long gone from the first room, it never comes.
    state.tick = 60 * 11;
    walkTo(state, 1);
    expect(nextCoachTip(state, none)).not.toMatchObject({ id: 'move' });
  });

  it('says each thing once: a tip already shown is not offered again, and the next one comes up', () => {
    const state = createMvpRun(7, { part: 1 });
    walkTo(state, 1);
    expect(nextCoachTip(state, new Set<CoachTipId>(['move']))).toMatchObject({ id: 'shop' });
    expect(nextCoachTip(state, new Set<CoachTipId>(['move', 'shop']))).toBeNull();
  });

  it('points at the shop door on a storefront concourse', () => {
    const state = createMvpRun(7, { part: 1 });
    walkTo(state, 1);
    const tip = nextCoachTip(state, new Set<CoachTipId>(['move']))!;
    expect(tip.id).toBe('shop');
    expect(tip.text).toMatch(/SHOP DOOR/);
  });

  it('explains buying and the grab-and-run alarm once inside a store', () => {
    const state = createMvpRun(7, { part: 1 });
    walkTo(state, 1);
    enterStore(state, 0);
    const tip = nextCoachTip(state, new Set<CoachTipId>(['move', 'shop']))!;
    expect(tip.id).toBe('buy');
    expect(tip.text).toMatch(/E/);
    expect(tip.text).toMatch(/ALARM/);
  });

  it('warns about wind-ups when a fight begins, and mentions the dash', () => {
    const state = createMvpRun(7, { part: 1 });
    walkTo(state, 2);
    expect(state.room.combat.enemies.length).toBeGreaterThan(0);
    const tip = nextCoachTip(state, new Set<CoachTipId>(['move', 'shop', 'buy']))!;
    expect(tip.id).toBe('dodge');
    expect(tip.text).toMatch(/SPACE/);
  });

  it('teaches switching once there is a second weapon to switch to', () => {
    const state = createMvpRun(7, { part: 1 });
    const seen = new Set<CoachTipId>(['move', 'shop', 'buy', 'dodge']);
    expect(nextCoachTip(state, seen)).toBeNull();
    state.inventory = {
      ...state.inventory,
      inventory: [...state.inventory.inventory, { kind: 'leaf', instanceId: 'w2', itemDefinitionId: 'party_popper', acquisitionKind: 'purchased', sourceLocationId: 't', sourceStockId: 'w2', acquisitionTick: 0 }],
    };
    expect(nextCoachTip(state, seen)).toMatchObject({ id: 'weapons' });
  });

  it('explains wanted stars the first time one lights', () => {
    const state = createMvpRun(7, { part: 1 });
    const seen = new Set<CoachTipId>(['move', 'shop', 'buy', 'dodge', 'weapons', 'bench']);
    expect(nextCoachTip(state, seen)).toBeNull();
    state.heat = 20;
    const tip = nextCoachTip(state, seen)!;
    expect(tip.id).toBe('wanted');
    expect(tip.text).toMatch(/GUARDS/);
  });

  it('is quiet once the shift is over', () => {
    const state = createMvpRun(7, { part: 1 });
    state.status = 'dead';
    expect(nextCoachTip(state, none)).toBeNull();
  });

  it('is on for a new janitor, off for a veteran, and off when switched off', () => {
    expect(COACH_SHIFTS).toBeGreaterThanOrEqual(1);
    expect(coachActive({ coach: true }, { shifts: 0 })).toBe(true);
    expect(coachActive({ coach: true }, { shifts: COACH_SHIFTS - 1 })).toBe(true);
    expect(coachActive({ coach: true }, { shifts: COACH_SHIFTS })).toBe(false);
    expect(coachActive({ coach: false }, { shifts: 0 })).toBe(false);
  });

  it('is a saved setting that defaults on and repairs a junk value', () => {
    expect(DEFAULT_SETTINGS.coach).toBe(true);
    expect(sanitizeSettings({}).coach).toBe(true);
    expect(sanitizeSettings({ coach: false }).coach).toBe(false);
    expect(sanitizeSettings({ coach: 'nope' }).coach).toBe(true);
  });
});
