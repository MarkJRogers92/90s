import { describe, expect, it } from 'vitest';
import { MOP_DAMAGE, MOP_COOLDOWN_TICKS } from '../../src/sim/combat/attack';
import { BOSS_MAX_HEALTH, BOSS_PURSUE_SPEED_PER_TICK, BOSS_SLAM_REACH, BOSS_SUMMONED_HEALTH } from '../../src/sim/combat/boss';
import { SPITTER_PROJECTILE_SPEED_PER_TICK, SPITTER_RECOVER_TICKS } from '../../src/sim/combat/enemies';
import { MELEE_KNOCKBACK } from '../../src/sim/effects/resolveAttack';
import { STATIC_BURST_RADIUS, STATIC_DRIFT_TICKS, STATIC_TELEGRAPH_TICKS } from '../../src/sim/combat/staticEnemy';
import { SHOPPER_RECOVER_TICKS, SHOPPER_TELEGRAPH_TICKS, SHOPPER_WALK_SPEED_PER_TICK } from '../../src/sim/combat/shopper';
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

/**
 * Playtest 2026-09-28, Floor 2: a win with 3 damage, all from the Mall
 * Manager's volley; Statics and Bargain Hunters landed nothing in 10 kills.
 * They attack more often; the wind-ups stay long enough to read and dodge.
 */
describe('difficulty tuning after the first Floor 2 playtest', () => {
  it('has the Static lock on sooner and blink more often, still dodgeable on foot', () => {
    expect(STATIC_TELEGRAPH_TICKS).toBe(34);
    expect(STATIC_DRIFT_TICKS).toBe(64);
    // Walking off the mark (210 px/s) clears the burst before it lands.
    expect(STATIC_BURST_RADIUS + 16).toBeLessThan(STATIC_TELEGRAPH_TICKS * (210 / 60));
  });

  it('has Bargain Hunters close in faster and charge again sooner, with the lane warning kept', () => {
    expect(SHOPPER_RECOVER_TICKS).toBe(24);
    expect(SHOPPER_WALK_SPEED_PER_TICK * 60).toBe(70);
    expect(SHOPPER_TELEGRAPH_TICKS).toBeGreaterThanOrEqual(34);
  });
});
