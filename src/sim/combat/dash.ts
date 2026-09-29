/**
 * The janitor's dash: a short burst of speed during which enemy hits cannot
 * land. It exists so the wind-ups the renderer now shows can be answered — see
 * the spit lane or the slam ring, and get out of it.
 *
 * Deterministic and input-driven like every other rule. It keeps its own
 * timers rather than borrowing the post-hit invulnerability window, because
 * that window means "the janitor was just hurt" everywhere else.
 */
import { normalizedDirection } from '../core/geometry';
import type { InputFrame, RunState } from '../model';
import { moveCircle } from './movement';

export const DASH_TICKS = 12;
export const DASH_DISTANCE = 126;
export const DASH_COOLDOWN_TICKS = 45;
const DASH_SPEED_PER_TICK = DASH_DISTANCE / DASH_TICKS;

/** True while a dash is carrying the janitor and enemy hits cannot land. */
export function playerDashing(state: RunState): boolean {
  return (state.player.dashTicks ?? 0) > 0;
}

/** Counts the dash cooldown down; called once per tick before input. */
export function tickDashCooldown(state: RunState): void {
  state.player.dashCooldownTicks = Math.max(0, (state.player.dashCooldownTicks ?? 0) - 1);
}

/**
 * Starts a dash on a fresh press when one is not running or cooling down. It
 * goes along the held movement direction, or toward the aim when standing
 * still. A run's perks may shorten the cooldown that follows.
 */
export function startDash(state: RunState, input: InputFrame, cooldownTicks = DASH_COOLDOWN_TICKS): void {
  if (!input.dash || playerDashing(state) || (state.player.dashCooldownTicks ?? 0) > 0) return;
  const moving = input.moveX !== 0 || input.moveY !== 0;
  const direction = moving
    ? normalizedDirection(input.moveX, input.moveY)
    : normalizedDirection(state.player.facing.x, state.player.facing.y);
  if (direction.x === 0 && direction.y === 0) return;
  state.player.dashTicks = DASH_TICKS;
  state.player.dashCooldownTicks = DASH_TICKS + cooldownTicks;
  state.player.dashX = direction.x;
  state.player.dashY = direction.y;
}

/** Moves the janitor one dash step; returns false when no dash is running. */
export function advanceDash(state: RunState): boolean {
  if (!playerDashing(state)) return false;
  const next = moveCircle(
    state.player,
    state.player.radius,
    (state.player.dashX ?? 0) * DASH_SPEED_PER_TICK,
    (state.player.dashY ?? 0) * DASH_SPEED_PER_TICK,
    state.walls,
  );
  state.player.x = next.x;
  state.player.y = next.y;
  state.player.dashTicks = (state.player.dashTicks ?? 0) - 1;
  return true;
}
