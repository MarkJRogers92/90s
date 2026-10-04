// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, frameBounds } from '../support/png';

// Roadmap V1: the Bargain Hunter's flinch is drawn (GPT image, converted to the game's grid by
// art/enemy-reactions/shopper-hurt/convert_gpt_hurt.py), not a squashed copy of its walk frame.
const SHIPPED = 'public/assets/neon/enemies/shopper-hurt.png';
const SOURCE = 'art/enemy-reactions/shopper-hurt/shopper-hurt.png';
const WALK = 'public/assets/neon/enemies/shopper-walk.png';
const FRAME = 96, FRAMES = 4;
const ROWS = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'];

const hurt = decodePng(readFileSync(SHIPPED));
const walk = decodePng(readFileSync(WALK));

describe('Bargain Hunter drawn hurt strip', () => {
  it('ships the committed drawn sheet, byte for byte, so a rebuild cannot swap in a derived one', () => {
    expect(readFileSync(SHIPPED).equals(readFileSync(SOURCE))).toBe(true);
  });

  it('is 4 frames × 8 facings of 96 px with only fully opaque or fully transparent pixels', () => {
    expect([hurt.width, hurt.height]).toEqual([FRAMES * FRAME, 8 * FRAME]);
    const soft = new Set<number>();
    for (let i = 3; i < hurt.data.length; i += 4) if (hurt.data[i] !== 0 && hurt.data[i] !== 255) soft.add(hurt.data[i]!);
    expect([...soft]).toEqual([]);
  });

  it.each(ROWS.map((name, row) => [name, row] as const))('%s: rest frame sits on the walk sheet\'s centre and floor row, and every frame keeps its feet planted', (_name, row) => {
    const walkRest = frameBounds(walk, 0, row, FRAME)!;
    const rest = frameBounds(hurt, 0, row, FRAME)!;
    // check_sheet.py rounds the shift, so a half pixel is the closest two boxes of different parity can sit.
    expect(Math.abs((rest.minX + rest.maxX) / 2 - (walkRest.minX + walkRest.maxX) / 2)).toBeLessThanOrEqual(0.5);
    expect(rest.maxY).toBe(walkRest.maxY);
    for (let column = 0; column < FRAMES; column++) {
      const bounds = frameBounds(hurt, column, row, FRAME);
      expect(bounds, `frame ${column} is empty`).not.toBeNull();
      expect(bounds!.maxY).toBeGreaterThanOrEqual(walkRest.maxY - 1);
      expect(bounds!.maxY).toBeLessThanOrEqual(walkRest.maxY);
    }
  });

  it.each(ROWS.map((name, row) => [name, row] as const))('%s: the peak recoil flings the arm out instead of squashing the walk frame', (_name, row) => {
    const walkRest = frameBounds(walk, 0, row, FRAME)!;
    const peak = frameBounds(hurt, 1, row, FRAME)!;
    expect(peak.maxX - peak.minX).toBeGreaterThanOrEqual(walkRest.maxX - walkRest.minX + 12);
  });
});
