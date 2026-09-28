import { describe, expect, it } from 'vitest';
import { DAWN_LINES, ENDING_MS, endingFrame, endingSkippable } from '../../src/game/ui/dawnEndingModel';

describe('the dawn ending', () => {
  it('fades up from black and then holds its last shot for the end card', () => {
    expect(endingFrame(0).fade).toBe(1);
    expect(endingFrame(ENDING_MS / 2).fade).toBe(0);
    expect(endingFrame(ENDING_MS).fade).toBe(0);
    expect(endingFrame(ENDING_MS + 5000).fade).toBe(0);
    expect(endingFrame(ENDING_MS).done).toBe(true);
    expect(endingFrame(ENDING_MS - 1).done).toBe(false);
    // Every line is up by the time the card may open.
    expect(endingFrame(ENDING_MS).lines.every((alpha) => alpha === 1)).toBe(true);
  });

  it('slides the doors open before the janitor reaches them', () => {
    expect(endingFrame(0).doors).toBe(0);
    expect(endingFrame(2000).doors).toBe(1);
  });

  it('walks the janitor out into the light, smaller and darker as they go', () => {
    const near = endingFrame(1400).walker;
    const far = endingFrame(5400).walker;
    expect(far.y).toBeLessThan(near.y);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.silhouette).toBeGreaterThan(near.silhouette);
  });

  it('brings the lines in one after another', () => {
    const early = endingFrame(2000).lines;
    const late = endingFrame(5600).lines;
    expect(early.every((alpha) => alpha === 0)).toBe(true);
    expect(late).toHaveLength(DAWN_LINES.length);
    expect(late.every((alpha) => alpha === 1)).toBe(true);
    expect(endingFrame(3000).lines[0]).toBeGreaterThan(endingFrame(3000).lines[1]!);
  });

  it('can be skipped once the press that ended the fight has passed', () => {
    expect(endingSkippable(100)).toBe(false);
    expect(endingSkippable(400)).toBe(true);
  });
});
