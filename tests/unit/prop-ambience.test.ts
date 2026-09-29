import { describe, expect, it } from 'vitest';
import {
  DROPLET_COUNT,
  MOTES_PER_LIGHT,
  dustMotes,
  ROCK_MAX,
  SWAY_MAX,
  fountainDroplets,
  fountainRipples,
  propMotion,
  propSeed,
  rockAngle,
  screenGlow,
  signFlicker,
  swayAngle,
} from '../../src/game/view/propAmbience';

const ticks = (count: number, step = 1): number[] => Array.from({ length: count }, (_, index) => index * step);

describe('prop ambience', () => {
  it('animates the lively props and leaves the rest still', () => {
    expect(propMotion('palm')).toBe('sway');
    expect(propMotion('arcadeCabinet')).toBe('screen');
    expect(propMotion('vending')).toBe('screen');
    expect(propMotion('fountain')).toBe('fountain');
    expect(propMotion('kiddieRide')).toBe('rock');
    expect(propMotion('crates')).toBeNull();
    expect(propMotion('bin')).toBeNull();
  });

  it('seeds props stably and distinctly', () => {
    expect(propSeed('palm-1')).toBe(propSeed('palm-1'));
    expect(propSeed('palm-1')).not.toBe(propSeed('palm-2'));
  });

  it('sways palms gently, out of step with each other', () => {
    const first = ticks(600).map((tick) => swayAngle(tick, propSeed('a')));
    const second = ticks(600).map((tick) => swayAngle(tick, propSeed('b')));
    expect(Math.max(...first.map(Math.abs))).toBeLessThanOrEqual(SWAY_MAX + 1e-9);
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThan(SWAY_MAX);
    expect(first).not.toEqual(second);
  });

  it('rocks the kiddie ride only part of the time, within its reach', () => {
    const angles = ticks(600).map((tick) => rockAngle(tick, 0));
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(ROCK_MAX);
    const still = angles.filter((angle) => angle === 0).length;
    expect(still).toBeGreaterThan(300);
    expect(still).toBeLessThan(600);
  });

  it('runs attract mode through several colours and blinks the ATM', () => {
    const colours = new Set(ticks(200, 10).map((tick) => screenGlow('arcadeCabinet', tick, 0)!.color));
    expect(colours.size).toBeGreaterThanOrEqual(3);
    const atm = new Set(ticks(10, 30).map((tick) => screenGlow('atm', tick, 0)!.intensity));
    expect(atm.size).toBe(2);
    expect(screenGlow('palm', 0, 0)).toBeNull();
  });

  it('gives only some signs a dying tube, and it mostly holds', () => {
    const seeds = ticks(30).map((index) => propSeed(`sign-${index}`));
    const bad = seeds.filter((seed) => ticks(420).some((tick) => signFlicker(tick, seed) < 1));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.length).toBeLessThan(seeds.length);
    const lit = ticks(420).filter((tick) => signFlicker(tick, bad[0]!) === 1).length;
    expect(lit / 420).toBeGreaterThan(0.9);
  });

  it('sprays droplets up from the globe and back down into the basin', () => {
    for (const tick of [0, 13, 29]) {
      const drops = fountainDroplets(tick, 5, 134, 105);
      expect(drops).toHaveLength(DROPLET_COUNT);
      for (const drop of drops) {
        expect(Math.abs(drop.dx)).toBeLessThanOrEqual(134 / 2);
        expect(drop.dy).toBeLessThan(0);
        expect(drop.alpha).toBeGreaterThanOrEqual(0);
        expect(drop.alpha).toBeLessThanOrEqual(1);
      }
    }
    // Droplets in flight are at different heights: a spray, not a sheet.
    const heights = new Set(fountainDroplets(0, 5, 134, 105).map((drop) => Math.round(drop.dy)));
    expect(heights.size).toBeGreaterThan(5);
  });

  it('spreads ripples out and fades them', () => {
    const rings = fountainRipples(0, 0);
    expect(rings).toHaveLength(3);
    for (const ring of rings) expect(ring.alpha).toBeCloseTo(0.5 * (1 - (ring.scale - 0.3) / 0.7));
  });

  it('keeps dust motes inside the light pool, fading at its edge, and drifting', () => {
    for (const tick of [0, 200, 777]) {
      const motes = dustMotes(tick, 3, 120);
      expect(motes).toHaveLength(MOTES_PER_LIGHT);
      for (const mote of motes) {
        expect(Math.abs(mote.dx)).toBeLessThanOrEqual(120 * 0.55 * 0.8 + 10 + 1e-9);
        expect(Math.abs(mote.dy)).toBeLessThanOrEqual(120 * 0.55 + 1e-9);
        expect(mote.alpha).toBeGreaterThanOrEqual(0);
        expect(mote.alpha).toBeLessThanOrEqual(1);
      }
    }
    // They move: the same mote is somewhere else a second later.
    expect(dustMotes(0, 3, 120)[0]).not.toEqual(dustMotes(60, 3, 120)[0]);
    // And they climb: over a short span, height goes up (dy falls).
    expect(dustMotes(10, 3, 120)[0]!.dy).toBeLessThan(dustMotes(0, 3, 120)[0]!.dy + 1e-9);
  });
});
