// @ts-expect-error Vitest provides this Node built-in at test runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error Vitest provides this Node built-in at test runtime.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { usableTextureKey } from '../../src/game/presentation/assetFallback';
import {
  ENVIRONMENT_TEXTURE_KEYS,
  PRESENTATION_ASSETS,
  type EnvironmentTextureKey,
} from '../../src/game/presentation/assets';

const expectedDimensions = new Map<string, readonly [number, number]>([
  ['presentation:environment:atrium-fountain', [96, 64]],
  ['presentation:environment:bench-warrant-kiosk', [64, 64]],
  ['presentation:environment:floor-terrazzo', [32, 32]],
  ['presentation:environment:mall-bench', [56, 30]],
  ['presentation:environment:mall-directory', [17, 54]],
  ['presentation:environment:planter', [25, 25]],
  ['presentation:environment:poster-stand', [38, 53]],
  ['presentation:environment:potted-palm', [38, 58]],
  ['presentation:environment:railing-glass', [32, 32]],
  ['presentation:environment:rubbish-bin', [20, 25]],
  ['presentation:environment:security-gate', [32, 32]],
  ['presentation:environment:sign-cool', [96, 24]],
  ['presentation:environment:storefront-fascia', [64, 32]],
  ['presentation:environment:wall-corner', [32, 64]],
  ['presentation:environment:wall-face', [32, 64]],
  ['presentation:environment:wall-top', [32, 32]],
]);

function pngDimensions(url: string): readonly [number, number] {
  const processWithCwd = globalThis as typeof globalThis & { process: { cwd(): string } };
  const png = readFileSync(resolve(processWithCwd.process.cwd(), `public${url}`));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('presentation asset manifest', () => {
  it('registers each approved local asset once at its expected dimensions', () => {
    expect(PRESENTATION_ASSETS).toHaveLength(16);
    expect(new Set(PRESENTATION_ASSETS.map((asset) => asset.key)).size).toBe(PRESENTATION_ASSETS.length);
    expect(new Set(PRESENTATION_ASSETS.map((asset) => asset.url)).size).toBe(PRESENTATION_ASSETS.length);

    for (const asset of PRESENTATION_ASSETS) {
      expect(asset.requiredFor).toBe('environment');
      expect(asset.url).toMatch(/^\/assets\/presentation\//);
      expect(asset.url).not.toMatch(/^(?:https?:|data:|\/Users\/|~\/)/i);
      expect(pngDimensions(asset.url)).toEqual(expectedDimensions.get(asset.key));
      if (asset.frameWidth !== undefined && asset.frameHeight !== undefined) {
        const [width, height] = pngDimensions(asset.url);
        expect(width % asset.frameWidth).toBe(0);
        expect(height % asset.frameHeight).toBe(0);
      }
    }
  });
});

describe('usableTextureKey', () => {
  const textureManager = (textures: ReadonlyMap<string, { key: string }>) =>
    ({
      exists: (key: string) => textures.has(key),
      get: (key: string) => textures.get(key) ?? { key: '__MISSING' },
    }) as never;

  it('returns only a loaded texture that is not Phaser missing-texture fallback', () => {
    expect(usableTextureKey(textureManager(new Map([['floor', { key: 'floor' }]])), 'floor')).toBe('floor');
    expect(usableTextureKey(textureManager(new Map()), 'absent')).toBeNull();
    expect(usableTextureKey(textureManager(new Map([['broken', { key: '__MISSING' }]])), 'broken')).toBeNull();
  });
});

describe('typed environment keys', () => {
  it('maps every named environment key to a preloaded manifest entry', () => {
    const manifestKeys = new Set(PRESENTATION_ASSETS.map((asset) => asset.key));
    for (const key of Object.values(ENVIRONMENT_TEXTURE_KEYS)) {
      expect(manifestKeys.has(key)).toBe(true);
    }
  });

  it('keeps request keys a closed compile-time union', () => {
    const approved: EnvironmentTextureKey = ENVIRONMENT_TEXTURE_KEYS.atriumFountain;
    expect(approved).toBe('presentation:environment:atrium-fountain');
    // @ts-expect-error Unapproved texture names must not compile at view call sites.
    const typo: EnvironmentTextureKey = 'presentation:environment:atrium-fountian';
    expect(typo).not.toBe(approved);
  });
});
