import { describe, expect, it } from 'vitest';
import { NEON_ASSETS } from '../../src/game/presentation/assets';
import { meleeEffect, projectileEffect, projectileEffectPose, WEAPON_EFFECT_ART } from '../../src/game/view/weaponEffects';

const traits = (sourceItemId: string, delivery = 'water_projectile') => ({ sourceItemId, delivery });

describe('first-slice native weapon effect selection', () => {
  it.each([
    ['pump_soaker', 'soaker'], ['foam_ball_blaster', 'foam'], ['nail_gun', 'nail'],
    ['vhs_tape', 'vhs'], ['record_toss', 'vinyl'], ['cd_shuriken', 'cd'],
  ] as const)('%s selects its authored %s body', (id, name) => {
    expect(projectileEffect(traits(id))).toBe(WEAPON_EFFECT_ART[name]);
  });

  it('retains a root shooter and recursively finds a melee hybrid shooter', () => {
    expect(projectileEffect(traits('hybrid__pump_soaker__nail_gun'))).toBe(WEAPON_EFFECT_ART.soaker);
    expect(projectileEffect(traits('hybrid__(hybrid__janitor_mop__foam_ball_blaster)__gel_pens'))).toBe(WEAPON_EFFECT_ART.foam);
    expect(projectileEffect(traits('hybrid__janitor_mop__(hybrid__vhs_tape__vhs_rewinder)'))).toBe(WEAPON_EFFECT_ART.vhs);
    // A root shooter keeps its own art over its ingredient's (round 61: every shooter has art)...
    expect(projectileEffect(traits('hybrid__staple_gun__pump_soaker'))).toBe(WEAPON_EFFECT_ART.ammoStaple);
    // ...and a root with its own art keeps it (the hose has its water since V3).
    expect(projectileEffect(traits('hybrid__garden_hose__pump_soaker'))).toBe(WEAPON_EFFECT_ART.hose);
    expect(projectileEffect(traits('hybrid__gumball_launcher__pump_soaker'))).toBe(WEAPON_EFFECT_ART.ammoGumball);
  });

  it('never overwrites converted bubbles, and draws nothing for an unknown shooter', () => {
    expect(projectileEffect(traits('pump_soaker', 'drifting_bubble'))).toBeNull();
    expect(projectileEffect(traits('nail_gun', 'drifting_bubble'))).toBeNull();
    expect(projectileEffect(traits('gumball_launcher', 'drifting_bubble'))).toBeNull();
    expect(projectileEffect(traits('unknown'))).toBeNull();
  });

  it('selects cloth and golden cloth for base and nested fused mops only', () => {
    expect(meleeEffect('janitor_mop')).toBe(WEAPON_EFFECT_ART.mop);
    expect(meleeEffect('hybrid__(hybrid__janitor_mop__pump_soaker)__gel_pens')).toBe(WEAPON_EFFECT_ART.mop);
    expect(meleeEffect('hybrid__golden_mop__nail_gun')).toBe(WEAPON_EFFECT_ART.goldenMop);
    expect(meleeEffect('pizza_cutter')).toBe(WEAPON_EFFECT_ART.glintCutter);
    expect(meleeEffect('unknown')).toBeNull();
  });

  it('preloads every exact sheet contract as a local effect image', () => {
    for (const art of Object.values(WEAPON_EFFECT_ART)) {
      expect(NEON_ASSETS.find((asset) => asset.key === art.key)).toMatchObject({
        url: `/assets/neon/weapon-effects/${art.file}`, frameWidth: art.width, frameHeight: art.height, requiredFor: 'effect',
      });
    }
  });
});

