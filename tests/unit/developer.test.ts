import { describe, expect, it } from 'vitest';
import { BOSS_CONFIGS, bossConfigFor, isBossKind } from '../../src/sim/combat/boss';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

const config = BOSS_CONFIGS.developer;
const barrage = config.tarBarrage!;

function developer(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 50, kind: 'developer', x: 560, y: 160, health: config.maxHealth, radius: config.radius,
    phase: 'pursue', phaseTicks: 200, cooldownTicks: 999, telegraphAimX: -1, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

/** A boss one tick from the end of an attack wind-up. */
const winding = (health: number, attacksSoFar: number) =>
  developer({ health, phase: 'telegraph', phaseTicks: 1, bossAttacks: attacksSoFar, bossSummonedMid: true, bossSummoned: true });

const phaseTwoHealth = Math.floor(config.maxHealth * 0.5);
const phaseThreeHealth = Math.floor(config.maxHealth * 0.2);

describe('the Developer (Floor 4 boss)', () => {
  it('is a boss with its own config', () => {
    expect(isBossKind('developer')).toBe(true);
    expect(bossConfigFor('developer')).toBe(config);
    expect(config.summonKind).toBe('roofer');
    expect(config.maxHealth).toBeGreaterThan(BOSS_CONFIGS.owner.maxHealth);
  });

  it('from phase two every other attack is a tar barrage: rings locked on and around the janitor', () => {
    const state = emptyFixture();
    state.enemies = [winding(phaseTwoHealth, 1)];
    tickRun(state, frame());
    const strikes = state.enemies[0]!.tarStrikes!;
    expect(strikes).toHaveLength(barrage.counts[1]);
    expect(strikes[0]).toMatchObject({ x: state.player.x, y: state.player.y });
    for (const strike of strikes.slice(1)) {
      expect(Math.hypot(strike.x - state.player.x, strike.y - state.player.y)).toBeCloseTo(barrage.spread, 0);
    }
    // The buckets land together: one splash on the janitor, a puddle per ring.
    advance(state, frame(), barrage.lobTicks + 1);
    expect(state.enemies[0]!.tarStrikes ?? []).toHaveLength(0);
    expect(state.tar).toHaveLength(barrage.counts[1]);
    expect(state.player.health).toBe(5);
  });

  it('phase three throws more buckets', () => {
    const state = emptyFixture();
    state.enemies = [winding(phaseThreeHealth, 1)];
    tickRun(state, frame());
    expect(state.enemies[0]!.tarStrikes).toHaveLength(barrage.counts[2]);
  });

  it('the barrage alternates with the slam (from phase one since the 2026-09-30 playtest)', () => {
    const early = emptyFixture();
    early.enemies = [winding(config.maxHealth, 1)];
    tickRun(early, frame());
    expect(early.enemies[0]!.tarStrikes ?? []).toHaveLength(barrage.counts[0]);

    const even = emptyFixture();
    even.enemies = [winding(phaseTwoHealth, 2)];
    tickRun(even, frame());
    expect(even.enemies[0]!.tarStrikes ?? []).toHaveLength(0);
  });

  it('calls in a Roofer at phase two, then two more at phase three', () => {
    const state = emptyFixture();
    state.enemies = [developer({ health: phaseTwoHealth })];
    tickRun(state, frame());
    expect(state.enemies.filter((enemy) => enemy.kind === 'roofer')).toHaveLength(1);
    state.enemies[0]!.health = phaseThreeHealth;
    tickRun(state, frame());
    expect(state.enemies.filter((enemy) => enemy.kind === 'roofer')).toHaveLength(3);
    // A called-in Roofer waits a beat before its first throw.
    expect(state.enemies.find((enemy) => enemy.kind === 'roofer')!.phase).toBe('recover');
  });
});
