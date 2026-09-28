import { describe, expect, it } from 'vitest';
import { presentationDepth, type PresentationDepthBand } from '../../src/game/presentation/depth';

const bands: readonly PresentationDepthBand[] = [
  'floor', 'decal', 'structure', 'lowProp', 'actor', 'tallForeground', 'effect', 'prompt',
];

describe('presentation depth', () => {
  it('keeps adjacent bands separate across the full 0..480 room height', () => {
    for (let index = 0; index < bands.length - 1; index += 1) {
      expect(presentationDepth(bands[index]!, 480)).toBeLessThan(
        presentationDepth(bands[index + 1]!, 0),
      );
    }
  });

  it('sorts actors by base Y and returns stable depths', () => {
    expect(presentationDepth('actor', 120)).toBeLessThan(presentationDepth('actor', 360));
    expect(presentationDepth('actor', 240)).toBe(presentationDepth('actor', 240));
  });
});
