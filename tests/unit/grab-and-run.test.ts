import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { runOfferPrice } from '../../src/sim/run/economy';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { ascend } from '../../src/sim/run/floors';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { confirmRunFusionPreview, openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import {
  ALARM_TICKS,
  LOCKDOWN_HEAT,
  SMUGGLE_POUCH_ALARM_BONUS,
  RUN_THEFT_HEAT,
  alarmSpawnSpots,
} from '../../src/sim/run/heist';
import {
  HEAT_PER_STAR,
  LAY_LOW_COOLING,
  WANTED_SURCHARGE_PER_STAR,
  hotHeatFloor,
  hotItemCount,
  wantedStars,
} from '../../src/sim/run/wanted';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { scoreFor } from '../../src/game/score/score';
import { stubsForShift } from '../../src/game/career/career';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function tick(state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void {
  tickMvpRun(state, { ...idle, ...overrides });
}

function walkEast(state: MvpRunState): void {
  state.room.combat.enemies = [];
  tick(state);
  const doorway = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  const result = enterDoorway(state, 'east');
  if (!result.accepted) throw new Error(result.reason);
}

/** A shift standing in the West Storefront, next to its first offer. */
function atShelf(seed = 9): MvpRunState {
  const state = createMvpRun(seed);
  walkEast(state);
  // The shelves are inside: through the shop door first.
  if (!enterStore(state).accepted) throw new Error('could not enter the store');
  const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
  state.room.combat.player.x = offer.position.x;
  state.room.combat.player.y = offer.position.y + 20;
  return state;
}

function grab(state: MvpRunState): void {
  tick(state, { steal: true });
  tick(state);
}

function store(state: MvpRunState) {
  return state.wing.rooms[state.roomIndex]!.store!;
}

function stepOutOfStore(state: MvpRunState): void {
  const exit = store(state).exit.bounds;
  state.room.combat.player.x = exit.x + exit.width / 2;
  state.room.combat.player.y = exit.y - 2;
  tick(state, { moveY: 1 });
}

function leaf(itemDefinitionId: string, acquisitionKind: 'purchased' | 'stolen'): InventoryLeaf {
  return { kind: 'leaf', instanceId: `t-${itemDefinitionId}`, itemDefinitionId, acquisitionKind, sourceLocationId: 'test', sourceStockId: `t-${itemDefinitionId}`, acquisitionTick: 0 };
}

function own(state: MvpRunState, node: InventoryLeaf, select = false): void {
  state.inventory = {
    ...state.inventory,
    inventory: [...state.inventory.inventory, node],
    ...(select ? { selectedPrimaryInstanceId: node.instanceId } : {}),
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
}

describe('grab and run: the store alarm', () => {
  it('grabbing an item sounds the alarm and wakes the store guards', () => {
    const state = atShelf();
    expect(state.alarm).toBeNull();
    grab(state);
    expect(state.carried).toHaveLength(1);
    expect(state.alarm).toMatchObject({ storeId: store(state).templateId, shutter: 'open' });
    expect(state.alarm!.ticksLeft).toBeLessThanOrEqual(ALARM_TICKS);
    const kinds = state.room.combat.enemies.map((enemy) => enemy.kind);
    expect(kinds.filter((kind) => kind === 'shopper').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('mannequin');
  });

  it('every guard spot in every store template is inside the store and clear of walls', () => {
    for (const template of STORE_TEMPLATES) {
      const state = atShelf();
      const room = state.wing.rooms[state.roomIndex]!;
      const walls = room.walls;
      const fakeStore = { ...room.store!, templateId: template.id, bounds: template.bounds, exit: template.exit };
      for (const wanted of [0, 5]) {
        for (const spot of [...alarmSpawnSpots(fakeStore, wanted, 'alarm'), ...alarmSpawnSpots(fakeStore, wanted, 'lockdown')]) {
          expect(spot.x).toBeGreaterThan(template.bounds.x);
          expect(spot.x).toBeLessThan(template.bounds.x + template.bounds.width);
          expect(spot.y).toBeGreaterThan(template.bounds.y);
          expect(spot.y).toBeLessThan(template.bounds.y + template.bounds.height);
          if (template.id === room.store!.templateId) {
            expect(walls.some((wall) => circleIntersectsRect(spot.x, spot.y, 18, wall))).toBe(false);
          }
        }
      }
    }
  });

  it('getting out the door in time keeps the item: one star of Heat, alarm over', () => {
    const state = atShelf();
    grab(state);
    stepOutOfStore(state);
    expect(state.carried).toEqual([]);
    expect(state.inventory.inventory.some((node) => node.kind === 'leaf' && node.acquisitionKind === 'stolen')).toBe(true);
    expect(state.heat).toBe(RUN_THEFT_HEAT);
    expect(wantedStars(state.heat)).toBe(1);
    expect(state.alarm).toBeNull();
  });

  it('there is no sight cone any more: carrying stolen stock never raises suspicion', () => {
    const state = atShelf();
    grab(state);
    for (let i = 0; i < 60; i += 1) tick(state);
    expect(state.suspicion).toBe(0);
    expect(state.carried).toHaveLength(1);
  });

  it('too slow: the shutter drops, a second wave comes, and Heat jumps', () => {
    const state = atShelf();
    grab(state);
    const guards = state.room.combat.enemies.length;
    const exit = store(state).exit.bounds;
    for (let i = 0; i < ALARM_TICKS + 2 && state.alarm?.shutter === 'open'; i += 1) {
      state.room.combat.player.invulnerableTicks = 30;
      tick(state);
    }
    expect(state.alarm?.shutter).toBe('closed');
    expect(state.room.combat.walls.some((wall) => wall.x === exit.x && wall.y === exit.y && wall.width === exit.width)).toBe(true);
    expect(state.room.combat.enemies.length).toBeGreaterThan(guards);
    expect(state.heat).toBe(LOCKDOWN_HEAT);

    // The shutter holds: walking at it does not get the item out.
    state.room.combat.player.x = exit.x + exit.width / 2;
    state.room.combat.player.y = exit.y - 14;
    state.room.combat.enemies = state.room.combat.enemies.map((enemy) => ({ ...enemy, x: 40, y: 40, phase: 'recover', phaseTicks: 999 }));
    for (let i = 0; i < 10; i += 1) tick(state, { moveY: 1 });
    expect(state.carried).toHaveLength(1);

    // Down every guard and the shutter lifts; then the door secures the item.
    state.room.combat.enemies = [];
    tick(state);
    expect(state.alarm?.shutter).toBe('lifted');
    expect(state.room.combat.walls.some((wall) => wall.x === exit.x && wall.y === exit.y && wall.width === exit.width)).toBe(false);
    stepOutOfStore(state);
    expect(state.carried).toEqual([]);
    expect(state.heat).toBe(LOCKDOWN_HEAT + RUN_THEFT_HEAT);
  });

  it('the shutter waits rather than closing on a janitor standing in the doorway', () => {
    const state = atShelf();
    grab(state);
    state.room.combat.enemies = [];
    const exit = store(state).exit.bounds;
    state.alarm!.ticksLeft = 1;
    state.room.combat.player.x = exit.x + exit.width / 2;
    state.room.combat.player.y = exit.y + exit.height / 2;
    tick(state);
    expect(state.alarm?.shutter).toBe('open');
  });

  it('the Reinforced Fanny Pack buys extra seconds before the shutter', () => {
    const plain = atShelf();
    grab(plain);
    const pouched = atShelf();
    own(pouched, leaf('fanny_pack', 'purchased'));
    grab(pouched);
    expect(pouched.alarm!.ticksLeft - plain.alarm!.ticksLeft).toBe(SMUGGLE_POUCH_ALARM_BONUS);
  });

  it('a second grab during the alarm does not restart it or call more guards', () => {
    const state = atShelf();
    own(state, leaf('fanny_pack', 'purchased'));
    grab(state);
    const guards = state.room.combat.enemies.length;
    const left = state.alarm!.ticksLeft;
    const second = state.wing.rooms[state.roomIndex]!.offers.find((offer) => state.offerStatus[offer.id] !== 'carried' && offer.itemDefinitionId !== 'fanny_pack')!;
    state.room.combat.player.x = second.position.x;
    state.room.combat.player.y = second.position.y + 20;
    grab(state);
    expect(state.carried).toHaveLength(2);
    expect(state.alarm!.ticksLeft).toBeLessThan(left);
    expect(state.room.combat.enemies.length).toBeLessThanOrEqual(guards);
  });
});

describe('the wanted level', () => {
  it('turns Heat into stars, 20 a star, five at most', () => {
    expect(HEAT_PER_STAR).toBe(20);
    expect([0, 19, 20, 59, 60, 100].map(wantedStars)).toEqual([0, 0, 1, 2, 3, 5]);
  });

  it('a wanted janitor meets extra security in every fight, and none when clean', () => {
    const state = createMvpRun(9);
    const fightIndex = state.wing.rooms.findIndex((room) => room.enemySpawns.length > 0 && room.bossAnchor === null);
    const clean = buildRoomCombatState(state.wing, fightIndex, 'west', state.inventory, state.seed);
    expect(buildRoomCombatState(state.wing, fightIndex, 'west', state.inventory, state.seed, 0).enemies).toEqual(clean.enemies);
    const two = buildRoomCombatState(state.wing, fightIndex, 'west', state.inventory, state.seed, 2);
    expect(two.enemies.length).toBe(clean.enemies.length + 2);
    expect(two.enemies.slice(clean.enemies.length).map((enemy) => enemy.kind)).toEqual(['mannequin', 'shopper']);
    // Safe rooms stay safe.
    expect(buildRoomCombatState(state.wing, 1, 'west', state.inventory, state.seed, 5).enemies).toEqual([]);
  });

  it('walking into a fight wanted brings that security along', () => {
    const state = atShelf();
    state.heat = 2 * HEAT_PER_STAR;
    state.room.combat.player.x = 0;
    walkEast(state);
    const clean = buildRoomCombatState(state.wing, state.roomIndex, 'west', state.inventory, state.seed);
    expect(state.room.combat.enemies.length).toBe(clean.enemies.length + 2);
  });

  it('clearing a fight lays low and sheds Heat', () => {
    const state = createMvpRun(9);
    walkEast(state);
    walkEast(state);
    expect(state.room.combat.enemies.length).toBeGreaterThan(0);
    state.heat = 50;
    state.room.combat.enemies = [];
    tick(state);
    expect(state.heat).toBe(50 - LAY_LOW_COOLING);
  });

  it('shops charge a wanted janitor more', () => {
    const state = atShelf();
    const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
    const clean = runOfferPrice(state, offer);
    state.heat = 3 * HEAT_PER_STAR;
    expect(runOfferPrice(state, offer)).toBe(clean + 3 * WANTED_SURCHARGE_PER_STAR);
  });

  it('Heat rides the escalator', () => {
    const state = createMvpRun(9);
    state.heat = 40;
    state.status = 'won';
    expect(ascend(state).heat).toBe(40);
  });

  it('a restored checkpoint rebuilds the room with its security', () => {
    const state = createMvpRun(9);
    walkEast(state);
    state.heat = 40;
    walkEast(state);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.room.combat.enemies.length).toBe(state.room.combat.enemies.length);
    expect(restored.alarm).toBeNull();
  });

  it('risk pays: stars add score and Pay Stubs instead of costing them', () => {
    const base = { won: false, roomsReached: 3, kills: 4, bestCombo: 2, cash: 10, seconds: 100 };
    expect(scoreFor({ ...base, heat: 60 }) - scoreFor({ ...base, heat: 0 })).toBe(3 * 60);
    const result = { score: 0, won: false, floorCleared: false, kills: 0, bestCombo: 0, seconds: 0, mall: 1 };
    expect(stubsForShift({ ...result, wanted: 3 }).lines).toContainEqual({ label: 'FIVE-FINGER BONUS', amount: 3 });
    expect(stubsForShift(result).lines.some((line) => line.label === 'FIVE-FINGER BONUS')).toBe(false);
  });
});

describe('hot goods', () => {
  it('a stolen weapon hits harder than the same one bought', () => {
    const bought = createMvpRun(9);
    own(bought, leaf('box_cutter', 'purchased'), true);
    const stolen = createMvpRun(9);
    own(stolen, leaf('box_cutter', 'stolen'), true);
    expect(stolen.room.combat.compiledLoadout.primary.damage).toBe(bought.room.combat.compiledLoadout.primary.damage + 1);

    const boughtGun = createMvpRun(9);
    own(boughtGun, leaf('pump_soaker', 'purchased'), true);
    const hotGun = createMvpRun(9);
    own(hotGun, leaf('pump_soaker', 'stolen'), true);
    const payload = (state: MvpRunState) => state.room.combat.compiledLoadout.effects.find((effect) => effect.kind === 'projectile_payload');
    expect((payload(hotGun) as { damage: number }).damage).toBe((payload(boughtGun) as { damage: number }).damage + 1);
  });

  it('the bonus survives a room change', () => {
    const state = createMvpRun(9);
    own(state, leaf('box_cutter', 'stolen'), true);
    const damage = state.room.combat.compiledLoadout.primary.damage;
    walkEast(state);
    expect(state.room.combat.compiledLoadout.primary.damage).toBe(damage);
  });

  it('each hot item keeps the janitor at least one star wanted', () => {
    const state = createMvpRun(9);
    own(state, leaf('box_cutter', 'stolen'));
    own(state, leaf('gel_pens', 'stolen'));
    expect(hotItemCount(state)).toBe(2);
    expect(hotHeatFloor(state)).toBe(2 * HEAT_PER_STAR);
    walkEast(state);
    walkEast(state);
    state.heat = 45;
    state.room.combat.enemies = [];
    tick(state);
    expect(state.heat).toBe(40);
  });

  it('fusing a hot item at the Bench Warrant launders it', () => {
    const state = createMvpRun(5);
    own(state, leaf('pump_soaker', 'stolen'));
    own(state, leaf('gel_pens', 'purchased'));
    state.cash = 40;
    state.inventory = { ...state.inventory, cash: 40 };
    state.heat = 30;
    const kiosk = state.wing.rooms[0]!.benchKiosk!;
    state.room.combat.player.x = kiosk.x;
    state.room.combat.player.y = kiosk.y;
    expect(hotItemCount(state)).toBe(1);
    openRunWorkbench(state);
    pickWorkbenchItem(state, 't-pump_soaker');
    pickWorkbenchItem(state, 't-gel_pens');
    const result = confirmRunFusionPreview(state);
    expect(result.accepted).toBe(true);
    expect(result.accepted && result.message).toMatch(/laundered/i);
    expect(hotItemCount(state)).toBe(0);
    expect(hotHeatFloor(state)).toBe(0);
  });
});
