// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WEAPON_EFFECT_ART, projectileEffect, thrownIconEffect } from '../../src/game/view/weaponEffects';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';

const traits = (sourceItemId: string) => ({ sourceItemId, delivery: 'projectile' });
const SPRAYS = [['hairspray', 'hairspray'], ['flea_spray', 'flea'], ['ketchup_bottle', 'ketchup'], ['whoopee_cushion', 'whoopee']] as const;

describe('spray weapons get their own mist (roadmap V3)', () => {
  it('maps each spray to its own palette swap of the extinguisher foam, fusions included', () => {
    for (const [id, name] of SPRAYS) {
      expect(projectileEffect(traits(id)), id).toBe(WEAPON_EFFECT_ART[name]);
      expect(projectileEffect(traits(hybridDefinitionId('janitor_mop', id))), id).toBe(WEAPON_EFFECT_ART[name]);
    }
  });
  it('keeps the foam sheet contract: 6 frames of 32x24, flight-aligned, pivot centred', () => {
    for (const [, name] of SPRAYS) {
      const art = WEAPON_EFFECT_ART[name];
      expect(art).toMatchObject({ width: 32, height: 24, frames: 6, pivotX: 16, pivotY: 12, flightAligned: true });
      const png = readFileSync(`public/assets/neon/weapon-effects/${art.file}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192, 24]);
      expect(png.equals(readFileSync('public/assets/neon/weapon-effects/extinguisher-foam.png'))).toBe(false);
    }
  });
  it('sizes each mist to its own hitbox, not the extinguisher’s', () => {
    // At its own base radius each spray draws at its authored scale, never shrunk to the 0.75 floor.
    expect(WEAPON_EFFECT_ART.ketchup.baseRadius).toBe(4);
    expect(WEAPON_EFFECT_ART.whoopee.baseRadius).toBe(8);
  });
  it('drops the four from the roster, which stays honest', () => {
    for (const [id] of SPRAYS) expect(diagnostics.projectile).not.toContain(id);
    for (const id of diagnostics.projectile) {
      expect(projectileEffect(traits(id)), id).toBeNull();
      expect(thrownIconEffect(id), id).toBeNull();
    }
  });
  it('releases its own mist at the nozzle', () => {
    const images: Array<{ texture: { key: string }; visible: boolean }> = [];
    const surface = (key: string) => {
      const s = { texture: { key }, visible: true } as { texture: { key: string }; visible: boolean } & Record<string, unknown>;
      for (const m of ['setOrigin', 'setCrop', 'setScale', 'setRotation', 'setPosition', 'setDepth', 'setAlpha', 'setFlipY', 'destroy']) s[m] = () => s;
      s.setTexture = (k: string) => { s.texture.key = k; return s; };
      s.setVisible = (v: boolean) => { s.visible = v; return s; };
      images.push(s); return s;
    };
    const scene = { textures: { exists: () => true, get: (key: string) => ({ key }) }, add: { image: (_x: number, _y: number, key: string) => surface(key) } } as unknown as Phaser.Scene;
    const view = new WeaponEffectView(scene);
    for (const [id, name] of SPRAYS) {
      view.beginFrame('room', 1);
      view.syncMuzzle(id, 0.05, { head: { x: 10, y: 10 }, angle: 0, flipY: false });
      expect(images.at(-1)?.texture.key, id).toBe(WEAPON_EFFECT_ART[name].key);
      expect(images.at(-1)?.visible, id).toBe(true);
    }
  });
});
