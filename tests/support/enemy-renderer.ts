import type Phaser from 'phaser';
import { ENEMY_TEXTURE_KEYS } from '../../src/game/presentation/assets';

/** Stateful DOM/WebGL substitute; production code owns all rendering decisions. */
export class ImageSurface {
  texture: { key: string }; width = 32; height = 32;
  x = 0; y = 0; rotation = 0; originX = 0; originY = 0; scaleX = 1; scaleY = 1; alpha = 1; depth = 0;
  visible = true; destroyed = false; tint: number | null = null; tintMode = 0;
  crop = { x: 0, y: 0, width: 0, height: 0 };
  constructor(key: string, readonly dimensions: (key: string) => { width: number; height: number }) { this.texture = { key }; this.setTexture(key); }
  setTexture(key: string) { this.texture.key = key; Object.assign(this, this.dimensions(key)); return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setCrop(x: number, y: number, width: number, height: number) { this.crop = { x, y, width, height }; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setRotation(v: number) { this.rotation = v; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(v: number) { this.depth = v; return this; }
  setAlpha(v: number) { this.alpha = v; return this; }
  setTint(v: number) { this.tint = v; return this; }
  clearTint() { this.tint = null; return this; }
  setTintMode(v: number) { this.tintMode = v; return this; }
  setFillStyle() { return this; } setScrollFactor() { return this; } setDisplaySize() { return this; } setBlendMode() { return this; }
  destroy() { this.destroyed = true; this.visible = false; }
}
export function enemyRenderer() {
  const images: ImageSurface[] = [], marks: string[] = [], shakes: Array<[number, number]> = [];
  const missing = new Set<string>(), aliases = new Set<string>();
  const sizes = new Map<string, { width: number; height: number }>([
    ['neon:enemy:static-crt-impact', { width: 288, height: 48 }],
    ['neon:enemy:static-hurt', { width: 384, height: 768 }],
    ['neon:enemy:static-idle', { width: 768, height: 96 }],
    ['neon:enemy:static-walk', { width: 768, height: 768 }],
    ['neon:enemy:static-death', { width: 672, height: 768 }],
    ['neon:enemy:static-attack', { width: 384, height: 768 }],
    ['neon:enemy:mannequin-plastic-impact', { width: 288, height: 48 }],
    ['neon:enemy:mannequin-hurt', { width: 384, height: 768 }],
    [ENEMY_TEXTURE_KEYS.mannequinIdle, { width: 768, height: 96 }],
    [ENEMY_TEXTURE_KEYS.mannequinWalk, { width: 576, height: 768 }],
    [ENEMY_TEXTURE_KEYS.mannequinDeath, { width: 672, height: 768 }],
    ['neon:enemy:mannequin-attack', { width: 384, height: 768 }],
    [ENEMY_TEXTURE_KEYS.hangerDeath, { width: 512, height: 512 }],
    ['neon:enemy:hanger-hurt', { width: 368, height: 736 }],
    ['neon:enemy:hanger-shell-impact', { width: 288, height: 48 }],
  ]);
  const dimensions = (key: string) => sizes.get(key) ?? { width: 64, height: 64 };
  const image = (x: number, y: number, key: string) => { const result = new ImageSurface(key, dimensions).setPosition(x, y); images.push(result); return result; };
  const g: Record<string, unknown> = {};
  for (const method of ['setDepth', 'clear', 'fillStyle', 'lineStyle', 'fillPoints', 'fillCircle', 'fillRect', 'strokeCircle', 'strokeEllipse', 'lineBetween', 'destroy']) {
    g[method] = () => { marks.push(method); return g; };
  }
  const scene = {
    textures: { exists: (key: string) => !missing.has(key), get: (key: string) => ({ key: aliases.has(key) ? '__MISSING' : key, getSourceImage: () => dimensions(key) }) },
    add: { image, rectangle: (x: number, y: number) => image(x, y, 'rectangle'), graphics: () => g },
    cameras: { main: { shake: (duration: number, intensity: number) => shakes.push([duration, intensity]) } },
  } as unknown as Phaser.Scene;
  return { scene, images, marks, shakes, missing, aliases, sizes };
}
