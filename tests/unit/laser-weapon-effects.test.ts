// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { NEON_ASSETS } from '../../src/game/presentation/assets';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { meleeEffect, projectileEffect, projectileEffectPose, type WeaponEffectArt } from '../../src/game/view/weaponEffects';
import { createRun } from '../../src/sim/createRun';
import { tickRun } from '../../src/sim/tickRun';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';
import { decodePng, type Png } from '../support/png';

const shots = [
  ['laser_pointer', 'laser-pointer-beam', 32, 12, 4, 16, 6, 2, .9],
  ['laser_tag_rifle', 'laser-tag-bolt', 32, 16, 4, 16, 8, 3, 1],
] as const;
const traits = (sourceItemId: string, delivery = 'water_projectile') => ({ sourceItemId, delivery });
const sheet = (name: string) => decodePng(readFileSync(`public/assets/neon/weapon-effects/${name}.png`));
const pixel = (png: Png, x: number, y: number) => [...png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];

describe('native laser family identity', () => {
  it.each(shots)('%s selects its own finite, flight-aligned laser segment', (id, name, width, height, frames, pivotX, pivotY, baseRadius, baseScale) => {
    const expected = { key: `neon:weapon-effect:${name}`, file: `${name}.png`, width, height, frames, pivotX, pivotY, baseRadius, baseScale, flightAligned: true };
    expect(projectileEffect(traits(id))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__(hybrid__janitor_mop__${id})__gel_pens`))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__${id}__pump_soaker`))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__gumball_launcher__${id}`))).toBeNull();
    expect(projectileEffect(traits(id, 'drifting_bubble'))).toBeNull();
  });

  it('gives only the sword root a head-registered luminous slash ribbon', () => {
    const expected = { key: 'neon:weapon-effect:laser-sword-slash', file: 'laser-sword-slash.png', width: 64, height: 48, frames: 6, pivotX: 48, pivotY: 24, baseScale: .8 };
    expect(meleeEffect('lightsaber_toy')).toMatchObject(expected);
    expect(meleeEffect('hybrid__(hybrid__lightsaber_toy__laser_pointer)__gel_pens')).toMatchObject(expected);
    expect(meleeEffect('hybrid__foam_sword__lightsaber_toy')).toBeNull();
  });

  it('preloads the three local sheets and removes exactly their roots from the fallback roster', () => {
    for (const [id, name] of shots) {
      expect(NEON_ASSETS.find(asset => asset.key === `neon:weapon-effect:${name}`)).toMatchObject({ url: `/assets/neon/weapon-effects/${name}.png`, requiredFor: 'effect' });
      expect(diagnostics.projectile).not.toContain(id);
    }
    expect(NEON_ASSETS.find(asset => asset.key === 'neon:weapon-effect:laser-sword-slash')).toMatchObject({ url: '/assets/neon/weapon-effects/laser-sword-slash.png', requiredFor: 'effect' });
    expect(diagnostics.direct).not.toContain('lightsaber_toy');
    expect(diagnostics.direct).toContain('foam_sword');
    expect(diagnostics.projectile).toContain('flash_camera');
  });
});

describe('hand-authored laser pixel contracts', () => {
  it.each([...shots.map(([, name, width, height, frames]) => [name, width, height, frames] as const), ['laser-sword-slash', 64, 48, 6] as const])('%s ships exact editable indexed source pixels with binary transparency and untouched padding', (name, width, height, frames) => {
    const png = sheet(name);
    expect([png.width, png.height]).toEqual([width * frames, height]);
    const hashes = new Set<string>();
    for (let frame = 0; frame < frames; frame++) {
      const source = JSON.parse(readFileSync(`art/weapon-effects/laser-pilot/${name}/forge/frame_${String(frame).padStart(2, '0')}.sprite.json`, 'utf8')) as { palette: Record<string, string>; rows: string[] };
      const cells: number[] = [];
      let opaque = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const key = source.rows[y]![x]!;
        const color = source.palette[key];
        const expected = key === '.' ? [0, 0, 0, 0] : [parseInt(color!.slice(1, 3), 16), parseInt(color!.slice(3, 5), 16), parseInt(color!.slice(5, 7), 16), 255];
        const actual = pixel(png, frame * width + x, y);
        expect(actual).toEqual(expected);
        cells.push(...actual);
        if (actual[3]) opaque++;
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) expect(actual[3]).toBe(0);
      }
      expect(opaque).toBeGreaterThan(20);
      expect(opaque).toBeLessThan(width * height / 4);
      hashes.add(cells.join(','));
    }
    expect(hashes.size).toBe(frames);
  });

  it('keeps the pointer needle-thin and white-cored, with a red rim and no whole-frame brightness pulse', () => {
    const png = sheet('laser-pointer-beam');
    const luminance: number[] = [];
    for (let frame = 0; frame < 4; frame++) {
      let total = 0;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) {
        const [r, g, b, a] = pixel(png, frame * 32 + x, y) as [number, number, number, number];
        if (!a) continue;
        expect(y).toBeGreaterThanOrEqual(4);
        expect(y).toBeLessThanOrEqual(8);
        total += r + g + b;
      }
      expect(pixel(png, frame * 32 + 16, 6)).toEqual([255, 238, 234, 255]);
      expect(pixel(png, frame * 32 + 16, 5)[0]).toBeGreaterThan(pixel(png, frame * 32 + 16, 5)[1]!);
      luminance.push(total);
    }
    expect(Math.max(...luminance) / Math.min(...luminance)).toBeLessThan(1.02);
  });

  it('keeps the rifle visibly thicker, cyan, and segmented with real transparent gaps', () => {
    const png = sheet('laser-tag-bolt');
    const luminance: number[] = [];
    for (let frame = 0; frame < 4; frame++) {
      let total = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
        const p = pixel(png, frame * 32 + x, y);
        if (p[3]) total += p[0]! + p[1]! + p[2]!;
        if ([11, 12, 21, 22].includes(x)) expect(p[3]).toBe(0);
      }
      expect(pixel(png, frame * 32 + 16, 5)[3]).toBe(255);
      expect(pixel(png, frame * 32 + 16, 11)[3]).toBe(255);
      const mid = pixel(png, frame * 32 + 16, 7);
      expect(mid[1]).toBeGreaterThan(mid[0]!);
      expect(mid[2]).toBeGreaterThan(mid[0]!);
      luminance.push(total);
    }
    expect(Math.max(...luminance) / Math.min(...luminance)).toBeLessThan(1.02);
  });
});

// Replace only Phaser's DOM/WebGL backend. Production view code owns the
// texture, frame, pose, fade, per-projectile clock and cleanup decisions.
class Surface {
  texture: { key: string }; visible = true; destroyed = false; x = 0; y = 0; rotation = 0;
  originX = 0; originY = 0; scale = 1; alpha = 1; flipY = false;
  crop = { x: 0, y: 0, width: 0, height: 0 };
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(value: number) { this.rotation = value; return this; }
  setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; }
  setScale(value: number) { this.scale = value; return this; }
  setCrop(x: number, y: number, width: number, height: number) { this.crop = { x, y, width, height }; return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  setFlipY(value: boolean) { this.flipY = value; return this; }
  setDepth() { return this; }
  destroy() { this.destroyed = true; this.visible = false; }
}
function renderer(missing = false) {
  const images: Surface[] = [];
  const scene = { textures: { exists: () => !missing, get: (key: string) => ({ key }) },
    add: { image: (_x: number, _y: number, key: string) => { const image = new Surface(key); images.push(image); return image; } },
  } as unknown as Phaser.Scene;
  return { view: new WeaponEffectView(scene), images };
}

describe('laser presentation preserves travel, aim and attack clocks', () => {
  it.each(shots)('%s follows every real travelling projectile, without changing speed, hitbox, or projectile count', (id, name, _w, _h, _f, _px, _py, radius) => {
    const state = createRun(7, { itemIds: [id], selectedItemId: id });
    state.enemies = []; state.walls = []; state.player.x = 300; state.player.y = 160; state.roomWasPopulated = false;
    tickRun(state, { moveX: 0, moveY: 0, aimX: 600, aimY: 160, fire: true });
    const projectiles = state.projectiles.filter(p => p.faction === 'player');
    expect(projectiles).toHaveLength(id === 'laser_pointer' ? 1 : 2);
    const before = JSON.stringify(state);
    const { view, images } = renderer();
    view.beginFrame('room', 1);
    for (const shot of projectiles) {
      expect(shot.radius).toBe(radius);
      expect(Math.hypot(shot.velocityX, shot.velocityY)).toBeCloseTo(id === 'laser_pointer' ? 9 : 8.5);
      expect(view.syncProjectile(shot, 1)).not.toBeNull();
    }
    view.endFrame();
    expect(images).toHaveLength(projectiles.length);
    expect(JSON.stringify(state)).toBe(before);
    tickRun(state, { moveX: 0, moveY: 0, aimX: 600, aimY: 160, fire: false });
    view.beginFrame('room', 2);
    for (const [index, shot] of projectiles.entries()) {
      expect(view.syncProjectile(shot, 2)).not.toBeNull();
      expect(images[index]).toMatchObject({ x: shot.x, y: shot.y, alpha: 1, texture: { key: `neon:weapon-effect:${name}` }, rotation: Math.atan2(shot.velocityY, shot.velocityX) });
    }
    view.endFrame();
    expect(images).toHaveLength(projectiles.length);
    view.beginFrame('room', 3); view.endFrame();
    expect(images.every(image => image.destroyed)).toBe(true);
  });

  it.each(shots)('%s preserves actual velocity direction, frame timing and bounded fusion geometry', (id, _name, _w, _h, frames, _px, _py, radius, baseScale) => {
    const art = projectileEffect(traits(id));
    expect(art).not.toBeNull();
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4;
      const shot = Object.freeze({ x: 123.5, y: 89.75, velocityX: Math.cos(angle) * 9, velocityY: Math.sin(angle) * 9, radius });
      for (let frame = 0; frame <= frames; frame++) {
        expect(projectileEffectPose(art as WeaponEffectArt, shot, frame * 3)).toMatchObject({ x: shot.x, y: shot.y, rotation: Math.atan2(shot.velocityY, shot.velocityX), frame: frame % frames, scale: baseScale });
      }
      expect(projectileEffectPose(art as WeaponEffectArt, { ...shot, radius: 100 }, 0).scale).toBeCloseTo(baseScale * 1.5);
    }
  });

  it.each(shots)('%s adds only a small two-tick core at the current nozzle and keeps missing-texture fallback', (id, name, width, height, frames, _px, pivotY) => {
    const { view, images } = renderer();
    const head = { head: { x: 78.5, y: 105.25 }, angle: -Math.PI / 3, flipY: true };
    expect(view.canRenderRanged(id)).toBe(true);
    view.syncMuzzle(id, 0, head);
    expect(images[0]).toMatchObject({ texture: { key: `neon:weapon-effect:${name}` }, x: head.head.x, y: head.head.y, rotation: head.angle, flipY: true,
      crop: { x: 0, y: 0, width: 12, height }, originX: 4 / (width * frames), originY: pivotY / height, scale: .7, alpha: 1 });
    view.syncMuzzle(id, 1 / 16, { ...head, head: { x: 90, y: 120 } });
    expect(images[0]).toMatchObject({ x: 90, y: 120, alpha: .5 });
    view.syncMuzzle(id, 2 / 16, head); expect(images[0]!.visible).toBe(false);
    expect(images).toHaveLength(1);
    expect(renderer(true).view.canRenderRanged(id)).toBe(false);
  });

  it('follows the sword tip through all frames, fades without pulsing and clears on interruption', () => {
    const { view, images } = renderer();
    expect(view.canRenderMelee('lightsaber_toy')).toBe(true);
    for (let tick = 0; tick <= 16; tick++) {
      const head = { head: { x: 180 + tick, y: 140 - tick }, angle: tick / 16, flipY: tick > 8 };
      view.beginFrame('room', tick); view.syncMelee('lightsaber_toy', tick / 16, head);
      const frame = Math.min(5, Math.floor(tick * 6 / 16));
      expect(images[0]).toMatchObject({ texture: { key: 'neon:weapon-effect:laser-sword-slash' }, x: head.head.x, y: head.head.y, rotation: head.angle,
        flipY: head.flipY, crop: { x: frame * 64, y: 0, width: 64, height: 48 }, originX: (frame * 64 + 48) / 384, originY: .5, scale: .8, alpha: 1 - tick / 16 });
    }
    view.beginFrame('room', 17); expect(images[0]!.visible).toBe(false);
    view.syncMelee('lightsaber_toy', 0, null); expect(images[0]!.visible).toBe(false);
    view.reset(); expect(images[0]!.destroyed).toBe(true);
    expect(renderer(true).view.canRenderMelee('lightsaber_toy')).toBe(false);
  });
});
