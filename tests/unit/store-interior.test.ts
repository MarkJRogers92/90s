import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, nearestMvpInteraction, nearestRunOffer, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { alarmSpawnSpots } from '../../src/sim/run/heist';
import { HEAT_PER_STAR } from '../../src/sim/run/wanted';
import {
  CONCOURSE_FURNITURE,
  INTERIOR_ARRIVAL,
  INTERIOR_BOUNDS,
  INTERIOR_EXIT,
  STORE_EXIT_ARRIVAL_Y,
  activeStore,
  enterStore,
  generateRunWing,
  interiorWalls,
  roomStores,
  storeEntrance,
} from '../../src/sim/run/storeInterior';
import { generateWing } from '../../src/sim/wing/generateWing';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { moveCircle } from '../../src/sim/combat/movement';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const tick = (state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void => tickMvpRun(state, { ...idle, ...overrides });

/** On the concourse of the first storefront. */
function onConcourse(seed = 9): MvpRunState {
  const state = createMvpRun(seed);
  state.room.combat.enemies = [];
  tick(state);
  const door = state.wing.rooms[0]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = door.rect.x + door.rect.width / 2;
  state.room.combat.player.y = door.rect.y + door.rect.height / 2;
  if (!enterDoorway(state, 'east').accepted) throw new Error('no storefront');
  expect(roomStores(state.wing.rooms[state.roomIndex]!)).toHaveLength(2);
  return state;
}

function inside(seed = 9, shop = 0): MvpRunState {
  const state = onConcourse(seed);
  expect(enterStore(state, shop).accepted).toBe(true);
  return state;
}

function walkOut(state: MvpRunState): void {
  state.room.combat.player.x = INTERIOR_EXIT.x + INTERIOR_EXIT.width / 2;
  state.room.combat.player.y = INTERIOR_EXIT.y - 2;
  tick(state, { moveY: 1 });
}

const SEEDS = [9, 77, 5150, 1, 424242];

describe('store interiors', () => {
  it('gives every storefront two shops, so a floor visits all four stores', () => {
    for (const seed of SEEDS) {
      for (const floor of [1, 2, 3] as const) {
        const wing = generateRunWing(seed, floor);
        const shops = wing.rooms.flatMap((room) => roomStores(room).map((store) => store.templateId));
        expect(new Set(shops).size).toBe(shops.length);
        expect([...shops].sort()).toEqual(STORE_TEMPLATES.map((template) => template.id).sort());
        for (const room of wing.rooms) {
          if (!room.store) continue;
          expect(roomStores(room)[0]).toBe(room.store);
          for (const store of roomStores(room)) {
            const stock = room.offers.filter((offer) => offer.storeId === store.templateId);
            expect(stock).toHaveLength(4);
            expect(store.offerIds).toEqual(stock.map((offer) => offer.id));
          }
          expect(new Set(room.offers.map((offer) => offer.id)).size).toBe(room.offers.length);
        }
      }
    }
  });

  it('keeps the wing\'s own first shop and its stock, scaled to fill the room', () => {
    for (const seed of SEEDS) {
      const plain = generateWing(seed);
      const run = generateRunWing(seed);
      run.rooms.forEach((room, index) => {
        const before = plain.rooms[index]!;
        if (!room.store) {
          expect(room.offers).toEqual(before.offers);
          return;
        }
        const first = room.offers.filter((offer) => offer.storeId === room.store!.templateId);
        expect(first.map((offer) => offer.id)).toEqual(before.offers.map((offer) => offer.id));
        for (const store of roomStores(room)) {
          expect(store.bounds).toEqual(INTERIOR_BOUNDS);
          expect(store.exit.bounds).toEqual(INTERIOR_EXIT);
          for (const spot of [...alarmSpawnSpots(store, 5, 'alarm'), ...alarmSpawnSpots(store, 5, 'lockdown')]) {
            expect(spot.x).toBeGreaterThan(INTERIOR_BOUNDS.x);
            expect(spot.x).toBeLessThan(INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width);
            expect(spot.y).toBeGreaterThan(INTERIOR_BOUNDS.y);
            expect(spot.y).toBeLessThan(INTERIOR_EXIT.y);
          }
        }
        for (const offer of room.offers) {
          expect(offer.position.x).toBeGreaterThan(INTERIOR_BOUNDS.x);
          expect(offer.position.x).toBeLessThan(INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width);
          expect(offer.position.y).toBeGreaterThan(INTERIOR_BOUNDS.y);
          expect(offer.position.y).toBeLessThan(INTERIOR_EXIT.y);
        }
      });
    }
  });

  it('keeps the shelves out of reach from the concourse', () => {
    const state = onConcourse();
    const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
    state.room.combat.player.x = offer.position.x;
    state.room.combat.player.y = offer.position.y;
    expect(nearestRunOffer(state)).toBeUndefined();
    tick(state, { steal: true });
    expect(state.alarm).toBeNull();
    expect(state.carried).toEqual([]);
  });

  it('offers each shop door as its own interaction, and walking into one goes into that shop', () => {
    for (const shop of [0, 1]) {
      const state = onConcourse();
      const door = storeEntrance(shop);
      state.room.combat.player.x = door.x;
      state.room.combat.player.y = door.y + 30;
      expect(nearestMvpInteraction(state)).toMatchObject({ kind: 'store', storeIndex: shop });
      for (let index = 0; index < 20 && !state.room.interior; index += 1) tick(state, { moveY: -1 });
      expect(state.room.interior).toBe(true);
      expect(activeStore(state)).toBe(roomStores(state.wing.rooms[state.roomIndex]!)[shop]);
      expect(state.room.combat.player.x).toBe(INTERIOR_ARRIVAL.x);
      // Just inside the door (the same tick's step carries on inward).
      expect(Math.abs(state.room.combat.player.y - INTERIOR_ARRIVAL.y)).toBeLessThanOrEqual(4);
    }
  });

  it('only this shop\'s shelves answer inside it', () => {
    for (const shop of [0, 1]) {
      const state = inside(9, shop);
      const here = activeStore(state)!.templateId;
      for (const offer of state.wing.rooms[state.roomIndex]!.offers) {
        state.room.combat.player.x = offer.position.x;
        state.room.combat.player.y = offer.position.y;
        const nearest = nearestRunOffer(state);
        if (offer.storeId === here) expect(nearest?.storeId).toBe(here);
        else expect(nearest === undefined || nearest.storeId === here).toBe(true);
      }
    }
  });

  it('walls the shop in: the door is the only way out', () => {
    const state = inside();
    const walls = state.room.combat.walls;
    expect(walls).toEqual(interiorWalls(activeStore(state)!));
    for (let y = 5; y < 480; y += 15) {
      for (let x = 5; x < 960; x += 15) {
        const onFloor = x > INTERIOR_BOUNDS.x && x < INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width && y > INTERIOR_BOUNDS.y && y < INTERIOR_EXIT.y;
        const inDoor = x > INTERIOR_EXIT.x && x < INTERIOR_EXIT.x + INTERIOR_EXIT.width && y >= INTERIOR_EXIT.y;
        if (onFloor || inDoor) continue;
        expect(walls.some((wall) => circleIntersectsRect(x, y, 1, wall))).toBe(true);
      }
    }
  });

  it('walking out the door puts the janitor back in front of that shop', () => {
    for (const shop of [0, 1]) {
      const state = inside(9, shop);
      walkOut(state);
      expect(state.room.interior).toBe(false);
      expect(state.room.combat.player).toMatchObject({ x: storeEntrance(shop).x, y: STORE_EXIT_ARRIVAL_Y });
      expect(state.room.combat.walls).toEqual(state.wing.rooms[state.roomIndex]!.walls);
    }
  });

  it('a grab carried out the door is secured, and the guards stay inside', () => {
    for (const shop of [0, 1]) {
      const state = inside(9, shop);
      const here = activeStore(state)!.templateId;
      const offer = state.wing.rooms[state.roomIndex]!.offers.find((candidate) => candidate.storeId === here)!;
      state.room.combat.player.x = offer.position.x;
      state.room.combat.player.y = offer.position.y + 20;
      tick(state, { steal: true });
      tick(state);
      expect(state.alarm).toMatchObject({ storeId: here });
      expect(state.room.combat.enemies.length).toBeGreaterThan(0);
      walkOut(state);
      expect(state.room.interior).toBe(false);
      expect(state.carried).toEqual([]);
      expect(state.heat).toBe(HEAT_PER_STAR);
      expect(state.alarm).toBeNull();
      expect(state.room.combat.enemies).toEqual([]);
      expect(state.recentChange).not.toContain('Back out on the concourse');
    }
  });

  it('is not checkpointed: a restored shift resumes on the concourse with the same shops and shelves', () => {
    const state = inside(9, 1);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.room.interior).toBe(false);
    expect(restored.wing.rooms.map((room) => room.offers)).toEqual(state.wing.rooms.map((room) => room.offers));
    expect(restored.wing.rooms.map((room) => roomStores(room).map((store) => store.templateId)))
      .toEqual(state.wing.rooms.map((room) => roomStores(room).map((store) => store.templateId)));
  });

  it('Loss Prevention follows the janitor in through the shop door', () => {
    const state = inside();
    state.heat = 5 * HEAT_PER_STAR;
    tick(state);
    expect(state.stalker?.phase).toBe('arriving');
    expect({ x: state.stalker!.x, y: state.stalker!.y }).toEqual(INTERIOR_ARRIVAL);
  });

  it('stands the concourse furniture in the way, but never across the lane between the side doors', () => {
    const state = onConcourse();
    const room = state.wing.rooms[state.roomIndex]!;
    for (const piece of CONCOURSE_FURNITURE) {
      if (piece.footprint) expect(state.room.combat.walls).toContainEqual(piece.footprint);
    }
    // Walk the whole lane from the west door to the east door at the entry height.
    for (const y of [200, 240, 280]) {
      let position = { x: 30, y };
      for (let step = 0; step < 400; step += 1) position = moveCircle(position, 10, 3.5, 0, state.room.combat.walls);
      expect(position.x).toBeGreaterThan(900);
    }
    // And the furniture really blocks: walking up into the seating island stops short of it.
    const island = CONCOURSE_FURNITURE.find((piece) => piece.id === 'island')!.footprint!;
    let position = { x: island.x + island.width / 2, y: island.y + island.height + 40 };
    for (let step = 0; step < 60; step += 1) position = moveCircle(position, 10, 0, -3.5, state.room.combat.walls);
    expect(position.y).toBeGreaterThanOrEqual(island.y + island.height + 10);
    expect(room.walls).toEqual(state.room.combat.walls);
  });
});
