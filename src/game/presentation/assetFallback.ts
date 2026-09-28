import type Phaser from 'phaser';

/**
 * Returns a usable asset key or null, letting callers retain their vector
 * rendering whenever Phaser did not load the requested presentation texture.
 */
export function usableTextureKey(
  textures: Phaser.Textures.TextureManager,
  key: string,
): string | null {
  if (!textures.exists(key)) {
    return null;
  }

  return textures.get(key).key === '__MISSING' ? null : key;
}
