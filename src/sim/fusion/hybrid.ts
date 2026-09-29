/**
 * Void the Warranty: any two items fuse into one hybrid at the Bench Warrant.
 *
 * A hybrid is never authored content. Its definition is derived, purely and
 * deterministically, from the ids of its two ingredients, so a save only
 * records the ingredients and every pair in the catalog works without a
 * hand-written recipe. The derived definition is an ordinary `ItemDefinition`
 * made of the existing effect kinds, so the attack resolver needs no branch
 * for it.
 *
 * The rules, by what each ingredient is:
 * - a weapon is always the base (melee over ranged: the swing stays and also
 *   throws the shot);
 * - two shooters merge their spreads into one bigger volley;
 * - two melee weapons merge into one heavier, wider swing;
 * - a modifier fused into anything is overclocked (longer statuses, longer
 *   chains, stronger geometry), but it stops boosting your other weapons;
 * - a utility item (wallet, fanny pack) keeps working and is overclocked by
 *   the run's economy rules;
 * - every fused weapon hits one harder.
 * The RC car is the exception: it only takes a shooter, as an Emitter Mount.
 */
import { ITEM_CATALOG } from '../items/catalog';
import type {
  ItemBaseAttack,
  ItemDefinition,
  ItemEffectSpec,
  ProjectilePayloadEffect,
} from '../items/types';
import { freezeDeep } from '../items/types';

export const HYBRID_PREFIX = 'hybrid__';
export const HYBRID_BASE_FEE = 5;
export const HYBRID_CLEAN_DISCOUNT = 2;
const DEGREES = Math.PI / 180;
const MAX_OFFSETS = 7;

export type FusionRole = 'melee' | 'ranged' | 'mod' | 'utility' | 'carrier';

export function fusionRole(definition: ItemDefinition): FusionRole {
  if (definition.capabilities?.includes('emitter_carrier')) return 'carrier';
  if (definition.base?.delivery === 'direct') return 'melee';
  if (definition.base?.delivery === 'projectile') return 'ranged';
  return definition.effects.length > 0 ? 'mod' : 'utility';
}

const ROLE_RANK: Record<FusionRole, number> = { melee: 4, ranged: 3, mod: 2, utility: 1, carrier: 0 };

export type FusionPair =
  | { readonly recipe: 'emitter_mount'; readonly baseId: string; readonly ingredientId: string }
  | { readonly recipe: 'hybrid'; readonly baseId: string; readonly ingredientId: string }
  | { readonly recipe: null; readonly baseId: null; readonly ingredientId: null; readonly reason: string };

/** What two items make, and which one is the base. `first` is the one picked first. */
export function fusionPairFor(first: ItemDefinition, second: ItemDefinition): FusionPair {
  const a = fusionRole(first);
  const b = fusionRole(second);
  if (a === 'carrier' || b === 'carrier') {
    const other = a === 'carrier' ? second : first;
    const carrier = a === 'carrier' ? first : second;
    if (a === 'carrier' && b === 'carrier') return { recipe: null, baseId: null, ingredientId: null, reason: 'Two cars make a traffic jam, not a weapon.' };
    if (fusionRole(other) !== 'ranged') {
      return { recipe: null, baseId: null, ingredientId: null, reason: `The ${carrier.name} only carries something that shoots.` };
    }
    return { recipe: 'emitter_mount', baseId: other.id, ingredientId: carrier.id };
  }
  const firstIsBase = ROLE_RANK[a] >= ROLE_RANK[b];
  return {
    recipe: 'hybrid',
    baseId: firstIsBase ? first.id : second.id,
    ingredientId: firstIsBase ? second.id : first.id,
  };
}

export function hybridDefinitionId(baseId: string, ingredientId: string): string {
  return `${HYBRID_PREFIX}${baseId}__${ingredientId}`;
}

export function hybridParts(id: string): { baseId: string; ingredientId: string } | null {
  if (!id.startsWith(HYBRID_PREFIX)) return null;
  const [baseId, ingredientId, extra] = id.slice(HYBRID_PREFIX.length).split('__');
  if (!baseId || !ingredientId || extra !== undefined) return null;
  return { baseId, ingredientId };
}

