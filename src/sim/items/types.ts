/**
 * Content model for the M2 interaction lab.
 *
 * Everything here is authored data plus shared constants: no run state, no
 * Phaser, and no DOM. A new item reuses these effect kinds, so the central tick
 * and attack resolver never need to branch on an item definition ID.
 */

/** Stable content ID for an item definition. */
export type ItemId = string;

export type AttackDelivery = 'direct' | 'projectile';

/**
 * Canonical semantic stage order. Effects always compile in this order so an
 * identical set of owned items yields an identical attack specification no
 * matter which order the player picked them up in.
 */
export const EFFECT_STAGE_ORDER = Object.freeze([
  'projectile',
  'conversion',
  'status',
  'reaction',
  'trajectory',
  'geometry',
] as const);

export type EffectStage = (typeof EFFECT_STAGE_ORDER)[number];

export const EFFECT_KINDS = Object.freeze([
  'projectile_payload',
  'projectile_conversion',
  'status_modifier',
  'conductive_reaction',
  'conductive_range',
  'trajectory_replay',
  'projectile_geometry',
] as const);

export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Each effect kind has exactly one semantic stage. */
export const EFFECT_STAGE_BY_KIND: Readonly<Record<EffectKind, EffectStage>> = Object.freeze({
  projectile_payload: 'projectile',
  projectile_conversion: 'conversion',
  status_modifier: 'status',
  conductive_reaction: 'reaction',
  conductive_range: 'reaction',
  trajectory_replay: 'trajectory',
  projectile_geometry: 'geometry',
});

/**
 * Kinds that only ever modify a projectile delivery. Owning one of these never
 * converts a direct attack such as the mop into a projectile.
 */
export const PROJECTILE_ONLY_EFFECT_KINDS = Object.freeze([
  'projectile_payload',
  'projectile_conversion',
  'trajectory_replay',
  'projectile_geometry',
] as const);

export function isProjectileOnlyEffectKind(kind: EffectKind): boolean {
  return (PROJECTILE_ONLY_EFFECT_KINDS as readonly EffectKind[]).includes(kind);
}

export function stageIndex(stage: EffectStage): number {
  return EFFECT_STAGE_ORDER.indexOf(stage);
}

type EffectBase = {
  /** Owning item definition. Validated to match the definition that declares it. */
  readonly sourceItemId: ItemId;
  /** Tiebreaker inside one semantic stage. */
  readonly priority: number;
  /** Short human-readable step used by the compiled behavior trace. */
  readonly label: string;
};

export type WetStatusApplication = {
  readonly status: 'wet';
  readonly ticks: number;
};

export type WetPatchSpec = {
  readonly radius: number;
  readonly ticks: number;
};

/** A compatible water projectile: the spawn-time payload the soaker fires. */
export type ProjectilePayloadEffect = EffectBase & {
  readonly kind: 'projectile_payload';
  readonly stage: 'projectile';
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly lifetimeTicks: number;
  readonly onHit: WetStatusApplication;
};

/** Bubble Bath: converts compatible water projectiles into drifting bubbles. */
export type ProjectileConversionEffect = EffectBase & {
  readonly kind: 'projectile_conversion';
  readonly stage: 'conversion';
  readonly converts: 'water_projectile';
  readonly result: 'drifting_bubble';
  readonly speed: number;
  readonly minRadius: number;
  readonly lifetimeTicks: number;
  readonly penetrates: boolean;
  readonly recordsHitPerPass: boolean;
  readonly terminalWetPatch: WetPatchSpec;
};

/** Gel Pens: the one authored Sticky application and its slow values. */
export type StatusModifierEffect = EffectBase & {
  readonly kind: 'status_modifier';
  readonly stage: 'status';
  readonly status: 'sticky';
  readonly ticks: number;
  readonly slowMultiplier: number;
  readonly slowFloor: number;
};

/** Plasma Globe: one bounded conductive chain per root action. */
export type ConductiveReactionEffect = EffectBase & {
  readonly kind: 'conductive_reaction';
  readonly stage: 'reaction';
  readonly chainStartsPerRoot: number;
  readonly maxAdditionalTargets: number;
  readonly baseRange: number;
  readonly visitsEachTargetOnce: boolean;
};

/** Extension Cord: longer conductive reach plus a weak discharge without a globe. */
export type ConductiveRangeEffect = EffectBase & {
  readonly kind: 'conductive_range';
  readonly stage: 'reaction';
  readonly range: number;
  readonly weakDischarge: boolean;
};

/** VHS Rewinder: one bounded return pass for an eligible surviving projectile. */
export type TrajectoryReplayEffect = EffectBase & {
  readonly kind: 'trajectory_replay';
  readonly stage: 'trajectory';
  readonly returnPasses: number;
  readonly activatesOncePerRoot: boolean;
};

/** Wide-Bore Nozzle: projectile geometry only, never the player hitbox. */
export type ProjectileGeometryEffect = EffectBase & {
  readonly kind: 'projectile_geometry';
  readonly stage: 'geometry';
  readonly radiusBonus: number;
  readonly speedMultiplier: number;
};

export type ItemEffectSpec =
  | ProjectilePayloadEffect
  | ProjectileConversionEffect
  | StatusModifierEffect
  | ConductiveReactionEffect
  | ConductiveRangeEffect
  | TrajectoryReplayEffect
  | ProjectileGeometryEffect;

export type ItemBaseAttack = {
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly cooldownTicks: number;
  /** Direct-attack reach in world units. Zero for projectile deliveries. */
  readonly range: number;
  /** Direct-attack half angle in radians. Zero for projectile deliveries. */
  readonly halfAngleRadians: number;
  /** Projectile muzzle speed in world units per tick. Zero for direct deliveries. */
  readonly speed: number;
};

export type ItemDefinition = {
  readonly id: ItemId;
  readonly name: string;
  readonly summary: string;
  /**
   * Base attack used only when this definition is the selected primary. Items
   * without a base attack are modifiers and cannot be selected as a primary.
   */
  readonly base?: ItemBaseAttack;
  readonly effects: readonly ItemEffectSpec[];
};

/** One owned copy of an item definition. */
export type ItemInstance = {
  readonly instanceId: string;
  readonly itemId: ItemId;
};

/** Definition-level attack specification, independent of instance IDs. */
export type CompiledPrimary = ItemBaseAttack & {
  readonly definitionId: ItemId;
  readonly name: string;
};

export type CompiledLoadout = {
  readonly primary: CompiledPrimary;
  /** Compatible effects in semantic stage, priority, and content-ID order. */
  readonly effects: readonly ItemEffectSpec[];
  /** Sorted unique item IDs that contributed behavior, including the primary. */
  readonly sourceItemIds: readonly ItemId[];
  /** Human-readable reasons an owned effect could not apply here. */
  readonly compatibilityNotes: readonly string[];
  /** Concise ordered gameplay steps for UI display. */
  readonly trace: readonly string[];
};

/**
 * Clones plain authored data and deep-freezes the clone, so compiled output is
 * immutable and callers cannot reach back into a definition through it.
 */
export function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    const entries = value.map((entry: unknown) => freezeDeep(entry));
    return Object.freeze(entries) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = freezeDeep(entry);
    }
    return Object.freeze(clone) as unknown as T;
  }
  return value;
}
