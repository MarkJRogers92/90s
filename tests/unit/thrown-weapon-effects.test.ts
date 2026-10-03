import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { THROWN_ICON_IDS, thrownIconEffect, thrownIconPose } from '../../src/game/view/weaponEffects';
import { itemIconKey } from '../../src/game/presentation/assets';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';
import type { ProjectileState } from '../../src/sim/model';

const THROWN = ['dodgeball', 'football', 'pog_slammer', 'laserdisc', 'jawbreaker', 'squeaky_toy', 'garden_gnome', 'hockey_puck'];
const shot = (sourceItemId: string, over: Partial<ProjectileState> = {}): ProjectileState => ({
  id: 3, faction: 'player', x: 200, y: 150, previousX: 196, previousY: 150, velocityX: 4, velocityY: 0, radius: 6, damage: 2,
  remainingTicks: 40, phase: 'outbound',
  payload: { delivery: 'projectile', payloadEffect: { sourceItemId } } as unknown as NonNullable<ProjectileState['payload']>,
  ...over,
});

describe('thrown weapons fly as their own spinning icon (roadmap V3)', () => {
  it('covers exactly the eight thrown weapons that still used the procedural blob', () => {
    expect([...THROWN_ICON_IDS].sort()).toEqual([...THROWN].sort());
    for (const id of THROWN) expect(thrownIconEffect(id)?.iconItemId).toBe(id);
    // The roster lists what still uses prior art: it must never name a covered weapon.
    for (const id of diagnostics.projectile) expect(thrownIconEffect(id), id).toBeNull();
    for (const id of THROWN) expect(diagnostics.projectile).not.toContain(id);
    // Native art and non-thrown shooters are untouched.
    for (const id of ['vhs_tape', 'record_toss', 'cd_shuriken', 'pump_soaker', 'janitor_mop', 'staple_gun']) expect(thrownIconEffect(id)).toBeNull();
  });
  it('a fusion throws the shooter inside it', () => {
    expect(thrownIconEffect(hybridDefinitionId('janitor_mop', 'dodgeball'))?.iconItemId).toBe('dodgeball');
  });
  it('spins with age, rolls the way it travels, and grows gently with a modified hitbox', () => {
    const ball = thrownIconEffect('dodgeball')!;
    const a = thrownIconPose(ball, shot('dodgeball', { radius: 10 }), 0);
    const b = thrownIconPose(ball, shot('dodgeball', { radius: 10 }), 6);
    expect(b.rotation).toBeGreaterThan(a.rotation);
    expect(thrownIconPose(ball, shot('dodgeball', { radius: 10, velocityX: -4 }), 6).rotation).toBeLessThan(a.rotation);
    expect(thrownIconPose(ball, shot('dodgeball', { radius: 40 }), 0).scale).toBeCloseTo(a.scale * 1.5);
    expect(thrownIconPose(ball, shot('dodgeball', { radius: 1 }), 0).scale).toBeCloseTo(a.scale * 0.75);
    expect(a).toMatchObject({ x: 200, y: 150 });
    expect(a.radius).toBeGreaterThan(0);
  });
  it('the football flies point-first along its velocity instead of tumbling', () => {
    const ball = thrownIconEffect('football')!;
    const east = thrownIconPose(ball, shot('football', { radius: 4 }), 0);
    const later = thrownIconPose(ball, shot('football', { radius: 4 }), 12);
    const south = thrownIconPose(ball, shot('football', { radius: 4, velocityX: 0, velocityY: 4 }), 0);
    expect(Math.abs(later.rotation - east.rotation)).toBeLessThan(0.2);
    expect(south.rotation - east.rotation).toBeCloseTo(Math.PI / 2, 1);
  });
});

class Surface {
  texture: { key: string }; visible = true; destroyed = false; x = 0; y = 0; rotation = 0; scaleX = 1; originX = 0; originY = 0; depth = 0;
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; } setVisible(v: boolean) { this.visible = v; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; } setCrop() { return this; }
  setScale(x: number) { this.scaleX = x; return this; } setRotation(r: number) { this.rotation = r; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; } setDepth(d: number) { this.depth = d; return this; }
  setAlpha() { return this; } setFlipY() { return this; } destroy() { this.destroyed = true; }
}
function view(missing: string[] = []) {
  const images: Surface[] = [];
  const scene = {
    textures: { exists: (key: string) => !missing.includes(key), get: (key: string) => ({ key }) },
    add: { image: (_x: number, _y: number, key: string) => { const s = new Surface(key); images.push(s); return s; } },
  } as unknown as Phaser.Scene;
  return { images, view: new WeaponEffectView(scene) };
}

describe('WeaponEffectView draws the thrown icon', () => {
  it('uses the item icon, uncropped and centred, and reports a core radius for modifiers', () => {
    const { view: v, images } = view();
    v.beginFrame('room', 10);
    const result = v.syncProjectile(shot('garden_gnome', { radius: 8 }), 10);
    v.endFrame();
    expect(result?.radius).toBeGreaterThan(0);
    expect(images[0]!.texture.key).toBe(itemIconKey('garden_gnome'));
    expect(images[0]).toMatchObject({ x: 200, y: 150, originX: 0.5, originY: 0.5, visible: true });
  });
  it('falls back to the procedural shot when the icon texture is missing', () => {
    const { view: v } = view([itemIconKey('hockey_puck')!]);
    v.beginFrame('room', 10);
    expect(v.syncProjectile(shot('hockey_puck'), 10)).toBeNull();
  });
});
