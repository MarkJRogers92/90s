import type { EnemyKind } from '../sim/model';
import type { WingDecalKind, WingFixtureKind } from '../sim/wing/types';

export const BENCH_WARRANT_KIOSK_TEXTURE = 'bench-warrant-kiosk';
export const BENCH_WARRANT_KIOSK_URL = '/assets/props/bench-warrant-kiosk.png';

/**
 * Facing order for the Alex sheets. This is the row order of `alex-walk.png`
 * and the frame order of `alex-idle.png`, so the two must stay in step with
 * whatever regenerates those PNGs.
 */
export const ALEX_DIRECTIONS = [
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
  'east',
  'south-east',
] as const;

export type AlexDirection = (typeof ALEX_DIRECTIONS)[number];

/**
 * World art for a carried item, keyed by item definition id. An item with no
 * entry keeps the vector marker, so this table can grow one item at a time
 * rather than needing every item drawn before any of them ship.
 *
 * Every catalog item now has an entry except `rc_car`, which is not a 32x32
 * pickup: the car is drawn from its own 8-frame spritesheet as a run entity, so
 * it lives in `RC_CAR_TEXTURE` below instead.
 */
export const ITEM_ART: Record<string, FixtureArt> = {
  janitor_mop: {
    texture: 'item-mop',
    url: '/assets/items/mop.png',
    width: 32,
    height: 32,
  },
  box_cutter: {
    texture: 'item-box-cutter',
    url: '/assets/items/box-cutter.png',
    width: 32,
    height: 32,
  },
  pump_soaker: {
    texture: 'item-pump-soaker',
    url: '/assets/items/pump-soaker.png',
    width: 32,
    height: 32,
  },
  slushie_cup: {
    texture: 'item-slushie-cup',
    url: '/assets/items/slushie-cup.png',
    width: 32,
    height: 32,
  },
  fire_extinguisher: {
    texture: 'item-fire-extinguisher',
    url: '/assets/items/fire-extinguisher.png',
    width: 32,
    height: 32,
  },
  fanny_pack: {
    texture: 'item-fanny-pack',
    url: '/assets/items/fanny-pack.png',
    width: 32,
    height: 32,
  },
  bubble_bath: {
    texture: 'item-bubble-bath',
    url: '/assets/items/bubble-bath.png',
    width: 32,
    height: 32,
  },
  plasma_globe: {
    texture: 'item-plasma-globe',
    url: '/assets/items/plasma-globe.png',
    width: 32,
    height: 32,
  },
  vhs_rewinder: {
    texture: 'item-vhs-rewinder',
    url: '/assets/items/vhs-rewinder.png',
    width: 32,
    height: 32,
  },
  extension_cord: {
    texture: 'item-extension-cord',
    url: '/assets/items/extension-cord.png',
    width: 32,
    height: 32,
  },
  gel_pens: {
    texture: 'item-gel-pens',
    url: '/assets/items/gel-pens.png',
    width: 32,
    height: 32,
  },
  wide_nozzle: {
    texture: 'item-wide-nozzle',
    url: '/assets/items/wide-nozzle.png',
    width: 32,
    height: 32,
  },
  receipt_wallet: {
    texture: 'item-receipt-wallet',
    url: '/assets/items/receipt-wallet.png',
    width: 32,
    height: 32,
  },
  party_popper: {
    texture: 'item-party-popper',
    url: '/assets/items/party-popper.png',
    width: 32,
    height: 32,
  },
  bottle_rocket_pack: {
    texture: 'item-bottle-rocket-pack',
    url: '/assets/items/bottle-rocket-pack.png',
    width: 32,
    height: 32,
  },
  paint_marker: {
    texture: 'item-paint-marker',
    url: '/assets/items/paint-marker.png',
    width: 32,
    height: 32,
  },
  foam_ball_blaster: {
    texture: 'item-foam-ball-blaster',
    url: '/assets/items/foam-ball-blaster.png',
    width: 32,
    height: 32,
  },
  broken_broom_handle: {
    texture: 'item-broken-broom-handle',
    url: '/assets/items/broken-broom-handle.png',
    width: 32,
    height: 32,
  },
  car_battery: {
    texture: 'item-car-battery',
    url: '/assets/items/car-battery.png',
    width: 32,
    height: 32,
  },
  heavy_duty_spring: {
    texture: 'item-heavy-duty-spring',
    url: '/assets/items/heavy-duty-spring.png',
    width: 32,
    height: 32,
  },
  grease_gun: {
    texture: 'item-grease-gun',
    url: '/assets/items/grease-gun.png',
    width: 32,
    height: 32,
  },
  anti_static_strap: {
    texture: 'item-anti-static-strap',
    url: '/assets/items/anti-static-strap.png',
    width: 32,
    height: 32,
  },
  needle_nozzle: {
    texture: 'item-needle-nozzle',
    url: '/assets/items/needle-nozzle.png',
    width: 32,
    height: 32,
  },
};

