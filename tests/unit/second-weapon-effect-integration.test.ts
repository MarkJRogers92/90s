import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { WeaponView } from '../../src/game/view/WeaponView';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { meleeEffect, projectileEffect } from '../../src/game/view/weaponEffects';
import { weaponPresentation } from '../../src/game/view/weaponPresentation';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import type { MvpRunState } from '../../src/sim/run/types';

vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));

// Only the DOM/WebGL image and graphics surfaces are replaced. Real weapon,
// effect and run-view code chooses the anchors, release and cleanup behavior.
class ImageSurface {
  texture: { key: string }; width = 32; height = 32;
  depth = 0; x = 0; y = 0; rotation = 0; scaleX = 1; scaleY = 1; originX = .5; originY = .5; flipY = false; alpha = 1; visible = true; destroyed = false;
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(r: number) { this.rotation = r; return this; }
  setScale(s: number) { this.scaleX = s; this.scaleY = s; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setFlipY(v: boolean) { this.flipY = v; return this; }
  setAlpha(v: number) { this.alpha = v; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setDepth(depth: number) { this.depth = depth; return this; } setCrop() { return this; }
  destroy() { this.destroyed = true; this.visible = false; }
  point(x: number, y: number) {
    const dx = (x - this.originX * this.width) * this.scaleX;
    const dy = ((this.flipY ? this.height - y : y) - this.originY * this.height) * this.scaleY;
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return { x: this.x + c * dx - s * dy, y: this.y + s * dx + c * dy };
  }
}
function setup() {
  const images: ImageSurface[] = [];
  const scene = { textures: { exists: () => true, get: (key: string) => ({ key }) },
    add: { image: (_x: number, _y: number, key: string) => { const image = new ImageSurface(key); images.push(image); return image; } },
  } as unknown as Phaser.Scene;
  const marks: string[] = []; const g: Record<string, unknown> = {};
  for (const method of ['fillStyle', 'fillCircle', 'fillPoints', 'lineStyle', 'beginPath', 'arc', 'strokePath', 'fillRect']) {
    g[method] = () => { marks.push(method); return g; };
  }
  const weapon = new WeaponView(scene), weaponEffects = new WeaponEffectView(scene);
  return { images, marks, weapon, weaponEffects, g: g as unknown as Phaser.GameObjects.Graphics,
    context: { weapon, weaponEffects, actorSprites: new Map(), openingConcourse: null } };
}
const ids = ['broken_broom_handle', 'box_cutter', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'] as const;
const drawPlayer = Reflect.get(MvpRunView.prototype, 'drawPlayer') as (state: MvpRunState, g: Phaser.GameObjects.Graphics, effects: Phaser.GameObjects.Graphics, drawBody: boolean) => void;
const state = (id: string, angle: number, tick: number, active = 6, status = 'playing'): MvpRunState => ({
  status, tick, inventory: { selectedPrimaryInstanceId: `held-${id}` }, room: { combat: {
    player: { x: 103, y: 107, facing: { x: Math.cos(angle), y: Math.sin(angle) }, attackActiveTicks: active, invulnerableTicks: 0 },
    compiledLoadout: { primary: { definitionId: id, ...ITEM_CATALOG.find((item) => item.id === id)!.base! } },
  } },
} as unknown as MvpRunState);

describe('second-slice real held/effect composition', () => {
  it.each(ids)('%s replaces its fallback and registers to the actual rendered head in eight directions', (id) => {
    for (let d = 0; d < 8; d++) {
      const { images, marks, weaponEffects, context, g } = setup();
      weaponEffects.beginFrame('room', 10);
      drawPlayer.call(context, state(id, d * Math.PI / 4, 10), g, g, false);
      const held = images[0]!, effect = images[1]!;
      const head = weaponPresentation(id).head, renderedHead = held.point(head.x, head.y);
      expect(effect?.visible).toBe(true);
      expect(effect.x).toBeCloseTo(renderedHead.x);
      expect(effect.y).toBeCloseTo(renderedHead.y);
      expect(effect.rotation).toBeCloseTo(context.weapon.headAt()!.angle);
      expect(effect.flipY).toBe(context.weapon.headAt()!.flipY);
      const expected = meleeEffect(id) ?? projectileEffect({ sourceItemId: id, delivery: 'water_projectile' });
      expect(effect.texture.key).toBe(expected!.key);
      expect(marks).toEqual([]); // No generic wedge or yellow muzzle circles.
    }
  });

  it.each(ids)('%s hides both the held image and material on death without recreating either', (id) => {
    const { images, weaponEffects, context, g } = setup();
    weaponEffects.beginFrame('room', 10); drawPlayer.call(context, state(id, 0, 10), g, g, false);
    expect(images).toHaveLength(2);
    for (let repeat = 0; repeat < 3; repeat++) {
      weaponEffects.beginFrame('room', 10);
      drawPlayer.call(context, state(id, 0, 10, 6, 'dead'), g, g, false);
      weaponEffects.endFrame();
      expect(images.every((image) => !image.visible)).toBe(true);
      expect(images).toHaveLength(2);
    }
  });

  it.each(ids)('%s has no material recovery ghost after switching to a new idle weapon', (id) => {
    const { images, weaponEffects, context, g } = setup();
    weaponEffects.beginFrame('room', 10); drawPlayer.call(context, state(id, 0, 10), g, g, false);
    weaponEffects.beginFrame('room', 11); drawPlayer.call(context, state('janitor_mop', 0, 11, 0), g, g, false);
    expect(context.weapon.swingAt(11)).toBeNull();
    expect(images[0]!.visible).toBe(true);
    expect(images[1]!.visible).toBe(false);
  });
});


it('passes the current displayed body palm through the Night Shift held-weapon/effect composition', () => {
  const { context, g, weapon, weaponEffects } = setup();
  const palm = { x: 81.125, y: 53.75, behind: true, depth: 100, alpha: .45 };
  context.actorSprites.set('player', { handAt: () => palm });
  weaponEffects.beginFrame('room', 10);
  drawPlayer.call(context, state('party_popper', 0, 10), g, g, false);
  expect(weapon.headAt()!.grip).toEqual({ x: palm.x, y: palm.y });
  expect(weapon.headAt()!.imageDepth).toBe(99);
});
