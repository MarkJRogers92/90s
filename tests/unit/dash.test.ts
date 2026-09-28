import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN_TICKS, DASH_DISTANCE, DASH_TICKS } from '../../src/sim/combat/dash';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame, ProjectileState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

const dash = (moveX = 0, moveY = 0): InputFrame => ({ ...frame(moveX, moveY), dash: true });

describe('dash', () => {
  it('covers its distance along the held direction over its ticks', () => {
    const state = emptyFixture();
    const startX = state.player.x;
    tickRun(state, dash(1, 0));
    advance(state, frame(1, 0), DASH_TICKS - 1);
    expect(state.player.x - startX).toBeCloseTo(DASH_DISTANCE, 0);
    expect(state.player.y).toBe(160);
  });

  it('dashes toward the aim when standing still', () => {
    const state = emptyFixture();
    const startX = state.player.x;
    // frame() aims at (900, 240): east and a little south.
    tickRun(state, dash());
    advance(state, frame(), DASH_TICKS - 1);
    expect(state.player.x - startX).toBeGreaterThan(DASH_DISTANCE * 0.9);
    expect(state.player.y).toBeGreaterThan(160);
  });

  it('cannot be chained: it waits out its cooldown', () => {
    const state = emptyFixture();
    tickRun(state, dash(1, 0));
    advance(state, frame(), DASH_TICKS);
    const x = state.player.x;
    // Refused: holding right just walks one normal step.
    tickRun(state, dash(1, 0));
    expect(state.player.x - x).toBeLessThan(4);
    advance(state, frame(), DASH_COOLDOWN_TICKS);
    const ready = state.player.x;
    tickRun(state, dash(1, 0));
    expect(state.player.x - ready).toBeGreaterThan(DASH_DISTANCE / DASH_TICKS - 0.5);
  });

  it('stops at walls like walking does', () => {
    const state = emptyFixture();
    state.walls = [{ x: 330, y: 100, width: 20, height: 120 }];
    tickRun(state, dash(1, 0));
    advance(state, frame(1, 0), DASH_TICKS);
    expect(state.player.x + state.player.radius).toBeLessThanOrEqual(330);
  });

  it('lets a glob pass through without hurting, and it keeps flying', () => {
    const state = emptyFixture();
    const glob: ProjectileState = {
      id: 30, x: 340, y: 160, previousX: 340, previousY: 160, velocityX: -8, velocityY: 0,
      radius: 5, remainingTicks: 60, faction: 'enemy', damage: 1,
    };
    state.projectiles = [glob];
    tickRun(state, dash(0, -1));
    advance(state, frame(), 3);
    expect(state.player.health).toBe(6);
    expect(state.player.invulnerableTicks).toBe(0);
    expect(state.projectiles.some((shot) => shot.id === 30)).toBe(true);
  });

  it('slips through a Hanger without taking contact damage', () => {
    const state = emptyFixture();
    const hanger: EnemyState = {
      id: 20, kind: 'hanger', x: 330, y: 160, health: 8, radius: 14,
      phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
    };
    state.enemies = [hanger];
    tickRun(state, dash(1, 0));
    advance(state, frame(1, 0), DASH_TICKS - 1);
    expect(state.player.health).toBe(6);
  });
});
