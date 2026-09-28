import { describe, expect, it } from 'vitest';
import { KILL_CAM_MS, KILL_CAM_ZOOM, killCamFrame, killCamStamp, slowMoMs } from '../../src/game/ui/killCamModel';

describe('the boss kill cam', () => {
  it('pushes in on the boss, holds, and eases back out before the end card', () => {
    expect(killCamFrame(0).zoom).toBe(1);
    expect(killCamFrame(400).zoom).toBeCloseTo(KILL_CAM_ZOOM, 2);
    expect(killCamFrame(KILL_CAM_MS).zoom).toBe(1);
    expect(killCamFrame(KILL_CAM_MS).done).toBe(true);
    expect(killCamFrame(KILL_CAM_MS - 1).done).toBe(false);
  });

  it('slams letterbox bars in and pulls them away again', () => {
    expect(killCamFrame(0).bars).toBe(0);
    expect(killCamFrame(600).bars).toBeGreaterThan(40);
    expect(killCamFrame(KILL_CAM_MS).bars).toBe(0);
  });

  it('flashes white on the killing blow and stamps a verdict shortly after', () => {
    expect(killCamFrame(0).flash).toBe(1);
    expect(killCamFrame(300).flash).toBe(0);
    expect(killCamFrame(200).stampAlpha).toBe(0);
    const landing = killCamFrame(420);
    expect(landing.stampAlpha).toBe(1);
    expect(landing.stampScale).toBeGreaterThan(1);
    expect(killCamFrame(900).stampScale).toBe(1);
  });

  it('plays the fall in slow motion, then lets it run at full speed', () => {
    expect(slowMoMs(1000)).toBeLessThan(500);
    const late = slowMoMs(3000) - slowMoMs(2000);
    expect(late).toBe(1000);
    // Continuous: no jump where slow motion ends.
    expect(slowMoMs(1201) - slowMoMs(1199)).toBeLessThan(3);
  });

  it('stamps each boss with its own verdict', () => {
    expect(killCamStamp('lp_manager')).toBe('LOSS PREVENTED');
    expect(killCamStamp('manager')).toBe("YOU'RE FIRED");
  });
});
