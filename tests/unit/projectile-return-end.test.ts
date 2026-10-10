import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { isPlayerProjectile, updatePlayerProjectiles } from '../../src/sim/effects/playerProjectiles';
import { resolvePrimaryAttack } from '../../src/sim/effects/resolveAttack';
import type { EnemyState, PlayerProjectileState, RunState } from '../../src/sim/model';

const ORIGIN = { x: 300, y: 160 };

function target(id: number, x: number): EnemyState {
  return {
    id, kind: 'spitter', x, y: ORIGIN.y, health: 40, radius: 14,
    phase: 'recover', phaseTicks: 100_000, cooldownTicks: 0,
    telegraphAimX: 0, telegraphAimY: 0,
  };
}

/** Let an authored Rewinder shot travel out and return to sampled node 2. */
function returningShot(penetrates: boolean): { state: RunState; shot: PlayerProjectileState } {
  const itemIds = ['pump_soaker', 'vhs_rewinder', ...(penetrates ? ['bubble_bath'] : [])];
  const state = createRun(7, { itemIds, selectedItemId: 'pump_soaker' });
  state.player.x = ORIGIN.x;
  state.player.y = ORIGIN.y;
  state.enemies = [];
  state.walls = [];
  resolvePrimaryAttack(state, { moveX: 0, moveY: 0, aimX: 900, aimY: ORIGIN.y, fire: true });
  const shot = state.projectiles.find(isPlayerProjectile)!;
  expect(shot.payload.penetrates).toBe(penetrates);
  for (let step = 0; step < 300 && (shot.phase !== 'return' || shot.sampledPathIndex !== 2); step += 1) {
    state.projectiles = updatePlayerProjectiles(state, state.projectiles);
    expect(state.projectiles).toContain(shot);
  }
  expect(shot.phase).toBe('return');
  expect(shot.sampledPathIndex).toBe(2);
  expect(shot.hitLedger).toEqual({ outbound: [], return: [] });
  return { state, shot };
}

describe('the last sampled segment of a projectile return pass', () => {
  it.each([true, false])('checks the final segment with the authored penetration rule (penetrates=%s)', (penetrates) => {
    const { state, shot } = returningShot(penetrates);
    // Only the segment from node 1 to node 0 can reach these targets. Their
    // circles do not touch node 1, so the preceding return step must miss.
    const contactX = ORIGIN.x - shot.radius - 14 + 0.5;
    const first = target(40, contactX);
    const second = target(41, contactX + 0.25);
    state.enemies = [second, first]; // Stable ID order, not array order.

    state.projectiles = updatePlayerProjectiles(state, state.projectiles);
    expect(shot.sampledPathIndex).toBe(1);
    expect([first.health, second.health]).toEqual([40, 40]);
    expect(shot.hitLedger.return).toEqual([]);
    expect(shot.x - second.x).toBeGreaterThan(shot.radius + second.radius);

    state.projectiles = updatePlayerProjectiles(state, state.projectiles);
    expect(first.health).toBe(40 - shot.payload.damage);
    expect(second.health).toBe(penetrates ? 40 - shot.payload.damage : 40);
    expect(shot.hitLedger.return).toEqual(penetrates ? [40, 41] : [40]);
    expect(shot.sampledPathIndex).toBe(0);
    expect({ x: shot.x, y: shot.y }).toEqual(ORIGIN);
    expect(shot.remainingTicks).toBe(0);
    expect(state.projectiles).toEqual([]);
    expect(shot.hasBurst).toBe(true);
    expect(state.behaviorTrace.filter((entry) => entry.includes(`projectile ${shot.id} burst (`))).toHaveLength(1);
    expect(state.surfaces).toHaveLength(penetrates ? 1 : 0);
  });

  it('does not hit a prior return target again when the final segment reaches a new target', () => {
    const { state, shot } = returningShot(true);
    const alreadyHit = target(30, ORIGIN.x);
    const lastOnly = target(31, ORIGIN.x - shot.radius - 14 + 0.5);
    state.enemies = [alreadyHit, lastOnly];
    state.projectiles = updatePlayerProjectiles(state, state.projectiles);
    expect(shot.sampledPathIndex).toBe(1);
    expect(alreadyHit.health).toBe(40 - shot.payload.damage);
    expect(lastOnly.health).toBe(40);
    expect(shot.hitLedger.return).toEqual([30]);

    state.projectiles = updatePlayerProjectiles(state, state.projectiles);
    expect(alreadyHit.health).toBe(40 - shot.payload.damage);
    expect(lastOnly.health).toBe(40 - shot.payload.damage);
    expect(shot.hitLedger.return).toEqual([30, 31]);
    expect(state.projectiles).toEqual([]);
    expect(state.surfaces).toHaveLength(1);
  });
});
