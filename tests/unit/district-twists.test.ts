import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { activeStore, enterStore, roomStores } from '../../src/sim/run/storeInterior';
import { buyRunOffer, runOfferPrice } from '../../src/sim/run/economy';
import { ALARM_TICKS_BY_FLOOR, alarmTicksFor } from '../../src/sim/run/heist';
import {
  BUZZER_TILES,
  CACTUS_POTS,
  PARROT_ALARM_CUT,
  SAMPLE_BOWL,
  STUDIO_FLASH_CYCLE_TICKS,
  STUDIO_FLASH_LANE,
  HAIRSPRAY_ZONES,
  SKATE_BOOST,
  TWIST_HINTS,
} from '../../src/sim/run/storeTwists';
import { DISTRICT_STORE_TEMPLATES } from '../../src/sim/wing/templates';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import type { EnemyState } from '../../src/sim/model';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const tick = (state: MvpRunState, overrides: Partial<MvpInputFrame> = {}) => tickMvpRun(state, { ...idle, ...overrides });

/** Standing inside a district store (the first shop of storefront `which`) on `floor`. */
function inside(floor: FloorNumber, which: 0 | 1): MvpRunState {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = createMvpRun(seed, { floor, part: 1 });
    if (!state.wing.district) continue;
    const target = state.wing.rooms.filter((room) => room.store !== null)[which]!;
    while (state.wing.rooms[state.roomIndex]!.id !== target.id) {
      state.room.combat.enemies = [];
      tick(state);
      const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
      state.room.combat.player.x = door.rect.x + door.rect.width / 2;
      state.room.combat.player.y = door.rect.y + door.rect.height / 2;
      expect(enterDoorway(state, 'east').accepted).toBe(true);
    }
    expect(enterStore(state, 0).accepted).toBe(true);
    tick(state);
    return state;
  }
  throw new Error('no district');
}

const guard = (x: number, y: number): EnemyState => ({ id: 900, kind: 'shopper', x, y, health: 18, radius: 16, phase: 'recover', phaseTicks: 999, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 });

describe('district store twists (round 50)', () => {
  it('every district store announces its twist', () => {
    for (const store of DISTRICT_STORE_TEMPLATES) expect(TWIST_HINTS[store.id], store.id).toBeTruthy();
  });

  it('Candy Cauldron: the sample bowl patches up half a heart, once a visit', () => {
    const state = inside(1, 0);
    expect(activeStore(state)?.templateId).toBe('candy-cauldron');
    const p = state.room.combat.player;
    p.health = 3;
    p.x = SAMPLE_BOWL.x;
    p.y = SAMPLE_BOWL.y;
    tick(state);
    expect(p.health).toBe(4);
    tick(state);
    expect(p.health).toBe(4);
  });

  it('Novelty Nook: a guard on a buzzer tile is zapped still', () => {
    const state = inside(1, 1);
    expect(activeStore(state)?.templateId).toBe('novelty-nook');
    const tile = BUZZER_TILES[0]!;
    state.room.combat.enemies.push(guard(tile.x, tile.y));
    tick(state);
    expect(state.room.combat.enemies.at(-1)!.stunnedTicks ?? 0).toBeGreaterThan(0);
  });

  it('Glam Snaps: caught in the flash lane when it pops, the janitor freezes for a beat', () => {
    const state = inside(2, 0);
    expect(activeStore(state)?.templateId).toBe('glam-snaps');
    const p = state.room.combat.player;
    p.x = 480;
    p.y = STUDIO_FLASH_LANE.y + STUDIO_FLASH_LANE.height / 2;
    for (let t = 0; t < STUDIO_FLASH_CYCLE_TICKS; t += 1) tick(state);
    const x = p.x;
    tick(state, { moveX: 1 });
    expect(p.x).toBe(x);
  });

  it('Hair Affair: guards in the hairspray haze go sticky', () => {
    const state = inside(2, 1);
    expect(activeStore(state)?.templateId).toBe('hair-affair');
    const zone = HAIRSPRAY_ZONES[0]!;
    state.room.combat.enemies.push(guard(zone.x + zone.width / 2, zone.y + zone.height / 2));
    tick(state);
    expect(state.room.combat.enemies.at(-1)!.statuses?.stickyTicks ?? 0).toBeGreaterThan(0);
  });

  it('Pet Palace: the parrot cuts the alarm short', () => {
    const state = inside(3, 0);
    expect(activeStore(state)?.templateId).toBe('pet-palace');
    expect(alarmTicksFor(state)).toBe(ALARM_TICKS_BY_FLOOR[3] - PARROT_ALARM_CUT);
  });

  it('Green Thumb: a cactus pricks the janitor, and pricks a guard too', () => {
    const state = inside(3, 1);
    expect(activeStore(state)?.templateId).toBe('green-thumb');
    const pot = CACTUS_POTS[0]!;
    const p = state.room.combat.player;
    const before = p.health;
    p.x = pot.x;
    p.y = pot.y;
    state.room.combat.enemies.push(guard(CACTUS_POTS[1]!.x, CACTUS_POTS[1]!.y));
    tick(state);
    expect(p.health).toBe(before - 1);
    expect(state.room.combat.enemies.at(-1)!.health).toBeLessThan(18);
  });

  it('Skate Shack: rental skates carry the janitor further each step', () => {
    const state = inside(4, 0);
    expect(activeStore(state)?.templateId).toBe('skate-shack');
    const p = state.room.combat.player;
    p.x = 400;
    p.y = 300;
    tick(state, { moveX: 1 });
    const stepped = p.x - 400;
    expect(stepped).toBeCloseTo((210 / 60) * (1 + SKATE_BOOST), 3);
  });

  it('Cocoa Hut: every second thing bought here is free', () => {
    const state = inside(4, 1);
    expect(activeStore(state)?.templateId).toBe('cocoa-hut');
    state.cash = 200;
    state.inventory = { ...state.inventory, cash: 200 };
    const offers = state.wing.rooms[state.roomIndex]!.offers.filter((offer) => offer.storeId === 'cocoa-hut');
    expect(runOfferPrice(state, offers[1]!)).toBeGreaterThan(0);
    expect(buyRunOffer(state, offers[0]!.id).accepted).toBe(true);
    expect(runOfferPrice(state, offers[1]!)).toBe(0);
    const cash = state.cash;
    expect(buyRunOffer(state, offers[1]!.id).accepted).toBe(true);
    expect(state.cash).toBe(cash);
    expect(runOfferPrice(state, offers[2]!)).toBeGreaterThan(0);
  });

  it('a district storefront still opens one regular store beside it', () => {
    const state = inside(2, 0);
    expect(roomStores(state.wing.rooms[state.roomIndex]!).length).toBeGreaterThanOrEqual(1);
  });
});
