import { describe, expect, it } from 'vitest';
import {
  RAIN_STREAKS, lightningAt, puddlesFor, rainStreaks, splashesAt, weatherFor,
} from '../../src/game/view/roofWeather';
import type { Rect } from '../../src/sim/model';

/**
 * Roadmap V7: rain on the Roof. A pure function of the tick and the night's
 * seed (so captures are repeatable), presentation only, and lightning never
 * flashes under Flashes: Reduced.
 */
describe('roof weather (roadmap V7)', () => {
  it('rains on the Roof only: never indoors, in a shop or in the Skate Arena', () => {
    expect(weatherFor(4, {})).toBe('rain');
    for (const floor of [1, 2, 3] as const) expect(weatherFor(floor, {})).toBeNull();
    expect(weatherFor(4, { insideStore: true })).toBeNull();
    expect(weatherFor(4, { district: 'rink' })).toBeNull();
  });

  it('draws the same rain for the same tick and seed, falling and slanting with the wind', () => {
    const now = rainStreaks(100, 7);
    expect(now).toEqual(rainStreaks(100, 7));
    expect(now).toHaveLength(RAIN_STREAKS);
    expect(rainStreaks(100, 8)).not.toEqual(now);
    const later = rainStreaks(101, 7);
    const moved = now.filter((streak, i) => later[i]!.y > streak.y);
    expect(moved.length).toBeGreaterThan(RAIN_STREAKS * 0.8);
    for (const streak of now) {
      expect(streak.dx).toBeLessThan(0);
      expect(streak.dy).toBeGreaterThan(Math.abs(streak.dx));
      expect(streak.y).toBeGreaterThanOrEqual(-120);
      expect(streak.y).toBeLessThanOrEqual(480);
    }
  });

  it('pops splash rings on the floor that grow and fade', () => {
    const splashes = splashesAt(240, 3);
    expect(splashes.length).toBeGreaterThan(4);
    for (const splash of splashes) {
      expect(splash.y).toBeGreaterThan(60);
      expect(splash.radius).toBeGreaterThan(0);
      expect(splash.alpha).toBeGreaterThan(0);
      expect(splash.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('lays a few puddles that keep off the walls and out of the side-door lanes', () => {
    const walls: Rect[] = [{ x: 300, y: 200, width: 360, height: 60 }];
    const puddles = puddlesFor(11, walls);
    expect(puddles.length).toBeGreaterThanOrEqual(3);
    expect(puddlesFor(11, walls)).toEqual(puddles);
    for (const puddle of puddles) {
      const hitsWall = walls.some((wall) => puddle.x + puddle.width / 2 > wall.x && puddle.x - puddle.width / 2 < wall.x + wall.width
        && puddle.y + puddle.height / 2 > wall.y && puddle.y - puddle.height / 2 < wall.y + wall.height);
      expect(hitsWall).toBe(false);
      const inLane = puddle.y > 176 && puddle.y < 304 && (puddle.x < 90 || puddle.x > 870);
      expect(inLane).toBe(false);
    }
  });

  it('flashes lightning now and then, as a double strike, and never with flashes reduced', () => {
    const minute = Array.from({ length: 3600 }, (_, tick) => lightningAt(tick, 5, true));
    const strikes = minute.filter((value, tick) => value > 0.5 && (minute[tick - 1] ?? 0) <= 0.5).length;
    expect(strikes).toBeGreaterThanOrEqual(6);
    expect(strikes).toBeLessThanOrEqual(30);
    expect(minute.filter((value) => value > 0).length / minute.length).toBeLessThan(0.08);
    expect(Math.max(...minute)).toBeLessThanOrEqual(1);
    for (let tick = 0; tick < 3600; tick += 1) expect(lightningAt(tick, 5, false)).toBe(0);
  });
});
