import type Phaser from 'phaser';

/**
 * Numbers a horizontal strip's cells `'0'..'count-1'` once per texture, so
 * `image.setFrame(String(i))` shows one cell. Cell 0 is always the still rest
 * sprite, so a strip reads correctly on its own or before it animates.
 *
 * Returns true only when the numbered cells are actually available: a texture
 * whose asset did not load (or a test double without a frame list) is left
 * alone, and the caller keeps its still image.
 */
export function ensureStripFrames(
  textures: Phaser.Textures.TextureManager,
  key: string,
  frameWidth: number,
  frameHeight: number,
  count: number,
): boolean {
  if (!count || !textures.exists(key)) return false;
  const texture = textures.get(key) as Phaser.Textures.Texture & {
    has?: (name: string) => boolean;
    add?: (name: string, sourceIndex: number, x: number, y: number, width: number, height: number) => unknown;
  };
  if (typeof texture.has !== 'function' || typeof texture.add !== 'function') return false;
  for (let index = 0; index < count; index += 1) {
    if (!texture.has(String(index))) {
      texture.add(String(index), 0, index * frameWidth, 0, frameWidth, frameHeight);
    }
  }
  return true;
}
