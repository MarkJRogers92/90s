import { describe, expect, it } from 'vitest';
import { moveCircle } from '../../src/sim/combat/movement';
import type { Rect, Vec2 } from '../../src/sim/model';
import { Navigator } from '../balance/path';

/** The opening concourse's pillar: solid from y=110 to y=370, with gaps above and below. */
const PILLAR: Rect[] = [{ x: 180, y: 110, width: 30, height: 260 }];
const RADIUS = 10;
const STEP = 3.5;

/** Walks like the sim does (axis-separated sliding), steering with `steer`, and returns how close it got. */
function walk(from: Vec2, goal: Vec2, walls: Rect[], steer: (at: Vec2) => Vec2 | null, steps = 700): number {
  let at = from;
  for (let step = 0; step < steps; step += 1) {
    const direction = steer(at);
    if (direction === null) break;
    at = moveCircle(at, RADIUS, direction.x * STEP, direction.y * STEP, walls);
  }
  return Math.hypot(goal.x - at.x, goal.y - at.y);
}

describe('balance bot navigator', () => {
  it('walks around a pillar that a straight line cannot pass (and the straight line really is stuck)', () => {
    const from = { x: 110, y: 240 };
    const goal = { x: 300, y: 240 };
    const straight = (at: Vec2): Vec2 => {
      const length = Math.hypot(goal.x - at.x, goal.y - at.y);
      return { x: (goal.x - at.x) / length, y: (goal.y - at.y) / length };
    };
    expect(walk(from, goal, PILLAR, straight)).toBeGreaterThan(60);

    const navigator = new Navigator();
    expect(walk(from, goal, PILLAR, (at) => navigator.direction(PILLAR, RADIUS, at, goal))).toBeLessThan(12);
  });

  it('takes the straight line when nothing is in the way', () => {
    const navigator = new Navigator();
    const direction = navigator.direction([], RADIUS, { x: 100, y: 100 }, { x: 300, y: 100 })!;
    expect(direction.x).toBeCloseTo(1, 5);
    expect(direction.y).toBeCloseTo(0, 5);
  });

  it('heads for the nearest open spot when the goal sits inside a wall, and says so when a goal is sealed off', () => {
    const navigator = new Navigator();
    const inside = navigator.direction(PILLAR, RADIUS, { x: 110, y: 240 }, { x: 195, y: 240 });
    expect(inside).not.toBeNull();

    const box: Rect[] = [
      { x: 440, y: 240, width: 120, height: 10 },
      { x: 440, y: 350, width: 120, height: 10 },
      { x: 440, y: 240, width: 10, height: 120 },
      { x: 550, y: 240, width: 10, height: 120 },
    ];
    expect(navigator.direction(box, RADIUS, { x: 100, y: 100 }, { x: 500, y: 300 })).toBeNull();
  });

  it('rebuilds its map when the walls change (a shutter drops)', () => {
    const navigator = new Navigator();
    const from = { x: 110, y: 240 };
    const goal = { x: 300, y: 240 };
    const open = navigator.direction([], RADIUS, from, goal)!;
    expect(open.y).toBeCloseTo(0, 5);
    const around = navigator.direction(PILLAR, RADIUS, from, goal)!;
    expect(Math.abs(around.y)).toBeGreaterThan(0.2);
  });
});
