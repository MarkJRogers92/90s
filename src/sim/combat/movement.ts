import {
  circleIntersectsRect,
  normalizedDirection,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from '../core/geometry';
import type { RunState } from '../model';
import type { Rect, Vec2 } from '../model';

const PLAYER_SPEED_PER_SECOND = 210;
const TICKS_PER_SECOND = 60;
const PLAYER_SPEED_PER_TICK = PLAYER_SPEED_PER_SECOND / TICKS_PER_SECOND;

function isBlocked(walls: Rect[], x: number, y: number, radius: number): boolean {
  return walls.some((wall) => circleIntersectsRect(x, y, radius, wall));
}

export function moveCircle(
  position: Vec2,
  radius: number,
  deltaX: number,
  deltaY: number,
  walls: Rect[],
): Vec2 {
  let x = Math.max(radius, Math.min(PLAYFIELD_WIDTH - radius, position.x + deltaX));
  if (isBlocked(walls, x, position.y, radius)) {
    x = position.x;
  }

  let y = Math.max(radius, Math.min(PLAYFIELD_HEIGHT - radius, position.y + deltaY));
  if (isBlocked(walls, x, y, radius)) {
    y = position.y;
  }

  return { x, y };
}

export function movePlayer(state: RunState, moveX: number, moveY: number): void {
  const direction = normalizedDirection(moveX, moveY);
  const next = moveCircle(
    state.player,
    state.player.radius,
    direction.x * PLAYER_SPEED_PER_TICK,
    direction.y * PLAYER_SPEED_PER_TICK,
    state.walls,
  );
  state.player.x = next.x;
  state.player.y = next.y;
}
