/**
 * How a player shot looks, from what the simulation says it is: the weapon
 * that fired it, whether it became a bubble, and the modifiers riding on it
 * (sticky, rewind, conductive). Pure, so every weapon provably reads
 * differently and a new weapon falls back to a plain bolt.
 */
import { hybridParts, rootItemId } from '../../sim/fusion/hybrid';

export type ProjectileShape = 'droplet' | 'confetti' | 'rocket' | 'cloud' | 'dart' | 'ball' | 'slush' | 'bubble' | 'bolt';
export type ProjectileTrail = 'droplets' | 'streamers' | 'flame' | 'mist' | 'ink' | 'none' | 'ice';

export type ProjectileStyle = {
  readonly shape: ProjectileShape;
  readonly color: number;
  readonly accent: number;
  readonly trail: ProjectileTrail;
  /** Size relative to the hitbox radius. */
  readonly scale: number;
  readonly drip: boolean;
  readonly rewind: boolean;
  readonly sparks: boolean;
};

export type ProjectileTraits = {
  readonly sourceItemId: string;
  readonly delivery: string;
  readonly sticky: boolean;
  readonly returning: boolean;
  readonly conductive: boolean;
};

const BASE: Record<string, Pick<ProjectileStyle, 'shape' | 'color' | 'accent' | 'trail' | 'scale'>> = {
  pump_soaker: { shape: 'droplet', color: 0x4ac8ff, accent: 0xd8f6ff, trail: 'droplets', scale: 1.3 },
  party_popper: { shape: 'confetti', color: 0xff3fc8, accent: 0xffd84a, trail: 'streamers', scale: 1.2 },
  bottle_rocket_pack: { shape: 'rocket', color: 0xff5a3a, accent: 0xffd84a, trail: 'flame', scale: 1.4 },
  fire_extinguisher: { shape: 'cloud', color: 0xf0f4ff, accent: 0xb8c8e8, trail: 'mist', scale: 0.9 },
  paint_marker: { shape: 'dart', color: 0x6aff8a, accent: 0x1a5a2a, trail: 'ink', scale: 1.2 },
  foam_ball_blaster: { shape: 'ball', color: 0xffb040, accent: 0x3a6aff, trail: 'none', scale: 1.3 },
  slushie_cup: { shape: 'slush', color: 0xb06aff, accent: 0xff6ab0, trail: 'ice', scale: 1.3 },
  // Round 32: the store roster's shooters.
  tennis_ball_launcher: { shape: 'ball', color: 0xd8f040, accent: 0xf0f0f0, trail: 'none', scale: 1.2 },
  dodgeball: { shape: 'ball', color: 0xe03a3a, accent: 0xa01a2a, trail: 'none', scale: 1.1 },
  football: { shape: 'rocket', color: 0xff7a2a, accent: 0xf0f0f0, trail: 'none', scale: 1.2 },
  nail_gun: { shape: 'dart', color: 0xc8d0dc, accent: 0x606870, trail: 'none', scale: 1.1 },
  staple_gun: { shape: 'dart', color: 0xd8dce4, accent: 0x2a5ab0, trail: 'none', scale: 1.0 },
  garden_hose: { shape: 'droplet', color: 0x5ad8ff, accent: 0xd8f6ff, trail: 'droplets', scale: 1.1 },
  super_soaker_50: { shape: 'droplet', color: 0x3ad0ff, accent: 0xffd84a, trail: 'droplets', scale: 1.5 },
  slingshot: { shape: 'ball', color: 0x9aa0a8, accent: 0x505058, trail: 'none', scale: 1.0 },
  pog_slammer: { shape: 'confetti', color: 0xffd84a, accent: 0x3a3a8a, trail: 'none', scale: 1.1 },
  water_balloons: { shape: 'ball', color: 0x4ac8ff, accent: 0xff6fa8, trail: 'droplets', scale: 1.2 },
  laser_pointer: { shape: 'bolt', color: 0xff3a4a, accent: 0xffb0b0, trail: 'none', scale: 1.0 },
  boombox: { shape: 'bubble', color: 0xa46bff, accent: 0x3ff0ff, trail: 'none', scale: 1.0 },
  rc_blimp_remote: { shape: 'bolt', color: 0x6aff8a, accent: 0xd8ffd8, trail: 'none', scale: 1.0 },
  camcorder: { shape: 'cloud', color: 0xfff6d0, accent: 0xff3fc8, trail: 'none', scale: 1.0 },
  record_toss: { shape: 'ball', color: 0x202028, accent: 0xff6fa8, trail: 'none', scale: 1.2 },
  cd_shuriken: { shape: 'ball', color: 0xc8e8ff, accent: 0xb06aff, trail: 'none', scale: 1.1 },
  soda_gun: { shape: 'droplet', color: 0x8a4a2a, accent: 0xffe0b0, trail: 'droplets', scale: 1.1 },
  pepperoni_launcher: { shape: 'ball', color: 0xb02a2a, accent: 0xffd84a, trail: 'none', scale: 1.2 },
  ketchup_bottle: { shape: 'droplet', color: 0xd02020, accent: 0xff8080, trail: 'ink', scale: 1.1 },
  vhs_tape: { shape: 'rocket', color: 0x202028, accent: 0xf0f0f0, trail: 'none', scale: 1.2 },
  laserdisc: { shape: 'ball', color: 0xd8e8ff, accent: 0xffd84a, trail: 'none', scale: 1.4 },
};

const BOLT = { shape: 'bolt' as const, color: 0xf0e6d2, accent: 0x9ad8ff, trail: 'none' as const, scale: 1 };

/**
 * A fused shot: the shooter's own look (or, for a melee hybrid, the look of
 * the weapon fused into it), trimmed in the other ingredient's colour.
 */
function baseLook(sourceItemId: string): Pick<ProjectileStyle, 'shape' | 'color' | 'accent' | 'trail' | 'scale'> {
  const parts = hybridParts(sourceItemId);
  if (!parts) return BASE[sourceItemId] ?? BOLT;
  // A deeper fusion looks like the items at the root of each side.
  const base = BASE[rootItemId(parts.baseId)];
  const ingredient = BASE[rootItemId(parts.ingredientId)];
  if (base) return { ...base, accent: ingredient?.color ?? base.accent, scale: base.scale * 1.15 };
  return ingredient ?? BOLT;
}

export function projectileStyle(traits: ProjectileTraits): ProjectileStyle {
  const base = baseLook(traits.sourceItemId);
  const bubble = traits.delivery === 'drifting_bubble';
  return {
    ...base,
    ...(bubble ? { shape: 'bubble' as const, scale: 1.6, trail: 'none' as const } : {}),
    drip: traits.sticky,
    rewind: traits.returning,
    sparks: traits.conductive,
  };
}
