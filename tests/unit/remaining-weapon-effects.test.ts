// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_EFFECT_ART, meleeEffect, projectileEffect, thrownIconEffect } from '../../src/game/view/weaponEffects';
import { hybridDefinitionId } from '../../src/sim/fusion/hybrid';
import diagnostics from '../../diagnostics/weapon-visuals/remaining-effect-roster.json';

/** The 41 weapons left after the energy family (round 61): every one now has its own effect. */
const MELEE = [
  'aluminum_bat', 'hockey_stick', 'golf_club', 'lacrosse_stick', 'pipe_wrench', 'claw_hammer', 'yo_yo', 'foam_sword',
  'electric_guitar', 'mic_stand', 'drumsticks', 'keytar', 'pizza_cutter', 'pizza_peel', 'dough_roller', 'cardboard_standee',
  'late_fee_stamp', 'candy_cane', 'rubber_chicken', 'photo_backdrop', 'tripod', 'curling_iron', 'salon_scissors', 'fish_net',
  'dog_leash', 'hedge_trimmer', 'figure_skate', 'skate_lace', 'pretzel_rod',
] as const;
const PROJECTILES = [
  'paint_marker', 'slushie_cup', 'tennis_ball_launcher', 'staple_gun', 'slingshot', 'boombox', 'rc_blimp_remote',
  'pepperoni_launcher', 'gumball_launcher', 'seed_spreader', 'cocoa_thermos', 'marshmallow_shooter',
] as const;
/** Narrow pokes and lashes (half-angle under ~18 degrees) streak straight out; they never sweep a crescent. */
const THRUSTS = ['yo_yo', 'dog_leash', 'skate_lace', 'tripod', 'mic_stand'] as const;

const traits = (sourceItemId: string) => ({ sourceItemId, delivery: 'projectile' });
const png = (file: string) => readFileSync(`public/assets/neon/weapon-effects/${file}`);
const pngSize = (file: string) => { const p = png(file); return [p.readUInt32BE(16), p.readUInt32BE(20)]; };

describe('every weapon has its own effect (roadmap V3 complete)', () => {
  it('empties the roster', () => {
    expect(diagnostics.direct).toEqual([]);
    expect(diagnostics.projectile).toEqual([]);
  });

  it('swings every melee weapon with its own one-sided trail, fusions included', () => {
    for (const id of MELEE) {
      const art = meleeEffect(id);
      expect(art, id).not.toBeNull();
      expect(art!.trails, id).toBe(true);
      expect(meleeEffect(hybridDefinitionId(id, 'duct_tape')), id).toBe(art);
      expect(pngSize(art!.file), id).toEqual([art!.width * art!.frames, art!.height]);
    }
  });

  it('gives each melee weapon its own sheet, so a bat and a candy cane never look alike', () => {
    const files = MELEE.map((id) => meleeEffect(id)!.file);
    expect(new Set(files).size).toBe(MELEE.length);
    const bytes = new Set(files.map((file) => png(file).toString('base64')));
    expect(bytes.size).toBe(MELEE.length);
  });

  it('streaks the narrow pokes and lashes straight out instead of sweeping', () => {
    for (const id of THRUSTS) expect(meleeEffect(id)!.file, id).toMatch(/^thrust-/);
    for (const id of MELEE.filter((candidate) => !(THRUSTS as readonly string[]).includes(candidate))) {
      expect(meleeEffect(id)!.file, id).not.toMatch(/^thrust-/);
    }
  });

  it('fires every remaining shooter with its own ammunition, fusions included', () => {
    for (const id of PROJECTILES) {
      const art = projectileEffect(traits(id));
      expect(art, id).not.toBeNull();
      expect(projectileEffect(traits(hybridDefinitionId('janitor_mop', id))), id).toBe(art);
      expect(pngSize(art!.file), id).toEqual([art!.width * art!.frames, art!.height]);
      expect(thrownIconEffect(id), id).toBeNull();
    }
    expect(new Set(PROJECTILES.map((id) => projectileEffect(traits(id))!.file)).size).toBe(PROJECTILES.length);
  });

  it('keeps every new sheet to a tight palette, like the authored effects', () => {
    const arts = [...MELEE.map((id) => meleeEffect(id)!), ...PROJECTILES.map((id) => projectileEffect(traits(id))!)];
    for (const art of arts) {
      const manifest = JSON.parse(readFileSync(`public/assets/neon/weapon-effects/${art.file.replace('.png', '.json')}`, 'utf8'));
      expect(manifest.colours, art.file).toBeLessThanOrEqual(6);
      expect(manifest.frameCount, art.file).toBe(art.frames);
    }
  });

  it('registers every sheet for loading', () => {
    const keys = new Set(Object.values(WEAPON_EFFECT_ART).map((art) => art.key));
    for (const id of MELEE) expect(keys.has(meleeEffect(id)!.key), id).toBe(true);
    for (const id of PROJECTILES) expect(keys.has(projectileEffect(traits(id))!.key), id).toBe(true);
  });
});

describe('round 61: trails read through the swing', () => {
  it('holds a trail strong through mid-swing, fading only at the end; a symmetric sweep fades evenly', async () => {
    const { meleeEffectAlpha } = await import('../../src/game/view/weaponEffects');
    const bat = meleeEffect('aluminum_bat')!;
    expect(meleeEffectAlpha(bat, 0.5)).toBeGreaterThanOrEqual(0.75);
    expect(meleeEffectAlpha(bat, 1)).toBe(0);
    expect(meleeEffectAlpha(WEAPON_EFFECT_ART.mop, 0.5)).toBe(0.5);
  });

  it('draws swings reaching past the weapon head', () => {
    for (const id of MELEE) {
      const art = meleeEffect(id)!;
      expect(art.baseScale, id).toBe(art.file.startsWith('thrust-') ? 0.9 : 1.05);
    }
  });
});
