import { describe, expect, it } from 'vitest';
import { ACTOR_HALF_WIDTH, OCCLUSION_MIN_ALPHA, presentationOcclusionAlpha } from '../../src/game/presentation/occlusion';

const foreground = { x: 200, y: 100, width: 80, height: 70 };

describe('presentation occlusion', () => {
  it('fades a foreground rectangle when an actor foot enters and restores it outside', () => {
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 135 }, foreground)).toBeLessThan(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 150, y: 135 }, foreground)).toBe(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 100 }, foreground)).toBe(1);
  });

  it('fades deep enough that an actor standing behind the prop reads clearly (round 54)', () => {
    // 50% fronds laid a green net over the janitor; the middle of the prop now drops well below that.
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 135 }, foreground)).toBeCloseTo(OCCLUSION_MIN_ALPHA, 6);
    expect(OCCLUSION_MIN_ALPHA).toBeLessThanOrEqual(0.4);
    // Never fully invisible: the prop is still there to walk around.
    expect(OCCLUSION_MIN_ALPHA).toBeGreaterThan(0.15);
  });

  it('starts fading when the actor body slips behind the edge, not only the foot point', () => {
    // 6 units outside the footprint: the foot is clear but the body's edge is behind the prop.
    expect(presentationOcclusionAlpha('tallForeground', { x: 194, y: 135 }, foreground)).toBeLessThan(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 286, y: 135 }, foreground)).toBeLessThan(1);
    // A body's width away, it is clear again.
    expect(presentationOcclusionAlpha('tallForeground', { x: 200 - ACTOR_HALF_WIDTH - 1, y: 135 }, foreground)).toBe(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 280 + ACTOR_HALF_WIDTH + 1, y: 135 }, foreground)).toBe(1);
  });

  it('is clear in front of the prop and above its top, and eases in as the actor goes behind', () => {
    // In front of (south of) the base the actor is drawn over the prop.
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 170 }, foreground)).toBe(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 190 }, foreground)).toBe(1);
    // No pop: alpha never rises as the actor walks further behind.
    let last = 1;
    for (let x = 180; x <= 240; x += 2) {
      const alpha = presentationOcclusionAlpha('tallForeground', { x, y: 135 }, foreground);
      expect(alpha).toBeLessThanOrEqual(last + 1e-9);
      last = alpha;
    }
  });

  it('never fades effects or prompts even over an occluder', () => {
    for (const band of ['effect', 'prompt'] as const) {
      expect(presentationOcclusionAlpha(band, { x: 240, y: 135 }, foreground)).toBe(1);
    }
  });
});
