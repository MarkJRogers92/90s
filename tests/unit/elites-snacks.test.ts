import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { collectTokens, dropTokensForDeaths, MALL_TOKEN_VALUE } from '../../src/sim/run/tokens';
import { ELITE_HEALTH_MULTIPLIER, luck } from '../../src/sim/run/luck';
import { PLAYER_MAX_HEALTH } from '../../src/sim/run/rooms';

function allCombatEnemies(seeds: number) {
  const enemies = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    const state = createMvpRun(seed);
    for (let guard = 0; guard < 6; guard += 1) {
      enemies.push(...state.room.combat.enemies.filter((enemy) => enemy.kind !== 'lp_manager'));
      state.room.combat.enemies = [];
      if (!enterDoorway(state, 'east').accepted) break;
    }
  }
  return enemies;
}

describe('seeded luck', () => {
  it('is deterministic and roughly uniform', () => {
    expect(luck(7, 'elite', 2, 1)).toBe(luck(7, 'elite', 2, 1));
    const draws = Array.from({ length: 2000 }, (_, i) => luck(i, 'test', 0, 0));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('Clearance elites', () => {
  it('turn up sometimes, never on the boss, with double health', () => {
    const enemies = allCombatEnemies(40);
    const elites = enemies.filter((enemy) => enemy.elite);
    expect(elites.length).toBeGreaterThan(0);
    expect(elites.length).toBeLessThan(enemies.length / 2);
    for (const elite of elites) expect(elite.health).toBe(12 * ELITE_HEALTH_MULTIPLIER);
  });

  it('drop three times the change', () => {
    const state = createMvpRun(7);
    state.room.tokens = [];
    dropTokensForDeaths(state, [{ id: 1, kind: 'spitter', x: 100, y: 100, health: 5, elite: true }]);
    expect(state.room.tokens.filter((t) => t.kind !== 'snack').reduce((sum, t) => sum + t.value, 0)).toBe(MALL_TOKEN_VALUE.spitter * 3);
  });
});

describe('snack drops', () => {
  function dropMany(elite: boolean): number {
    let snacks = 0;
    for (let id = 1; id <= 400; id += 1) {
      const state = createMvpRun(7);
      state.room.tokens = [];
      state.tick = id * 13;
      dropTokensForDeaths(state, [{ id, kind: 'hanger', x: 100, y: 100, health: 3, elite }]);
      snacks += state.room.tokens.filter((t) => t.kind === 'snack').length;
    }
    return snacks;
  }

  it('fall from some kills, more often from elites', () => {
    const normal = dropMany(false);
    const elite = dropMany(true);
    expect(normal).toBeGreaterThan(20);
    expect(normal).toBeLessThan(160);
    expect(elite).toBeGreaterThan(normal);
  });

  it('heal half a heart, and wait on the floor while health is full', () => {
    const state = createMvpRun(7);
    const p = state.room.combat.player;
    state.room.tokens = [{ id: 's', kind: 'snack', x: p.x, y: p.y, value: 0, droppedTick: 0 }];
    collectTokens(state);
    expect(state.room.tokens).toHaveLength(1);
    p.health = PLAYER_MAX_HEALTH - 2;
    collectTokens(state);
    expect(p.health).toBe(PLAYER_MAX_HEALTH - 1);
    expect(state.room.tokens).toHaveLength(0);
  });
});
