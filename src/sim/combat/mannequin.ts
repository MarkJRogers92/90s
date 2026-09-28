/**
 * The Mannequin: a display dummy that only moves when you are not looking.
 *
 * While the janitor's aim points within WATCH_HALF_ANGLE of it with a clear
 * line of sight, it is frozen mid-pose and harmless even at arm's length.
 * The moment the aim goes elsewhere — to a Spitter, to a door, to a shelf —
 * it rushes the janitor faster than a Hanger can crawl and hurts on touch.
 * It turns aiming into a choice: watch the dummy or deal with everything else.
 *
 * Its frozen/moving state is written to `phase` ('recover' while watched,
 * 'pursue' while moving) so the renderer and the cues can read it.
 */
import { normalizedDirection } from '../core/geometry';
import type { EnemyState, RunState } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { hasLineOfSight } from './collision';
import { moveCircle, scaleMovementDelta } from './movement';

export const MANNEQUIN_SPEED_PER_TICK = 160 / 60;
export const MANNEQUIN_HEALTH = 20;
export const MANNEQUIN_RADIUS = 14;
/** How wide a look freezes it: 35 degrees either side of the aim. */
export const WATCH_HALF_ANGLE = (35 * Math.PI) / 180;
const WATCH_COS = Math.cos(WATCH_HALF_ANGLE);

/** Is the janitor looking at this mannequin right now? */
export function mannequinWatched(state: RunState, enemy: EnemyState): boolean {
  const dx = enemy.x - state.player.x;
  const dy = enemy.y - state.player.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return true;
  const facing = normalizedDirection(state.player.facing.x, state.player.facing.y);
  const along = (dx * facing.x + dy * facing.y) / distance;
  return along >= WATCH_COS && hasLineOfSight(state.player.x, state.player.y, enemy.x, enemy.y, state.walls);
}

export function updateMannequin(state: RunState, enemy: EnemyState): void {
  if (mannequinWatched(state, enemy)) {
    enemy.phase = 'recover';
    return;
  }
  enemy.phase = 'pursue';
  const direction = normalizedDirection(state.player.x - enemy.x, state.player.y - enemy.y);
  const movement = scaleMovementDelta(
    direction.x * MANNEQUIN_SPEED_PER_TICK,
    direction.y * MANNEQUIN_SPEED_PER_TICK,
    effectiveSpeedMultiplier(enemy),
  );
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
}
