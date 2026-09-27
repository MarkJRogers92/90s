import { describe, expect, it } from 'vitest';
import { MELEE_KNOCKBACK } from '../../src/sim/effects/resolveAttack';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame } from '../../src/sim/model';
import { emptyFixture, frame } from '../helpers';

function hanger(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 20, kind: 'hanger', x: 0, y: 0, health: 12, radius: 14,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
    ...overrides,
  };
}

function swingAt(x: number, y: number): InputFrame {
  return { ...frame(), aimX: x, aimY: y, fire: true };
}

describe('melee knockback', () => {
  it('shoves a struck enemy straight away from the janitor', () => {
    const state = emptyFixture();
    const target = hanger({ x: state.player.x + 50, y: state.player.y });
    state.enemies = [target];
    const before = target.x - state.player.x;
    tickRun(state, swingAt(target.x, target.y));
    const hit = state.enemies[0]!;
    expect(hit.health).toBeLessThan(12);
    // It is pushed at least most of the knockback (walls permitting), minus
    // the one tick of pursuit it gets back.
    expect(hit.x - state.player.x).toBeGreaterThan(before + MELEE_KNOCKBACK - 4);
    expect(Math.abs(hit.y - state.player.y)).toBeLessThan(1);
  });

  it('opens enough room that the next swing lands before a Hanger can touch', () => {
    // Knockback must cover the ground a Hanger closes during one mop cooldown.
    // 95 px/s for 27 ticks is about 43 px.
    expect(MELEE_KNOCKBACK).toBeGreaterThanOrEqual(44);
  });

  it('leaves a Spitter where it stands, so it can be finished instead of chased', () => {
    const state = emptyFixture();
    const spitter = hanger({ kind: 'spitter', radius: 16, x: state.player.x + 50, y: state.player.y, phase: 'recover', phaseTicks: 90 });
    state.enemies = [spitter];
    tickRun(state, swingAt(spitter.x, spitter.y));
    expect(state.enemies[0]!.health).toBeLessThan(12);
    expect(state.enemies[0]!.x).toBeCloseTo(state.player.x + 50, 0);
  });

  it('never shoves the boss', () => {
    const state = emptyFixture();
    const boss = hanger({ kind: 'lp_manager', radius: 22, health: 60, x: state.player.x + 50, y: state.player.y, phase: 'recover', phaseTicks: 90 });
    state.enemies = [boss];
    tickRun(state, swingAt(boss.x, boss.y));
    expect(state.enemies[0]!.health).toBeLessThan(60);
    expect(state.enemies[0]!.x).toBeCloseTo(state.player.x + 50, 0);
  });
});
