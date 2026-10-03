import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { projectileStyle, type ProjectileStyle } from '../../src/game/view/projectileStyle';
import type { ProjectileState } from '../../src/sim/model';

vi.mock('phaser', () => ({ default: {} }));

type Mark = { method: string; color: number; args: number[] };
function graphicsSurface() {
  const marks: Mark[] = []; let color = 0;
  const graphics = {
    fillStyle(value: number) { color = value; return this; },
    lineStyle(_width: number, value: number) { color = value; return this; },
    beginPath() { return this; }, strokePath() { return this; },
  } as Record<string, unknown>;
  for (const method of ['fillCircle', 'fillTriangle', 'fillRect', 'lineBetween', 'arc', 'strokeCircle', 'fillEllipse', 'strokeEllipse']) {
    graphics[method] = (...args: number[]) => { marks.push({ method, color, args }); return graphics; };
  }
  return { graphics: graphics as unknown as Phaser.GameObjects.Graphics, marks };
}
const shot: ProjectileState = { id: 7, faction: 'player', x: 100, y: 70, previousX: 97, previousY: 70, velocityX: 3, velocityY: 0, radius: 6, remainingTicks: 50, damage: 2 };
const style = (extras = {}) => projectileStyle({ sourceItemId: 'pump_soaker', delivery: 'water_projectile', sticky: false, returning: false, conductive: false, ...extras });
// Exercise the real shot painter without constructing unrelated room/lighting
// backends. Only its graphics surface and light sink are substituted.
const paint = Reflect.get(MvpRunView.prototype, 'drawShot') as (shot: ProjectileState, style: ProjectileStyle, g: Phaser.GameObjects.Graphics, nativeRadius?: number) => void;
const view = { openingConcourse: { addLight() {} } };

describe('native shot composition with procedural modifiers', () => {
  it.each(['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('does not paint the old %s body or trail over an authored native core', (sourceItemId) => {
    const { graphics, marks } = graphicsSurface();
    paint.call(view, shot, style({ sourceItemId }), graphics, 8);
    expect(marks).toEqual([]);
  });

  it.each(['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('%s retains sticky, return and conductive cues outside the native core', (sourceItemId) => {
    const { graphics, marks } = graphicsSurface();
    paint.call(view, shot, style({ sourceItemId, sticky: true, returning: true, conductive: true }), graphics, 8);
    expect(marks.filter((mark) => mark.color === 0xd7a45c && mark.method === 'fillCircle')).toHaveLength(2);
    expect(marks.filter((mark) => mark.color === 0xfff27a && mark.method === 'lineBetween')).toHaveLength(3);
    expect(marks.find((mark) => mark.color === 0x6a9aff && mark.method === 'strokeCircle')?.args).toEqual([100, 70, 13]);
    expect(marks.some((mark) => mark.color === style({ sourceItemId }).color)).toBe(false);
  });

  it('keeps the iridescent bubble and missing-texture procedural fallback visible', () => {
    const normal = graphicsSurface(); paint.call(view, shot, style(), normal.graphics);
    expect(normal.marks.some((mark) => mark.method === 'fillTriangle')).toBe(true);
    const bubble = graphicsSurface(); paint.call(view, shot, style({ delivery: 'drifting_bubble' }), bubble.graphics);
    expect(bubble.marks.some((mark) => mark.method === 'strokeEllipse')).toBe(true);
  });
});

describe('death stops player projectile presentation', () => {
  it.each(['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('%s releases native images on death without recreating them or drawing fallback ghosts on later frozen frames', async (sourceItemId) => {
    const { WeaponEffectView } = await import('../../src/game/view/WeaponEffectView');
    const { createRun } = await import('../../src/sim/createRun');
    const { buildPlayerProjectileSpec } = await import('../../src/sim/effects/playerProjectiles');
    const images: Array<{ destroyed: boolean }> = [];
    const scene = {
      textures: { exists: () => true, get: (key: string) => ({ key }) },
      add: { image: (_x: number, _y: number, key: string) => {
        const image: Record<string, unknown> & { destroyed: boolean } = { texture: { key }, destroyed: false };
        for (const method of ['setCrop', 'setOrigin', 'setPosition', 'setRotation', 'setScale', 'setFlipY', 'setAlpha', 'setVisible', 'setDepth']) image[method] = () => image;
        image.destroy = () => { image.destroyed = true; };
        images.push(image); return image;
      } },
    } as unknown as Phaser.Scene;
    const state = createRun(1, { itemIds: [sourceItemId], selectedItemId: sourceItemId });
    const native = { ...shot, payload: buildPlayerProjectileSpec(state.compiledLoadout.effects, sourceItemId)! };
    const weaponEffects = new WeaponEffectView(scene);
    const context = { ...view, weaponEffects, drawShot: paint };
    const drawProjectile = Reflect.get(MvpRunView.prototype, 'drawProjectile') as (shot: ProjectileState, g: Phaser.GameObjects.Graphics, tick: number, playerAlive: boolean) => void;
    weaponEffects.beginFrame('room', 10);
    drawProjectile.call(context, native, graphicsSurface().graphics, 10, true);
    weaponEffects.endFrame();
    expect(images).toHaveLength(1);
    expect(images[0]!.destroyed).toBe(false);

    const dead = graphicsSurface();
    for (let frame = 0; frame < 3; frame += 1) {
      weaponEffects.beginFrame('room', 10);
      drawProjectile.call(context, native, dead.graphics, 10, false);
      weaponEffects.endFrame();
    }
    expect(images[0]!.destroyed).toBe(true);
    expect(images).toHaveLength(1);
    expect(dead.marks).toEqual([]);

    const enemy = graphicsSurface();
    drawProjectile.call(context, { ...native, faction: 'enemy' }, enemy.graphics, 10, false);
    expect(enemy.marks.some((mark) => mark.method === 'fillEllipse')).toBe(true);
  });
});
