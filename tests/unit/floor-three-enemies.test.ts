import { describe, expect, it } from 'vitest';
import { BOSS_CONFIGS, bossPhaseForHealth, isBossKind } from '../../src/sim/combat/boss';
import {
  MASCOT_CHARGE_SPEED_PER_TICK,
  MASCOT_CHARGE_TICKS,
  MASCOT_STUN_DAMAGE_MULTIPLIER,
  MASCOT_TELEGRAPH_TICKS,
  vulnerableDamage,
} from '../../src/sim/combat/mascot';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function mascot(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 30, kind: 'mascot', x: 600, y: 160, health: 34, radius: 18,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

describe('the Mascot Brute', () => {
  it('winds up in place with a locked aim, then charges in a straight line', () => {
    const state = emptyFixture();
    state.enemies = [mascot()];
    tickRun(state, frame());
    const winding = state.enemies[0]!;
    expect(winding.phase).toBe('telegraph');
    expect(winding.telegraphAimX).toBeCloseTo(-1, 1);
    const x0 = winding.x;
    advance(state, frame(), MASCOT_TELEGRAPH_TICKS - 2);
    expect(state.enemies[0]!.x).toBeCloseTo(x0, 5);
    // The janitor sidesteps; the lane stays where it was locked.
    advance(state, frame(0, 1), 8);
    expect(x0 - state.enemies[0]!.x).toBeGreaterThan(MASCOT_CHARGE_SPEED_PER_TICK * 2);
    expect(state.enemies[0]!.y).toBeCloseTo(160, 0);
  });

  it('hits a janitor standing in the lane', () => {
    const hit = emptyFixture();
    hit.enemies = [mascot({ x: hit.player.x + 200 })];
    advance(hit, frame(), MASCOT_TELEGRAPH_TICKS + MASCOT_CHARGE_TICKS + 2);
    expect(hit.player.health).toBeLessThan(6);
  });

  it('stuns itself against a wall and takes bonus damage while dazed', () => {
    const state = emptyFixture();
    state.walls = [{ x: 330, y: 0, width: 20, height: 400 }];
    state.player.x = 300;
    state.enemies = [mascot({ x: 520 })];
    advance(state, frame(), MASCOT_TELEGRAPH_TICKS + MASCOT_CHARGE_TICKS);
    const dazed = state.enemies[0]!;
    expect(dazed.stunnedTicks ?? 0).toBeGreaterThan(0);
    expect(state.player.health).toBe(6);
    expect(vulnerableDamage(dazed, 4)).toBe(Math.ceil(4 * MASCOT_STUN_DAMAGE_MULTIPLIER));
    expect(vulnerableDamage(mascot(), 4)).toBe(4);
  });

  it('is fair: a sidestep during the wind-up dodges the charge on foot', () => {
    const dodge = emptyFixture();
    dodge.enemies = [mascot({ x: dodge.player.x + 200 })];
    tickRun(dodge, frame());
    advance(dodge, frame(0, 1), MASCOT_TELEGRAPH_TICKS + MASCOT_CHARGE_TICKS + 4);
    expect(dodge.player.health).toBe(6);
    // The wind-up is long enough to read: well over half a second.
    expect(MASCOT_TELEGRAPH_TICKS).toBeGreaterThanOrEqual(40);
  });

  it('is tanky', () => {
    expect(mascot().health).toBeGreaterThan(18);
  });
});

const O = BOSS_CONFIGS.owner;

function owner(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 10, kind: 'owner', x: 330, y: 240, health: O.maxHealth, radius: O.radius,
    phase: 'recover', phaseTicks: 100_000, cooldownTicks: 1, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

describe('the Mall Owner', () => {
  it('is the toughest boss and summons Mascot Brutes', () => {
    expect(isBossKind('owner')).toBe(true);
    expect(O.maxHealth).toBeGreaterThan(BOSS_CONFIGS.manager.maxHealth);
    expect(O.summonKind).toBe('mascot');
    expect(bossPhaseForHealth(Math.floor(O.maxHealth * 0.2), O.maxHealth)).toBe(3);
  });

  it('opens with a food-tray volley', () => {
    const state = emptyFixture();
    state.enemies = [owner()];
    state.roomWasPopulated = true;
    tickRun(state, frame());
    expect(state.projectiles.filter((shot) => shot.faction === 'enemy')).toHaveLength(O.volleyAngles.length);
  });

  it('calls a Mascot Brute in phase two and two more in phase three', () => {
    const state = emptyFixture();
    state.enemies = [owner({ health: Math.floor(O.maxHealth * 0.5), cooldownTicks: 150 })];
    state.roomWasPopulated = true;
    tickRun(state, frame());
    expect(state.enemies.filter((enemy) => enemy.kind === 'mascot')).toHaveLength(1);
    state.enemies[0]!.health = Math.floor(O.maxHealth * 0.2);
    advance(state, frame(), 3);
    expect(state.enemies.filter((enemy) => enemy.kind === 'mascot')).toHaveLength(3);
    advance(state, frame(), 5);
    expect(state.enemies.filter((enemy) => enemy.kind === 'mascot')).toHaveLength(3);
  });

  it('charges after a wind-up from phase two, and shakes the room when it hits the wall', () => {
    const state = emptyFixture();
    state.player.x = 120;
    state.walls = [{ x: 60, y: 0, width: 20, height: 480 }];
    state.enemies = [owner({
      health: Math.floor(O.maxHealth * 0.5), phase: 'telegraph', phaseTicks: 1, cooldownTicks: 500,
      bossAttacks: 1, bossSummoned: true, bossSummonedMid: true, telegraphAimX: -1, telegraphAimY: 0,
    })];
    state.roomWasPopulated = true;
    advance(state, frame(), 2);
    expect(state.enemies[0]!.chargeTicks ?? 0).toBeGreaterThan(0);
    for (let guard = 0; guard < 70 && (state.enemies.find((enemy) => enemy.kind === 'owner')!.stunnedTicks ?? 0) === 0; guard += 1) {
      tickRun(state, frame());
    }
    const boss = state.enemies.find((enemy) => enemy.kind === 'owner')!;
    expect(boss.stunnedTicks ?? 0).toBeGreaterThan(0);
    // The impact throws a ring of trays.
    expect(state.projectiles.filter((shot) => shot.faction === 'enemy').length).toBeGreaterThanOrEqual(8);
  });
});
