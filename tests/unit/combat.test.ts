import { describe, expect, it } from 'vitest';
import {
  inAttackCone,
  MOP_HALF_ANGLE_RADIANS,
  MOP_RANGE,
} from '../../src/sim/combat/attack';
import { hasLineOfSight } from '../../src/sim/combat/collision';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame, ProjectileState, RunState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function enemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 20,
    kind: 'hanger',
    x: 350,
    y: 160,
    health: 12,
    radius: 10,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    ...overrides,
  };
}

function projectile(overrides: Partial<ProjectileState> = {}): ProjectileState {
  return {
    id: 30,
    x: 360,
    y: 160,
    previousX: 360,
    previousY: 160,
    velocityX: -60,
    velocityY: 0,
    radius: 4,
    remainingTicks: 60,
    faction: 'enemy',
    damage: 1,
    ...overrides,
  };
}

function fireFrame(aimX = 400, aimY = 160): InputFrame {
  return { ...frame(), aimX, aimY, fire: true };
}

describe('directional mop geometry', () => {
  it('includes targets inside the arc and excludes targets outside it', () => {
    expect(inAttackCone(100, 100, 200, 100, 160, 100, 10, MOP_RANGE, MOP_HALF_ANGLE_RADIANS)).toBe(
      true,
    );
    expect(inAttackCone(100, 100, 200, 100, 100, 160, 10, MOP_RANGE, MOP_HALF_ANGLE_RADIANS)).toBe(
      false,
    );
  });

  it('uses target radius consistently at the range boundary', () => {
    expect(inAttackCone(100, 100, 200, 100, 180, 100, 10, MOP_RANGE, MOP_HALF_ANGLE_RADIANS)).toBe(
      true,
    );
    expect(inAttackCone(100, 100, 200, 100, 181, 100, 10, MOP_RANGE, MOP_HALF_ANGLE_RADIANS)).toBe(
      false,
    );
  });

  it('reports a solid wall between attack origin and target', () => {
    expect(hasLineOfSight(100, 100, 200, 100, [{ x: 145, y: 80, width: 10, height: 40 }])).toBe(
      false,
    );
    expect(hasLineOfSight(100, 100, 200, 100, [{ x: 145, y: 120, width: 10, height: 40 }])).toBe(
      true,
    );
  });
});

describe('mop resolution', () => {
  it('hits once on acceptance and cannot hit again during cooldown', () => {
    const state = emptyFixture();
    state.enemies = [enemy()];
    state.roomWasPopulated = true;

    tickRun(state, fireFrame());
    expect(state.enemies[0]?.health).toBe(8);
    expect(state.player.attackCooldownTicks).toBe(27);

    tickRun(state, fireFrame());
    expect(state.enemies[0]?.health).toBe(8);
    expect(state.player.attackCooldownTicks).toBe(26);
  });

  it('does not damage a target behind a wall', () => {
    const state = emptyFixture();
    state.enemies = [enemy({ x: 370 })];
    state.walls = [{ x: 330, y: 140, width: 10, height: 40 }];
    state.roomWasPopulated = true;
    tickRun(state, fireFrame(400, 160));
    expect(state.enemies[0]?.health).toBe(12);
  });

  it('accepts an attack from the pre-movement player position', () => {
    const state = emptyFixture();
    state.enemies = [enemy({ x: 383 })];
    state.roomWasPopulated = true;

    tickRun(state, { ...fireFrame(500, 160), moveX: 1 });

    expect(state.player.x).toBeGreaterThan(300);
    expect(state.enemies[0]?.health).toBe(12);
  });
});

describe('enemy damage and phases', () => {
  it('limits sustained Hanger overlap to one hit per invulnerability window', () => {
    const state = emptyFixture();
    state.enemies = [enemy({ x: 300, kind: 'hanger' })];
    state.roomWasPopulated = true;

    advance(state, frame(), 30);
    expect(state.player.health).toBe(5);
    expect(state.player.invulnerableTicks).toBe(31);

    advance(state, frame(), 30);
    expect(state.player.health).toBe(5);
    expect(state.player.invulnerableTicks).toBe(1);

    tickRun(state, frame());
    expect(state.player.health).toBe(4);
  });

  it('stores the Spitter telegraph direction and never fires before tick 36', () => {
    const state = emptyFixture();
    state.enemies = [
      enemy({
        kind: 'spitter',
        x: 500,
        y: 160,
        phase: 'telegraph',
        phaseTicks: 36,
        telegraphAimX: -1,
        telegraphAimY: 0,
      }),
    ];
    state.roomWasPopulated = true;

    advance(state, frame(), 18);
    state.player.y = 300;
    advance(state, frame(), 17);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]?.velocityX).toBeLessThan(0);
    expect(state.projectiles[0]?.velocityY).toBe(0);
  });

  it('removes expired and wall-striking projectiles before they can damage through a wall', () => {
    const expired = emptyFixture();
    expired.projectiles = [projectile({ remainingTicks: 1, x: 500, previousX: 500 })];
    tickRun(expired, frame());
    expect(expired.projectiles).toHaveLength(0);

    const blocked = emptyFixture();
    blocked.walls = [{ x: 320, y: 140, width: 10, height: 40 }];
    blocked.projectiles = [projectile()];
    tickRun(blocked, frame());
    expect(blocked.projectiles).toHaveLength(0);
    expect(blocked.player.health).toBe(6);
  });

  it('resolves player death before room clear on a simultaneous lethal tick', () => {
    const state: RunState = emptyFixture();
    state.player.health = 1;
    state.enemies = [enemy({ health: 4 })];
    state.projectiles = [projectile()];
    state.roomWasPopulated = true;

    tickRun(state, fireFrame());

    expect(state.player.health).toBe(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.status).toBe('dead');
    expect(state.rewardGranted).toBe(false);
  });
});
