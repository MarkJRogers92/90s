import { describe, expect, it } from 'vitest';
import { firstShiftSeed, nextShiftSeed } from '../../src/game/run/shiftSeed';

const rolls = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length]!;
};

describe('which mall you clock into', () => {
  it('rolls a new mall for every fresh shift when no seed is asked for', () => {
    const one = firstShiftSeed(null, rolls(0.25));
    const two = firstShiftSeed('', rolls(0.75));
    expect(one.pinned).toBe(false);
    expect(one.seed).not.toBe(two.seed);
    expect(Number.isInteger(one.seed)).toBe(true);
    expect(one.seed).toBeGreaterThanOrEqual(1);
  });

  it('keeps a seed from the address bar, for sharing a mall and for tests', () => {
    expect(firstShiftSeed('4242', rolls(0.5))).toEqual({ seed: 4242, pinned: true });
    expect(firstShiftSeed('0', rolls(0.5))).toEqual({ seed: 0, pinned: true });
    expect(firstShiftSeed('nonsense', rolls(0.5)).pinned).toBe(false);
  });

  it('replays the same mall on a retry, and rolls a new one after a win', () => {
    const shift = { seed: 1234, pinned: false };
    expect(nextShiftSeed(shift, false, rolls(0.5))).toBe(1234);
    expect(nextShiftSeed(shift, true, rolls(0.5))).not.toBe(1234);
    expect(nextShiftSeed({ seed: 4242, pinned: true }, true, rolls(0.5))).toBe(4242);
  });
});
