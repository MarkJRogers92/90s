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
 *
 * Round 32: a hybrid can be fused again, with another item or another hybrid,
 * up to MAX_FUSION_PARTS items in one thing. A nested hybrid's id wraps each
 * hybrid part in parentheses (`hybrid__(hybrid__a__b)__c`), so a two-item id
 * is unchanged and every save from before still resolves. The same rules
 * apply at every depth, and whatever the base already did is kept.
 */
import { heroForPair } from './heroPairs';
import { ITEM_CATALOG } from '../items/catalog';
import { ALL_ROSTER } from '../items/storeRoster';
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
/** The most items one fused thing can hold. */
export const MAX_FUSION_PARTS = 4;
/**
 * The signature tier (round 43): a named pair is the best fusion there is.
 * When one is formed it hits half again as hard and attacks a fifth faster
 * than the plain rule would make it (once; fusing more onto it builds on the
 * boosted stats), and anything holding one has room for a fifth part.
 * Playtest 2026-09-30: at +1 damage, 0 of 8 recipe hints were followed.
 */
export const SIGNATURE_DAMAGE_SCALE = 1.5;
export const SIGNATURE_COOLDOWN_SCALE = 0.8;
export const SIGNATURE_MAX_PARTS = 5;
/** What each item past the second adds to a fusion's fee. */
export const HYBRID_FEE_PER_EXTRA_PART = 3;

/** The fee for a fusion that ends up holding `parts` items. */
export function hybridFee(parts: number, clean: boolean): number {
  return HYBRID_BASE_FEE + Math.max(0, parts - 2) * HYBRID_FEE_PER_EXTRA_PART - (clean ? HYBRID_CLEAN_DISCOUNT : 0);
}
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

function wrapPart(id: string): string {
  return id.startsWith(HYBRID_PREFIX) ? `(${id})` : id;
}

export function hybridDefinitionId(baseId: string, ingredientId: string): string {
  return `${HYBRID_PREFIX}${wrapPart(baseId)}__${wrapPart(ingredientId)}`;
}

/** Reads one part at `start`: a bracketed hybrid or a plain id up to the next `__`. */
function readPart(body: string, start: number): { id: string; end: number } | null {
  if (body[start] === '(') {
    let depth = 0;
    for (let index = start; index < body.length; index += 1) {
      if (body[index] === '(') depth += 1;
      else if (body[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          const id = body.slice(start + 1, index);
          return id.startsWith(HYBRID_PREFIX) ? { id, end: index + 1 } : null;
        }
      }
    }
    return null;
  }
  const next = body.indexOf('__', start);
  const end = next === -1 ? body.length : next;
  const id = body.slice(start, end);
  return id.length > 0 && !id.includes('(') && !id.includes(')') ? { id, end } : null;
}

export function hybridParts(id: string): { baseId: string; ingredientId: string } | null {
  if (!id.startsWith(HYBRID_PREFIX)) return null;
  const body = id.slice(HYBRID_PREFIX.length);
  const base = readPart(body, 0);
  if (!base || body.slice(base.end, base.end + 2) !== '__') return null;
  const ingredient = readPart(body, base.end + 2);
  if (!ingredient || ingredient.end !== body.length) return null;
  return { baseId: base.id, ingredientId: ingredient.id };
}

/** How many catalog items an id stands for: 1 for an item, 2-4 for a hybrid. */
export function hybridPartCount(id: string): number {
  const parts = hybridParts(id);
  return parts ? hybridPartCount(parts.baseId) + hybridPartCount(parts.ingredientId) : 1;
}

/** The catalog item at the root of an id: the item every base chain started from. */
export function rootItemId(id: string): string {
  const parts = hybridParts(id);
  return parts ? rootItemId(parts.baseId) : id;
}

