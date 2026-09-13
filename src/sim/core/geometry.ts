import type { Rect } from '../model';

export const PLAYFIELD_WIDTH = 960;
export const PLAYFIELD_HEIGHT = 480;

export function normalizedDirection(x: number, y: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0 };
  }
  const length = Math.hypot(x, y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  const divisor = Math.max(1, length);
  return { x: x / divisor, y: y / divisor };
}

export function circleIntersectsRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  return Math.hypot(x - nearestX, y - nearestY) < radius;
}
