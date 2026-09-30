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