/** Named combinations: the fusions worth discovering. Order does not matter. */
const AUTHORED_SIGNATURES: Readonly<Record<string, string>> = {
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
  // Round 32: the store roster's named combinations.
  'aluminum_bat+tennis_ball_launcher': 'Home Run Derby',
  'dodgeball+slingshot': 'Dodge This',
  'car_battery+electric_guitar': 'Power Chord',
  'boombox+electric_guitar': 'Wall of Sound',
  'nail_gun+pipe_wrench': "Plumber's Revenge",
  'laser_pointer+plasma_globe': 'Laser Light Show',
  'pizza_cutter+pizza_peel': 'Pizza Party',
  'pump_soaker+super_soaker_50': 'Super Soaker 100',
  'walkman+yo_yo': 'Walk the Dog',
  'boombox+drumsticks': 'Drum Solo',
  'bubble_bath+leaf_blower': 'Bubble Storm',
  'duct_tape+janitor_mop': 'MacGyver Mop',
  'dodgeball+golf_club': 'Fore!',
  'boombox+mic_stand': 'Feedback Loop',
  'foam_ball_blaster+pog_slammer': 'Slammer Jammer',
  'cheese_pump+dough_roller': 'Deep Dish',
  'mixtape+record_toss': 'Greatest Hits',
  'hockey_stick+slime_tub': 'Slime Time',
  'garden_hose+jumper_cables': 'Live Hose',
  'foam_sword+keytar': 'Rock Opera',
  'popcorn_bucket+vhs_tape': 'Movie Night',
  'fog_machine+super_soaker_50': 'Smoke Show',
  'claw_hammer+nail_gun': 'Handyman Special',
  'soda_gun+slushie_cup': 'Free Refills',
  // Round 48: at least three pairs every store can shelve, so its hint changes night to night.
  'ketchup_bottle+water_balloons': 'Food Fight',
  'claw_hammer+duct_tape': 'Weekend Project',
  'party_popper+slushie_cup': 'Sugar Rush',
  'bubble_bath+pump_soaker': 'Bubble Gun',
  'foam_ball_blaster+paint_marker': 'Paintball',
  'bottle_rocket_pack+extension_cord': 'Short Fuse',
  'anti_static_strap+plasma_globe': 'Ground Control',
  'fire_extinguisher+needle_nozzle': 'Ice Pick',
  'football+lacrosse_stick': 'Trick Play',
  'slinky+yo_yo': 'Spring Break',
  'super_soaker_50+water_balloons': 'Water War',
  'boombox+walkman': 'Dual Deck',
  'nine_volt_pack+tesla_coil_kit': 'Lick Test',
  'electric_guitar+mic_stand': 'Encore',
  'cd_shuriken+fog_machine': 'Smoke and Mirrors',
  'cardboard_standee+late_fee_stamp': 'Overdue Notice',
  'laserdisc+rewind_button': "Director's Cut",
  // Round 50: the district stores, three or more each.
  'gumball_launcher+taffy_puller': 'Chewing Gum Gatling',
  'candy_cane+jawbreaker': 'Candy Crusher',
  'party_popper+pop_rocks': 'Pop Pop Pop',
  'jawbreaker+slime_tub': 'Gobstopper Goo',
  'joy_buzzer+lava_lamp': 'Lava Shock',
  'rubber_chicken+whoopee_cushion': 'Comedy Hour',
  'lava_lamp+plasma_globe': 'Mood Lighting',
  'silly_string+slinky': 'Party Tangle',
  'flash_camera+soft_focus_lens': 'Glamour Shot',
  'camcorder+tripod': 'Home Video',
  'flash_camera+photo_backdrop': 'Say Cheese',
  'laser_pointer+photo_backdrop': 'Senior Portrait',
  'blow_dryer+hairspray': 'Big Hair Day',
  'curling_iron+styling_gel': 'Perm Wave',
  'hairspray+salon_scissors': 'Feathered Cut',
  'blow_dryer+bubble_bath': 'Bubble Blowout',
  'catnip+laser_pointer': 'Red Dot Frenzy',
  'dog_leash+squeaky_toy': 'Fetch',
  'fish_net+flea_spray': 'Flea Circus',
  'garden_hose+watering_can': 'Sprinkler System',
  'fertilizer+hedge_trimmer': 'Topiary',
  'garden_gnome+seed_spreader': 'Gnome Invasion',
  'leaf_blower+seed_spreader': 'Dandelion Storm',
  'hockey_puck+hockey_stick': 'Slap Shot',
  'figure_skate+ice_pack': 'Triple Axel',
  'figure_skate+skate_lace': 'Laced Blades',
  'cocoa_thermos+marshmallow_shooter': 'Hot Cocoa',
  'cocoa_thermos+slushie_cup': 'Hot and Cold',
  'marshmallow_shooter+whipped_cream': "S'mores",
  // Round 55: the floor-exclusive stores' third pairs.
  'mixtape+walkman': 'Road Trip',
  'duct_tape+staple_gun': 'Bound Edition',
  'gel_pens+staple_gun': 'Paper Cut',
  'rc_blimp_remote+satellite_dish': 'Eye in the Sky',
  'car_battery+jumper_cables': 'Jump Start',
  'aluminum_bat+golf_club': 'Double Header',
};

