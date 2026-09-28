/**
 * The Bargain Hunter: a shopper who never stopped shopping.
 *
 * It plods toward the janitor; once within range it plants its feet and
 * lines up a charge along a locked direction (the renderer draws the lane),
 * then barrels down it. It only hurts while charging, and a charge that runs
 * into a wall leaves it stunned and open. Sidestep, then punish.
 */
import { normalizedDirection } from '../core/geometry';
import type { EnemyState, RunState } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { playerDashing } from './dash';
import { moveCircle, scaleMovementDelta } from './movement';

export const SHOPPER_HEALTH = 18;
export const SHOPPER_RADIUS = 16;
export const SHOPPER_TELEGRAPH_TICKS = 34;
export const SHOPPER_CHARGE_TICKS = 16;
export const SHOPPER_STUN_TICKS = 70;
export const SHOPPER_RECOVER_TICKS = 24;
const SHOPPER_RANGE = 320;
export const SHOPPER_WALK_SPEED_PER_TICK = 70 / 60;
const SHOPPER_CHARGE_SPEED_PER_TICK = 9;
const PLAYER_INVULNERABILITY_TICKS = 60;

export function updateShopper(state: RunState, enemy: EnemyState): void {
  if ((enemy.stunnedTicks ?? 0) > 0) {
    enemy.stunnedTicks = (enemy.stunnedTicks ?? 0) - 1;
    return;
  }
  if ((enemy.chargeTicks ?? 0) > 0) {
    const before = { x: enemy.x, y: enemy.y };
    const next = moveCircle(enemy, enemy.radius, enemy.telegraphAimX * SHOPPER_CHARGE_SPEED_PER_TICK, enemy.telegraphAimY * SHOPPER_CHARGE_SPEED_PER_TICK, state.walls);
    enemy.x = next.x;
    enemy.y = next.y;
    enemy.chargeTicks = (enemy.chargeTicks ?? 0) - 1;
    const touching = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= enemy.radius + state.player.radius;
    if (touching) {
      if (state.player.invulnerableTicks <= 0 && !playerDashing(state)) {
        state.player.health -= 1;
        state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
      }
      enemy.chargeTicks = 0;
      enemy.phase = 'recover';
      enemy.phaseTicks = SHOPPER_RECOVER_TICKS;
      return;
    }
    // Barely moved: the cart hit a wall. Dazed.
    if (Math.hypot(enemy.x - before.x, enemy.y - before.y) < SHOPPER_CHARGE_SPEED_PER_TICK * 0.5) {
      enemy.chargeTicks = 0;
      enemy.stunnedTicks = SHOPPER_STUN_TICKS;
      enemy.phase = 'recover';
      enemy.phaseTicks = 1;
      return;
    }
    if (enemy.chargeTicks === 0) {
      enemy.phase = 'recover';
      enemy.phaseTicks = SHOPPER_RECOVER_TICKS;
    }
    return;
  }
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      enemy.phase = 'pursue';
      enemy.chargeTicks = SHOPPER_CHARGE_TICKS;
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
  if (Math.hypot(dx, dy) <= SHOPPER_RANGE) {
    const aim = normalizedDirection(dx, dy);
    enemy.phase = 'telegraph';
    enemy.phaseTicks = SHOPPER_TELEGRAPH_TICKS;
    enemy.telegraphAimX = aim.x === 0 && aim.y === 0 ? 1 : aim.x;
    enemy.telegraphAimY = aim.x === 0 && aim.y === 0 ? 0 : aim.y;
    return;
  }
  const direction = normalizedDirection(dx, dy);
  const movement = scaleMovementDelta(direction.x * SHOPPER_WALK_SPEED_PER_TICK, direction.y * SHOPPER_WALK_SPEED_PER_TICK, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
}
