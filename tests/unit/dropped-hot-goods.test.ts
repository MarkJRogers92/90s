import { describe, expect, it } from 'vitest';
import { definitionFor } from '../../src/sim/items/registry';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buyRunOffer } from '../../src/sim/run/economy';
import { stealRunOffer } from '../../src/sim/run/heist';
import { activeStore, enterStore } from '../../src/sim/run/storeInterior';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { HEAT_PER_STAR, LAY_LOW_COOLING, hotHeatFloor, hotItemCount } from '../../src/sim/run/wanted';
import { selectRunWeaponSlot } from '../../src/sim/run/weapons';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = {
  moveX: 0, moveY: 0, aimX: 900, aimY: 240,
  fire: false, interact: false, steal: false, recall: false,
};

/** Acquire a real shop weapon, then enter the first authored fight. */
function acquiredWeapon(stolen: boolean): MvpRunState {
  const state = createMvpRun(8);
  expect(enterDoorway(state, 'east').accepted).toBe(true);
  expect(enterStore(state).accepted).toBe(true);
  const store = activeStore(state)!;
  const offer = state.wing.rooms[state.roomIndex]!.offers.find((candidate) =>
    candidate.storeId === store.templateId && definitionFor(candidate.itemDefinitionId)?.base !== undefined);
  expect(offer).toBeDefined();
  const acquired = stolen ? stealRunOffer(state, offer!.id) : buyRunOffer(state, offer!.id);
  expect(acquired.accepted).toBe(true);

  // Cross the real exit in one tick: stolen goods are secured by the run, and
  // the alarm ends. No test assignment lowers or raises Heat.
  const player = state.room.combat.player;
  player.x = store.exit.bounds.x + store.exit.bounds.width / 2;
  player.y = store.exit.bounds.y - 2;
  tickMvpRun(state, { ...idle, moveY: 1 });
  expect(state.room.interior).toBe(false);
  expect(state.carried).toEqual([]);
  expect(state.heat).toBe(stolen ? HEAT_PER_STAR : 0);
  expect(selectRunWeaponSlot(state, 2).accepted).toBe(true);
  expect(enterDoorway(state, 'east').accepted).toBe(true);
  expect(state.wing.rooms[state.roomIndex]!.enemySpawns.length).toBeGreaterThan(0);
  expect(state.room.cleared).toBe(false);
  return state;
}

describe('recollecting a weapon after laying low in its room', () => {
  it.each([true, false])('restores the hot-goods floor only for stolen goods (stolen=%s)', (stolen) => {
    const state = acquiredWeapon(stolen);
    const weaponId = state.inventory.selectedPrimaryInstanceId;
    const weapon = state.inventory.inventory.find((node) => node.instanceId === weaponId)!;
    const combat = state.room.combat;
    const player = combat.player;
    player.x = 300;
    player.y = 240;
    combat.walls = [];
    // Set up the last survivor of this authored fight. Its actual death and
    // the one legitimate room-clear cooling happen through tickMvpRun below.
    combat.enemies = [{
      ...combat.enemies[0]!, x: 530, y: 240, health: 1,
      phase: 'recover', phaseTicks: 100_000,
    }];
    tickMvpRun(state, { ...idle, drop: true });
    const dropped = state.room.tokens.find((pickup) => pickup.node?.instanceId === weaponId)!;
    expect(dropped.node).toBe(weapon);
    expect(dropped.awaitingStepOff).toBe(true);
    expect(hotItemCount(state)).toBe(0);

    player.x = 500;
    tickMvpRun(state, { ...idle, fire: true });
    expect(state.room.cleared).toBe(true);
    expect(state.heat).toBe(stolen ? HEAT_PER_STAR - LAY_LOW_COOLING : 0);
    expect(state.room.tokens.find((pickup) => pickup.id === dropped.id)?.awaitingStepOff).toBe(false);

    player.x = dropped.x;
    player.y = dropped.y;
    tickMvpRun(state, idle);
    expect(state.inventory.inventory.find((node) => node.instanceId === weaponId)).toBe(weapon);
    expect(state.room.tokens.some((pickup) => pickup.id === dropped.id)).toBe(false);
    expect(hotItemCount(state)).toBe(stolen ? 1 : 0);
    expect(hotHeatFloor(state)).toBe(stolen ? HEAT_PER_STAR : 0);
    expect(state.heat).toBe(stolen ? HEAT_PER_STAR : 0);
  });
});
