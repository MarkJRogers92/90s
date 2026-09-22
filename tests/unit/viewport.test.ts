import { describe, expect, it } from 'vitest';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../src/sim/core/geometry';
import {
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  aimPointFor,
  cameraScrollFor,
  worldToScreenOffset,
} from '../../src/game/view/viewport';

describe('camera window', () => {
  it('centres on the player when the window fits inside the room', () => {
    expect(cameraScrollFor(480, 240)).toEqual({ scrollX: 160, scrollY: 60 });
  });

  it('clamps at every room edge so the window never leaves the room', () => {
    expect(cameraScrollFor(0, 0)).toEqual({ scrollX: 0, scrollY: 0 });
    expect(cameraScrollFor(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT)).toEqual({
      scrollX: PLAYFIELD_WIDTH - VIEWPORT_WIDTH,
      scrollY: PLAYFIELD_HEIGHT - VIEWPORT_HEIGHT,
    });
  });

  it('floors the scroll so the pixel grid never sits between pixels', () => {
    const scroll = cameraScrollFor(480.7, 240.9);
    expect(Number.isInteger(scroll.scrollX)).toBe(true);
    expect(Number.isInteger(scroll.scrollY)).toBe(true);
  });

  it('always keeps the player inside the visible window', () => {
    for (let x = 0; x <= PLAYFIELD_WIDTH; x += 37) {
      for (let y = 0; y <= PLAYFIELD_HEIGHT; y += 29) {
        const scroll = cameraScrollFor(x, y);
        expect(x).toBeGreaterThanOrEqual(scroll.scrollX);
        expect(x).toBeLessThanOrEqual(scroll.scrollX + VIEWPORT_WIDTH);
        expect(y).toBeGreaterThanOrEqual(scroll.scrollY);
        expect(y).toBeLessThanOrEqual(scroll.scrollY + VIEWPORT_HEIGHT);
      }
    }
  });

  it('degrades to a fixed origin when the window is as large as the room', () => {
    expect(cameraScrollFor(480, 240, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT)).toEqual({
      scrollX: 0,
      scrollY: 0,
    });
  });
});

describe('world to screen', () => {
  it('maps a world point through the scroll, not through the world size', () => {
    const scroll = cameraScrollFor(480, 240);
    const offset = worldToScreenOffset(480, 240, scroll, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    expect(offset).toEqual({ x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 });
  });

  it('maps the window origin to the canvas origin', () => {
    const scroll = cameraScrollFor(480, 240);
    expect(
      worldToScreenOffset(scroll.scrollX, scroll.scrollY, scroll, VIEWPORT_WIDTH, VIEWPORT_HEIGHT),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('aim point', () => {
  const boxWidth = VIEWPORT_WIDTH;
  const boxHeight = VIEWPORT_HEIGHT;

  it('aims along the player-to-target direction rather than at the target', () => {
    const player = { x: 480, y: 240 };
    const scroll = cameraScrollFor(player.x, player.y);
    // A target far past the room edge, so it could never be clicked directly.
    const point = aimPointFor(player, { x: 3000, y: 240 }, scroll, boxWidth, boxHeight);
    expect(point.y).toBeCloseTo(VIEWPORT_HEIGHT / 2, 5);
    expect(point.x).toBeGreaterThan(VIEWPORT_WIDTH / 2);
  });

  it('stays on the canvas when the target lies beyond a room edge', () => {
    // The player is near the left edge, so the camera clamps and the player sits
    // off-centre; aiming further left must still land on the canvas.
    const player = { x: 20, y: 240 };
    const scroll = cameraScrollFor(player.x, player.y);
    expect(scroll.scrollX).toBe(0);
    const point = aimPointFor(player, { x: 0, y: 240 }, scroll, boxWidth, boxHeight);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(boxWidth);
  });

  it('collapses to the player when the target is the player', () => {
    const player = { x: 480, y: 240 };
    const scroll = cameraScrollFor(player.x, player.y);
    expect(aimPointFor(player, { x: 480, y: 240 }, scroll, boxWidth, boxHeight)).toEqual({
      x: VIEWPORT_WIDTH / 2,
      y: VIEWPORT_HEIGHT / 2,
    });
  });

  it('never lands outside the canvas for any target direction', () => {
    // A corner player, where the window is clamped on two edges at once.
    const player = { x: 30, y: 450 };
    const scroll = cameraScrollFor(player.x, player.y);
    for (let degrees = 0; degrees < 360; degrees += 23) {
      const radians = (degrees * Math.PI) / 180;
      const target = {
        x: player.x + Math.cos(radians) * 900,
        y: player.y + Math.sin(radians) * 900,
      };
      const point = aimPointFor(player, target, scroll, boxWidth, boxHeight);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(boxWidth);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(boxHeight);
    }
  });
});