/** Authored size of one effect frame, in pixels. */
export const EFFECT_FRAME_SIZE = 32;
/** Frames in every effect strip. */
export const EFFECT_FRAMES = 4;

export type EffectArt = {
  readonly texture: string;
  readonly url: string;
  /** Sim ticks each frame is held. The strips were authored at 40-70 ms/frame. */
  readonly frameTicks: number;
};

/** 60 sim ticks per second, matching the fixed step. */
const TICKS_PER_SECOND = 60;

function effectArt(name: string, msPerFrame: number): EffectArt {
  return {
    texture: `fx-${name}`,
    url: `/assets/fx/${name}.png`,
    // ms -> ticks: ms / (1000 / TICKS_PER_SECOND).
    frameTicks: Math.max(1, Math.round((msPerFrame / 1000) * TICKS_PER_SECOND)),
  };
}

/**
 * Combat effect strips, four 32x32 frames laid out left to right.
 *
 * Only the cues the run can currently detect are listed. Fifteen strips are
 * authored on disk; the rest (fire, smoke, glass, electric shock, and so on)
 * describe events the simulation does not yet publish, and loading art no cue
 * can reach would just be dead weight. Add an entry when its event exists.
 *
 * Playback is driven from the run tick rather than a wall-clock timer, so an
 * effect's lifetime is reproducible from the same state a test reads.
 */
export const EFFECT_ART = {
  'melee-swing': effectArt('melee-swing', 50),
  'muzzle-flash': effectArt('muzzle-flash', 45),
  'blood-hit': effectArt('blood-hit', 60),
  'blunt-impact': effectArt('blunt-impact', 55),
  'bullet-impact': effectArt('bullet-impact', 45),
  'electric-shock': effectArt('electric-shock', 50),
  debris: effectArt('debris', 60),
} as const satisfies Record<string, EffectArt>;

export type EffectName = keyof typeof EFFECT_ART;

export const RC_CAR_TEXTURE = 'rc-car';
export const RC_CAR_URL = '/assets/props/rc-car.png';
export const RC_CAR_FRAME_SIZE = 24;

export type FixtureArt = {
  readonly texture: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
};

/**
 * One sprite per fixture kind. These are props, not characters: each is drawn
 * base-anchored, so the sprite's bottom edge sits on the fixture's world
 * position. Sizes are the authored canvases and are what the runtime validator
 * checks, so a mismatch here shows up as a prop drawn at the wrong scale.
 */
export const FIXTURE_ART: Record<WingFixtureKind, FixtureArt> = {
  'mall-bench': {
    texture: 'mall-bench',
    url: '/assets/props/mall-bench.png',
    width: 32,
    height: 24,
  },
  'vending-machine': {
    texture: 'vending-machine',
    url: '/assets/props/vending-machine.png',
    width: 24,
    height: 40,
  },
  'store-gondola': {
    texture: 'store-gondola',
    url: '/assets/props/store-gondola.png',
    width: 32,
    height: 40,
  },
};

/** Frame index for a facing; the car sheet shares the player's facing order. */
export function rcCarFrame(direction: AlexDirection): number {
  return ALEX_DIRECTIONS.indexOf(direction);
}

