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
  damage: 2,
  speed: 3.2,
  radius: 6,
  lifetimeTicks: 80,
  onHit: { status: 'wet', ticks: WET_TICKS },
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

/**
 * The eight M2 items. Immutable definitions only: runtime behavior comes from
 * the compiled effect kinds, never from these IDs.
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
]);