/** Named combinations: the fusions worth discovering. Order does not matter. */
const SIGNATURES: Readonly<Record<string, string>> = {
  'janitor_mop+pump_soaker': 'Hydro Mop',
  'janitor_mop+plasma_globe': 'Shock Mop',
  'gel_pens+janitor_mop': 'Goo Mop',
  'grease_gun+janitor_mop': 'Slick Mop',
  'plasma_globe+pump_soaker': 'Storm Soaker',
  'bottle_rocket_pack+party_popper': 'New Years Eve',
  'bubble_bath+fire_extinguisher': 'Foam Party',
  'box_cutter+extension_cord': 'Live Wire',
  'broken_broom_handle+heavy_duty_spring': 'Pogo Broom',
  'gel_pens+paint_marker': 'Glitter Glue Gun',
  'car_battery+plasma_globe': 'Tesla Coil',
  'fanny_pack+receipt_wallet': 'Coupon Clutch',
  'foam_ball_blaster+vhs_rewinder': 'Boomerang Blaster',
  'plasma_globe+slushie_cup': 'Electric Slush',
  'slushie_cup+wide_nozzle': 'Brain Freeze',
  'box_cutter+broken_broom_handle': 'Box Broom',
};

const NOUNS: Readonly<Record<string, string>> = {
  janitor_mop: 'Mop', pump_soaker: 'Soaker', party_popper: 'Popper', bottle_rocket_pack: 'Rockets',
  fire_extinguisher: 'Extinguisher', paint_marker: 'Marker', foam_ball_blaster: 'Blaster', slushie_cup: 'Slushie',
  broken_broom_handle: 'Broom', box_cutter: 'Cutter', bubble_bath: 'Bath', plasma_globe: 'Globe',
  vhs_rewinder: 'Rewinder', extension_cord: 'Cord', gel_pens: 'Pens', wide_nozzle: 'Nozzle',
  receipt_wallet: 'Wallet', fanny_pack: 'Fanny Pack', grease_gun: 'Grease Gun', anti_static_strap: 'Strap',
  car_battery: 'Battery', needle_nozzle: 'Needle', heavy_duty_spring: 'Spring',
};