/** Keyed by `pairKey`, so a pair authored in either order still matches. */
const SIGNATURES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(AUTHORED_SIGNATURES).map(([key, name]) => {
    const [a, b] = key.split('+') as [string, string];
    return [pairKey(a, b), name];
  }),
);

const NOUNS: Readonly<Record<string, string>> = {
  janitor_mop: 'Mop', pump_soaker: 'Soaker', party_popper: 'Popper', bottle_rocket_pack: 'Rockets',
  fire_extinguisher: 'Extinguisher', paint_marker: 'Marker', foam_ball_blaster: 'Blaster', slushie_cup: 'Slushie',
  broken_broom_handle: 'Broom', box_cutter: 'Cutter', bubble_bath: 'Bath', plasma_globe: 'Globe',
  vhs_rewinder: 'Rewinder', extension_cord: 'Cord', gel_pens: 'Pens', wide_nozzle: 'Nozzle',
  receipt_wallet: 'Wallet', fanny_pack: 'Fanny Pack', grease_gun: 'Grease Gun', anti_static_strap: 'Strap',
  car_battery: 'Battery', needle_nozzle: 'Needle', heavy_duty_spring: 'Spring',
  ...Object.fromEntries(ALL_ROSTER.map((entry) => [entry.definition.id, entry.noun])),
};

