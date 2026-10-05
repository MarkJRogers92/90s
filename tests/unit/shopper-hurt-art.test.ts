// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, frameBounds, type Png } from '../support/png';

const ART = 'art/enemy-reactions/shopper-hurt/';
const SHIPPED = 'public/assets/neon/enemies/shopper-hurt.png';
const F = 96;
const original = decodePng(readFileSync(ART + 'original-candidate.png'));
const shipped = decodePng(readFileSync(SHIPPED));
const walk = decodePng(readFileSync('public/assets/neon/enemies/shopper-walk.png'));
const rowBytes = (png: Png, row: number) => png.data.slice(row * F * png.width * 4, (row + 1) * F * png.width * 4);

describe('focused Bargain Hunter hurt-art correction', () => {
  it('ships the committed corrected source byte-for-byte', () => {
    expect(existsSync(ART + 'shopper-hurt.png')).toBe(true);
    expect(readFileSync(SHIPPED).equals(readFileSync(ART + 'shopper-hurt.png'))).toBe(true);
  });
  it('uses the existing 4 by 8 native grid with hard alpha', () => {
    expect([shipped.width, shipped.height]).toEqual([384, 768]);
    let soft = 0;
    for (let p = 3; p < shipped.data.length; p += 4) if (shipped.data[p] !== 0 && shipped.data[p] !== 255) soft++;
    expect(soft).toBe(0);
  });
  it.each([0, 1, 3, 4, 5, 6, 7])('preserves candidate row %i exactly outside the approved WEST correction', (row) => {
    const before = rowBytes(original, row);
    expect(rowBytes(shipped, row).every((value, index) => value === before[index])).toBe(true);
  });
  it('replaces the old front-turning WEST row', () => {
    const before = rowBytes(original, 2);
    expect(rowBytes(shipped, 2).some((value, index) => value !== before[index])).toBe(true);
  });
  it('aligns the WEST rest-frame centre with the walk source', () => {
    const source = frameBounds(walk, 0, 2, F)!;
    const rest = frameBounds(shipped, 0, 2, F)!;
    expect(Math.abs((source.minX + source.maxX - rest.minX - rest.maxX) / 2)).toBeLessThanOrEqual(0.5);
  });
  it.each([0, 1, 2, 3])('keeps WEST frame %i registered to the walking baseline and source height', (column) => {
    const source = frameBounds(walk, 0, 2, F)!;
    const pose = frameBounds(shipped, column, 2, F)!;
    expect(pose).not.toBeNull();
    expect(pose.maxY).toBe(source.maxY);
    expect(pose.maxY - pose.minY + 1).toBeGreaterThanOrEqual(78);
    expect(pose.maxY - pose.minY + 1).toBeLessThanOrEqual(84);
  });
  // This geometric guard catches the known broad, front-turning peak. It is not a facing classifier.
  // Human/native-scale review still establishes identity, side profile, hand and motion.
  it('keeps peak-recoil shoulder width within a narrow side-profile silhouette', () => {
    const column = 1, row = 2;
    let widestBlueRun = 0;
    for (let y = 30; y <= 58; y++) {
      const xs: number[] = [];
      for (let x = 0; x < F; x++) {
        const i = ((row * F + y) * shipped.width + column * F + x) * 4;
        const r = shipped.data[i]!, g = shipped.data[i + 1]!, b = shipped.data[i + 2]!;
        if (shipped.data[i + 3] && b > r + 8 && g > r + 4) xs.push(x);
      }
      if (xs.length) widestBlueRun = Math.max(widestBlueRun, xs.at(-1)! - xs[0]! + 1);
    }
    expect(widestBlueRun).toBeLessThanOrEqual(18);
  });
});
