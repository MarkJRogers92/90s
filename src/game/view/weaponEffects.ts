/** Native weapon-specific attack art. These choices never feed the simulation. */
import { rootItemId } from '../../sim/fusion/hybrid';
import { projectileSourceItemId } from './projectileStyle';
import { GENERATED_MELEE, GENERATED_PROJECTILES, generatedEffectArt } from './generatedWeaponEffects';

export type WeaponEffectArt = {
  readonly key: string; readonly file: string;
  readonly width: number; readonly height: number; readonly frames: number;
  readonly pivotX: number; readonly pivotY: number;
  readonly flightAligned: boolean; readonly baseRadius: number; readonly baseScale: number; readonly coreRadius: number;
  /**
   * A one-sided swing trail (round 60). Swings always turn the same way, so it is
   * never mirrored with a weapon held upright (`flipY`); a symmetric sweep does not care.
   */
  readonly trails?: true;
};
const art = (name: string, width: number, height: number, frames: number, pivotX: number, pivotY: number,
  flightAligned: boolean, baseRadius: number, baseScale: number, coreRadius: number): WeaponEffectArt => ({
  key: `neon:weapon-effect:${name}`, file: `${name}.png`, width, height, frames, pivotX, pivotY,
  flightAligned, baseRadius, baseScale, coreRadius,
});
export const WEAPON_EFFECT_ART = {
  mop: art('mop-sweep', 64, 64, 6, 48, 32, true, 1, 0.65, 12),
  goldenMop: art('golden-mop-sweep', 64, 64, 6, 48, 32, true, 1, 0.65, 12),
  soaker: art('soaker-water', 32, 16, 4, 16, 8, true, 6, 1, 8),
  foam: art('foam-ball', 24, 24, 4, 12, 12, false, 3, 0.65, 7),
  nail: art('nail', 24, 16, 2, 12, 8, true, 2, 0.8, 4),
  vhs: art('vhs-tape', 32, 32, 4, 16, 16, false, 6, 0.85, 10),
  vinyl: art('vinyl-record', 32, 32, 4, 16, 16, false, 6, 0.85, 11),
  cd: art('scratched-cd', 32, 32, 4, 16, 16, false, 3, 0.6, 11),
  broom: art('broom-sweep', 48, 48, 6, 36, 24, true, 1, 0.65, 9),
  cutter: art('cutter-slice', 32, 24, 4, 24, 12, true, 1, 0.8, 8),
  confetti: art('party-confetti', 24, 24, 6, 12, 12, true, 4, 0.75, 8),
  rocket: art('bottle-rocket', 32, 16, 4, 16, 8, true, 3, 0.85, 6),
  extinguisher: art('extinguisher-foam', 32, 24, 6, 16, 12, true, 10, 0.85, 10),
  // Palette swaps of soaker-water (art/weapon-effects/derived): same shape, pivot and timing.
  hose: art('hose-stream', 32, 16, 4, 16, 8, true, 5, 1, 7),
  soda: art('soda-jet', 32, 16, 4, 16, 8, true, 5, 0.9, 7),
  shower: art('watering-shower', 32, 16, 4, 16, 8, true, 6, 0.8, 7),
  // Palette swaps of extinguisher-foam, each sized to its own weapon's hitbox.
  hairspray: art('hairspray-mist', 32, 24, 6, 16, 12, true, 6, 0.6, 7),
  flea: art('flea-mist', 32, 24, 6, 16, 12, true, 5, 0.6, 6),
  ketchup: art('ketchup-squirt', 32, 24, 6, 16, 12, true, 4, 0.55, 5),
  whoopee: art('whoopee-puff', 32, 24, 6, 16, 12, true, 8, 0.75, 8),
  // Round 60: the energy family, drawn by art/weapon-effects/derived/build_energy_effects.py.
  laserRed: art('laser-red', 32, 16, 4, 16, 8, true, 3, 1.5, 8),
  laserGreen: art('laser-green', 32, 16, 4, 16, 8, true, 4, 1.5, 9),
  flash: art('camera-flash', 24, 24, 4, 12, 12, false, 6, 1.6, 12),
  recFlash: art('rec-flash', 24, 24, 4, 12, 12, false, 6, 1.6, 12),
  lava: art('lava-blob', 24, 24, 4, 12, 12, false, 8, 1.3, 11),
  saber: { ...art('saber-swing', 64, 64, 6, 46, 32, true, 1, 0.75, 12), trails: true },
  glovePunch: art('glove-punch', 48, 48, 6, 14, 24, true, 1, 1.1, 10),
  // Round 61: every remaining weapon, drawn by art/weapon-effects/derived/build_weapon_families.py.
  ...generatedEffectArt(art),
} as const;