const ADJECTIVES: Readonly<Record<string, string>> = {
  janitor_mop: 'Mopping', pump_soaker: 'Soaking', party_popper: 'Confetti', bottle_rocket_pack: 'Rocket',
  fire_extinguisher: 'Foaming', paint_marker: 'Painted', foam_ball_blaster: 'Foam', slushie_cup: 'Slushy',
  broken_broom_handle: 'Broom', box_cutter: 'Bladed', bubble_bath: 'Bubbly', plasma_globe: 'Shocking',
  vhs_rewinder: 'Rewinding', extension_cord: 'Wired', gel_pens: 'Sticky', wide_nozzle: 'Wide-Bore',
  receipt_wallet: 'Discount', fanny_pack: 'Smuggling', grease_gun: 'Greasy', anti_static_strap: 'Grounded',
  car_battery: 'Supercharged', needle_nozzle: 'Needle', heavy_duty_spring: 'Spring-Loaded',
  ...Object.fromEntries(ALL_ROSTER.map((entry) => [entry.definition.id, entry.adjective])),
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

export function isSignatureFusion(baseId: string, ingredientId: string): boolean {
  return pairKey(baseId, ingredientId) in SIGNATURES;
}

/** Whether a fused id holds a signature pair anywhere inside it. */
export function containsSignature(id: string): boolean {
  const parts = hybridParts(id);
  return parts !== null && (isSignatureFusion(parts.baseId, parts.ingredientId) || containsSignature(parts.baseId) || containsSignature(parts.ingredientId));
}

/** The most items fusing these two could hold: one more when a signature is in it. */
export function maxPartsFor(baseId: string, ingredientId: string): number {
  return isSignatureFusion(baseId, ingredientId) || containsSignature(baseId) || containsSignature(ingredientId)
    ? SIGNATURE_MAX_PARTS
    : MAX_FUSION_PARTS;
}

const MARKS = ['', '', '', 'MK III', 'MK IV', 'MK V'];

function adjectiveFor(id: string): string {
  return ADJECTIVES[rootItemId(id)] ?? 'Fused';
}

function hybridName(base: ItemDefinition, ingredient: ItemDefinition): string {
  const signature = SIGNATURES[pairKey(base.id, ingredient.id)];
  if (signature) return signature;
  const parts = hybridPartCount(base.id) + hybridPartCount(ingredient.id);
  if (parts <= 2) return `${adjectiveFor(ingredient.id)} ${NOUNS[base.id] ?? base.name}`;
  // Deeper: stack one adjective on the base's own name while it still fits.
  const stacked = `${adjectiveFor(ingredient.id)} ${base.name}`;
  if (stacked.length <= 22) return stacked;
  return `${adjectiveFor(ingredient.id)} ${NOUNS[rootItemId(base.id)] ?? 'Thing'} ${MARKS[parts] ?? ''}`.trim();
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

/** Everything but the shot a definition already does, now owned by the new hybrid. */
function carried(definition: ItemDefinition, id: string): ItemEffectSpec[] {
  return definition.effects
    .filter((effect) => effect.kind !== 'projectile_payload')
    .map((effect) => ({ ...effect, sourceItemId: id }));
}

/** One shot out of two parts that may each already fire one. */
function combinedPayload(a: ProjectilePayloadEffect | null, b: ProjectilePayloadEffect | null, id: string, bonus: number): ProjectilePayloadEffect | null {
  if (a && b) {
    const merged = mergedPayload(a, b, id);
    return { ...merged, damage: merged.damage + bonus };
  }
  const only = a ?? b;
  return only ? ownPayload(only, id, bonus) : null;
}

/** A named pair, raised to the signature tier: every hit harder, every attack sooner. */
function signatureTier(definition: ItemDefinition): ItemDefinition {
  const harder = (damage: number) => Math.ceil(damage * SIGNATURE_DAMAGE_SCALE);
  return {
    ...definition,
    ...(definition.base ? { base: { ...definition.base, damage: harder(definition.base.damage), cooldownTicks: Math.max(8, Math.round(definition.base.cooldownTicks * SIGNATURE_COOLDOWN_SCALE)) } } : {}),
    effects: definition.effects.map((effect) => (effect.kind === 'projectile_payload' ? { ...effect, damage: harder(effect.damage) } : effect)),
  };
}

function build(base: ItemDefinition, ingredient: ItemDefinition): ItemDefinition {
  const plain = buildPlain(base, ingredient);
  return isSignatureFusion(base.id, ingredient.id) ? signatureTier(plain) : plain;
}

function buildPlain(base: ItemDefinition, ingredient: ItemDefinition): ItemDefinition {
  const id = hybridDefinitionId(base.id, ingredient.id);
  const name = hybridName(base, ingredient);
  const roles = [fusionRole(base), fusionRole(ingredient)] as const;
  // The signature bonus is the tier applied in `build`, not a flat +1 here.
  const signature = 0;
  const summary = summaryFor(base, ingredient);
  const [baseRole, ingredientRole] = roles;
  // A base that was already fused keeps what it did (round 32).
  const kept = carried(base, id);

  if (baseRole === 'ranged' && ingredientRole === 'ranged') {
    const payload = mergedPayload(payloadOf(base)!, payloadOf(ingredient)!, id);
    const withSignature = { ...payload, damage: payload.damage + signature };
    return {
      id, name, summary,
      base: { ...base.base!, damage: withSignature.damage, speed: withSignature.speed, cooldownTicks: Math.round(((base.base!.cooldownTicks + ingredient.base!.cooldownTicks) / 2) * 0.9) },
      effects: [withSignature, ...kept, ...carried(ingredient, id)],
    };
  }
  if (baseRole === 'melee' && ingredientRole === 'melee') {
    const a = base.base!;
    const b = ingredient.base!;
    const shot = combinedPayload(payloadOf(base), payloadOf(ingredient), id, 0);
    return {
      id, name, summary,
      base: {
        ...a,
        damage: Math.max(a.damage, b.damage) + Math.ceil(Math.min(a.damage, b.damage) / 2) + signature,
        range: Math.max(a.range, b.range),
        halfAngleRadians: Math.max(a.halfAngleRadians, b.halfAngleRadians),
        cooldownTicks: Math.round((a.cooldownTicks + b.cooldownTicks) / 2),
      },
      effects: [...(shot ? [shot] : []), ...kept, ...carried(ingredient, id)],
    };
  }
  if (baseRole === 'melee' && ingredientRole === 'ranged') {
    const shot = combinedPayload(payloadOf(base), payloadOf(ingredient), id, signature)!;
    return {
      id, name, summary,
      base: { ...base.base!, damage: base.base!.damage + 1 + signature, cooldownTicks: base.base!.cooldownTicks + 6 },
      effects: [shot, ...kept, ...carried(ingredient, id).map((effect) => overclock(effect, id))],
    };
  }
  if (baseRole === 'melee') {
    const { attack, effects } = meleeWithModifier(base.base!, ingredient, id);
    const own = payloadOf(base);
    // A second swing bubble would only double up on the one the base fires.
    const added = own ? effects.filter((effect) => effect.kind !== 'projectile_payload') : effects;
    return {
      id, name, summary,
      base: { ...attack, damage: attack.damage + signature },
      effects: [...(own ? [ownPayload(own, id, 0)] : []), ...kept, ...added],
    };
  }
  if (baseRole === 'ranged') {
    const shot = ownPayload(payloadOf(base)!, id, 1 + signature);
    return {
      id, name, summary,
      base: { ...base.base!, damage: shot.damage },
      effects: [shot, ...kept, ...ingredient.effects.map((effect) => overclock(effect, id))],
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

/** Any item or hybrid id's definition, or undefined when it is not a legal thing to own. */
export function fusedDefinitionFor(id: string): ItemDefinition | undefined {
  const authored = DEFINITIONS.get(id);
  if (authored) return authored;
  const parts = hybridParts(id);
  if (!parts || !isHybridPair(parts.baseId, parts.ingredientId)) return undefined;
  return hybridDefinition(parts.baseId, parts.ingredientId);
}

/** The derived definition for a base and an ingredient (throws on an impossible pair). */
export function hybridDefinition(baseId: string, ingredientId: string): ItemDefinition {
  const id = hybridDefinitionId(baseId, ingredientId);
  const cached = CACHE.get(id);
  if (cached) return cached;
  if (!isHybridPair(baseId, ingredientId)) throw new Error(`"${baseId}" + "${ingredientId}" is not a hybrid in that order.`);
  const definition = freezeDeep(build(fusedDefinitionFor(baseId)!, fusedDefinitionFor(ingredientId)!));
  CACHE.set(id, definition);
  return definition;
}

/** True when the pair, in this order, is a legal hybrid of at most `maxPartsFor` items. */
export function isHybridPair(baseId: string, ingredientId: string): boolean {
  if (baseId === ingredientId) return false;
  if (hybridPartCount(baseId) + hybridPartCount(ingredientId) > maxPartsFor(baseId, ingredientId)) return false;
  const base = fusedDefinitionFor(baseId);
  const ingredient = fusedDefinitionFor(ingredientId);
  if (!base || !ingredient) return false;
  const pair = fusionPairFor(base, ingredient);
  return pair.recipe === 'hybrid' && pair.baseId === baseId;
}

/** Plain-words lines for the Bench Warrant card: what the hybrid does. */
export function hybridHighlights(baseId: string, ingredientId: string): string[] {
  const definition = hybridDefinition(baseId, ingredientId);
  const base = fusedDefinitionFor(baseId)!;
  const ingredient = fusedDefinitionFor(ingredientId)!;
  const roles = [fusionRole(base), fusionRole(ingredient)];
  const lines: string[] = [];
  const payload = definition.effects.find((effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload');
  if (roles[0] === 'ranged' && roles[1] === 'ranged' && payload) lines.push(`ONE ${payload.angularOffsetsRadians.length}-PRONG VOLLEY, ${payload.damage} DAMAGE EACH`);
  else if (roles[0] === 'melee' && roles[1] === 'melee') lines.push(`ONE HEAVY SWING, ${definition.base!.damage} DAMAGE`);
  else if (roles[0] === 'melee' && payload) lines.push(`EVERY SWING ALSO FIRES ${payload.payloadKind === 'water' ? 'WATER' : 'A SHOT'}`);
  else if (definition.base) lines.push(`${definition.base.damage} DAMAGE PER HIT (${isSignatureFusion(baseId, ingredientId) ? 'SIGNATURE' : '+1 FUSED'})`);
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
  const parts = hybridPartCount(baseId) + hybridPartCount(ingredientId);
  const limit = maxPartsFor(baseId, ingredientId);
  if (parts > 2) lines.unshift(`${parts}-ITEM FUSION${parts === limit ? ' (THE LIMIT)' : ''}`);
  if (isSignatureFusion(baseId, ingredientId)) lines.unshift('SIGNATURE: +50% DAMAGE, 20% FASTER, ROOM FOR A 5TH PART');
  const hero = heroForPair(baseId, ingredientId);
  if (hero) lines.unshift(`HERO: ${hero.line}`);
  return lines.slice(0, 5);
}

/** A short tile label: the item's one-word noun, or a hybrid's own name. */
export function shortItemName(id: string): string {
  const parts = hybridParts(id);
  if (parts) return fusedDefinitionFor(id)?.name ?? id;
  return NOUNS[id] ?? DEFINITIONS.get(id)?.name ?? id;
}

/** A named pair's signature name, in either order, or null. */
export function signatureName(a: string, b: string): string | null {
  return SIGNATURES[pairKey(a, b)] ?? null;
}

/** Every named combination, for the Break Room's fusion log. */
export function signatureFusions(): Array<{ readonly name: string; readonly itemIds: readonly [string, string] }> {
  return Object.entries(SIGNATURES).map(([key, name]) => {
    const [a, b] = key.split('+') as [string, string];
    return { name, itemIds: [a, b] as const };
  });
}
