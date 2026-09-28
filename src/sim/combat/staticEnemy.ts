/**
 * The Static: a TV-headed thing that lives in the broken electronics.
 *
 * It drifts toward the janitor, then locks onto the exact spot they are
 * standing on (`blinkX/blinkY`, the renderer draws a crackling ring there)
 * and after a short wind-up blinks onto that spot with a shock burst. Stand
 * still and it lands on you; move or dash off the mark and it misses and
 * stands there stunned. It turns "stay put and swing" into a liability.
 */
import { normalizedDirection, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH, circleIntersectsRect } from '../core/geometry';
import type { EnemyState, RunState } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { playerDashing } from './dash';
import { moveCircle, scaleMovementDelta } from './movement';

export const STATIC_HEALTH = 14;
export const STATIC_RADIUS = 14;
export const STATIC_DRIFT_TICKS = 64;
export const STATIC_TELEGRAPH_TICKS = 34;
export const STATIC_RECOVER_TICKS = 60;
export const STATIC_BURST_RADIUS = 48;
const STATIC_DRIFT_SPEED_PER_TICK = 40 / 60;
const PLAYER_INVULNERABILITY_TICKS = 60;

export function updateStatic(state: RunState, enemy: EnemyState): void {
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks > 0) return;
    const x = Math.max(enemy.radius, Math.min(PLAYFIELD_WIDTH - enemy.radius, enemy.blinkX ?? enemy.x));
    const y = Math.max(enemy.radius, Math.min(PLAYFIELD_HEIGHT - enemy.radius, enemy.blinkY ?? enemy.y));
    if (!state.walls.some((wall) => circleIntersectsRect(x, y, enemy.radius, wall))) {
      enemy.x = x;
      enemy.y = y;
    }
    const caught = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= STATIC_BURST_RADIUS;
    if (caught && state.player.invulnerableTicks <= 0 && !playerDashing(state)) {
      state.player.health -= 1;
      state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
    }
    enemy.phase = 'recover';
    enemy.phaseTicks = STATIC_RECOVER_TICKS;
    return;
  }
  if (enemy.phase === 'recover') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      enemy.phase = 'pursue';
      enemy.phaseTicks = STATIC_DRIFT_TICKS;
    }
    return;
  }
  const direction = normalizedDirection(state.player.x - enemy.x, state.player.y - enemy.y);
  const movement = scaleMovementDelta(direction.x * STATIC_DRIFT_SPEED_PER_TICK, direction.y * STATIC_DRIFT_SPEED_PER_TICK, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
  enemy.phaseTicks -= 1;
  if (enemy.phaseTicks <= 0) {
    enemy.phase = 'telegraph';
    enemy.phaseTicks = STATIC_TELEGRAPH_TICKS;
    enemy.blinkX = state.player.x;
    enemy.blinkY = state.player.y;
  }
}
