// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WEAPON_EFFECT_ART, meleeEffect, projectileEffect, thrownIconEffect } from '../../src/game/view/weaponEffects';
import { WeaponEffectView } from '../../src/game/view/WeaponEffectView';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';

const traits = (sourceItemId: string) => ({ sourceItemId, delivery: 'projectile' });
const PROJECTILES = [
  ['laser_pointer', 'laserRed'], ['laser_tag_rifle', 'laserGreen'],
  ['flash_camera', 'flash'], ['camcorder', 'recFlash'], ['lava_lamp', 'lava'],
] as const;
const MELEE = [['lightsaber_toy', 'saber'], ['power_glove', 'glovePunch']] as const;

/** Width and height of a PNG, from its IHDR chunk. */
const pngSize = (file: string) => {
  const png = readFileSync(`public/assets/neon/weapon-effects/${file}`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('energy weapons get their own effects (roadmap V3)', () => {
  it('maps each energy shooter to its own sheet, fusions included', () => {
    for (const [id, name] of PROJECTILES) {
      expect(projectileEffect(traits(id)), id).toBe(WEAPON_EFFECT_ART[name]);
      expect(projectileEffect(traits(hybridDefinitionId('janitor_mop', id))), id).toBe(WEAPON_EFFECT_ART[name]);
    }
  });

  it('swings the laser sword and the Power Glove with their own art', () => {
    for (const [id, name] of MELEE) {
      expect(meleeEffect(id), id).toBe(WEAPON_EFFECT_ART[name]);
      expect(meleeEffect(hybridDefinitionId(id, 'duct_tape')), id).toBe(WEAPON_EFFECT_ART[name]);
    }
  });

  it('throws the Game Brick as its own spinning icon', () => {
    expect(thrownIconEffect('game_brick')).toMatchObject({ iconItemId: 'game_brick', motion: 'spin' });
  });

  it('ships every sheet at its declared size, one strip of frames', () => {
    for (const name of ['laserRed', 'laserGreen', 'flash', 'recFlash', 'lava', 'saber', 'glovePunch'] as const) {
      const art = WEAPON_EFFECT_ART[name];
      expect(pngSize(art.file), name).toEqual([art.width * art.frames, art.height]);
      expect(art.pivotX).toBeLessThanOrEqual(art.width);
      expect(art.pivotY).toBeLessThanOrEqual(art.height);
    }
  });

  it('keeps the laser beams the same shape, so the two read as one family', () => {
    expect(WEAPON_EFFECT_ART.laserGreen).toMatchObject({ width: WEAPON_EFFECT_ART.laserRed.width, height: WEAPON_EFFECT_ART.laserRed.height, frames: WEAPON_EFFECT_ART.laserRed.frames, flightAligned: true });
    expect(readFileSync(`public/assets/neon/weapon-effects/${WEAPON_EFFECT_ART.laserGreen.file}`).equals(readFileSync(`public/assets/neon/weapon-effects/${WEAPON_EFFECT_ART.laserRed.file}`))).toBe(false);
  });

  it('drops the eight from the roster, which stays honest', () => {
    for (const [id] of PROJECTILES) expect(diagnostics.projectile).not.toContain(id);
    expect(diagnostics.projectile).not.toContain('game_brick');
    for (const [id] of MELEE) expect(diagnostics.direct).not.toContain(id);
    for (const id of diagnostics.projectile) {
      expect(projectileEffect(traits(id)), id).toBeNull();
      expect(thrownIconEffect(id), id).toBeNull();
    }
    for (const id of diagnostics.direct) expect(meleeEffect(id), id).toBeNull();
  });

  it('never mirrors the sword\'s one-sided trail (swings always turn the same way), but does mirror a symmetric sweep', () => {
    const flips: Record<string, boolean> = {};
    const surface = (key: string) => {
      const s = { texture: { key }, visible: true } as Record<string, unknown> & { texture: { key: string } };
      for (const m of ['setOrigin', 'setCrop', 'setScale', 'setRotation', 'setPosition', 'setDepth', 'setAlpha', 'setVisible', 'destroy']) s[m] = () => s;
      s.setTexture = (k: string) => { s.texture.key = k; return s; };
      s.setFlipY = (v: boolean) => { flips[s.texture.key] = v; return s; };
      return s;
    };
    const scene = { textures: { exists: () => true, get: (key: string) => ({ key }) }, add: { image: (_x: number, _y: number, key: string) => surface(key) } } as unknown as Phaser.Scene;
    for (const id of ['lightsaber_toy', 'janitor_mop']) {
      const view = new WeaponEffectView(scene);
      view.beginFrame('room', 1);
      view.syncMelee(id, 0.4, { head: { x: 10, y: 10 }, angle: Math.PI, flipY: true });
    }
    expect(WEAPON_EFFECT_ART.saber.trails).toBe(true);
    expect(flips[WEAPON_EFFECT_ART.saber.key]).toBe(false);
    expect(flips[WEAPON_EFFECT_ART.mop.key]).toBe(true);
  });
});