describe('native projectile pose', () => {
  it('keeps the simulation centre and rotates a water jet to its actual velocity', () => {
    const pose = projectileEffectPose(WEAPON_EFFECT_ART.soaker, { x: 123.5, y: 76.25, velocityX: 0, velocityY: -3, radius: 6 }, 6);
    expect(pose).toMatchObject({ x: 123.5, y: 76.25, rotation: -Math.PI / 2, frame: 2, scale: 1 });
  });

  it('uses native VHS frames for tumbling rather than a rocket-shaped flight pose', () => {
    const pose = projectileEffectPose(WEAPON_EFFECT_ART.vhs, { x: 0, y: 0, velocityX: 0, velocityY: 4, radius: 6 }, 9);
    expect(pose.rotation).toBe(0);
    expect(pose.frame).toBe(3);
  });

  it('uses style-specific modest scales and caps enlarged modified geometry', () => {
    const shot = { x: 0, y: 0, velocityX: 5, velocityY: 0, radius: 3 };
    expect(projectileEffectPose(WEAPON_EFFECT_ART.foam, shot, 0).scale).toBeCloseTo(0.65);
    expect(projectileEffectPose(WEAPON_EFFECT_ART.cd, shot, 0).scale).toBeCloseTo(0.6);
    expect(projectileEffectPose(WEAPON_EFFECT_ART.foam, { ...shot, radius: 40 }, 0).scale).toBeLessThanOrEqual(1);
  });
});


const secondMelee = [
  ['broken_broom_handle', 'broom-sweep', 48, 48, 6, 36, 24, .65],
  ['box_cutter', 'cutter-slice', 32, 24, 4, 24, 12, .8],
] as const;
const secondShots = [
  ['party_popper', 'party-confetti', 24, 24, 6, 12, 12, 4, .75],
  ['bottle_rocket_pack', 'bottle-rocket', 32, 16, 4, 16, 8, 3, .85],
  ['fire_extinguisher', 'extinguisher-foam', 32, 24, 6, 16, 12, 10, .85],
] as const;

describe('second-slice native material contracts', () => {
  it.each(secondMelee)('%s selects its exact material sheet and head pivot', (id, name, width, height, frames, pivotX, pivotY, baseScale) => {
    const expected = { key: `neon:weapon-effect:${name}`, file: `${name}.png`, width, height, frames, pivotX, pivotY, baseScale };
    expect(meleeEffect(id)).toMatchObject(expected);
    expect(meleeEffect(`hybrid__(hybrid__${id}__party_popper)__gel_pens`)).toMatchObject(expected);
    expect(meleeEffect(`hybrid__janitor_mop__${id}`)).toBe(WEAPON_EFFECT_ART.mop);
  });

  it.each(secondShots)('%s selects its own projectile, nested shooter and root precedence', (id, name, width, height, frames, pivotX, pivotY, baseRadius, baseScale) => {
    const expected = { key: `neon:weapon-effect:${name}`, file: `${name}.png`, width, height, frames, pivotX, pivotY, baseRadius, baseScale, flightAligned: true };
    expect(projectileEffect(traits(id))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__(hybrid__broken_broom_handle__${id})__gel_pens`))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__box_cutter__(hybrid__${id}__pump_soaker)`))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__${id}__pump_soaker`))).toMatchObject(expected);
    expect(projectileEffect(traits(`hybrid__pump_soaker__${id}`))).toBe(WEAPON_EFFECT_ART.soaker);
    expect(projectileEffect(traits(`hybrid__gumball_launcher__${id}`))).toBe(WEAPON_EFFECT_ART.ammoGumball);
    expect(projectileEffect(traits(id, 'drifting_bubble'))).toBeNull();
  });

  it.each(secondShots)('%s advances all frames on actual flight direction while keeping collision state immutable', (id, _name, _w, _h, frames, _px, _py, baseRadius, baseScale) => {
    const art = projectileEffect(traits(id));
    expect(art).not.toBeNull();
    const shot = Object.freeze({ x: 82.125, y: 44.75, velocityX: -3, velocityY: 0, radius: baseRadius });
    const before = JSON.stringify(shot);
    for (let frame = 0; frame <= frames; frame++) {
      expect(projectileEffectPose(art!, shot, frame * 3)).toMatchObject({ x: shot.x, y: shot.y, rotation: Math.PI, frame: frame % frames, scale: baseScale });
    }
    expect(projectileEffectPose(art!, { ...shot, radius: baseRadius * 10 }, 0).scale).toBeCloseTo(baseScale * 1.5);
    expect(projectileEffectPose(art!, { ...shot, radius: .1 }, 0).scale).toBeCloseTo(baseScale * .75);
    expect(JSON.stringify(shot)).toBe(before);
  });
});
