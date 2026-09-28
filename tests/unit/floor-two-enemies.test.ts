import { describe, expect, it } from 'vitest';
import {
  STATIC_BURST_RADIUS,
  STATIC_DRIFT_TICKS,
  STATIC_TELEGRAPH_TICKS,
} from '../../src/sim/combat/staticEnemy';
import { SHOPPER_CHARGE_TICKS, SHOPPER_TELEGRAPH_TICKS } from '../../src/sim/combat/shopper';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function enemy(kind: EnemyState['kind'], overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 30, kind, x: 600, y: 160, health: 14, radius: 14,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

describe('the Static', () => {
  it('locks onto where the janitor stood, then blinks there and shocks', () => {
    const state = emptyFixture();
    state.enemies = [enemy('static', { phaseTicks: 1 })];
    tickRun(state, frame());
    const locked = state.enemies[0]!;
    expect(locked.phase).toBe('telegraph');
    expect(locked.blinkX).toBeCloseTo(state.player.x, 0);
    advance(state, frame(), STATIC_TELEGRAPH_TICKS);
    const after = state.enemies[0]!;
    expect(Math.hypot(after.x - locked.blinkX!, after.y - locked.blinkY!)).toBeLessThan(1);
    expect(state.player.health).toBe(5);
    expect(after.phase).toBe('recover');
  });

  it('misses a janitor who moved off the mark', () => {
    const state = emptyFixture();
    state.enemies = [enemy('static', { phaseTicks: 1 })];
    tickRun(state, frame());
    advance(state, frame(0, 1), STATIC_TELEGRAPH_TICKS);
    expect(state.player.health).toBe(6);
    expect(STATIC_BURST_RADIUS).toBeLessThan(STATIC_TELEGRAPH_TICKS * (210 / 60));
  });

  it('drifts between blinks', () => {
    const state = emptyFixture();
    state.enemies = [enemy('static', { phaseTicks: STATIC_DRIFT_TICKS })];
    tickRun(state, frame());
    expect(state.enemies[0]!.x).toBeLessThan(600);
    expect(state.enemies[0]!.phase).toBe('pursue');
  });
});

describe('the Bargain Hunter', () => {
  it('lines up a charge when it sees the janitor, then barrels along that line', () => {
    const state = emptyFixture();
    state.enemies = [enemy('shopper', { health: 18, radius: 16 })];
    tickRun(state, frame());
    expect(state.enemies[0]!.phase).toBe('telegraph');
    expect(state.enemies[0]!.telegraphAimX).toBeCloseTo(-1);
    const startX = state.enemies[0]!.x;
    advance(state, frame(), SHOPPER_TELEGRAPH_TICKS + 4);
    expect(startX - state.enemies[0]!.x).toBeGreaterThan(20);
  });

  it('hurts only while charging, and a sidestep dodges it', () => {
    const hit = emptyFixture();
    hit.enemies = [enemy('shopper', { health: 18, radius: 16, x: hit.player.x + 150 })];
    advance(hit, frame(), SHOPPER_TELEGRAPH_TICKS + SHOPPER_CHARGE_TICKS + 2);
    expect(hit.player.health).toBe(5);
    const dodge = emptyFixture();
    dodge.enemies = [enemy('shopper', { health: 18, radius: 16, x: dodge.player.x + 150 })];
    tickRun(dodge, frame());
    advance(dodge, frame(0, 1), SHOPPER_TELEGRAPH_TICKS + SHOPPER_CHARGE_TICKS + 2);
    expect(dodge.player.health).toBe(6);
  });

  it('stuns itself when it hits a wall', () => {
    const state = emptyFixture();
    state.walls = [{ x: 330, y: 0, width: 20, height: 400 }];
    state.player.x = 300;
    state.enemies = [enemy('shopper', { health: 18, radius: 16, x: 460 })];
    advance(state, frame(), SHOPPER_TELEGRAPH_TICKS + SHOPPER_CHARGE_TICKS);
    expect(state.enemies[0]!.stunnedTicks ?? 0).toBeGreaterThan(0);
    expect(state.player.health).toBe(6);
  });
});
