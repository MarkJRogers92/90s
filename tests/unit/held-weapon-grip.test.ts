import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { WeaponView, type WeaponSnapshot } from '../../src/game/view/WeaponView';

// This adapter records actual Image transforms; the assertions below apply the
// same origin/flip geometry as Phaser's TransformerImage, not mock call counts.
class ImageProbe {
  width = 32; height = 32; texture = { key: '__DEFAULT' }; visible = true;
  x = 0; y = 0; rotation = 0; scaleX = 1; scaleY = 1; flipY = false; originX = .5; originY = .5; depth = 0;
  setVisible(v: boolean) { this.visible = v; return this; }
  setTexture(key: string) { this.texture = { key }; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(r: number) { this.rotation = r; return this; }
  setScale(s: number) { this.scaleX = s; this.scaleY = s; return this; }
  setFlipY(v: boolean) { this.flipY = v; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setDepth(d: number) { this.depth = d; return this; }
  destroy() {}
  point(x: number, y: number) {
    const px = (x - this.originX * 32) * this.scaleX;
    const py = ((this.flipY ? 32 - y : y) - this.originY * 32) * this.scaleY;
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return { x: this.x + c * px - s * py, y: this.y + s * px + c * py };
  }
}
function setup() {
  const held = new ImageProbe();
  const scene = { add: { image: () => held }, textures: { exists: () => true, get: (key: string) => ({ key }) } } as unknown as Phaser.Scene;
  const circles: Array<{ x: number; y: number; radius: number }> = [];
  const graphics: Record<string, unknown> = {};
  for (const method of ['fillStyle', 'fillCircle', 'fillPoints', 'lineStyle', 'beginPath', 'arc', 'strokePath', 'fillRect']) graphics[method] = () => graphics;
  graphics.fillCircle = (x: number, y: number, radius: number) => { circles.push({ x, y, radius }); return graphics; };
  return { circles, held, view: new WeaponView(scene), effects: graphics as unknown as Phaser.GameObjects.Graphics };
}
const snapshot = (definitionId: string, facingX = 1, facingY = 0): WeaponSnapshot => ({
  x: 100, y: 100, definitionId, facingX, facingY, attackActiveTicks: 0, delivery: 'projectile', range: 60, halfAngleRadians: Math.PI / 4,
});

describe('held icon grip geometry', () => {
  it.each(['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('%s suppresses the generic muzzle flash only when a native ranged effect is available', (id) => {
    const native = setup(), fallback = setup();
    const weapon = { ...snapshot(id), attackActiveTicks: 6 };
    native.view.sync(weapon, 10, native.effects, 100, false, true);
    fallback.view.sync(weapon, 10, fallback.effects, 100);
    expect(native.circles).toHaveLength(0);
    expect(fallback.circles).toHaveLength(2);
  });
  it('exposes the exact mirrored muzzle position used by its generic fallback flash', () => {
    for (const facingX of [-1, 1]) {
      const { held, view, effects, circles } = setup();
      view.sync({ ...snapshot('foam_ball_blaster', facingX), attackActiveTicks: 6 }, 10, effects, 100);
      const muzzle = held.point(3, 16);
      expect(view.headAt()!.head.x).toBeCloseTo(muzzle.x);
      expect(view.headAt()!.head.y).toBeCloseTo(muzzle.y);
      expect(circles[0]!.x).toBeCloseTo(muzzle.x);
      expect(circles[0]!.y).toBeCloseTo(muzzle.y);
    }
  });
  it.each(['janitor_mop', 'broken_broom_handle', 'box_cutter', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('%s keeps the six-tick active attack and sixteen-tick visual scheduling unchanged', (id) => {
    const { view } = setup();
    view.noteAttack({ definitionId: id, attackActiveTicks: 6, facingX: 1, facingY: 0 }, 10);
    view.noteAttack({ definitionId: id, attackActiveTicks: 6, facingX: 1, facingY: 0 }, 10);
    expect(view.swingAt(10)).toBe(0);
    view.noteAttack({ definitionId: id, attackActiveTicks: 0, facingX: 1, facingY: 0 }, 16);
    expect(view.swingAt(18)).toBe(.5);
    expect(view.swingAt(26)).toBe(1);
    expect(view.swingAt(27)).toBeNull();
    view.noteAttack({ definitionId: id, attackActiveTicks: 6, facingX: 0, facingY: -1 }, 30);
    expect(view.swingAt(30)).toBe(0);
    expect(view.swingAt(34)).toBe(.25);
    view.reset();
    expect(view.swingAt(34)).toBeNull();
  });
  it('clears visible head geometry on hide, reset and destroy', () => {
    for (const method of ['hide', 'reset', 'destroy'] as const) {
      const { view, effects } = setup();
      view.sync(snapshot('janitor_mop'), 0, effects, 100);
      expect(view.headAt()).not.toBeNull();
      view[method]();
      expect(view.headAt()).toBeNull();
    }
  });
  it('places upward held sprites behind the body and downward sprites in front', () => {
    const { held, view, effects } = setup();
    view.sync(snapshot('pump_soaker', 0, -1), 0, effects, 100);
    expect(held.depth).toBe(99);
    view.sync(snapshot('pump_soaker', 0, 1), 0, effects, 100);
    expect(held.depth).toBe(101);
  });
  it('points the left-facing foam blaster barrel right when aiming right, with the handle below', () => {
    const { held, view, effects } = setup();
    view.sync(snapshot('foam_ball_blaster'), 0, effects, 100);
    const muzzle = held.point(3, 16), barrelRear = held.point(20, 16), grip = held.point(22, 23);
    expect(muzzle.x).toBeGreaterThan(barrelRear.x);
    expect(muzzle.y).toBeCloseTo(barrelRear.y);
    expect(grip.y).toBeGreaterThan(barrelRear.y);
  });
  it('holds a mop by its shaft near the body instead of centering its tile beyond the hand', () => {
    const { held, view, effects } = setup();
    view.sync({ ...snapshot('janitor_mop'), delivery: 'direct', halfAngleRadians: 0 }, 0, effects, 100);
    const grip = held.point(23, 9);
    expect(grip.x).toBeCloseTo(110);
    expect(grip.y).toBeCloseTo(80);
  });
  it('gives a fused mop the same held transform as the original mop', () => {
    const a = setup(), b = setup();
    a.view.sync({ ...snapshot('janitor_mop'), delivery: 'direct' }, 0, a.effects, 100);
    b.view.sync({ ...snapshot('hybrid__janitor_mop__pump_soaker'), delivery: 'direct' }, 0, b.effects, 100);
    expect(b.held.point(8, 24)).toEqual(a.held.point(8, 24));
  });
});


describe('compact cutter image geometry', () => {
  it.each(['box_cutter', 'hybrid__(hybrid__box_cutter__party_popper)__gel_pens'])('%s uses the small source-size override without moving its authored grip', (definitionId) => {
    for (const aim of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const { held, view, effects } = setup();
      const weapon = { ...snapshot(definitionId, Math.cos(aim), Math.sin(aim)), delivery: 'direct' as const, halfAngleRadians: 0 };
      view.sync(weapon, 0, effects, 100);
      expect(held.scaleX).toBe(20 / 32 * 1.05);
      view.sync({ ...weapon, attackActiveTicks: 6 }, 10, effects, 100, true);
      expect(held.scaleX).toBe(20 / 32 * 1.35);
      const grip = held.point(23, 13), head = held.point(4, 18);
      expect(grip.x).toBe(Math.round(100 + Math.cos(aim) * 12));
      expect(grip.y).toBe(Math.round(80 + Math.sin(aim) * 12 * .8));
      expect(view.headAt()!.head.x).toBeCloseTo(head.x);
      expect(view.headAt()!.head.y).toBeCloseTo(head.y);
      const length = Math.hypot(19, 5) * 20 / 32 * 1.35;
      expect(head.x - grip.x).toBeCloseTo(Math.cos(aim) * length);
      expect(head.y - grip.y).toBeCloseTo(Math.sin(aim) * length);
    }
  });
});
