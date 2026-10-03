import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { WEAPON_EFFECT_ART } from '../../src/game/view/weaponEffects';
import { createRun } from '../../src/sim/createRun';
import { buildPlayerProjectileSpec } from '../../src/sim/effects/playerProjectiles';
import type { ProjectileState } from '../../src/sim/model';
import { presentationDepth } from '../../src/game/presentation/depth';

// A stateful image surface substitutes only for Phaser's DOM/WebGL backend.
// Texture selection, crop/pivot math, clocks and object lifetime are production code.
class ImageSurface {
  texture: { key: string };
  visible = true; destroyed = false;
  x = 0; y = 0; rotation = 0; originX = 0; originY = 0; scaleX = 1; scaleY = 1; alpha = 1; depth = 0; flipY = false;
  crop = { x: 0, y: 0, width: 0, height: 0 };
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setCrop(x: number, y: number, width: number, height: number) { this.crop = { x, y, width, height }; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setRotation(rotation: number) { this.rotation = rotation; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setFlipY(flipY: boolean) { this.flipY = flipY; return this; }
  destroy() { this.destroyed = true; this.visible = false; }
}
function renderer(missing = false, missingAlias = false) {
  const images: ImageSurface[] = [];
  const scene = {
    textures: { exists: () => !missing, get: (key: string) => ({ key: missingAlias ? '__MISSING' : key }) },
    add: { image: (_x: number, _y: number, key: string) => { const image = new ImageSurface(key); images.push(image); return image; } },
  } as unknown as Phaser.Scene;
  return { images, view: new WeaponEffectView(scene) };
}
function projectile(source = 'pump_soaker', itemIds = [source]): ProjectileState {
  const state = createRun(2, { itemIds, selectedItemId: source });
  const payload = buildPlayerProjectileSpec(state.compiledLoadout.effects, source)!;
  return { id: 7, faction: 'player', x: 125.5, y: 85.25, previousX: 120, previousY: 85.25,
    velocityX: payload.speed, velocityY: 0, radius: payload.radius, damage: payload.damage,
    remainingTicks: payload.lifetimeTicks, payload, phase: 'outbound' };
}

describe('native projectile image lifetime', () => {
  it('reuses a live id, freezes on duplicate ticks, crops its next frame, and preserves its exact centre', () => {
    const { view, images } = renderer(); const shot = projectile();
    view.beginFrame('room', 20); expect(view.syncProjectile(shot, 20)).not.toBeNull(); view.endFrame();
    const first = images[0]!;
    view.beginFrame('room', 26); view.syncProjectile(shot, 26); view.endFrame();
    expect(images).toHaveLength(1);
    expect(first).toMatchObject({ x: shot.x, y: shot.y, crop: { x: 64, y: 0, width: 32, height: 16 }, originX: 80 / 128, originY: 0.5, depth: presentationDepth('effect', 2) });
    view.beginFrame('room', 26); view.syncProjectile(shot, 26); view.endFrame();
    expect(first.crop.x).toBe(64);
    expect(first.destroyed).toBe(false);
  });

  it('turns a returning nail along the actual velocity without replacing its sprite or losing the clock', () => {
    const { view, images } = renderer(); const shot = projectile('nail_gun');
    view.beginFrame('room', 0); view.syncProjectile(shot, 0); view.endFrame();
    shot.phase = 'return'; shot.velocityX = -7;
    view.beginFrame('room', 3); view.syncProjectile(shot, 3); view.endFrame();
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ rotation: Math.PI, crop: { x: 24, y: 0, width: 24, height: 16 }, texture: { key: WEAPON_EFFECT_ART.nail.key } });
  });

  it('retains a clearly visible native core with sticky and conductive payloads', () => {
    const { view, images } = renderer();
    const shot = projectile('pump_soaker', ['pump_soaker', 'gel_pens', 'plasma_globe']);
    expect(shot.payload!.statusEffects.length).toBeGreaterThan(0);
    expect(shot.payload!.reactionEffects.length).toBeGreaterThan(0);
    view.beginFrame('room', 0); expect(view.syncProjectile(shot, 0)).not.toBeNull(); view.endFrame();
    expect(images[0]).toMatchObject({ alpha: 1, visible: true, texture: { key: WEAPON_EFFECT_ART.soaker.key } });
  });

  it('does not draw enemy shots, converted bubbles, or missing textures as a native base projectile', () => {
    const normal = renderer(); const bubble = projectile('pump_soaker', ['pump_soaker', 'bubble_bath']);
    normal.view.beginFrame('room', 0);
    expect(normal.view.syncProjectile(bubble, 0)).toBeNull();
    expect(normal.view.syncProjectile({ ...projectile(), faction: 'enemy' }, 0)).toBeNull();
    expect(normal.images).toHaveLength(0);
    for (const absent of [renderer(true), renderer(false, true)]) {
      absent.view.beginFrame('room', 0);
      expect(absent.view.syncProjectile(projectile(), 0)).toBeNull();
      expect(absent.images).toHaveLength(0);
    }
  });

  it('destroys despawned images and never reuses stale sprites across room changes or rewinds', () => {
    const { view, images } = renderer(); const shot = projectile();
    const render = (scope: string, tick: number) => { view.beginFrame(scope, tick); view.syncProjectile(shot, tick); view.endFrame(); };
    render('room', 10); view.beginFrame('room', 11); view.endFrame();
    expect(images[0]!.destroyed).toBe(true);
    render('room', 12); render('store', 13);
    expect(images[1]!.destroyed).toBe(true);
    render('store', 0);
    expect(images[2]!.destroyed).toBe(true);
    expect(images[3]!.crop.x).toBe(0);
    view.reset(); expect(images[3]!.destroyed).toBe(true);
    render('room', 0); view.destroy(); expect(images[4]!.destroyed).toBe(true);
  });

  it('prunes a native image if an id is reused for a bubble fallback', () => {
    const { view, images } = renderer();
    view.beginFrame('room', 0); view.syncProjectile(projectile(), 0); view.endFrame();
    view.beginFrame('room', 1); view.syncProjectile(projectile('pump_soaker', ['pump_soaker', 'bubble_bath']), 1); view.endFrame();
    expect(images[0]!.destroyed).toBe(true);
  });
});

