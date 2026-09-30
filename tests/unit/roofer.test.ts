import { describe, expect, it } from 'vitest';
import {
  ROOFER_FLEE_RANGE,
  ROOFER_LOB_TICKS,
  ROOFER_RECOVER_TICKS,
  TAR_PUDDLE_TICKS,
  TAR_SLOW,
  TAR_SPLASH_RADIUS,
  inTar,
} from '../../src/sim/combat/roofer';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function roofer(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 40, kind: 'roofer', x: 560, y: 160, health: 20, radius: 15,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

describe('the Roofer', () => {
  it('lobs tar at where the janitor stood when it threw, not where he goes', () => {
    const state = emptyFixture();
    state.enemies = [roofer()];
    tickRun(state, frame());
    const thrower = state.enemies[0]!;
    expect(thrower.phase).toBe('telegraph');
    expect(thrower.lobX).toBeCloseTo(300, 0);
    expect(thrower.lobY).toBeCloseTo(160, 0);
    // The janitor walks off; the landing spot stays put.
    advance(state, frame(0, 1), 10);
    expect(state.enemies[0]!.lobY).toBeCloseTo(160, 0);
  });

  it('the splash hurts a janitor still under it, and leaves a tar puddle there', () => {
    const state = emptyFixture();
    state.enemies = [roofer()];
    advance(state, frame(), ROOFER_LOB_TICKS + 2);
    expect(state.player.health).toBe(5);
    expect(state.tar).toHaveLength(1);
    expect(state.tar![0]).toMatchObject({ x: 300, y: 160 });
    expect(inTar(state, state.player)).toBe(true);
  });

  it('a janitor who moves out of the landing ring takes no damage', () => {
    const state = emptyFixture();
    state.enemies = [roofer()];
    tickRun(state, frame());
    advance(state, frame(0, 1), ROOFER_LOB_TICKS + 2);
    expect(Math.abs(state.player.y - 160)).toBeGreaterThan(TAR_SPLASH_RADIUS);
    expect(state.player.health).toBe(6);
    expect(state.tar).toHaveLength(1);
  });

  it('tar slows walking, not dashing, and dries up', () => {
    const slowed = emptyFixture();
    slowed.tar = [{ x: 300, y: 160, radius: 60, ticks: TAR_PUDDLE_TICKS }];
    const clear = emptyFixture();
    advance(slowed, frame(1, 0), 10);
    advance(clear, frame(1, 0), 10);
    expect(slowed.player.x - 300).toBeCloseTo((clear.player.x - 300) * TAR_SLOW, 0);

    const dried = emptyFixture();
    dried.tar = [{ x: 300, y: 160, radius: 60, ticks: 3 }];
    advance(dried, frame(), 4);
    expect(dried.tar).toHaveLength(0);
  });

  it('backs away from a janitor who closes in, between throws', () => {
    const state = emptyFixture();
    state.enemies = [roofer({ x: 300 + ROOFER_FLEE_RANGE - 40, phase: 'recover', phaseTicks: ROOFER_RECOVER_TICKS })];
    const x0 = state.enemies[0]!.x;
    advance(state, frame(), 20);
    expect(state.enemies[0]!.x).toBeGreaterThan(x0);
  });
});
