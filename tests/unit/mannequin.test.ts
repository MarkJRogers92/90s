import { describe, expect, it } from 'vitest';
import { MANNEQUIN_BITE_FREEZE_TICKS, MANNEQUIN_SPEED_PER_TICK, mannequinWatched } from '../../src/sim/combat/mannequin';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame } from '../../src/sim/model';
import { emptyFixture, frame } from '../helpers';

function mannequin(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 40, kind: 'mannequin', x: 500, y: 160, health: 20, radius: 14,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

const aimAt = (x: number, y: number): InputFrame => ({ ...frame(), aimX: x, aimY: y });

describe('the mannequin', () => {
  it('freezes while the janitor aims at it', () => {
    const state = emptyFixture();
    state.enemies = [mannequin()];
    tickRun(state, aimAt(500, 160));
    expect(state.enemies[0]!.x).toBe(500);
    expect(mannequinWatched(state, state.enemies[0]!)).toBe(true);
  });

  it('rushes the janitor the moment they look away', () => {
    const state = emptyFixture();
    state.enemies = [mannequin()];
    tickRun(state, aimAt(100, 160));
    expect(state.enemies[0]!.x).toBeCloseTo(500 - MANNEQUIN_SPEED_PER_TICK, 5);
    expect(MANNEQUIN_SPEED_PER_TICK * 60).toBeGreaterThan(95);
  });

  it('is not watched through a wall', () => {
    const state = emptyFixture();
    state.walls = [{ x: 390, y: 100, width: 20, height: 120 }];
    state.enemies = [mannequin()];
    tickRun(state, aimAt(500, 160));
    expect(state.enemies[0]!.x).toBeLessThan(500);
  });

  it('hurts on touch when moving, but a watched mannequin is harmless', () => {
    const watched = emptyFixture();
    watched.enemies = [mannequin({ x: watched.player.x + 20, y: watched.player.y })];
    tickRun(watched, aimAt(watched.player.x + 20, watched.player.y));
    expect(watched.player.health).toBe(6);
    const unwatched = emptyFixture();
    unwatched.enemies = [mannequin({ x: unwatched.player.x + 20, y: unwatched.player.y })];
    tickRun(unwatched, aimAt(unwatched.player.x - 200, unwatched.player.y));
    expect(unwatched.player.health).toBe(5);
  });

  it('freezes after a bite, long enough to break away, and creaks back to life', () => {
    const state = emptyFixture();
    state.enemies = [mannequin({ x: state.player.x + 20, y: state.player.y })];
    const away = aimAt(state.player.x - 200, state.player.y);
    tickRun(state, away);
    expect(state.player.health).toBe(5);
    const bitten = { x: state.enemies[0]!.x, y: state.enemies[0]!.y };
    // Caught: it holds still and harmless past the janitor's invulnerability.
    for (let tick = 0; tick < MANNEQUIN_BITE_FREEZE_TICKS; tick += 1) tickRun(state, away);
    expect(MANNEQUIN_BITE_FREEZE_TICKS).toBeGreaterThan(60);
    expect(state.player.health).toBe(5);
    expect(state.enemies[0]!).toMatchObject({ x: bitten.x, y: bitten.y, phase: 'recover' });
    // Still standing in reach when it wakes: it bites again.
    tickRun(state, away);
    expect(state.player.health).toBe(4);
  });

  it('is shoved back by the mop like a Hanger', () => {
    const state = emptyFixture();
    const target = mannequin({ x: state.player.x + 50, y: state.player.y });
    state.enemies = [target];
    tickRun(state, { ...aimAt(target.x, target.y), fire: true });
    expect(state.enemies[0]!.x - state.player.x).toBeGreaterThan(80);
  });
});
