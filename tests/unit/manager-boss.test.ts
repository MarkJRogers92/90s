import { describe, expect, it } from 'vitest';
import { BOSS_CONFIGS, bossPhaseForHealth, isBossKind } from '../../src/sim/combat/boss';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

const M = BOSS_CONFIGS.manager;

function manager(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 10, kind: 'manager', x: 500, y: 240, health: M.maxHealth, radius: M.radius,
    phase: 'recover', phaseTicks: 100_000, cooldownTicks: 1, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

describe('the Mall Manager', () => {
  it('is a boss with its own, tougher numbers', () => {
    expect(isBossKind('manager')).toBe(true);
    expect(isBossKind('lp_manager')).toBe(true);
    expect(isBossKind('hanger')).toBe(false);
    expect(M.maxHealth).toBeGreaterThan(BOSS_CONFIGS.lp_manager.maxHealth);
    expect(M.slamReach).toBeGreaterThan(BOSS_CONFIGS.lp_manager.slamReach);
  });

  it('reads its phase against its own maximum health', () => {
    expect(bossPhaseForHealth(M.maxHealth, M.maxHealth)).toBe(1);
    expect(bossPhaseForHealth(Math.floor(M.maxHealth * 0.5), M.maxHealth)).toBe(2);
    expect(bossPhaseForHealth(Math.floor(M.maxHealth * 0.2), M.maxHealth)).toBe(3);
  });

  it('fires a wider volley than Loss Prevention, even in its first phase', () => {
    const state = emptyFixture();
    state.enemies = [manager({ cooldownTicks: 1 })];
    state.roomWasPopulated = true;
    tickRun(state, frame());
    const shots = state.projectiles.filter((shot) => shot.faction === 'enemy');
    expect(shots).toHaveLength(M.volleyAngles.length);
    expect(M.volleyAngles.length).toBeGreaterThan(BOSS_CONFIGS.lp_manager.volleyAngles.length);
  });

  it('calls in Bargain Hunters when it hits its last phase', () => {
    const state = emptyFixture();
    state.enemies = [manager({ health: Math.floor(M.maxHealth * 0.2), cooldownTicks: 150 })];
    state.roomWasPopulated = true;
    tickRun(state, frame());
    const summoned = state.enemies.filter((enemy) => enemy.kind === M.summonKind);
    expect(M.summonKind).toBe('shopper');
    expect(summoned).toHaveLength(2);
    advance(state, frame(), 5);
    expect(state.enemies.filter((enemy) => enemy.kind === M.summonKind)).toHaveLength(2);
  });
});