const ADJECTIVES: Readonly<Record<string, string>> = {
  janitor_mop: 'Mopping', pump_soaker: 'Soaking', party_popper: 'Confetti', bottle_rocket_pack: 'Rocket',
  fire_extinguisher: 'Foaming', paint_marker: 'Painted', foam_ball_blaster: 'Foam', slushie_cup: 'Slushy',
  broken_broom_handle: 'Broom', box_cutter: 'Bladed', bubble_bath: 'Bubbly', plasma_globe: 'Shocking',
  vhs_rewinder: 'Rewinding', extension_cord: 'Wired', gel_pens: 'Sticky', wide_nozzle: 'Wide-Bore',
  receipt_wallet: 'Discount', fanny_pack: 'Smuggling', grease_gun: 'Greasy', anti_static_strap: 'Grounded',
  car_battery: 'Supercharged', needle_nozzle: 'Needle', heavy_duty_spring: 'Spring-Loaded',
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

export function isSignatureFusion(baseId: string, ingredientId: string): boolean {
  return pairKey(baseId, ingredientId) in SIGNATURES;
}

function hybridName(base: ItemDefinition, ingredient: ItemDefinition): string {
  return SIGNATURES[pairKey(base.id, ingredient.id)]
    ?? `${ADJECTIVES[ingredient.id] ?? 'Fused'} ${NOUNS[base.id] ?? base.name}`;
}

/** A modifier's effect, stronger for being bolted on, and owned by the hybrid. */
function overclock(effect: ItemEffectSpec, id: string): ItemEffectSpec {
  const owned = { ...effect, sourceItemId: id, label: `overclocked ${effect.label}` };
  switch (owned.kind) {
    case 'status_modifier':
      return {
        ...owned,
        ticks: Math.round(owned.ticks * 1.5),
        slowMultiplier: Math.round(Math.max(0.3, owned.slowMultiplier * 0.85) * 100) / 100,
        slowFloor: Math.round(Math.max(0.25, owned.slowFloor - 0.05) * 100) / 100,
      };
    case 'conductive_reaction':
      return { ...owned, maxAdditionalTargets: owned.maxAdditionalTargets + 1, baseRange: owned.baseRange + 40 };
    case 'conductive_range':
      return { ...owned, range: owned.range + 60 };
    case 'projectile_geometry':
      return {
        ...owned,
        radiusBonus: Math.round(owned.radiusBonus * 1.5),
        speedMultiplier: Math.round((1 + (owned.speedMultiplier - 1) * 1.5) * 100) / 100,
      };
    case 'projectile_conversion':
      return {
        ...owned,
        lifetimeTicks: Math.round(owned.lifetimeTicks * 1.3),
        terminalWetPatch: { radius: Math.round(owned.terminalWetPatch.radius * 1.4), ticks: owned.terminalWetPatch.ticks },
      };
    default:
      return owned;
  }
}

function payloadOf(definition: ItemDefinition): ProjectilePayloadEffect | null {
  return definition.effects.find((effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload') ?? null;
}

function ownPayload(payload: ProjectilePayloadEffect, id: string, damageBonus: number): ProjectilePayloadEffect {
  return { ...payload, sourceItemId: id, damage: payload.damage + damageBonus, label: `fused ${payload.label}` };
}

/** Two volleys become one: every prong of both, water if either was wet. */
function mergedPayload(a: ProjectilePayloadEffect, b: ProjectilePayloadEffect, id: string): ProjectilePayloadEffect {
  // The second volley fans out wider, so the prongs interleave instead of overlapping.
  let offsets = [...new Set([...a.angularOffsetsRadians, ...b.angularOffsetsRadians.map((offset) => offset * 1.6)].map((offset) => Math.round(offset * 1e6) / 1e6))]
    .sort((x, y) => x - y);
  // Two single shots become a double barrel.
  if (offsets.length < 2) offsets = [-4 * DEGREES, 4 * DEGREES].map((offset) => Math.round(offset * 1e6) / 1e6);
  // Keep a readable fan: the centre and the widest prongs survive a trim.
  while (offsets.length > MAX_OFFSETS) offsets.splice(Math.floor(offsets.length / 2) + (offsets.length % 2 === 0 ? 0 : 1), 1);
  const wet = [a, b].filter((payload) => payload.payloadKind === 'water');
  const onHit = wet.reduce<ProjectilePayloadEffect['onHit']>(
    (best, payload) => (payload.onHit && (!best || payload.onHit.ticks > best.ticks) ? payload.onHit : best),
    null,
  );
  return {
    kind: 'projectile_payload',
    stage: 'projectile',
    priority: 0,
    sourceItemId: id,
    label: `merged volley (${offsets.length} prongs${wet.length > 0 ? ', water' : ''})`,
    payloadKind: wet.length > 0 ? 'water' : 'physical',
    angularOffsetsRadians: offsets,
    damage: Math.max(a.damage, b.damage) + 1,
    speed: Math.round(((a.speed + b.speed) / 2) * 100) / 100,
    radius: Math.max(a.radius, b.radius),
    lifetimeTicks: Math.max(a.lifetimeTicks, b.lifetimeTicks),
    onHit: wet.length > 0 ? onHit : null,
  };
}

/** A melee swing picks up what a projectile-only modifier would have done to a shot. */
function meleeWithModifier(attack: ItemBaseAttack, mod: ItemDefinition, id: string): { attack: ItemBaseAttack; effects: ItemEffectSpec[] } {
  let next = { ...attack, damage: attack.damage + 1 };
  const effects: ItemEffectSpec[] = [];
  for (const effect of mod.effects) {
    switch (effect.kind) {
      case 'projectile_geometry':
        next = effect.radiusBonus > 0
          ? { ...next, range: next.range + effect.radiusBonus * 6, halfAngleRadians: Math.min(Math.PI * 0.6, next.halfAngleRadians + 12 * DEGREES) }
          : { ...next, cooldownTicks: Math.max(8, Math.round(next.cooldownTicks * 0.75)) };
        break;
      case 'trajectory_replay':
        // "Rewinds" the swing: it comes around again sooner.
        next = { ...next, cooldownTicks: Math.max(8, Math.round(next.cooldownTicks * 0.7)) };
        break;
      case 'projectile_conversion':
        // Every swing blows a bubble.
        effects.push({
          kind: 'projectile_payload', stage: 'projectile', priority: 0, sourceItemId: id,
          label: 'swing bubble (water, Wet on hit)', payloadKind: 'water', angularOffsetsRadians: [0],
          damage: 1, speed: 2.5, radius: 8, lifetimeTicks: 90, onHit: { status: 'wet', ticks: 180 },
        });
        effects.push(overclock(effect, id));
        break;
      default:
        effects.push(overclock(effect, id));
    }
  }
  return { attack: next, effects };
}

function summaryFor(base: ItemDefinition, ingredient: ItemDefinition): string {
  return `${base.name} fused with ${ingredient.name} at the Bench Warrant.`;
}

function build(base: ItemDefinition, ingredient: ItemDefinition): ItemDefinition {
  const id = hybridDefinitionId(base.id, ingredient.id);
  const name = hybridName(base, ingredient);
  const roles = [fusionRole(base), fusionRole(ingredient)] as const;
  const signature = isSignatureFusion(base.id, ingredient.id) ? 1 : 0;
  const summary = summaryFor(base, ingredient);
  const [baseRole, ingredientRole] = roles;

  if (baseRole === 'ranged' && ingredientRole === 'ranged') {
    const payload = mergedPayload(payloadOf(base)!, payloadOf(ingredient)!, id);
    const withSignature = { ...payload, damage: payload.damage + signature };
    return {
      id, name, summary,
      base: { ...base.base!, damage: withSignature.damage, speed: withSignature.speed, cooldownTicks: Math.round(((base.base!.cooldownTicks + ingredient.base!.cooldownTicks) / 2) * 0.9) },
      effects: [withSignature],
    };
  }
  if (baseRole === 'melee' && ingredientRole === 'melee') {
    const a = base.base!;
    const b = ingredient.base!;
    return {
      id, name, summary,
      base: {
        ...a,
        damage: Math.max(a.damage, b.damage) + Math.ceil(Math.min(a.damage, b.damage) / 2) + signature,
        range: Math.max(a.range, b.range),
        halfAngleRadians: Math.max(a.halfAngleRadians, b.halfAngleRadians),
        cooldownTicks: Math.round((a.cooldownTicks + b.cooldownTicks) / 2),
      },
      effects: [],
    };
  }
  if (baseRole === 'melee' && ingredientRole === 'ranged') {
    const shot = ownPayload(payloadOf(ingredient)!, id, signature);
    return {
      id, name, summary,
      base: { ...base.base!, damage: base.base!.damage + 1 + signature, cooldownTicks: base.base!.cooldownTicks + 6 },
      effects: [shot],
    };
  }
  if (baseRole === 'melee') {
    const { attack, effects } = meleeWithModifier(base.base!, ingredient, id);
    return { id, name, summary, base: { ...attack, damage: attack.damage + signature }, effects };
  }
  if (baseRole === 'ranged') {
    const shot = ownPayload(payloadOf(base)!, id, 1 + signature);
    return {
      id, name, summary,
      base: { ...base.base!, damage: shot.damage },
      effects: [shot, ...ingredient.effects.map((effect) => overclock(effect, id))],
    };
  }
  // Two passives (or a passive and a utility): one kit, everything overclocked.
  return {
    id, name, summary,
    effects: [...base.effects, ...ingredient.effects].map((effect) => overclock(effect, id)),
  };
}

const DEFINITIONS = new Map(ITEM_CATALOG.map((definition) => [definition.id, definition]));
const CACHE = new Map<string, ItemDefinition>();

/** The derived definition for a base and an ingredient (throws on an impossible pair). */
export function hybridDefinition(baseId: string, ingredientId: string): ItemDefinition {
  const id = hybridDefinitionId(baseId, ingredientId);
  const cached = CACHE.get(id);
  if (cached) return cached;
  const base = DEFINITIONS.get(baseId);
  const ingredient = DEFINITIONS.get(ingredientId);
  if (!base || !ingredient || baseId === ingredientId) throw new Error(`No hybrid of "${baseId}" and "${ingredientId}".`);
  const pair = fusionPairFor(base, ingredient);
  if (pair.recipe !== 'hybrid' || pair.baseId !== baseId) throw new Error(`"${baseId}" + "${ingredientId}" is not a hybrid in that order.`);
  const definition = freezeDeep(build(base, ingredient));
  CACHE.set(id, definition);
  return definition;
}

/** True when the pair, in this order, is a legal hybrid. */
export function isHybridPair(baseId: string, ingredientId: string): boolean {
  const base = DEFINITIONS.get(baseId);
  const ingredient = DEFINITIONS.get(ingredientId);
  if (!base || !ingredient || baseId === ingredientId) return false;
  const pair = fusionPairFor(base, ingredient);
  return pair.recipe === 'hybrid' && pair.baseId === baseId;
}

/** Plain-words lines for the Bench Warrant card: what the hybrid does. */
export function hybridHighlights(baseId: string, ingredientId: string): string[] {
  const definition = hybridDefinition(baseId, ingredientId);
  const base = DEFINITIONS.get(baseId)!;
  const ingredient = DEFINITIONS.get(ingredientId)!;
  const roles = [fusionRole(base), fusionRole(ingredient)];
  const lines: string[] = [];
  const payload = definition.effects.find((effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload');
  if (roles[0] === 'ranged' && roles[1] === 'ranged' && payload) lines.push(`ONE ${payload.angularOffsetsRadians.length}-PRONG VOLLEY, ${payload.damage} DAMAGE EACH`);
  else if (roles[0] === 'melee' && roles[1] === 'melee') lines.push(`ONE HEAVY SWING, ${definition.base!.damage} DAMAGE`);
  else if (roles[0] === 'melee' && payload) lines.push(`EVERY SWING ALSO FIRES ${payload.payloadKind === 'water' ? 'WATER' : 'A SHOT'}`);
  else if (definition.base) lines.push(`${definition.base.damage + 0} DAMAGE PER HIT (+1 FUSED)`);
  for (const effect of definition.effects) {
    if (effect.kind === 'status_modifier') lines.push(`STICKY LASTS ${Math.round(effect.ticks / 60 * 10) / 10}S (OVERCLOCKED)`);
    if (effect.kind === 'conductive_reaction') lines.push(`CHAINS TO ${effect.maxAdditionalTargets} MORE TARGETS (OVERCLOCKED)`);
    if (effect.kind === 'conductive_range') lines.push(`CHAIN REACH ${effect.range} (OVERCLOCKED)`);
    if (effect.kind === 'projectile_geometry') lines.push(effect.radiusBonus >= 0 ? 'BIGGER, SLOWER SHOTS (OVERCLOCKED)' : 'THINNER, FASTER SHOTS (OVERCLOCKED)');
    if (effect.kind === 'projectile_conversion') lines.push('SHOTS BECOME BIG DRIFTING BUBBLES');
    if (effect.kind === 'trajectory_replay') lines.push('SHOTS REWIND FOR A SECOND PASS');
  }
  if (roles[0] === 'melee' && ingredient.effects.some((effect) => effect.kind === 'projectile_geometry' || effect.kind === 'trajectory_replay')) {
    lines.push('A FASTER OR WIDER SWING');
  }
  if ([baseId, ingredientId].includes('receipt_wallet')) lines.push('BIGGER DISCOUNT: $3 OFF EVERY PURCHASE');
  if ([baseId, ingredientId].includes('fanny_pack')) lines.push('CARRY ONE MORE STOLEN ITEM');
  if (ingredient.effects.length > 0 && roles[1] === 'mod') lines.push(`${ingredient.name.toUpperCase()} NO LONGER BOOSTS YOUR OTHER WEAPONS`);
  if (isSignatureFusion(baseId, ingredientId)) lines.unshift('SIGNATURE FUSION: +1 DAMAGE');
  return lines.slice(0, 5);
}

/** A short tile label: the item's one-word noun, or a hybrid's own name. */
export function shortItemName(id: string): string {
  const parts = hybridParts(id);
  if (parts && isHybridPair(parts.baseId, parts.ingredientId)) return hybridDefinition(parts.baseId, parts.ingredientId).name;
  return NOUNS[id] ?? DEFINITIONS.get(id)?.name ?? id;
}

/** Every named combination, for the Break Room's fusion log. */
export function signatureFusions(): Array<{ readonly name: string; readonly itemIds: readonly [string, string] }> {
  return Object.entries(SIGNATURES).map(([key, name]) => {
    const [a, b] = key.split('+') as [string, string];
    return { name, itemIds: [a, b] as const };
  });
}
