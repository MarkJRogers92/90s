/**
 * Clearing a fight is the run's only authored recovery.
 *
 * Six health across two combat rooms and a sixty-health boss made a chipped
 * shift arithmetically unwinnable, so a cleared fight now pays back a small
 * fixed amount. These tests pin both halves of that rule: fights heal, and the
 * enemy-free safe rooms do not.
 */
import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { PLAYER_MAX_HEALTH, ROOM_CLEAR_HEAL } from '../../src/sim/run/rooms';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

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

function advance(state: MvpRunState, count: number): void {
  for (let index = 0; index < count; index += 1) {
    tickMvpRun(state, input());
  }
}

/** Walks east the given number of rooms, through each room's own doorway. */
function walkEast(state: MvpRunState, rooms: number): void {
  for (let index = 0; index < rooms; index += 1) {
    const doorway = state.wing.rooms[state.roomIndex]!.doorways.find(
      (entry) => entry.side === 'east',
    )!;
    state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
    state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
    const result = enterDoorway(state, 'east');
    if (!result.accepted) {
      throw new Error(`Could not walk east: ${result.reason}`);
    }
  }
}

function roomIdAt(state: MvpRunState): string {
  return state.wing.rooms[state.roomIndex]!.id;
}

describe('room-clear recovery', () => {
  it('patches the janitor up when an authored fight is cleared', () => {
    const state = createMvpRun(9);
    walkEast(state, 2);
    expect(roomIdAt(state)).toBe('food_court');
    expect(state.wing.rooms[state.roomIndex]!.enemySpawns.length).toBeGreaterThan(0);
    advance(state, 1);
    expect(state.room.cleared).toBe(false);

    state.room.combat.player.health = 2;
    state.room.combat.enemies = [];
    advance(state, 1);

    expect(state.room.cleared).toBe(true);
    expect(state.room.combat.player.health).toBe(2 + ROOM_CLEAR_HEAL);
    expect(state.recentChange).toMatch(/patched up/i);
  });

  it('never heals past the authored maximum', () => {
    const state = createMvpRun(9);
    walkEast(state, 2);
    advance(state, 1);

    state.room.combat.player.health = PLAYER_MAX_HEALTH - 1;
    state.room.combat.enemies = [];
    advance(state, 1);

    expect(state.room.combat.player.health).toBe(PLAYER_MAX_HEALTH);
  });

  it('heals a cleared room exactly once', () => {
    const state = createMvpRun(9);
    walkEast(state, 2);
    advance(state, 1);
    state.room.combat.player.health = 2;
    state.room.combat.enemies = [];
    advance(state, 1);
    const afterClear = state.room.combat.player.health;

    advance(state, 30);

    expect(state.room.combat.player.health).toBe(afterClear);
  });

  it('does not heal in the enemy-free safe rooms', () => {
    const state = createMvpRun(9);
    // The service corridor authors no spawns, so it is clear on arrival.
    expect(state.wing.rooms[0]!.enemySpawns.length).toBe(0);
    state.room.combat.player.health = 2;
    advance(state, 5);
    expect(state.room.combat.player.health).toBe(2);

    // So does the first storefront.
    walkEast(state, 1);
    expect(roomIdAt(state)).toBe('storefront_a');
    expect(state.wing.rooms[state.roomIndex]!.enemySpawns.length).toBe(0);
    advance(state, 5);
    expect(state.room.combat.player.health).toBe(2);
  });
});
