import {
  MOP_COOLDOWN_TICKS,
  MOP_DAMAGE,
  MOP_HALF_ANGLE_RADIANS,
  MOP_RANGE,
} from '../combat/attack';
import type {
  ItemDefinition,
  ProjectileConversionEffect,
  ProjectileGeometryEffect,
  ProjectilePayloadEffect,
  StatusModifierEffect,
  ConductiveRangeEffect,
  ConductiveReactionEffect,
  TrajectoryReplayEffect,
} from './types';
import { freezeDeep } from './types';

/** Wet and Sticky durations are authored content, identical for every source. */
export const WET_TICKS = 180;
export const STICKY_TICKS = 90;
export const STICKY_SLOW_MULTIPLIER = 0.65;
export const STICKY_SLOW_FLOOR = 0.5;

/** Conductive reach without and with the Extension Cord. */
export const CONDUCTIVE_BASE_RANGE = 150;
export const CONDUCTIVE_CORD_RANGE = 220;
export const CONDUCTIVE_CHAIN_MAX_ADDITIONAL_TARGETS = 3;

const soakerPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'pump_soaker',
  label: 'water projectile (Wet 180 ticks on hit)',
  payloadKind: 'water',
  angularOffsetsRadians: [0],
  damage: 2,
  speed: 3.2,
  radius: 6,
  lifetimeTicks: 80,
  onHit: { status: 'wet', ticks: WET_TICKS },
};

const DEGREES_TO_RADIANS = Math.PI / 180;

const popperPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'party_popper',
  label: 'physical burst (three prongs, no status)',
  payloadKind: 'physical',
  angularOffsetsRadians: [-8 * DEGREES_TO_RADIANS, 0, 8 * DEGREES_TO_RADIANS],
  damage: 2,
  speed: 4.2,
  radius: 4,
  lifetimeTicks: 55,
  onHit: null,
};

const bubbleConversion: ProjectileConversionEffect = {
  kind: 'projectile_conversion',
  stage: 'conversion',
  priority: 0,
  sourceItemId: 'bubble_bath',
  label: 'bubbles (penetrating drift, one radius-48 Wet patch for 180 ticks)',
  converts: 'water_projectile',
  result: 'drifting_bubble',
  speed: 2.5,
  minRadius: 10,
  lifetimeTicks: 90,
  penetrates: true,
  recordsHitPerPass: true,
  terminalWetPatch: { radius: 48, ticks: WET_TICKS },
};

const gelPenSticky: StatusModifierEffect = {
  kind: 'status_modifier',
  stage: 'status',
  priority: 0,
  sourceItemId: 'gel_pens',
  label: 'Sticky 90 ticks at 0.65 movement (0.5 floor)',
  status: 'sticky',
  ticks: STICKY_TICKS,
  slowMultiplier: STICKY_SLOW_MULTIPLIER,
  slowFloor: STICKY_SLOW_FLOOR,
};

const globeChain: ConductiveReactionEffect = {
  kind: 'conductive_reaction',
  stage: 'reaction',
  priority: 0,
  sourceItemId: 'plasma_globe',
  label: 'conductive chain (one start per root, three additional Wet targets)',
  chainStartsPerRoot: 1,
  maxAdditionalTargets: CONDUCTIVE_CHAIN_MAX_ADDITIONAL_TARGETS,
  baseRange: CONDUCTIVE_BASE_RANGE,
  visitsEachTargetOnce: true,
};

const cordRange: ConductiveRangeEffect = {
  kind: 'conductive_range',
  stage: 'reaction',
  priority: 1,
  sourceItemId: 'extension_cord',
  label: 'conductive range 220 (weak discharge without a globe)',
  range: CONDUCTIVE_CORD_RANGE,
  weakDischarge: true,
};

const rewinderReplay: TrajectoryReplayEffect = {
  kind: 'trajectory_replay',
  stage: 'trajectory',
  priority: 0,
  sourceItemId: 'vhs_rewinder',
  label: 'one return pass (activates once per root)',
  returnPasses: 1,
  activatesOncePerRoot: true,
};

