import { describe, expect, it } from 'vitest';
import {
  WALKER_HEALTH,
  WALKER_PATROL_SPEED_PER_TICK,
  spawnWalker,
} from '../../src/sim/combat/walker';
import { tickRun } from '../../src/sim/tickRun';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState, hasLivingEnemies } from '../../src/sim/run/rooms';
import { MALL_TOKEN_VALUE } from '../../src/sim/run/tokens';
import type { InputFrame } from '../../src/sim/model';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import { emptyFixture, frame } from '../helpers';

const away = (state: ReturnType<typeof emptyFixture>): InputFrame => ({ ...frame(), aimX: state.player.x - 300, aimY: state.player.y });

describe('the Mall Walker (owner queue, round 48)', () => {
  it('walks its loop and ignores the janitor', () => {
    const state = emptyFixture();
    const walker = spawnWalker(70, state.player.x + 220, state.player.y);
    state.enemies = [walker];
    const start = { x: walker.x, y: walker.y };
    for (let tick = 0; tick < 120; tick += 1) tickRun(state, away(state));
    const moved = Math.hypot(state.enemies[0]!.x - start.x, state.enemies[0]!.y - start.y);
    expect(moved).toBeGreaterThan(WALKER_PATROL_SPEED_PER_TICK * 20);
    expect(state.enemies[0]!.provoked).toBeFalsy();
    expect(state.player.health).toBe(6);
  });

  it('a calm walker never blocks clearing the room', () => {
    const state = emptyFixture();
    state.enemies = [spawnWalker(70, 600, 300)];
    expect(hasLivingEnemies(state)).toBe(false);
  });

  it('bumping into it starts a fight: no hit for the bump, then it chases and hurts', () => {
    const state = emptyFixture();
    state.enemies = [spawnWalker(70, state.player.x + 20, state.player.y)];
    tickRun(state, away(state));
    expect(state.enemies[0]!.provoked).toBe(true);
    expect(state.player.health).toBe(6);
    expect(hasLivingEnemies(state)).toBe(true);
    // Chases now, and lands a hit once it reaches the janitor.
    for (let tick = 0; tick < 120 && state.player.health === 6; tick += 1) tickRun(state, away(state));
    expect(state.player.health).toBe(5);
  });

  it('hitting it starts a fight too', () => {
    const state = emptyFixture();
    const walker = spawnWalker(70, state.player.x + 40, state.player.y);
    state.enemies = [walker];
    tickRun(state, { ...frame(), aimX: walker.x, aimY: walker.y, fire: true });
    tickRun(state, frame());
    expect(state.enemies[0]!.health).toBeLessThan(WALKER_HEALTH);
    expect(state.enemies[0]!.provoked).toBe(true);
  });

  it('carries the most pocket change of any regular', () => {
    const regulars = (['hanger', 'spitter', 'mannequin', 'static', 'shopper', 'mascot', 'roofer'] as const).map((kind) => MALL_TOKEN_VALUE[kind]);
    expect(MALL_TOKEN_VALUE.walker).toBeGreaterThan(Math.max(...regulars));
  });

  it('strolls through some Floor 1-2 fights, never upstairs or into a boss room', () => {
    const walkersIn = (floor: FloorNumber, seed: number) => {
      const state = createMvpRun(seed, { floor });
      return state.wing.rooms.map((room, index) => ({
        boss: room.bossAnchor !== null,
        walkers: buildRoomCombatState(state.wing, index, 'west', state.inventory, state.seed).enemies.filter((enemy) => enemy.kind === 'walker').length,
      }));
    };
    let lowFloors = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      for (const floor of [1, 2] as const) {
        for (const room of walkersIn(floor, seed)) {
          if (room.boss) expect(room.walkers).toBe(0);
          lowFloors += room.walkers;
        }
      }
      for (const floor of [3, 4] as const) for (const room of walkersIn(floor, seed)) expect(room.walkers).toBe(0);
    }
    expect(lowFloors).toBeGreaterThan(10);
  });
});