describe('native cloth effect at the held head', () => {
  const transform = { head: { x: 180, y: 144 }, angle: Math.PI / 3, flipY: false };
  it('registers its exact leading pivot on the held head and uses six visual-only frames', () => {
    const { view, images } = renderer();
    view.beginFrame('room', 0);
    expect(view.canRenderMelee('hybrid__janitor_mop__pump_soaker')).toBe(true);
    view.syncMelee('hybrid__janitor_mop__pump_soaker', 0.5, transform);
    const image = images[0]!;
    expect(image).toMatchObject({ x: 180, y: 144, rotation: Math.PI / 3, scaleX: 0.65, originX: (3 * 64 + 48) / 384, originY: 0.5, crop: { x: 192, y: 0, width: 64, height: 64 } });
    expect(image.alpha).toBeGreaterThan(0); expect(image.alpha).toBeLessThan(1);
    view.syncMelee('janitor_mop', null, transform);
    expect(image.visible).toBe(false);
    view.syncMelee('golden_mop', 0, transform);
    expect(images).toHaveLength(1);
    expect(image.texture.key).toBe(WEAPON_EFFECT_ART.goldenMop.key);
    expect(image.alpha).toBe(1);
  });

  it('does not suppress vector fallback when cloth is missing and hides cloth on death or a scope boundary', () => {
    expect(renderer(true).view.canRenderMelee('janitor_mop')).toBe(false);
    expect(renderer(false, true).view.canRenderMelee('janitor_mop')).toBe(false);
    const { view, images } = renderer();
    view.beginFrame('room', 0); view.syncMelee('janitor_mop', 0, transform);
    view.hideMelee(); expect(images[0]!.visible).toBe(false);
    view.syncMelee('janitor_mop', 0, transform);
    view.beginFrame('store', 1); expect(images[0]!.destroyed).toBe(true);
  });
});

