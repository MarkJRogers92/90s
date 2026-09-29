import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, nearestMvpInteraction, tickMvpRun, tryInteract } from '../../src/sim/run/tickMvpRun';
import { enterStore, roomStores } from '../../src/sim/run/storeInterior';
import {
  ARCADE_CABINET,
  ARCADE_PLAY_COST,
  ARCADE_PRIZES,
  CART_DAMAGE,
  DISPLAY_MANNEQUIN_SPOTS,
} from '../../src/sim/run/storeTwists';
import { heistRecap } from '../../src/game/ui/shiftCardModel';
import type { RunRecord } from '../../src/game/playtest/recorder';
import type { EnemyState } from '../../src/sim/model';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const tick = (state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void => tickMvpRun(state, { ...idle, ...overrides });

/** Walks the shift east, room by room, until it stands in room `target`. */
function walkEastTo(state: MvpRunState, target: number): void {
  while (state.roomIndex < target) {
    state.room.combat.enemies = [];
    tick(state);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    if (!enterDoorway(state, 'east').accepted) throw new Error('could not walk east');
  }
  state.room.combat.enemies = [];
}

/** Inside the named store, found by walking the storefronts of a few seeds. */
function inside(storeId: string): MvpRunState {
  for (let seed = 1; seed < 200; seed += 1) {
    const state = createMvpRun(seed);
    for (let room = 0; room < state.wing.rooms.length; room += 1) {
      const index = roomStores(state.wing.rooms[room]!).findIndex((store) => store.templateId === storeId);
      if (index < 0) continue;
      walkEastTo(state, room);
      expect(enterStore(state, index).accepted).toBe(true);
      tick(state);
      return state;
    }
  }
  throw new Error(`no ${storeId} found`);
}

describe('store twists', () => {
  it('Arcade Annex: the lit cabinet takes $2 a play and pays out by the house odds', () => {
    const state = inside('arcade-annex');
    state.room.combat.player.x = ARCADE_CABINET.x - 30;
    state.room.combat.player.y = ARCADE_CABINET.y + 20;
    expect(nearestMvpInteraction(state)).toMatchObject({ kind: 'cabinet' });
    state.cash = 10;
    const before = state.cash;
    const played = tryInteract(state);
    expect(played.accepted).toBe(true);
    const prizes = ARCADE_PRIZES.map((entry) => entry.prize);
    expect([0, ...prizes].map((prize) => before - ARCADE_PLAY_COST + prize)).toContain(state.cash);
    expect(state.inventory.cash).toBe(state.cash);
    // It is busy for a moment, then takes another coin; broke janitors are refused.
    expect(tryInteract(state).accepted).toBe(false);
    for (let index = 0; index < 60; index += 1) tick(state);
    state.cash = 1;
    state.inventory = { ...state.inventory, cash: 1 };
    expect(tryInteract(state)).toMatchObject({ accepted: false });
  });

  it('Arcade Annex: the odds favour the house', () => {
    let expected = 0;
    let previous = 0;
    for (const entry of ARCADE_PRIZES) {
      expected += (entry.below - previous) * entry.prize;
      previous = entry.below;
    }
    expect(expected).toBeLessThan(ARCADE_PLAY_COST);
    expect(expected).toBeGreaterThan(ARCADE_PLAY_COST * 0.85);
  });

  it('Cinema Snacks: the butter builds up speed and keeps the janitor sliding after letting go', () => {
    const state = inside('cinema-snacks');
    const player = state.room.combat.player;
    player.x = 300;
    player.y = 230;
    tick(state, { moveX: 1 });
    const firstStep = player.x - 300;
    expect(firstStep).toBeLessThan(2);
    for (let index = 0; index < 60; index += 1) tick(state, { moveX: 1 });
    const cruising = player.x;
    tick(state, { moveX: 1 });
    // Never faster than walking.
    expect(player.x - cruising).toBeLessThanOrEqual(3.6);
    const released = player.x;
    for (let index = 0; index < 60; index += 1) tick(state);
    expect(player.x - released).toBeGreaterThan(20);
  });

  it('Department Outlet: the posed displays stay still until the alarm, then all come alive', () => {
    const state = inside('department-outlet');
    const posed = state.room.combat.enemies.filter((enemy) => enemy.dormant);
    expect(posed).toHaveLength(DISPLAY_MANNEQUIN_SPOTS.length);
    const health = state.room.combat.player.health;
    // Stand right next to one, looking away: nothing happens.
    state.room.combat.player.x = posed[0]!.x + 20;
    state.room.combat.player.y = posed[0]!.y;
    for (let index = 0; index < 90; index += 1) tick(state, { aimX: 900, aimY: 20 });
    expect(state.room.combat.player.health).toBe(health);
    // They have not moved from their spots.
    expect(posed.map((enemy) => ({ x: enemy.x, y: enemy.y }))).toEqual(DISPLAY_MANNEQUIN_SPOTS);
    // A grab sets off the alarm, and every display wakes.
    const here = state.room.twist!.storeId;
    const offer = state.wing.rooms[state.roomIndex]!.offers.find((candidate) => candidate.storeId === here)!;
    state.room.combat.player.x = offer.position.x;
    state.room.combat.player.y = offer.position.y + 20;
    tick(state, { steal: true });
    tick(state);
    expect(state.alarm).not.toBeNull();
    expect(posed.every((enemy) => enemy.dormant === false)).toBe(true);
  });

  it('Mall Mart: running into a cart sends it rolling, and it bowls over a guard', () => {
    const state = inside('mall-mart');
    const twist = state.room.twist!;
    const cart = twist.carts[0]!;
    const guard = { id: 99, kind: 'shopper', x: cart.x + 70, y: cart.y, health: 20, radius: 16, phase: 'recover', phaseTicks: 999, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState;
    state.room.combat.enemies.push(guard);
    const player = state.room.combat.player;
    player.x = cart.x - 30;
    player.y = cart.y;
    for (let index = 0; index < 10 && Math.hypot(cart.vx, cart.vy) === 0; index += 1) tick(state, { moveX: 1 });
    expect(cart.vx).toBeGreaterThan(0);
    for (let index = 0; index < 30; index += 1) tick(state);
    expect(guard.health).toBe(20 - CART_DAMAGE);
    expect(guard.x).toBeGreaterThan(cart.x);
  });

  it('twists are room-local: leaving the store drops them', () => {
    const state = inside('mall-mart');
    expect(state.room.twist).not.toBeNull();
    const door = state.wing.rooms[state.roomIndex]!.store!.exit.bounds;
    state.room.combat.player.x = door.x + door.width / 2;
    state.room.combat.player.y = door.y - 2;
    tick(state, { moveY: 1 });
    expect(state.room.interior).toBe(false);
    expect(state.room.twist).toBeNull();
  });
});

describe('heist recap on the end card', () => {
  const base = { alarms: [], stalker: { arrivals: 0, writeUps: 0, shoves: 0 } } as unknown as RunRecord;
  it('says nothing for a clean shift', () => {
    expect(heistRecap(null)).toBeNull();
    expect(heistRecap(base)).toBeNull();
  });

  it('names getaways with the closest call, lockdowns and write-ups', () => {
    const record = {
      ...base,
      alarms: [
        { store: 'A', outcome: 'escaped', secondsLeft: 1.4, stars: 0 },
        { store: 'B', outcome: 'escaped', secondsLeft: 0.6, stars: 1 },
        { store: 'C', outcome: 'lockedEscaped', secondsLeft: null, stars: 2 },
      ],
      stalker: { arrivals: 1, writeUps: 2, shoves: 3 },
    } as RunRecord;
    expect(heistRecap(record)).toBe('3 GETAWAYS (0.6S TO SPARE) - LOCKED IN 1X - WRITTEN UP 2X');
  });
});
