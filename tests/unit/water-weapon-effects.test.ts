// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WEAPON_EFFECT_ART, projectileEffect, thrownIconEffect } from '../../src/game/view/weaponEffects';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';

const traits = (sourceItemId: string) => ({ sourceItemId, delivery: 'water_projectile' });

describe('water weapons get their own water (roadmap V3)', () => {
  it('maps every water shooter to a material sheet: soakers keep the soaker, the rest are palette swaps', () => {
    expect(projectileEffect(traits('super_soaker_50'))).toBe(WEAPON_EFFECT_ART.soaker);
    expect(projectileEffect(traits('super_soaker_cps'))).toBe(WEAPON_EFFECT_ART.soaker);
    expect(projectileEffect(traits('garden_hose'))).toBe(WEAPON_EFFECT_ART.hose);
    expect(projectileEffect(traits('soda_gun'))).toBe(WEAPON_EFFECT_ART.soda);
    expect(projectileEffect(traits('watering_can'))).toBe(WEAPON_EFFECT_ART.shower);
    expect(projectileEffect(traits(hybridDefinitionId('janitor_mop', 'soda_gun')))).toBe(WEAPON_EFFECT_ART.soda);
  });
  it('lobs water balloons as their own wobbling icon', () => {
    expect(projectileEffect(traits('water_balloons'))).toBeNull();
    expect(thrownIconEffect('water_balloons')?.iconItemId).toBe('water_balloons');
  });
  it('ships each derived sheet at the soaker contract: 4 frames of 32x16, pivot centred', () => {
    for (const art of [WEAPON_EFFECT_ART.hose, WEAPON_EFFECT_ART.soda, WEAPON_EFFECT_ART.shower]) {
      expect(art).toMatchObject({ width: 32, height: 16, frames: 4, pivotX: 16, pivotY: 8, flightAligned: true });
      const png = readFileSync(`public/assets/neon/weapon-effects/${art.file}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 16]);
      expect(png.equals(readFileSync('public/assets/neon/weapon-effects/soaker-water.png'))).toBe(false);
    }
  });
  it('keeps the roster honest: nothing it lists has native or icon art', () => {
    for (const id of ['garden_hose', 'super_soaker_50', 'super_soaker_cps', 'soda_gun', 'watering_can', 'water_balloons']) {
      expect(diagnostics.projectile).not.toContain(id);
    }
    for (const id of diagnostics.projectile) {
      expect(projectileEffect(traits(id)), id).toBeNull();
      expect(thrownIconEffect(id), id).toBeNull();
    }
  });
});

class Surface {
  texture: { key: string }; visible = true; x = 0; y = 0;
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; } setVisible(v: boolean) { this.visible = v; return this; }
  setOrigin() { return this; } setCrop() { return this; } setScale() { return this; } setRotation() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; } setDepth() { return this; }
  setAlpha() { return this; } setFlipY() { return this; } destroy() {}
}
describe('a water release at the nozzle', () => {
  it('shows the weapon’s own water for the first ticks of a shot', () => {
    const images: Surface[] = [];
    const scene = {
      textures: { exists: () => true, get: (key: string) => ({ key }) },
      add: { image: (_x: number, _y: number, key: string) => { const s = new Surface(key); images.push(s); return s; } },
    } as unknown as Phaser.Scene;
    const view = new WeaponEffectView(scene);
    const pose = { head: { x: 50, y: 60 }, angle: 0, flipY: false };
    for (const [id, art] of [['soda_gun', WEAPON_EFFECT_ART.soda], ['garden_hose', WEAPON_EFFECT_ART.hose], ['watering_can', WEAPON_EFFECT_ART.shower]] as const) {
      view.beginFrame('room', 1);
      view.syncMuzzle(id, 0.05, pose);
      expect(images.at(-1)?.texture.key, id).toBe(art.key);
      expect(images.at(-1)?.visible).toBe(true);
    }
  });
});
