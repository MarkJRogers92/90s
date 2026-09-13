import { describe, expect, it } from 'vitest';
import { tickRun } from '../../src/sim/tickRun';
import { emptyFixture, frame } from '../helpers';
import type { EnemyState, ProjectileState } from '../../src/sim/model';

function defeatedEnemy(): EnemyState {
  return {
    id: 40,
    kind: 'hanger',
    x: 500,
    y: 200,
    health: 0,
    radius: 10,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
  };
}

function lethalProjectile(): ProjectileState {
  return {
    id: 41,
    x: 360,
    y: 160,
    previousX: 360,
    previousY: 160,
    velocityX: -60,
    velocityY: 0,
    radius: 4,
    remainingTicks: 30,
    faction: 'enemy',
    damage: 1,
  };
}

describe('run lifecycle', () => {
  it('clears a populated room once and freezes the terminal snapshot', () => {
    const state = emptyFixture();
    state.enemies = [defeatedEnemy()];
    state.roomWasPopulated = true;

    tickRun(state, frame());
    expect(state.status).toBe('won');
    expect(state.rewardGranted).toBe(true);
    const terminal = JSON.stringify(state);

    for (let index = 0; index < 20; index += 1) {
      tickRun(state, frame(1, 0));
    }
    expect(JSON.stringify(state)).toBe(terminal);
  });

  it('ends a dead run once without granting the room reward', () => {
    const state = emptyFixture();
    state.player.health = 0;
    state.enemies = [defeatedEnemy()];
    state.roomWasPopulated = true;

    tickRun(state, frame());
    expect(state.status).toBe('dead');
    expect(state.rewardGranted).toBe(false);
    const terminal = JSON.stringify(state);
    tickRun(state, frame(1, 0));
    expect(JSON.stringify(state)).toBe(terminal);
  });

  it('gives death priority when the final enemy and player die on the same tick', () => {
    const state = emptyFixture();
    state.player.health = 1;
    state.enemies = [{ ...defeatedEnemy(), health: 4, x: 350, y: 160 }];
    state.projectiles = [lethalProjectile()];
    state.roomWasPopulated = true;

    tickRun(state, { ...frame(), aimX: 400, aimY: 160, fire: true });
    expect(state.player.health).toBe(0);
    expect(state.enemies).toHaveLength(0);
    expect(state.status).toBe('dead');
    expect(state.rewardGranted).toBe(false);
  });
});
