import { describe, expect, it } from 'vitest';
import { PINK_SLIP_MS, SLIP_STAMP_AT_MS, pinkSlipFrame, pinkSlipReason } from '../../src/game/ui/pinkSlipModel';

describe('the pink slip', () => {
  it('waits for the fall, flutters down to rest, and leaves before the card', () => {
    expect(pinkSlipFrame(0).y).toBeLessThan(0);
    const resting = pinkSlipFrame(SLIP_STAMP_AT_MS);
    expect(resting.y).toBeCloseTo(300, 0);
    expect(pinkSlipFrame(PINK_SLIP_MS - 1).y).toBeGreaterThan(resting.y);
    expect(pinkSlipFrame(PINK_SLIP_MS).done).toBe(true);
    expect(pinkSlipFrame(PINK_SLIP_MS - 1).done).toBe(false);
  });

  it('sways while it falls and settles flat-ish on landing', () => {
    const swings = [1100, 1300, 1500].map((ms) => pinkSlipFrame(ms).rotation);
    expect(new Set(swings.map((r) => Math.sign(r))).size).toBeGreaterThan(1);
    expect(Math.abs(pinkSlipFrame(SLIP_STAMP_AT_MS).rotation)).toBeLessThan(0.1);
  });

  it('stamps FIRED once it has landed', () => {
    expect(pinkSlipFrame(SLIP_STAMP_AT_MS - 1).stampAlpha).toBe(0);
    expect(pinkSlipFrame(SLIP_STAMP_AT_MS).stampAlpha).toBe(1);
    expect(pinkSlipFrame(SLIP_STAMP_AT_MS).stampScale).toBeGreaterThan(1);
    expect(pinkSlipFrame(SLIP_STAMP_AT_MS + 400).stampScale).toBe(1);
  });

  it('gives the reason that fits what landed the last blow', () => {
    expect(pinkSlipReason('glob', 1)).toBe('SLIPPED ON AN UNREPORTED SPILL');
    expect(pinkSlipReason('hanger', 1)).toBe('EXCESSIVE CONTACT WITH MERCHANDISE');
    expect(pinkSlipReason('slam', 1)).toBe('DISRESPECTING LOSS PREVENTION');
    expect(pinkSlipReason('slam', 2)).toBe('DISAGREEING WITH MANAGEMENT');
    expect(pinkSlipReason('shopper', 2)).toBe('BLOCKING A DOORBUSTER');
    expect(pinkSlipReason(null, 1)).toBe('GENERAL POOR ATTITUDE');
  });
});
