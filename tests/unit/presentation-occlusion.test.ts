import { describe, expect, it } from 'vitest';
import { presentationOcclusionAlpha } from '../../src/game/presentation/occlusion';

const foreground = { x: 200, y: 100, width: 80, height: 70 };

describe('presentation occlusion', () => {
  it('fades a foreground rectangle when an actor foot enters and restores it outside', () => {
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 135 }, foreground)).toBeLessThan(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 150, y: 135 }, foreground)).toBe(1);
    expect(presentationOcclusionAlpha('tallForeground', { x: 240, y: 100 }, foreground)).toBe(1);
  });

  it('never fades effects or prompts even over an occluder', () => {
    for (const band of ['effect', 'prompt'] as const) {
      expect(presentationOcclusionAlpha(band, { x: 240, y: 135 }, foreground)).toBe(1);
    }
  });
});
