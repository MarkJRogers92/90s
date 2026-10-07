/**
 * Roadmap V7: rain on the Roof.
 *
 * Wind-slanted rain over the whole stage (the sky behind the back wall too),
 * splash rings popping on the gravel, a few puddles that glint, and lightning
 * now and then as a double strike. Everything is a pure function of the tick
 * and the night's seed, so the same night rains the same way and captures are
 * repeatable; nothing is stored. Presentation only: rain never makes anything
 * Wet (that is the sprinklers event, in sim/run/wingEvents), and lightning
 * never flashes under Flashes: Reduced.
 */
import type { Rect } from '../../sim/model';
import type { FloorNumber } from '../../sim/wing/floorSpecs';
import type { DistrictId } from '../../sim/wing/districts';

export type Weather = 'rain';

/** Floor 4's open-air rooms; never a shop, and the Skate Arena district is indoors. */
export function weatherFor(floor: FloorNumber, where: { readonly insideStore?: boolean; readonly district?: DistrictId }): Weather | null {
  if (floor !== 4 || where.insideStore || where.district === 'rink') return null;
  return 'rain';
}

const STAGE = { x: 0, y: -120, width: 960, height: 600 };
export const RAIN_STREAKS = 140;
const FALL_PER_TICK = 11;
const WIND = -0.28;

/** A stable 0..1 for (index, salt, seed). */
function scatter(index: number, salt: number, seed: number): number {
  const mixed = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  const h = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d);
  return (((h ^ (h >>> 12)) >>> 0) % 100_000) / 100_000;
}

export type RainStreak = { readonly x: number; readonly y: number; readonly dx: number; readonly dy: number; readonly alpha: number };

/** The rain at `tick`: each streak falls down and a little left with the wind, wrapping round the stage. */
export function rainStreaks(tick: number, seed: number): RainStreak[] {
  return Array.from({ length: RAIN_STREAKS }, (_, index) => {
    const near = scatter(index, 4, seed) < 0.3;
    const speed = FALL_PER_TICK * (near ? 1.35 : 0.8 + scatter(index, 3, seed) * 0.3);
    const fall = (scatter(index, 2, seed) * STAGE.height + tick * speed) % STAGE.height;
    const length = near ? 18 : 11;
    const x = ((scatter(index, 1, seed) * (STAGE.width + 120) + fall * WIND) % (STAGE.width + 120) + STAGE.width + 120) % (STAGE.width + 120);
    return {
      x: Math.round(x),
      y: Math.round(STAGE.y + fall),
      dx: Math.round(length * WIND),
      dy: length,
      alpha: near ? 0.55 : 0.32,
    };
  });
}

export type Splash = { readonly x: number; readonly y: number; readonly radius: number; readonly alpha: number };

const SPLASH_SLOTS = 16;
const SPLASH_LIFE = 12;

/** Rings where drops land on the floor: each slot re-lands somewhere new every cycle. */
export function splashesAt(tick: number, seed: number): Splash[] {
  const splashes: Splash[] = [];
  for (let slot = 0; slot < SPLASH_SLOTS; slot += 1) {
    const period = 22 + Math.floor(scatter(slot, 7, seed) * 18);
    const local = tick + Math.floor(scatter(slot, 8, seed) * period);
    const cycle = Math.floor(local / period);
    const age = local % period;
    if (age >= SPLASH_LIFE) continue;
    splashes.push({
      x: Math.round(40 + scatter(slot * 97 + cycle, 9, seed) * 880),
      y: Math.round(70 + scatter(slot * 89 + cycle, 10, seed) * 380),
      radius: 1.5 + age * 0.55,
      alpha: 0.7 * (1 - age / SPLASH_LIFE),
    });
  }
  return splashes;
}

export type Puddle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly glintPhase: number };

/** A few seeded puddles on clear ground: off every wall and out of the side-door lanes. */
export function puddlesFor(seed: number, walls: readonly Rect[]): Puddle[] {
  const puddles: Puddle[] = [];
  for (let attempt = 0; attempt < 40 && puddles.length < 5; attempt += 1) {
    const width = 34 + Math.round(scatter(attempt, 11, seed) * 40);
    const height = Math.round(width * 0.32);
    const x = Math.round(110 + scatter(attempt, 12, seed) * 740);
    const y = Math.round(90 + scatter(attempt, 13, seed) * 350);
    const box = { x: x - width / 2 - 6, y: y - height / 2 - 6, width: width + 12, height: height + 12 };
    const overlaps = (rect: Rect) => box.x < rect.x + rect.width && rect.x < box.x + box.width && box.y < rect.y + rect.height && rect.y < box.y + box.height;
    if (walls.some(overlaps)) continue;
    if (y > 176 && y < 304 && (x < 90 || x > 870)) continue;
    if (puddles.some((other) => Math.abs(other.x - x) < 90 && Math.abs(other.y - y) < 50)) continue;
    puddles.push({ x, y, width, height, glintPhase: scatter(attempt, 14, seed) * Math.PI * 2 });
  }
  return puddles;
}

/**
 * How bright the lightning is at `tick`, 0..1: a strike every 8-15 seconds,
 * each a double flash (flash, a dim beat, a brighter flash, a long fade).
 * Always 0 when flashes are reduced.
 */
export function lightningAt(tick: number, seed: number, flashes: boolean): number {
  if (!flashes) return 0;
  // Walk the strikes forward from tick 0: each gap is its own seeded 8-15 s.
  let start = 120 + Math.floor(scatter(0, 15, seed) * 300);
  for (let strike = 0; start <= tick; strike += 1) {
    const age = tick - start;
    if (age < 26) {
      const shape = [0.55, 0.35, 0.1, 0, 0, 0.9, 1, 0.8, 0.6, 0.45, 0.33, 0.24, 0.17, 0.12, 0.08, 0.05, 0.03, 0.02];
      return shape[age] ?? 0;
    }
    start += 480 + Math.floor(scatter(strike + 1, 16, seed) * 420);
  }
  return 0;
}
