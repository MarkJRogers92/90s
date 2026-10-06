// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { decodePng } from '../support/png';
import { ALEX_HAND_ANCHORS, alexHandAnchor } from '../../src/game/view/alexHandAnchors';

// Pin the images actually audited. A replacement sheet must re-audit its palms.
const SOURCES = [
  ['neon:player:alex-idle', 'neon/player/alex-idle.png', 64, 64, '020b828cca5c05d79d7b204e35e689240658c544fb0bb10f69d0806935dbdca3'],
  ['neon:player:alex-walk', 'neon/player/alex-walk.png', 64, 64, '52b0ee210c0c1a3509fe1d6dcdff041374d38793f5088f8bd14c368c0106e1ab'],
  ['neon:player:alex-swing', 'neon/player/alex-swing.png', 92, 92, 'c159d1b1909a4ef4513eada3e18d45c79217bb8978f202b8ad69ce4ef905852d'],
  ['neon:player:alex-aim', 'neon/player/alex-aim.png', 92, 92, '9ec56c4e28adf5e75a5cdcf31c4e17141f9698df6c6f73f0bb08425304818e98'],
  ['neon:player:alex-dash', 'neon/player/alex-dash.png', 92, 92, '3d9abe9936da6d0977350ae0c2185941ea3a0195ed10858d9322af5bb14d13ef'],
  ['neon:player:alex-hurt', 'neon/player/alex-hurt.png', 92, 92, '6e319e421adeef6fa932cf8ada4b2b12dadb1a3b85a0726f8caed81a627f09e7'],
  ['presentation:actor:alex-idle', 'presentation/actors/alex-idle.png', 32, 48, '2f6d7f11748ec655eb9f940b91ab7a1b463a489cdd86bd1bb086eff1acb26130'],
  ['presentation:actor:alex-walk', 'presentation/actors/alex-walk.png', 32, 48, 'dc4097bbf62891dd929173abcf15903444e6d015a5514086cece9202bccac789'],
] as const;

it.each(SOURCES)('%s covers every actual source frame with opaque, in-bounds anchors and patches', (key, path, width, height, hash) => {
  const bytes = readFileSync(`public/assets/${path}`);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  const png = decodePng(bytes), rows = ALEX_HAND_ANCHORS[key]!;
  expect(rows.length * height).toBe(png.height);
  for (const [row, columns] of rows.entries()) {
    expect(columns.length * width).toBe(png.width);
    for (const [column, anchor] of columns.entries()) {
      expect(anchor.x).toBeGreaterThanOrEqual(0); expect(anchor.x).toBeLessThan(width);
      expect(anchor.y).toBeGreaterThanOrEqual(0); expect(anchor.y).toBeLessThan(height);
      const offset = ((row * height + anchor.y) * png.width + column * width + anchor.x) * 4;
      expect(png.data[offset + 3], `${key} row ${row} frame ${column}`).toBe(255);
      if (anchor.occluded) expect(anchor.handPatch).toBeUndefined();
      if (anchor.handPatch) {
        const patch = anchor.handPatch;
        expect(patch.width).toBe(3); expect(patch.height).toBe(3);
        expect(patch.x).toBeGreaterThanOrEqual(0); expect(patch.x + patch.width).toBeLessThanOrEqual(width);
        expect(patch.y).toBeGreaterThanOrEqual(0); expect(patch.y + patch.height).toBeLessThanOrEqual(height);
      }
    }
  }
});

it('covers 280 measured frames, marks five hidden palms, and rejects absent/invalid frames', () => {
  const anchors = Object.values(ALEX_HAND_ANCHORS).flat(2);
  expect(anchors).toHaveLength(280);
  expect(anchors.filter(a => a.occluded)).toHaveLength(5);
  expect(anchors.filter(a => a.handPatch)).toHaveLength(221);
  for (const frame of [{ row: -1, column: 0 }, { row: 0, column: 99 }, { row: .5, column: 0 }]) expect(alexHandAnchor(SOURCES[0][0], frame)).toBeNull();
  expect(alexHandAnchor('neon:player:alex-death', { row: 0, column: 0 })).toBeNull();
});