const nozzleGeometry: ProjectileGeometryEffect = {
  kind: 'projectile_geometry',
  stage: 'geometry',
  priority: 0,
  sourceItemId: 'wide_nozzle',
  label: 'radius +4 and speed x0.8 for projectile deliveries',
  radiusBonus: 4,
  speedMultiplier: 0.8,
};

const bottleRocketPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'bottle_rocket_pack',
  label: 'physical projectile (two prongs, no status)',
  payloadKind: 'physical',
  angularOffsetsRadians: [-8 * DEGREES_TO_RADIANS, 8 * DEGREES_TO_RADIANS],
  damage: 3,
  speed: 5.0,
  radius: 3,
  lifetimeTicks: 45,
  onHit: null,
};

const extinguisherPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'fire_extinguisher',
  label: 'water projectile (Wet 240 ticks on hit)',
  payloadKind: 'water',
  angularOffsetsRadians: [0],
  damage: 1,
  speed: 2.6,
  radius: 10,
  lifetimeTicks: 70,
  onHit: { status: 'wet', ticks: 240 },
};

const paintMarkerPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'paint_marker',
  label: 'physical projectile (single shot, no status)',
  payloadKind: 'physical',
  angularOffsetsRadians: [0],
  damage: 2,
  speed: 6.0,
  radius: 3,
  lifetimeTicks: 40,
  onHit: null,
};

const foamPayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'foam_ball_blaster',
  label: 'physical burst (three prongs, no status)',
  payloadKind: 'physical',
  angularOffsetsRadians: [-14 * DEGREES_TO_RADIANS, 0, 14 * DEGREES_TO_RADIANS],
  damage: 1,
  speed: 5.5,
  radius: 3,
  lifetimeTicks: 45,
  onHit: null,
};

const slushiePayload: ProjectilePayloadEffect = {
  kind: 'projectile_payload',
  stage: 'projectile',
  priority: 0,
  sourceItemId: 'slushie_cup',
  label: 'water projectile (Wet 120 ticks on hit)',
  payloadKind: 'water',
  angularOffsetsRadians: [0],
  damage: 2,
  speed: 3.6,
  radius: 5,
  lifetimeTicks: 60,
  onHit: { status: 'wet', ticks: 120 },
};

const greaseSticky: StatusModifierEffect = {
  kind: 'status_modifier',
  stage: 'status',
  priority: 0,
  sourceItemId: 'grease_gun',
  label: 'Sticky 150 ticks at 0.45 movement (0.4 floor)',
  status: 'sticky',
  ticks: 150,
  slowMultiplier: 0.45,
  slowFloor: 0.4,
};

const strapChain: ConductiveReactionEffect = {
  kind: 'conductive_reaction',
  stage: 'reaction',
  priority: 0,
  sourceItemId: 'anti_static_strap',
  label: 'conductive chain (two starts per root, four additional Wet targets)',
  chainStartsPerRoot: 2,
  maxAdditionalTargets: 4,
  baseRange: 110,
  visitsEachTargetOnce: true,
};

const batteryRange: ConductiveRangeEffect = {
  kind: 'conductive_range',
  stage: 'reaction',
  priority: 1,
  sourceItemId: 'car_battery',
  label: 'conductive range 300 (no weak discharge)',
  range: 300,
  weakDischarge: false,
};

const needleGeometry: ProjectileGeometryEffect = {
  kind: 'projectile_geometry',
  stage: 'geometry',
  priority: 0,
  sourceItemId: 'needle_nozzle',
  label: 'radius -1 and speed x1.35 for projectile deliveries',
  radiusBonus: -1,
  speedMultiplier: 1.35,
};

const springGeometry: ProjectileGeometryEffect = {
  kind: 'projectile_geometry',
  stage: 'geometry',
  priority: 0,
  sourceItemId: 'heavy_duty_spring',
  label: 'radius +3 and speed x0.75 for projectile deliveries',
  radiusBonus: 3,
  speedMultiplier: 0.75,
};

/**
 * The twenty-four M5 definitions. Immutable authored data only: runtime behavior
 * comes from the compiled effect kinds, never from these IDs. M2 and M3 stay
 * frozen to the eight-item M2_M3_ITEM_CATALOG subset below, and M4 stays frozen
 * to the twelve-item M4_ITEM_CATALOG subset below.
 */
