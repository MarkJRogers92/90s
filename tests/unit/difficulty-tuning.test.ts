import { describe, expect, it } from 'vitest';
import { MOP_DAMAGE, MOP_COOLDOWN_TICKS } from '../../src/sim/combat/attack';
import { BOSS_MAX_HEALTH, BOSS_PURSUE_SPEED_PER_TICK, BOSS_SLAM_REACH, BOSS_SUMMONED_HEALTH } from '../../src/sim/combat/boss';
import { SPITTER_PROJECTILE_SPEED_PER_TICK, SPITTER_RECOVER_TICKS } from '../../src/sim/combat/enemies';
import { MELEE_KNOCKBACK } from '../../src/sim/effects/resolveAttack';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';

/** Playtest 2026-09-28: two wins, 0 and 2 damage taken, boss never landed a hit. */
describe('difficulty tuning after the first playtest', () => {
  it('takes three mop hits to drop a Hanger or a Spitter', () => {
    const state = createMvpRun(7);
    let enemies = state.room.combat.enemies;
    for (let guard = 0; guard < 6 && enemies.length === 0; guard += 1) {
      state.room.combat.enemies = [];
      enterDoorway(state, 'east');
      enemies = state.room.combat.enemies;
    }
    expect(enemies.length).toBeGreaterThan(0);
    for (const enemy of enemies.filter((e) => (e.kind === 'hanger' || e.kind === 'spitter') && !e.elite)) expect(Math.ceil(enemy.health / MOP_DAMAGE)).toBe(3);
    expect(Math.ceil(BOSS_SUMMONED_HEALTH / MOP_DAMAGE)).toBe(3);
  });

  it('makes Spitters shoot more often and faster', () => {
    expect(SPITTER_RECOVER_TICKS).toBeLessThanOrEqual(66);
    expect(SPITTER_PROJECTILE_SPEED_PER_TICK * 60).toBeGreaterThanOrEqual(175);
  });

  it('makes the boss tougher, faster and longer-reaching', () => {
    expect(BOSS_MAX_HEALTH).toBe(90);
    expect(BOSS_PURSUE_SPEED_PER_TICK * 60).toBeGreaterThanOrEqual(48);
    expect(BOSS_SLAM_REACH).toBe(52);
  });

  it('keeps Hanger knockback fair: the shove still covers a cooldown of pursuit', () => {
    const hangerPerTick = 95 / 60;
    expect(MELEE_KNOCKBACK).toBeGreaterThan(hangerPerTick * MOP_COOLDOWN_TICKS);
  });
});
