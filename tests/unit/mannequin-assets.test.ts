// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_TEXTURE_KEYS, NEON_ASSETS } from '../../src/game/presentation/assets';
import { MANNEQUIN_HURT_FRAME_TICKS } from '../../src/game/view/EnemyReactionView';

describe('authored mannequin renderer asset contracts', () => {
  it.each([
    [ENEMY_TEXTURE_KEYS.mannequinHurt, 'mannequin-hurt.png', 384, 768],
    [ENEMY_TEXTURE_KEYS.mannequinDeath, 'mannequin-death.png', 672, 768],
    [ENEMY_TEXTURE_KEYS.mannequinPlasticImpact, 'mannequin-plastic-impact.png', 288, 48],
  ])('registers %s once with its approved local dimensions', (key, file, width, height) => {
    const found = NEON_ASSETS.filter((asset) => asset.key === key);
    expect(found).toHaveLength(1);
    expect(found[0]!.url).toBe(`/assets/neon/enemies/${file}`);
    const png = readFileSync(`public${found[0]!.url}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
  });
  it('preserves the exact nonuniform 14-tick hurt playback contract', () => {
    expect(MANNEQUIN_HURT_FRAME_TICKS).toEqual([3, 3, 4, 4]);
    expect(MANNEQUIN_HURT_FRAME_TICKS.reduce<number>((sum, ticks) => sum + ticks, 0)).toBe(14);
  });
});
