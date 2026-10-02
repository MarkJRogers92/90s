import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { HeroPropView, type HeroPropLayers } from '../../src/game/view/HeroPropView';
import { createProp } from '../../src/sim/combat/props';
import { createRun } from '../../src/sim/createRun';

// Only the graphics backend is replaced; the production renderer owns all
// state changes, texture selection and ID reuse across successive room frames.
vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0 } } }));

class ImageBackend {
  texture: { key: string };
  flipX = false;
  x = 0; y = 0; originX = 0; originY = 0; scaleX = 0; scaleY = 0; depth = 0; alpha = 1;
  angle = 0;
  data = new Map<string, unknown>();
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; }
  setVisible() { return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setAngle(angle: number) { this.angle = angle; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setFlipX(flip: boolean) { this.flipX = flip; return this; }
  setCrop() { return this; }
  setBlendMode() { return this; }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  getData(key: string) { return this.data.get(key); }
  destroy() { /* no backend resource in this test */ }
}

describe('normal prop renderer room transitions', () => {
  it.each(['bakery', 'monitors', 'slush'] as const)('%s clears a previous cart image flip while preserving its exact native pose after damage', (kind) => {
    const images: ImageBackend[] = [];
    const scene = {
      textures: { exists: () => true, get: (key: string) => ({ key }) },
      add: { image: (_x: number, _y: number, key: string) => { const image = new ImageBackend(key); images.push(image); return image; } },
    } as unknown as Phaser.Scene;
    const graphics = { lineStyle() { return this; }, strokeEllipse() { return this; } };
    const layers = { effects: graphics, floor: graphics, light: () => {}, shadow: () => {} } as unknown as HeroPropLayers;
    const view = new HeroPropView(scene);
    const combat = createRun(1); combat.enemies = [];
    const cart = createProp(1, 'cart', 350, 300); cart.vx = -1;
    combat.props = [cart];
    view.sync(combat, 0, layers);
    const image = images[0]!;
    expect(image.flipX).toBe(true);

    const prop = createProp(1, kind, 550, 110);
    combat.props = [prop];
    view.sync(combat, 0, layers);
    expect(images[0]).toBe(image);
    expect(image).toMatchObject({ flipX: false, x: 550, y: 110, originX: 0.5, originY: 1, scaleX: 1, scaleY: 1, angle: 0 });
    const depth = image.depth;
    prop.state = 'broken'; prop.brokenTick = 0;
    view.sync(combat, 0, layers);
    expect(image).toMatchObject({ flipX: false, x: 550, y: 110, originX: 0.5, originY: 1, scaleX: 1, scaleY: 1, depth });
    expect(image.texture.key).toContain('damaged');
  });
});