type EffectName = keyof typeof WEAPON_EFFECT_ART;
const generated = (table: Readonly<Record<string, string>>, id: string): WeaponEffectArt | null =>
  (table[id] ? WEAPON_EFFECT_ART[table[id] as EffectName] : null) ?? null;

/**
 * How opaque a melee effect is through its swing. A one-sided trail (round 61)
 * holds near full strength through the middle of the swing, where the motion
 * reads, and fades fast at the end; a symmetric sweep fades evenly as before.
 */
export function meleeEffectAlpha(art: WeaponEffectArt, progress: number): number {
  return art.trails ? 1 - progress * progress : 1 - progress;
}

export function meleeEffect(definitionId: string): WeaponEffectArt | null {
  const root = rootItemId(definitionId);
  return root === 'janitor_mop' ? WEAPON_EFFECT_ART.mop
    : root === 'golden_mop' ? WEAPON_EFFECT_ART.goldenMop
    : root === 'broken_broom_handle' ? WEAPON_EFFECT_ART.broom
    : root === 'box_cutter' ? WEAPON_EFFECT_ART.cutter
    : root === 'lightsaber_toy' ? WEAPON_EFFECT_ART.saber
    : root === 'power_glove' ? WEAPON_EFFECT_ART.glovePunch
    : generated(GENERATED_MELEE, root);
}

const PROJECTILE_ART: Readonly<Record<string, WeaponEffectArt>> = {
  pump_soaker: WEAPON_EFFECT_ART.soaker, foam_ball_blaster: WEAPON_EFFECT_ART.foam,
  nail_gun: WEAPON_EFFECT_ART.nail, vhs_tape: WEAPON_EFFECT_ART.vhs,
  record_toss: WEAPON_EFFECT_ART.vinyl, cd_shuriken: WEAPON_EFFECT_ART.cd,
  party_popper: WEAPON_EFFECT_ART.confetti, bottle_rocket_pack: WEAPON_EFFECT_ART.rocket,
  fire_extinguisher: WEAPON_EFFECT_ART.extinguisher,
  super_soaker_50: WEAPON_EFFECT_ART.soaker, super_soaker_cps: WEAPON_EFFECT_ART.soaker,
  garden_hose: WEAPON_EFFECT_ART.hose, soda_gun: WEAPON_EFFECT_ART.soda,
  watering_can: WEAPON_EFFECT_ART.shower,
  hairspray: WEAPON_EFFECT_ART.hairspray, flea_spray: WEAPON_EFFECT_ART.flea,
  ketchup_bottle: WEAPON_EFFECT_ART.ketchup, whoopee_cushion: WEAPON_EFFECT_ART.whoopee,
  laser_pointer: WEAPON_EFFECT_ART.laserRed, laser_tag_rifle: WEAPON_EFFECT_ART.laserGreen,
  flash_camera: WEAPON_EFFECT_ART.flash, camcorder: WEAPON_EFFECT_ART.recFlash,
  lava_lamp: WEAPON_EFFECT_ART.lava,
};

export function projectileEffect(traits: { readonly sourceItemId: string; readonly delivery: string }): WeaponEffectArt | null {
  if (traits.delivery === 'drifting_bubble') return null;
  const id = projectileSourceItemId(traits.sourceItemId) ?? '';
  return PROJECTILE_ART[id] ?? generated(GENERATED_PROJECTILES, id);
}

