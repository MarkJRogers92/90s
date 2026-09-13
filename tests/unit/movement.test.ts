import { describe, expect, it } from 'vitest';
import { normalizedDirection } from '../../src/sim/core/geometry';
import type { Rect } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function circleIntersectsRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  return Math.hypot(x - nearestX, y - nearestY) < radius;
}

describe('normalizedDirection', () => {
  it('rejects non-finite input instead of contaminating run state', () => {
    expect(normalizedDirection(Number.NaN, 1)).toEqual({ x: 0, y: 0 });
    expect(normalizedDirection(1, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });

  it('caps diagonal magnitude at one', () => {
    const direction = normalizedDirection(1, 1);
    expect(direction.x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(direction.y).toBeCloseTo(Math.SQRT1_2, 8);
  });
});

describe('fixed movement', () => {
  it('moves at 210 pixels per second on a cardinal axis', () => {
    const state = emptyFixture();
    advance(state, frame(1, 0), 60);
    expect(state.player.x).toBeCloseTo(510, 6);
    expect(state.player.y).toBe(160);
    expect(state.tick).toBe(60);
  });

  it('normalizes diagonal speed to cardinal speed', () => {
    const cardinal = emptyFixture();
    const diagonal = emptyFixture();
    advance(cardinal, frame(1, 0), 30);
    advance(diagonal, frame(1, 1), 30);
    expect(Math.hypot(diagonal.player.x - 300, diagonal.player.y - 160)).toBeCloseTo(
      Math.hypot(cardinal.player.x - 300, cardinal.player.y - 160),
      6,
    );
  });

  it('keeps the player circle inside every playfield edge', () => {
    const topLeft = emptyFixture();
    advance(topLeft, frame(-1, -1), 600);
    expect(topLeft.player.x).toBeGreaterThanOrEqual(10);
    expect(topLeft.player.y).toBeGreaterThanOrEqual(10);

    const bottomRight = emptyFixture();
    advance(bottomRight, frame(1, 1), 600);
    expect(bottomRight.player.x).toBeLessThanOrEqual(950);
    expect(bottomRight.player.y).toBeLessThanOrEqual(470);
  });

  it('cannot enter a rectangular solid from an edge or corner', () => {
    const wall = { x: 400, y: 100, width: 40, height: 200 };
    const edge = emptyFixture();
    edge.player.x = 380;
    edge.player.y = 180;
    edge.walls = [wall];
    advance(edge, frame(1, 0), 60);
    expect(circleIntersectsRect(edge.player.x, edge.player.y, edge.player.radius, wall)).toBe(false);
    expect(edge.player.x).toBeLessThanOrEqual(390);

    const corner = emptyFixture();
    corner.player.x = 389;
    corner.player.y = 89;
    corner.walls = [wall];
    advance(corner, frame(1, 1), 1);
    expect(circleIntersectsRect(corner.player.x, corner.player.y, corner.player.radius, wall)).toBe(
      false,
    );
  });

  it('does not mutate any state while paused', () => {
    const state = emptyFixture();
    state.paused = true;
    const before = JSON.stringify(state);
    advance(state, frame(1, 0), 60);
    expect(JSON.stringify(state)).toBe(before);
  });
});
