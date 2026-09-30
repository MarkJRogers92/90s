import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, flickerTick } from '../../src/game/settings/settings';
import { alarmCue } from '../../src/game/view/alarmCues';
import { stepBlackoutMix } from '../../src/game/view/blackoutFade';
import { revealSparkCount } from '../../src/game/ui/fusionRevealModel';

const reduced = { ...DEFAULT_SETTINGS, flashes: 'reduced' as const };
const ringing = { storeId: 'x', ticksLeft: 300, shutter: 'open' } as never;

describe('reduced flashing (round 37)', () => {
  it('holds the alarm beacon steady instead of alternating', () => {
    const seen = (steady: boolean) => new Set([0, 10, 20, 30].map((tick) => alarmCue(ringing, 600, tick, steady).flash));
    expect(seen(false).size).toBe(2);
    expect(seen(true).size).toBe(1);
  });

  it('freezes the Radio Shed snow when flashes are reduced', () => {
    expect(flickerTick(DEFAULT_SETTINGS, 123)).toBe(123);
    expect(flickerTick(reduced, 123)).toBe(flickerTick(reduced, 999));
  });

  it('bursts fewer fusion sparks when flashes are reduced', () => {
    expect(revealSparkCount(3, false)).toBe(22);
    expect(revealSparkCount(3, true)).toBeLessThan(revealSparkCount(3, false));
    expect(revealSparkCount(3, true)).toBeGreaterThan(0);
  });

  it('cuts a blackout at once normally, and fades it in over about a second when reduced', () => {
    expect(stepBlackoutMix(0, true, false)).toBe(1);
    let mix = 0;
    let frames = 0;
    while (mix < 1 && frames < 500) { mix = stepBlackoutMix(mix, true, true); frames += 1; }
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(90);
    expect(stepBlackoutMix(1, false, true)).toBeLessThan(1);
    expect(stepBlackoutMix(1, false, true)).toBeGreaterThan(0);
    expect(stepBlackoutMix(1, false, false)).toBe(0);
  });
});