export function projectileEffectPose(art: WeaponEffectArt,
  projectile: { readonly x: number; readonly y: number; readonly velocityX: number; readonly velocityY: number; readonly radius: number },
  age: number) {
  // The authored core stays legible at normal hitbox size. Modified geometry
  // scales gently, rather than multiplying a collision radius into a huge orb.
  const scale = art.baseScale * Math.max(0.75, Math.min(1.5, projectile.radius / art.baseRadius));
  return {
    x: projectile.x, y: projectile.y,
    rotation: art.flightAligned ? Math.atan2(projectile.velocityY, projectile.velocityX) : 0,
    frame: Math.floor(Math.max(0, age) / 3) % art.frames,
    scale, radius: art.coreRadius * scale,
  };
}

/**
 * Thrown weapons with no authored sheet fly as their own inventory icon (roadmap V3):
 * a ball spins and rolls the way it travels, a football flies point-first with a
 * slight wobble. `size` is the on-screen icon size at the item's base radius.
 */
export type ThrownIconEffect = {
  readonly iconItemId: string;
  readonly baseRadius: number;
  readonly size: number;
  readonly motion: 'spin' | 'flight';
  /** Radians per tick for spinners. */
  readonly spinPerTick: number;
  /** For flight-aligned icons: the icon's own head direction, from its grip/head metadata. */
  readonly headingOffset: number;
};
const THROWN: Readonly<Record<string, Omit<ThrownIconEffect, 'iconItemId'>>> = {
  dodgeball: { baseRadius: 10, size: 24, motion: 'spin', spinPerTick: 0.18, headingOffset: 0 },
  // weaponPresentation: grip (12, 21) to head (24, 8), so the tip points at atan2(-13, 12).
  football: { baseRadius: 4, size: 18, motion: 'flight', spinPerTick: 0, headingOffset: -Math.atan2(-13, 12) },
  pog_slammer: { baseRadius: 4, size: 14, motion: 'spin', spinPerTick: 0.5, headingOffset: 0 },
  laserdisc: { baseRadius: 8, size: 22, motion: 'spin', spinPerTick: 0.4, headingOffset: 0 },
  jawbreaker: { baseRadius: 6, size: 16, motion: 'spin', spinPerTick: 0.2, headingOffset: 0 },
  squeaky_toy: { baseRadius: 5, size: 18, motion: 'spin', spinPerTick: 0.3, headingOffset: 0 },
  garden_gnome: { baseRadius: 8, size: 22, motion: 'spin', spinPerTick: 0.15, headingOffset: 0 },
  hockey_puck: { baseRadius: 4, size: 14, motion: 'spin', spinPerTick: 0.45, headingOffset: 0 },
  // A lobbed balloon wobbles more than it spins.
  water_balloons: { baseRadius: 8, size: 20, motion: 'spin', spinPerTick: 0.08, headingOffset: 0 },
  // A handheld game console, tumbling end over end.
  game_brick: { baseRadius: 8, size: 22, motion: 'spin', spinPerTick: 0.22, headingOffset: 0 },
};
export const THROWN_ICON_IDS: readonly string[] = Object.keys(THROWN);

export function thrownIconEffect(sourceItemId: string): ThrownIconEffect | null {
  const id = projectileSourceItemId(sourceItemId);
  if (!id || PROJECTILE_ART[id]) return null;
  const effect = THROWN[id];
  return effect ? { iconItemId: id, ...effect } : null;
}

export function thrownIconPose(effect: ThrownIconEffect,
  projectile: { readonly x: number; readonly y: number; readonly velocityX: number; readonly velocityY: number; readonly radius: number },
  age: number) {
  // Same gentle growth rule as the authored sheets: a modified hitbox never balloons the icon.
  const grow = Math.max(0.75, Math.min(1.5, projectile.radius / effect.baseRadius));
  const ticks = Math.max(0, age);
  const rotation = effect.motion === 'flight'
    ? Math.atan2(projectile.velocityY, projectile.velocityX) + effect.headingOffset + Math.sin(ticks * 0.6) * 0.08
    : (projectile.velocityX < 0 ? -1 : 1) * effect.spinPerTick * ticks;
  return { x: projectile.x, y: projectile.y, rotation, scale: (effect.size / 32) * grow, radius: (effect.size / 2) * grow * 0.8 };
}
