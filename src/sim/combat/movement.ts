import {
  circleIntersectsRect,
  normalizedDirection,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from '../core/geometry';
import type { RunState } from '../model';

const PLAYER_SPEED_PER_SECOND = 210;
const TICKS_PER_SECOND = 60;
const PLAYER_SPEED_PER_TICK = PLAYER_SPEED_PER_SECOND / TICKS_PER_SECOND;

function isBlocked(state: RunState, x: number, y: number): boolean {
  return state.walls.some((wall) =>
    circleIntersectsRect(x, y, state.player.radius, wall),
  );
}

export function movePlayer(state: RunState, moveX: number, moveY: number): void {
  const direction = normalizedDirection(moveX, moveY);
  const radius = state.player.radius;

  const proposedX = Math.max(
    radius,
    Math.min(PLAYFIELD_WIDTH - radius, state.player.x + direction.x * PLAYER_SPEED_PER_TICK),
  );
  if (!isBlocked(state, proposedX, state.player.y)) {
    state.player.x = proposedX;
  }

  const proposedY = Math.max(
    radius,
    Math.min(PLAYFIELD_HEIGHT - radius, state.player.y + direction.y * PLAYER_SPEED_PER_TICK),
  );
  if (!isBlocked(state, state.player.x, proposedY)) {
    state.player.y = proposedY;
  }
}