describe('weapon-specific release at the true nozzle', () => {
  const head = { head: { x: 180, y: 144 }, angle: Math.PI / 2, flipY: false };
  it('shows a small water frame at the nozzle only during the brief release', () => {
    const { view, images } = renderer();
    expect(view.canRenderRanged('pump_soaker')).toBe(true);
    view.syncMuzzle('pump_soaker', 0, head);
    expect(images[0]).toMatchObject({ x: 180, y: 144, rotation: Math.PI / 2, scaleX: 0.55, texture: { key: WEAPON_EFFECT_ART.soaker.key } });
    view.syncMuzzle('pump_soaker', 0.3, head);
    expect(images[0]!.visible).toBe(false);
    view.syncMuzzle('pump_soaker', 0, head); view.reset();
    expect(images[0]!.destroyed).toBe(true);
  });

  it('suppresses the universal flash for physical first-slice weapons without drawing a gun flash on thrown media', () => {
    const { view, images } = renderer();
    for (const source of ['foam_ball_blaster', 'nail_gun', 'vhs_tape', 'record_toss', 'cd_shuriken']) {
      expect(view.canRenderRanged(source)).toBe(true);
      view.syncMuzzle(source, 0, head);
    }
    expect(images).toHaveLength(0);
    expect(view.canRenderRanged('gumball_launcher')).toBe(false);
    expect(renderer(true).view.canRenderRanged('pump_soaker')).toBe(false);
  });
});


