import type { Rect } from '../model';

export function segmentIntersectsRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rect: Rect,
): boolean {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  let minimumTime = 0;
  let maximumTime = 1;

  const clipAxis = (start: number, delta: number, minimum: number, maximum: number): boolean => {
    if (delta === 0) {
      return start >= minimum && start <= maximum;
    }
    const first = (minimum - start) / delta;
    const second = (maximum - start) / delta;
    const entry = Math.min(first, second);
    const exit = Math.max(first, second);
    minimumTime = Math.max(minimumTime, entry);
    maximumTime = Math.min(maximumTime, exit);
    return minimumTime <= maximumTime;
  };

  return (
    clipAxis(startX, deltaX, rect.x, rect.x + rect.width) &&
    clipAxis(startY, deltaY, rect.y, rect.y + rect.height) &&
    maximumTime >= 0 &&
    minimumTime <= 1
  );
}

export function hasLineOfSight(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  walls: Rect[],
): boolean {
  return !walls.some((wall) => segmentIntersectsRect(startX, startY, endX, endY, wall));
}

export function sweptCircleIntersectsRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
  rect: Rect,
): boolean {
  return segmentIntersectsRect(startX, startY, endX, endY, {
    x: rect.x - radius,
    y: rect.y - radius,
    width: rect.width + radius * 2,
    height: rect.height + radius * 2,
  });
}

export function sweptCircleIntersectsCircle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  movingRadius: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
): boolean {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((targetX - startX) * deltaX + (targetY - startY) * deltaY) /
              segmentLengthSquared,
          ),
        );
  const closestX = startX + deltaX * projection;
  const closestY = startY + deltaY * projection;
  return Math.hypot(targetX - closestX, targetY - closestY) <= movingRadius + targetRadius;
}

export function circlesOverlap(
  firstX: number,
  firstY: number,
  firstRadius: number,
  secondX: number,
  secondY: number,
  secondRadius: number,
): boolean {
  return Math.hypot(secondX - firstX, secondY - firstY) <= firstRadius + secondRadius;
}
