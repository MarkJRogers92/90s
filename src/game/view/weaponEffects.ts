/** Native weapon-specific attack art. These choices never feed the simulation. */
import { rootItemId } from '../../sim/fusion/hybrid';
import { projectileSourceItemId } from './projectileStyle';

export type WeaponEffectArt = {
  readonly key: string; readonly file: string;
  readonly width: number; readonly height: number; readonly frames: number;
  readonly pivotX: number; readonly pivotY: number;
  readonly flightAligned: boolean; readonly baseRadius: number; readonly baseScale: number; readonly coreRadius: number;
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
} as const;

export function meleeEffect(definitionId: string): WeaponEffectArt | null {
  const root = rootItemId(definitionId);
  return root === 'janitor_mop' ? WEAPON_EFFECT_ART.mop
    : root === 'golden_mop' ? WEAPON_EFFECT_ART.goldenMop
    : root === 'broken_broom_handle' ? WEAPON_EFFECT_ART.broom
    : root === 'box_cutter' ? WEAPON_EFFECT_ART.cutter : null;
}

const PROJECTILE_ART: Readonly<Record<string, WeaponEffectArt>> = {
  pump_soaker: WEAPON_EFFECT_ART.soaker, foam_ball_blaster: WEAPON_EFFECT_ART.foam,
  nail_gun: WEAPON_EFFECT_ART.nail, vhs_tape: WEAPON_EFFECT_ART.vhs,
  record_toss: WEAPON_EFFECT_ART.vinyl, cd_shuriken: WEAPON_EFFECT_ART.cd,
  party_popper: WEAPON_EFFECT_ART.confetti, bottle_rocket_pack: WEAPON_EFFECT_ART.rocket,
  fire_extinguisher: WEAPON_EFFECT_ART.extinguisher,
};

export function projectileEffect(traits: { readonly sourceItemId: string; readonly delivery: string }): WeaponEffectArt | null {
  if (traits.delivery === 'drifting_bubble') return null;
  return PROJECTILE_ART[projectileSourceItemId(traits.sourceItemId) ?? ''] ?? null;
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