/** Authored size of a decal, in pixels. Every decal is authored square. */
export const DECAL_FRAME_SIZE = 32;

function decalArt(name: WingDecalKind): FixtureArt {
  return {
    texture: `decal-${name}`,
    url: `/assets/decals/${name}.png`,
    width: DECAL_FRAME_SIZE,
    height: DECAL_FRAME_SIZE,
  };
}

/**
 * Floor decals, keyed by kind.
 *
 * Carries width and height like the other art tables: the placement tests derive
 * a decal's footprint from here, so a size that disagreed with the PNG would let
 * an overlapping decal pass. Decals are drawn CENTRED on their author position,
 * because one lies flat on the floor rather than standing on a base.
 */
export const DECAL_ART: Record<WingDecalKind, FixtureArt> = {
  'blood-drops': decalArt('blood-drops'),
  'blood-pool': decalArt('blood-pool'),
  'blood-drag': decalArt('blood-drag'),
  'blood-splash': decalArt('blood-splash'),
  'blood-handprint': decalArt('blood-handprint'),
  'broken-glass': decalArt('broken-glass'),
  'cracked-tile': decalArt('cracked-tile'),
  'torn-carpet': decalArt('torn-carpet'),
  'scorch-mark': decalArt('scorch-mark'),
  'organic-residue': decalArt('organic-residue'),
};

/** Authored frame size of an enemy idle sheet, in pixels. */
export const ENEMY_FRAME_SIZE = 48;

/**
 * One idle sheet per enemy kind.
 *
 * Eight frames laid out in `ALEX_DIRECTIONS` order, which is the same order the
 * player sheets use — so `alexIdleFrame` indexes an enemy sheet exactly as it
 * indexes the player's, and one direction helper serves both. A sheet's frames
 * are 48x48 and drawn base-anchored like every other upright sprite.
 */
export const ENEMY_ART: Record<EnemyKind, { readonly texture: string; readonly url: string }> = {
  hanger: { texture: 'enemy-hanger', url: '/assets/enemies/hanger-idle.png' },
  spitter: { texture: 'enemy-spitter', url: '/assets/enemies/spitter-idle.png' },
  lp_manager: { texture: 'enemy-lp-manager', url: '/assets/enemies/lp-manager-idle.png' },
};

export const ALEX_IDLE_TEXTURE = 'alex-idle';
export const ALEX_IDLE_URL = '/assets/characters/alex-idle.png';
export const ALEX_WALK_TEXTURE = 'alex-walk';
export const ALEX_WALK_URL = '/assets/characters/alex-walk.png';
export const ALEX_FRAME_WIDTH = 32;
export const ALEX_FRAME_HEIGHT = 48;
/** Frames per direction in the walk sheet. */
export const ALEX_WALK_FRAMES = 6;

/**
 * Frames the walk sheet laid out in increasing screen-angle order. `atan2`
 * gives 0 at east and grows clockwise on screen because y points down, so
 * rounding the angle to 45-degree buckets and indexing this ring is an
 * exact 8-way lookup with no trigonometry per frame.
 */
const ANGLE_RING = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const;

/** Which way an upright sprite should face for a world-space movement vector. */
export function alexDirectionFor(x: number, y: number): AlexDirection {
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  // The ring is a tuple, so the literal index type proves the lookup is defined
  // and no `?? fallback` is needed to satisfy the compiler.
  const bucket = (Math.round((((degrees % 360) + 360) % 360) / 45) % 8) as
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  return ANGLE_RING[bucket];
}

/** Idle frame index (one frame per direction) for a facing. */
export function alexIdleFrame(direction: AlexDirection): number {
  return ALEX_DIRECTIONS.indexOf(direction);
}

/** Walk frame index for a facing and step, wrapping over the sheet's row. */
export function alexWalkFrame(direction: AlexDirection, step: number): number {
  const row = ALEX_DIRECTIONS.indexOf(direction);
  const column = ((step % ALEX_WALK_FRAMES) + ALEX_WALK_FRAMES) % ALEX_WALK_FRAMES;
  return row * ALEX_WALK_FRAMES + column;
}
