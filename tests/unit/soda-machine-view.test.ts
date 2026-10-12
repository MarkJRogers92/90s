// @ts-expect-error Vitest provides the Node built-in for real asset inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { HeroPropView, type HeroPropLayers } from '../../src/game/view/HeroPropView';
import { PROP_TEXTURES } from '../../src/game/presentation/rooms/roomDressing';
import { createProp } from '../../src/sim/combat/props';
import { createRun } from '../../src/sim/createRun';

vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0 } } }));

/** A texture that records the numbered frames a strip registers. */
class StripTexture {
  readonly frames = new Map<string, unknown>([['__BASE', {}]]);
  public constructor(public key: string) {}
  has(name: string) { return this.frames.has(name); }
  add(name: string) { this.frames.set(name, {}); return this.frames.get(name); }
}

class Image {
  texture: StripTexture;
  frame: { name: string } = { name: '__BASE' };
  flipX = false; x = 0; y = 0; originX = 0; originY = 0; scaleX = 1; scaleY = 1; depth = 0; alpha = 1; angle = 0;
  constructor(texture: StripTexture) { this.texture = texture; }
  setTexture(key: string) { this.texture = manager.get(key)!; return this; }
  setVisible() { return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setAngle(a: number) { this.angle = a; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(d: number) { this.depth = d; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setFlipX(f: boolean) { this.flipX = f; return this; }
  setCrop() { return this; }
  setBlendMode() { return this; }
  setData() { return this; }
  getData() { return undefined; }
  setFrame(name: string) { this.frame = { name }; return this; }
  destroy() { /* no backend resource in this test */ }
}

const manager = new Map<string, StripTexture>();
manager.set('neon:prop:soda-machine-anim', new StripTexture('neon:prop:soda-machine-anim'));
manager.set('neon:prop:soda-machine-broken', new StripTexture('neon:prop:soda-machine-broken'));

const textures = { exists: (key: string) => manager.has(key), get: (key: string) => manager.get(key)! };
const graphics = { lineStyle() { return this; }, strokeEllipse() { return this; } };
const layers = { effects: graphics, floor: graphics, light: () => {}, shadow: () => {} } as unknown as HeroPropLayers;

function sodaView() {
  const images: Image[] = [];
  const scene = {
    textures,
    add: { image: (_x: number, _y: number, key: string) => { const image = new Image(manager.get(key)!); images.push(image); return image; } },
  } as unknown as Phaser.Scene;
  const combat = createRun(1); combat.enemies = [];
  combat.props = [createProp(1, 'soda', 420, 280)];
  const view = new HeroPropView(scene);
  view.sync(combat, 0, layers);
  return { view, combat, image: images[0]! };
}

describe('animated soda machine', () => {
  it('is registered as a four-cell strip at the machine cell size', () => {
    const texture = PROP_TEXTURES.sodaMachineAnim;
    expect('frames' in texture && texture.frames).toBe(4);
    const png = readFileSync(`public/assets/neon/${texture.file}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([44 * 4, 78]);
  });

  it('steps the standing machine through its cells, once per ~8 ticks', () => {
    const { view, combat, image } = sodaView();
    const nameAt = (tick: number) => { combat.enemies = []; view.sync(combat, tick, layers); return image.frame.name; };
    expect([0, 7, 14, 21].map(nameAt)).toEqual(['0', '1', '2', '3']);
  });

  it('holds frame 0 under Reduced Flashes (no flicker for photosensitive players)', () => {
    const { view, combat, image } = sodaView();
    const nameAt = (tick: number) => { view.sync(combat, tick, layers, false); return image.frame.name; };
    expect([0, 7, 14, 21].map(nameAt)).toEqual(['0', '0', '0', '0']);
  });
});
