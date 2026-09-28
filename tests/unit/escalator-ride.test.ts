import { describe, expect, it } from 'vitest';
import { ESCALATOR, RIDE_MS, RIDE_SKIP_GRACE_MS, rideFrame, rideSkippable } from '../../src/game/ui/escalatorRideModel';

describe('the escalator ride', () => {
  it('carries the janitor from the bottom-left of the escalator to the top-right', () => {
    const start = rideFrame(0).rider;
    const end = rideFrame(RIDE_MS).rider;
    expect(start.x).toBeCloseTo(ESCALATOR.bottom.x, 0);
    expect(start.y).toBeCloseTo(ESCALATOR.bottom.y, 0);
    expect(end.x).toBeCloseTo(ESCALATOR.top.x, 0);
    expect(end.y).toBeCloseTo(ESCALATOR.top.y, 0);
  });

  it('never slides the janitor backwards', () => {
    let last = -Infinity;
    for (let ms = 0; ms <= RIDE_MS; ms += 50) {
      const { x } = rideFrame(ms).rider;
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });

  it('keeps the steps rolling and the downstairs shops falling away while the upstairs ones arrive', () => {
    const early = rideFrame(200);
    const late = rideFrame(RIDE_MS - 400);
    expect(late.stepScroll).toBeGreaterThan(early.stepScroll);
    expect(late.lowerShopsY).toBeGreaterThan(early.lowerShopsY);
    expect(late.upperShopsY).toBeGreaterThan(early.upperShopsY);
  });

  it('lights the UPPER LEVEL sign only once the ride is well under way', () => {
    expect(rideFrame(300).titleAlpha).toBe(0);
    expect(rideFrame(RIDE_MS * 0.8).titleAlpha).toBe(1);
  });

  it('fades out at the end and says when it is done', () => {
    expect(rideFrame(RIDE_MS / 2).fade).toBe(0);
    expect(rideFrame(RIDE_MS - 1).fade).toBeGreaterThan(0.9);
    expect(rideFrame(RIDE_MS - 1).done).toBe(false);
    expect(rideFrame(RIDE_MS).done).toBe(true);
  });

  it('ignores the key press that started it, then lets any press skip', () => {
    expect(rideSkippable(0)).toBe(false);
    expect(rideSkippable(RIDE_SKIP_GRACE_MS - 1)).toBe(false);
    expect(rideSkippable(RIDE_SKIP_GRACE_MS)).toBe(true);
  });
});