describe('second-slice held material and muzzle releases', () => {
  const head = { head: { x: 183.125, y: 147.25 }, angle: -Math.PI / 3, flipY: true };
  it.each([
    ['broken_broom_handle', 'broom-sweep', 48, 48, 6, 36, 24, .65],
    ['box_cutter', 'cutter-slice', 32, 24, 4, 24, 12, .8],
  ] as const)('%s uses every authored frame at the exact current head with a modest material scale', (id, name, width, height, frames, pivotX, pivotY, scale) => {
    const { view, images } = renderer();
    expect(view.canRenderMelee(id)).toBe(true);
    for (let age = 0; age <= 16; age++) {
      view.beginFrame('room', age);
      view.syncMelee(id, age / 16, head);
      const frame = Math.min(frames - 1, Math.floor(age * frames / 16));
      expect(images[0]).toMatchObject({ x: head.head.x, y: head.head.y, rotation: head.angle, flipY: true,
        texture: { key: `neon:weapon-effect:${name}` }, crop: { x: frame * width, y: 0, width, height },
        originX: (frame * width + pivotX) / (width * frames), originY: pivotY / height, scaleX: scale, alpha: 1 - age / 16 });
    }
    expect(images).toHaveLength(1);
    view.syncMelee(id, null, head); expect(images[0]!.visible).toBe(false);
    view.syncMelee(id, 0, null); expect(images[0]!.visible).toBe(false);
    for (const absent of [renderer(true), renderer(false, true)]) {
      expect(absent.view.canRenderMelee(id)).toBe(false);
      absent.view.syncMelee(id, 0, head); expect(absent.images).toHaveLength(0);
    }
  });

  it.each([
    ['party_popper', 'party-confetti', 24, 24, 6, 4, .4, 2],
    ['bottle_rocket_pack', 'bottle-rocket', 10, 16, 4, 2, .65, 2],
    ['fire_extinguisher', 'extinguisher-foam', 32, 24, 6, 4, .4, 3],
  ] as const)('%s replaces the yellow flash with a brief small material release at the actual mirrored nozzle', (id, name, width, height, frames, tailX, scale, ticks) => {
    const { view, images } = renderer();
    expect(view.canRenderRanged(id)).toBe(true);
    view.syncMuzzle(id, 0, head);
    const sheetWidth = id === 'bottle_rocket_pack' ? 32 : width;
    expect(images[0]).toMatchObject({ x: head.head.x, y: head.head.y, rotation: head.angle, flipY: true,
      texture: { key: `neon:weapon-effect:${name}` }, crop: { x: 0, y: 0, width, height },
      originX: tailX / (sheetWidth * frames), originY: .5, scaleX: scale, alpha: 1, visible: true });
    view.syncMuzzle(id, 1 / 16, head);
    expect(images[0]!.alpha).toBeCloseTo(1 - 1 / ticks);
    view.syncMuzzle(id, ticks / 16, head); expect(images[0]!.visible).toBe(false);
    view.syncMuzzle(id, 0, null); expect(images[0]!.visible).toBe(false);
    view.syncMuzzle(id, null, head); expect(images[0]!.visible).toBe(false);
    for (const absent of [renderer(true), renderer(false, true)]) {
      expect(absent.view.canRenderRanged(id)).toBe(false);
      absent.view.syncMuzzle(id, 0, head); expect(absent.images).toHaveLength(0);
    }
  });

  it('reuses the release image with the new material texture after a shooter swap and clears it at room/reset/death frame boundaries', () => {
    const { view, images } = renderer();
    view.beginFrame('room', 10); view.syncMuzzle('pump_soaker', 0, head);
    view.beginFrame('room', 11); view.syncMuzzle('party_popper', 0, head);
    expect(images).toHaveLength(1);
    expect(images[0]!.texture.key).toBe('neon:weapon-effect:party-confetti');
    view.beginFrame('room', 12); view.syncMuzzle('bottle_rocket_pack', 0, head);
    expect(images[0]!.texture.key).toBe('neon:weapon-effect:bottle-rocket');
    expect(images[0]!.crop.width).toBe(10);
    view.beginFrame('room', 13); view.syncMuzzle('fire_extinguisher', 0, head);
    expect(images[0]!.texture.key).toBe('neon:weapon-effect:extinguisher-foam');
    expect(images[0]!.crop.width).toBe(32);
    view.beginFrame('room', 14); expect(images[0]!.visible).toBe(false);
    view.syncMuzzle('pump_soaker', 0, { ...head, flipY: false });
    expect(images[0]).toMatchObject({ texture: { key: WEAPON_EFFECT_ART.soaker.key }, crop: { x: 0, y: 0, width: 32, height: 16 }, originX: 4 / 128, flipY: false, scaleX: .55 });
    view.syncMuzzle('fire_extinguisher', 0, head);
    view.beginFrame('store', 15); expect(images[0]!.destroyed).toBe(true);
    view.syncMuzzle('fire_extinguisher', 0, head); view.beginFrame('store', 0);
    expect(images[1]!.destroyed).toBe(true);
    view.syncMuzzle('fire_extinguisher', 0, head); view.destroy(); expect(images[2]!.destroyed).toBe(true);
  });

  it.each(['party_popper', 'bottle_rocket_pack', 'fire_extinguisher'])('%s preserves modified native cores, real hitboxes and per-id clocks', (id) => {
    const { view, images } = renderer();
    const shot = projectile(id, [id, 'gel_pens', 'plasma_globe', 'wide_nozzle']);
    shot.phase = 'return'; shot.velocityX = -shot.velocityX;
    const before = JSON.stringify(shot);
    expect(shot.payload!.statusEffects.length).toBeGreaterThan(0);
    expect(shot.payload!.reactionEffects.length).toBeGreaterThan(0);
    view.beginFrame('room', 10); expect(view.syncProjectile(shot, 10)).not.toBeNull(); view.endFrame();
    view.beginFrame('room', 16); view.syncProjectile(shot, 16); view.endFrame();
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ x: shot.x, y: shot.y, rotation: Math.PI, alpha: 1, visible: true });
    expect(images[0]!.crop.x).toBe(images[0]!.crop.width * 2);
    expect(JSON.stringify(shot)).toBe(before);
    view.beginFrame('room', 17); view.endFrame(); expect(images[0]!.destroyed).toBe(true);
    for (const absent of [renderer(true), renderer(false, true)]) {
      expect(absent.view.syncProjectile(shot, 0)).toBeNull(); expect(absent.images).toHaveLength(0);
    }
  });

  it('keeps converted extinguisher bubbles procedural while the held nozzle retains its material identity', () => {
    const { view, images } = renderer();
    const bubble = projectile('fire_extinguisher', ['fire_extinguisher', 'bubble_bath']);
    expect(bubble.payload!.delivery).toBe('drifting_bubble');
    expect(view.syncProjectile(bubble, 0)).toBeNull();
    expect(images).toHaveLength(0);
    expect(view.canRenderRanged('fire_extinguisher')).toBe(true);
  });
});
