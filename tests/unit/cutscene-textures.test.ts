import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node is supplied by Vitest for dependency inspection.
import { createRequire } from 'node:module';
// @ts-expect-error Node is supplied by Vitest for dependency inspection.
import { dirname, join } from 'node:path';
import type Phaser from 'phaser';
import { PLAYER_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { EscalatorRide } from '../../src/game/ui/EscalatorRide';
import { DawnEnding } from '../../src/game/ui/DawnEnding';
import { endingFrame } from '../../src/game/ui/dawnEndingModel';
import { rideFrame } from '../../src/game/ui/escalatorRideModel';
import { ActorSpriteView, type ActorSnapshot } from '../../src/game/view/ActorSpriteView';

vi.mock('phaser', () => ({ default: {
  BlendModes: { ADD: 1 },
  Math: { Vector2: class { constructor(public x: number, public y: number) {} } },
  Display: { Color: { GetColor: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b } },
} }));
vi.mock('../../src/game/presentation/neon/proceduralTextures', () => ({
  ensureNeonSign: () => ({ halo: 'label', core: 'label' }),
  ensurePixelLabel: () => ({ key: 'label' }),
}));

// Use Phaser's actual Texture / Frame implementation, including default-frame
// selection and crop clamping. Only the GPU, drawing commands and events are stubbed.
const require = createRequire(import.meta.url);
const Texture = require(join(dirname(require.resolve('phaser')), '../src/textures/Texture.js')) as typeof Phaser.Textures.Texture;

function sheet(key: string, width: number, height: number): Phaser.Textures.Texture {
  const texture = new Texture({} as Phaser.Textures.TextureManager, key, []);
  texture.source.push({ width, height, glTexture: {} } as Phaser.Textures.TextureSource);
  texture.add('__BASE', 0, 0, 0, width, height);
  return texture;
}

type Crop = { x: number; y: number; width: number; height: number; cx: number; cy: number };

class ImageBackend {
  texture: Phaser.Textures.Texture;
  frame: Phaser.Textures.Frame;
  crop: Crop | null = null;
  x = 0; y = 0; originX = 0.5; originY = 0.5; scaleX = 1; scaleY = 1;
  visible = true; destroyed = false;
  constructor(private readonly textures: Map<string, Phaser.Textures.Texture>, key: string, frame?: string) {
    this.texture = textures.get(key)!;
    this.frame = this.texture.get(frame);
  }
  get width() { return this.frame.realWidth; }
  get height() { return this.frame.realHeight; }
  setTexture(key: string, frame?: string) { this.texture = this.textures.get(key)!; return this.setFrame(frame); }
  setFrame(name?: string) {
    this.frame = this.texture.get(name);
    if (this.crop) this.frame.updateCropUVs(this.crop, false, false);
    return this;
  }
  setCrop(x: number, y: number, width: number, height: number) {
    this.crop = { x, y, width, height, cx: 0, cy: 0 };
    this.frame.setCropUVs(this.crop, x, y, width, height, false, false);
    return this;
  }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setDepth() { return this; } setAlpha() { return this; } setTint() { return this; }
  setTintMode() { return this; } clearTint() { return this; } setRotation() { return this; }
  setBlendMode() { return this; }
  destroy() { this.destroyed = true; }
  sourceRect() {
    return this.crop
      ? { x: this.crop.cx, y: this.crop.cy, width: this.crop.width, height: this.crop.height }
      : { x: this.frame.cutX, y: this.frame.cutY, width: this.width, height: this.height };
  }
  visibleTopLeft() {
    return {
      x: this.x + ((this.crop?.x ?? 0) - this.originX * this.width) * this.scaleX,
      y: this.y + ((this.crop?.y ?? 0) - this.originY * this.height) * this.scaleY,
    };
  }
}

function renderer() {
  const textures = new Map([
    [PLAYER_TEXTURE_KEYS.idle, sheet(PLAYER_TEXTURE_KEYS.idle, 512, 64)],
    [PLAYER_TEXTURE_KEYS.walk, sheet(PLAYER_TEXTURE_KEYS.walk, 384, 512)],
    ['label', sheet('label', 100, 40)],
  ]);
  const images: ImageBackend[] = [];
  const graphics: Record<string, () => unknown> = {};
  for (const method of ['clear', 'fillStyle', 'fillRect', 'fillGradientStyle', 'fillPoints', 'lineStyle', 'lineBetween', 'fillCircle', 'fillTriangle', 'fillEllipse', 'setBlendMode', 'destroy']) {
    graphics[method] = () => graphics;
  }
  const scene = {
    textures: { exists: (key: string) => textures.has(key), get: (key: string) => textures.get(key) },
    add: {
      graphics: () => graphics,
      image: (x: number, y: number, key: string, frame?: string) => {
        const image = new ImageBackend(textures, key, frame).setPosition(x, y);
        images.push(image); return image;
      },
      container: (_x: number, _y: number, children: Array<{ destroy(): void }>) => ({
        setScrollFactor() { return this; }, setDepth() { return this; },
        destroy() { for (const child of children) child.destroy(); },
      }),
    },
    input: { on: vi.fn(), off: vi.fn() },
  } as unknown as Phaser.Scene;
  return { scene, textures, images };
}

beforeEach(() => vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('cutscenes sharing Alex sheets with gameplay', () => {
  it.each(['ride', 'ending'] as const)('%s leaves the shared whole-sheet default intact while open and after skipping', (kind) => {
    const { scene, textures } = renderer();
    const key = kind === 'ride' ? PLAYER_TEXTURE_KEYS.idle : PLAYER_TEXTURE_KEYS.walk;
    const texture = textures.get(key)!;
    const cutscene = kind === 'ride' ? new EscalatorRide(scene) : new DawnEnding(scene);
    try {
      expect(texture.get().name).toBe('__BASE');
      cutscene.update(400);
      cutscene.requestSkip();
      expect(cutscene.update(1)).toBe(true);
      expect(texture.get().name).toBe('__BASE');
    } finally { cutscene.destroy(); }
    expect(texture.get().name).toBe('__BASE');
    expect(texture.frameTotal).toBe(1);
  });

  it('keeps the north-east rider at the same feet point and scale throughout each floor ride', () => {
    const { scene, images } = renderer();
    for (const floor of [2, 3, 4] as const) {
      const ride = new EscalatorRide(scene, floor);
      const rider = images.filter((image) => image.texture.key === PLAYER_TEXTURE_KEYS.idle).at(-1)!;
      let previous = 0;
      for (const ms of [0, 900, 1800, 3600]) {
        ride.update(ms - previous); previous = ms;
        expect(rider.sourceRect()).toEqual({ x: 320, y: 0, width: 64, height: 64 });
        expect(rider.visibleTopLeft().x).toBeCloseTo(Math.round(rideFrame(ms).rider.x) - 64);
        expect(rider.visibleTopLeft().y).toBeCloseTo(Math.round(rideFrame(ms).rider.y) - 115.2);
      }
      ride.destroy();
      expect(rider.destroyed).toBe(true);
    }
  });

  it('animates all six north-facing walking cells without shifting the ending feet point', () => {
    const { scene, images } = renderer();
    const ending = new DawnEnding(scene);
    const walker = images.find((image) => image.texture.key === PLAYER_TEXTURE_KEYS.walk)!;
    let previous = 0;
    for (const ms of [0, 130, 260, 390, 520, 650, 780, 1500, 3900, 6400]) {
      ending.update(ms - previous); previous = ms;
      const { x, y, scale, frame } = endingFrame(ms).walker;
      expect(walker.sourceRect()).toEqual({ x: frame * 64, y: 256, width: 64, height: 64 });
      expect(walker.visibleTopLeft().x).toBeCloseTo(Math.round(x) - 32 * scale);
      expect(walker.visibleTopLeft().y).toBeCloseTo(Math.round(y) - 57.6 * scale);
    }
    ending.destroy();
    expect(walker.destroyed).toBe(true);
  });

  it.each(['existing', 'new'] as const)('%s gameplay images retain their full-sheet crops after both cutscenes', (lifecycle) => {
    const { scene, images } = renderer();
    const idle = { textureKey: PLAYER_TEXTURE_KEYS.idle, frameWidth: 64, frameHeight: 64, scale: 1 };
    let view = lifecycle === 'existing' ? new ActorSpriteView(scene, idle) : null;
    const ride = new EscalatorRide(scene); ride.update(3600); ride.destroy();
    const ending = new DawnEnding(scene); ending.update(6400); ending.destroy();
    view ??= new ActorSpriteView(scene, idle);
    const image = images.find((entry) => entry.texture.key === PLAYER_TEXTURE_KEYS.idle && !entry.destroyed)!;
    const actor: ActorSnapshot = { id: 'player', kind: 'alex', x: 300, y: 400, moveX: 0, moveY: 1, attackTicks: 0, damaged: false, phase: 'walk' };
    const visual = { direction: 'south' as const, walking: true, lunge: 0, bobY: 0, damageFlicker: false, damageFeedback: false, attackLean: 0 };
    for (const [key, row, column] of [
      [PLAYER_TEXTURE_KEYS.walk, 7, 5],
      [PLAYER_TEXTURE_KEYS.idle, 0, 7],
      [PLAYER_TEXTURE_KEYS.walk, 4, 3],
    ] as const) {
      view.sync(actor, { row, column }, visual, true, 1, { ...idle, textureKey: key });
      expect(image.sourceRect()).toEqual({ x: column * 64, y: row * 64, width: 64, height: 64 });
      expect(image.visibleTopLeft().x).toBeCloseTo(actor.x - 32);
      expect(image.visibleTopLeft().y).toBeCloseTo(actor.y - 64 * 0.84);
      expect(image.frame.name).toBe('__BASE');
    }
    view.destroy();
  });

  it('still plays and cleans up when the player sheets are unavailable', () => {
    const { scene, textures } = renderer();
    textures.delete(PLAYER_TEXTURE_KEYS.idle);
    textures.delete(PLAYER_TEXTURE_KEYS.walk);
    const ride = new EscalatorRide(scene); expect(ride.update(3600)).toBe(true); ride.destroy();
    const ending = new DawnEnding(scene); expect(ending.update(6400)).toBe(true); ending.destroy();
  });
});