export const ITEM_CATALOG: readonly ItemDefinition[] = freezeDeep([
  {
    id: 'janitor_mop',
    name: 'Associate-Issue Mop',
    summary: 'Directional mop swing. Stays a direct attack; projectile modifiers never convert it.',
    base: {
      delivery: 'direct',
      damage: MOP_DAMAGE,
      cooldownTicks: MOP_COOLDOWN_TICKS,
      range: MOP_RANGE,
      halfAngleRadians: MOP_HALF_ANGLE_RADIANS,
      speed: 0,
    },
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'pump_soaker',
    name: 'Pump-Action Soaker',
    summary: 'Fires a water projectile that applies Wet on the first hit.',
    base: {
      delivery: 'projectile',
      damage: soakerPayload.damage,
      cooldownTicks: 24,
      range: 0,
      halfAngleRadians: 0,
      speed: soakerPayload.speed,
    },
    effects: [soakerPayload],
  } satisfies ItemDefinition,
  {
    id: 'bubble_bath',
    name: 'Bubble-Bath Concentrate',
    summary: 'Converts compatible water projectiles into penetrating drifting bubbles.',
    effects: [bubbleConversion],
  } satisfies ItemDefinition,
  {
    id: 'plasma_globe',
    name: 'Cracked Plasma Globe',
    summary: 'Starts one bounded conductive chain from an eligible Wet hit.',
    effects: [globeChain],
  } satisfies ItemDefinition,
  {
    id: 'vhs_rewinder',
    name: 'VHS Rewinder',
    summary: 'Lets one eligible surviving projectile retrace its path once.',
    effects: [rewinderReplay],
  } satisfies ItemDefinition,
  {
    id: 'extension_cord',
    name: 'Extension Cord',
    summary: 'Extends conductive reach and discharges weakly when no globe is owned.',
    effects: [cordRange],
  } satisfies ItemDefinition,
  {
    id: 'gel_pens',
    name: 'Gel Pen Pack',
    summary: 'Applies Sticky: 90 ticks at 0.65 movement speed with a 0.5 floor.',
    effects: [gelPenSticky],
  } satisfies ItemDefinition,
  {
    id: 'wide_nozzle',
    name: 'Wide-Bore Nozzle',
    summary: 'Widens and slows compatible projectiles without touching the player hitbox.',
    effects: [nozzleGeometry],
  } satisfies ItemDefinition,
  {
    id: 'receipt_wallet',
    name: 'Receipt Wallet',
    summary: 'Reduces each lawful purchase by $2 with a $1 floor. No combat effect.',
    capabilities: ['shop_discount'],
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'fanny_pack',
    name: 'Reinforced Fanny Pack',
    summary: 'Holds two concurrent unsecured thefts and cuts secured-theft Heat to 10. No combat effect.',
    capabilities: ['smuggle_pouch'],
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'rc_car',
    name: 'RC Car',
    summary: 'Remote-control car that can carry an emitter. No combat effect of its own.',
    capabilities: ['emitter_carrier'],
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'party_popper',
    name: 'Party Popper',
    summary: 'Fires a three-prong physical burst that applies no status.',
    base: {
      delivery: 'projectile',
      damage: popperPayload.damage,
      cooldownTicks: 30,
      range: 0,
      halfAngleRadians: 0,
      speed: popperPayload.speed,
    },
    effects: [popperPayload],
  } satisfies ItemDefinition,
  {
    id: 'bottle_rocket_pack',
    name: 'Bottle Rocket Pack',
    summary: 'Fires a two-prong physical burst that applies no status.',
    base: {
      delivery: 'projectile',
      damage: bottleRocketPayload.damage,
      cooldownTicks: 36,
      range: 0,
      halfAngleRadians: 0,
      speed: bottleRocketPayload.speed,
    },
    effects: [bottleRocketPayload],
  } satisfies ItemDefinition,
  {
    id: 'fire_extinguisher',
    name: 'Fire Extinguisher',
    summary: 'Fires a slow heavy water projectile that applies Wet on the first hit.',
    base: {
      delivery: 'projectile',
      damage: extinguisherPayload.damage,
      cooldownTicks: 30,
      range: 0,
      halfAngleRadians: 0,
      speed: extinguisherPayload.speed,
    },
    effects: [extinguisherPayload],
  } satisfies ItemDefinition,
  {
    id: 'paint_marker',
    name: 'Paint Marker',
    summary: 'Fires a fast light physical shot that applies no status.',
    base: {
      delivery: 'projectile',
      damage: paintMarkerPayload.damage,
      cooldownTicks: 18,
      range: 0,
      halfAngleRadians: 0,
      speed: paintMarkerPayload.speed,
    },
    effects: [paintMarkerPayload],
  } satisfies ItemDefinition,
  {
    id: 'foam_ball_blaster',
    name: 'Foam Ball Blaster',
    summary: 'Fires a three-prong physical burst that applies no status.',
    base: {
      delivery: 'projectile',
      damage: foamPayload.damage,
      cooldownTicks: 20,
      range: 0,
      halfAngleRadians: 0,
      speed: foamPayload.speed,
    },
    effects: [foamPayload],
  } satisfies ItemDefinition,
  {
    id: 'slushie_cup',
    name: 'Slushie Cup',
    summary: 'Fires a water projectile that applies Wet on the first hit.',
    base: {
      delivery: 'projectile',
      damage: slushiePayload.damage,
      cooldownTicks: 26,
      range: 0,
      halfAngleRadians: 0,
      speed: slushiePayload.speed,
    },
    effects: [slushiePayload],
  } satisfies ItemDefinition,
  {
    id: 'broken_broom_handle',
    name: 'Broken Broom Handle',
    summary: 'Long heavy direct swing. Stays a direct attack; projectile modifiers never convert it.',
    base: {
      delivery: 'direct',
      damage: 5,
      cooldownTicks: 42,
      range: 92,
      halfAngleRadians: 30 * DEGREES_TO_RADIANS,
      speed: 0,
    },
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'box_cutter',
    name: 'Box Cutter',
    summary: 'Fast short direct slash. Stays a direct attack; projectile modifiers never convert it.',
    base: {
      delivery: 'direct',
      damage: 3,
      cooldownTicks: 15,
      range: 54,
      halfAngleRadians: 25 * DEGREES_TO_RADIANS,
      speed: 0,
    },
    effects: [],
  } satisfies ItemDefinition,
  {
    id: 'grease_gun',
    name: 'Grease Gun',
    summary: 'Applies Sticky: 150 ticks at 0.45 movement speed with a 0.4 floor.',
    effects: [greaseSticky],
  } satisfies ItemDefinition,
  {
    id: 'anti_static_strap',
    name: 'Anti-Static Strap',
    summary: 'Starts two bounded conductive chains from eligible Wet hits.',
    effects: [strapChain],
  } satisfies ItemDefinition,
  {
    id: 'car_battery',
    name: 'Car Battery',
    summary: 'Extends conductive reach without discharging weakly when no globe is owned.',
    effects: [batteryRange],
  } satisfies ItemDefinition,
  {
    id: 'needle_nozzle',
    name: 'Needle Nozzle',
    summary: 'Narrows and quickens compatible projectiles without touching the player hitbox.',
    effects: [needleGeometry],
  } satisfies ItemDefinition,
  {
    id: 'heavy_duty_spring',
    name: 'Heavy-Duty Spring',
    summary: 'Widens and slows compatible projectiles without touching the player hitbox.',
    effects: [springGeometry],
  } satisfies ItemDefinition,
]);

/**
 * The frozen M2/M3 subset: the original eight definitions in catalog order.
 * The Interaction Lab and the M3 wing consume this export explicitly, so later
 * roster growth never leaks into completed modes.
 */
export const M2_M3_ITEM_CATALOG: readonly ItemDefinition[] = freezeDeep(
  ITEM_CATALOG.slice(0, 8),
);

/**
 * The frozen M4 subset: the original twelve definitions in catalog order.
 * Bench fusion consumes this export explicitly, so later roster growth never
 * leaks into the completed M4 mode.
 */
export const M4_ITEM_CATALOG: readonly ItemDefinition[] = freezeDeep(
  ITEM_CATALOG.slice(0, 12),
);

/** The full M5 roster: all twenty-four definitions in catalog order. */
export const M5_ITEM_CATALOG: readonly ItemDefinition[] = ITEM_CATALOG;
