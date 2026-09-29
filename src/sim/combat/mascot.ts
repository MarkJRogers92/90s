/**
 * The Mascot Brute: a food-court mascot nobody ever took the costume off.
 *
 * It plods toward the janitor. Once within range it plants its feet and winds
 * up (a long, readable telegraph with the lane locked at the start), then
 * charges in a straight line, fast. Only the charge hurts. If the charge runs
 * into a wall or an obstacle the brute is stunned: dazed, open, and it takes
 * bonus damage until it shakes it off. Sidestep, let it hit the wall, punish.
 */
import { normalizedDirection } from '../core/geometry';
import type { EnemyState, RunState } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { playerDashing } from './dash';
import { moveCircle, scaleMovementDelta } from './movement';

export const MASCOT_HEALTH = 34;
export const MASCOT_RADIUS = 18;
export const MASCOT_TELEGRAPH_TICKS = 46;
export const MASCOT_CHARGE_TICKS = 26;
export const MASCOT_CHARGE_SPEED_PER_TICK = 10.5;
export const MASCOT_CHARGE_DAMAGE = 2;
export const MASCOT_STUN_TICKS = 110;
export const MASCOT_RECOVER_TICKS = 36;
export const MASCOT_STUN_DAMAGE_MULTIPLIER = 1.5;
export const MASCOT_WALK_SPEED_PER_TICK = 52 / 60;
const MASCOT_RANGE = 340;
const PLAYER_INVULNERABILITY_TICKS = 60;

/** A stunned brute or Owner is open: hits on it land harder. */
export function vulnerableDamage(target: Pick<EnemyState, 'kind' | 'stunnedTicks'>, damage: number): number {
  if ((target.kind === 'mascot' || target.kind === 'owner') && (target.stunnedTicks ?? 0) > 0) {
    return Math.ceil(damage * MASCOT_STUN_DAMAGE_MULTIPLIER);
  }
  return damage;
}

export function updateMascot(state: RunState, enemy: EnemyState): void {
  if ((enemy.stunnedTicks ?? 0) > 0) {
    enemy.stunnedTicks = (enemy.stunnedTicks ?? 0) - 1;
    return;
  }
  if ((enemy.chargeTicks ?? 0) > 0) {
    const before = { x: enemy.x, y: enemy.y };
    const next = moveCircle(enemy, enemy.radius, enemy.telegraphAimX * MASCOT_CHARGE_SPEED_PER_TICK, enemy.telegraphAimY * MASCOT_CHARGE_SPEED_PER_TICK, state.walls);
    enemy.x = next.x;
    enemy.y = next.y;
    enemy.chargeTicks = (enemy.chargeTicks ?? 0) - 1;
    const touching = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= enemy.radius + state.player.radius;
    if (touching) {
      if (state.player.invulnerableTicks <= 0 && !playerDashing(state)) {
        state.player.health -= MASCOT_CHARGE_DAMAGE;
        state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
      }
      // A dash slips past: the brute keeps barrelling.
      if (!playerDashing(state)) {
        enemy.chargeTicks = 0;
        enemy.phase = 'recover';
        enemy.phaseTicks = MASCOT_RECOVER_TICKS;
        return;
      }
    }
    // Barely moved: it ran into something solid. Dazed.
    if (Math.hypot(enemy.x - before.x, enemy.y - before.y) < MASCOT_CHARGE_SPEED_PER_TICK * 0.5) {
      enemy.chargeTicks = 0;
      enemy.stunnedTicks = MASCOT_STUN_TICKS;
      enemy.phase = 'recover';
      enemy.phaseTicks = 1;
      return;
    }
    if (enemy.chargeTicks === 0) {
      enemy.phase = 'recover';
      enemy.phaseTicks = MASCOT_RECOVER_TICKS;
    }
    return;
  }
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      enemy.phase = 'pursue';
      enemy.chargeTicks = MASCOT_CHARGE_TICKS;
    }
    return;
  }
  if (enemy.phase === 'recover') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) enemy.phase = 'pursue';
    return;
  }
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  if (Math.hypot(dx, dy) <= MASCOT_RANGE) {
    const aim = normalizedDirection(dx, dy);
    enemy.phase = 'telegraph';
    enemy.phaseTicks = MASCOT_TELEGRAPH_TICKS;
    enemy.telegraphAimX = aim.x === 0 && aim.y === 0 ? 1 : aim.x;
    enemy.telegraphAimY = aim.x === 0 && aim.y === 0 ? 0 : aim.y;
    return;
  }
  const direction = normalizedDirection(dx, dy);
  const movement = scaleMovementDelta(direction.x * MASCOT_WALK_SPEED_PER_TICK, direction.y * MASCOT_WALK_SPEED_PER_TICK, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
}
