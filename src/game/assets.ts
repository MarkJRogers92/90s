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
 *
 * The bench and the gondola were regenerated larger on 2026-09-22 (see
 * `artifacts/provenance/mall-bench.json`): their canvases are the art cropped
 * to its content, so the base row is opaque and the sprite cannot float. Note
 * that these sizes are not free -- `tests/unit/wing-fixtures.test.ts` derives
 * each fixture's footprint from them and asserts fixtures do not overlap, so
 * widening a prop can fail a placement test rather than a rendering one.
 */
export const FIXTURE_ART: Record<WingFixtureKind, FixtureArt> = {
  'mall-bench': {
    texture: 'mall-bench',
    url: '/assets/props/mall-bench.png',
    width: 56,
    height: 30,
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
    width: 30,
    height: 46,
  },
  // Concourse, wayfinding and services.
  planter: {
    texture: 'planter',
    url: '/assets/props/planter.png',
    width: 25,
    height: 25,
  },
  'potted-palm': {
    texture: 'potted-palm',
    url: '/assets/props/potted-palm.png',
    width: 38,
    height: 58,
  },
  'rubbish-bin': {
    texture: 'rubbish-bin',
    url: '/assets/props/rubbish-bin.png',
    width: 20,
    height: 25,
  },
  'mall-directory': {
    texture: 'mall-directory',
    url: '/assets/props/mall-directory.png',
    width: 17,
    height: 54,
  },
  'poster-stand': {
    texture: 'poster-stand',
    url: '/assets/props/poster-stand.png',
    width: 38,
    height: 53,
  },
  'info-kiosk': {
    texture: 'info-kiosk',
    url: '/assets/props/info-kiosk.png',
    width: 26,
    height: 34,
  },
  atm: {
    texture: 'atm',
    url: '/assets/props/atm.png',
    width: 29,
    height: 47,
  },
  payphone: {
    texture: 'payphone',
    url: '/assets/props/payphone.png',
    width: 31,
    height: 63,
  },
  'drinking-fountain': {
    texture: 'drinking-fountain',
    url: '/assets/props/drinking-fountain.png',
    width: 20,
    height: 22,
  },
  'wet-floor-sign': {
    texture: 'wet-floor-sign',
    url: '/assets/props/wet-floor-sign.png',
    width: 19,
    height: 16,
  },
  'security-turnstile': {
    texture: 'security-turnstile',
    url: '/assets/props/security-turnstile.png',
    width: 24,
    height: 29,
  },
  'kiddie-ride': {
    texture: 'kiddie-ride',
    url: '/assets/props/kiddie-ride.png',
    width: 41,
    height: 31,
  },
  'shopping-cart': {
    texture: 'shopping-cart',
    url: '/assets/props/shopping-cart.png',
    width: 37,
    height: 33,
  },
  // Food court.
  'food-court-table': {
    texture: 'food-court-table',
    url: '/assets/props/food-court-table.png',
    width: 25,
    height: 21,
  },
  'food-court-chair': {
    texture: 'food-court-chair',
    url: '/assets/props/food-court-chair.png',
    width: 19,
    height: 27,
  },
  'condiment-stand': {
    texture: 'condiment-stand',
    url: '/assets/props/condiment-stand.png',
    width: 41,
    height: 36,
  },
  // Retail fit-out.
  'checkout-counter': {
    texture: 'checkout-counter',
    url: '/assets/props/checkout-counter.png',
    width: 32,
    height: 29,
  },
  'clothing-rack': {
    texture: 'clothing-rack',
    url: '/assets/props/clothing-rack.png',
    width: 36,
    height: 34,
  },
  'vhs-shelf': {
    texture: 'vhs-shelf',
    url: '/assets/props/vhs-shelf.png',
    width: 48,
    height: 30,
  },
  'shoe-bench': {
    texture: 'shoe-bench',
    url: '/assets/props/shoe-bench.png',
    width: 41,
    height: 22,
  },
  // Arcade.
  'arcade-cabinet': {
    texture: 'arcade-cabinet',
    url: '/assets/props/arcade-cabinet.png',
    width: 27,
    height: 59,
  },
  'claw-machine': {
    texture: 'claw-machine',
    url: '/assets/props/claw-machine.png',
    width: 32,
    height: 57,
  },
  'air-hockey-table': {
    texture: 'air-hockey-table',
    url: '/assets/props/air-hockey-table.png',
    width: 32,
    height: 28,
  },
  'arcade-stool': {
    texture: 'arcade-stool',
    url: '/assets/props/arcade-stool.png',
    width: 24,
    height: 21,
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

/** Authored edge length of every floor tile, in pixels. */
export const FLOOR_TILE_SIZE = 32;

/** Authored height of an upright wall face: two tile-rows of vertical extent. */
export const WALL_FACE_HEIGHT = 64;

/** Authored edge length of the wall-top surface, in pixels: one square tile. */
export const WALL_TOP_SIZE = 32;

export type FloorKind =
  | 'floor-tile-beige'
  | 'floor-terrazzo'
  | 'floor-tile-accent'
  | 'floor-carpet'
  | 'floor-carpet-damaged';

/**
 * One 32x32 floor tile per kind. The texture is the kind string itself, so the
 * floor a room names is the texture the renderer loads, with no second mapping
 * to drift out of step with the PNGs on disk.
 *
 * Every tile here was validated seam-safe (each join no worse than the tile's
 * own worst interior transition) with zero off-palette pixels; see
 * `docs/art/work/tiles/report.json`. Promote a new floor by adding its kind
 * here, never by pointing at a preview (`-x8`), a tiled proof (`-tiled-4x4`), or
 * a source file (`.aseprite`).
 *
 * These tiles are opaque, so the renderer paints them over the room rect rather
 * than compositing them.
 */
export const FLOOR_ART: Record<FloorKind, FixtureArt> = {
  'floor-tile-beige': {
    texture: 'floor-tile-beige',
    url: '/assets/tiles/floor-tile-beige-32.png',
    width: 32,
    height: 32,
  },
  'floor-terrazzo': {
    texture: 'floor-terrazzo',
    url: '/assets/tiles/floor-terrazzo-32.png',
    width: 32,
    height: 32,
  },
  'floor-tile-accent': {
    texture: 'floor-tile-accent',
    url: '/assets/tiles/floor-tile-accent-32.png',
    width: 32,
    height: 32,
  },
  'floor-carpet': {
    texture: 'floor-carpet',
    url: '/assets/tiles/floor-carpet-32.png',
    width: 32,
    height: 32,
  },
  'floor-carpet-damaged': {
    texture: 'floor-carpet-damaged',
    url: '/assets/tiles/floor-carpet-damaged-32.png',
    width: 32,
    height: 32,
  },
};

export type WallPieceKind =
  | 'wall-face'
  | 'wall-top'
  | 'wall-corner'
  | 'column'
  | 'railing-glass'
  | 'security-gate';

/**
 * The 64-tall wall family. A face and a corner stand two tile-rows high, because
 * height is what makes a wall read as a wall; a separate 32x32 top covers runs
 * seen from above. `overlay: true` marks the RGBA pieces (column, railing-glass)
 * that are built on a transparent canvas and so stand on any floor; the other
 * four are opaque and replace what is beneath them.
 *
 * Do NOT promote `wall-h-32`, `wall-v-32`, or `wall-corner-32`. Those are a
 * superseded 32-tall set that passed every automated check and still read as
 * panelling, because nothing about a one-tile wall says "this has vertical
 * extent". The `PIECES` list in `docs/art/tools/make_walls.py` is the authority
 * for which pieces belong to this family.
 */
export const WALL_ART: Record<WallPieceKind, FixtureArt & { readonly overlay: boolean }> = {
  'wall-face': {
    texture: 'wall-face',
    url: '/assets/walls/wall-face-32x64.png',
    width: 32,
    height: 64,
    overlay: false,
  },
  'wall-top': {
    texture: 'wall-top',
    url: '/assets/walls/wall-top-32.png',
    width: 32,
    height: 32,
    overlay: false,
  },
  'wall-corner': {
    texture: 'wall-corner',
    url: '/assets/walls/wall-corner-32x64.png',
    width: 32,
    height: 64,
    overlay: false,
  },
  column: {
    texture: 'column',
    url: '/assets/walls/column-32.png',
    width: 32,
    height: 32,
    overlay: true,
  },
  'railing-glass': {
    texture: 'railing-glass',
    url: '/assets/walls/railing-glass-32.png',
    width: 32,
    height: 32,
    overlay: true,
  },
  'security-gate': {
    texture: 'security-gate',
    url: '/assets/walls/security-gate-32.png',
    width: 32,
    height: 32,
    overlay: false,
  },
};

export type StorefrontArtKind = 'storefront-fascia' | 'sign-warm' | 'sign-cool';

/**
 * Storefront art: the shopfront band, and the two lit signs that hang above a
 * shop's door.
 *
 * The fascia is a repeating 64x32 band that runs along a store's front edge on
 * both sides of its opening. The signs are 96x24 — the doorway's own width — so
 * a sign sits flush over the door with nothing to align by hand.
 *
 * These three were generated with this project's palette forced, so they arrived
 * with zero off-palette pixels, and were authored large (192x48 and 128x64) then
 * integer-downscaled by two: asking the model for a 96x24 canvas directly trades
 * away the very detail the downscale is meant to keep.
 *
 * The warm board needed one repair first. The generator returned its face as
 * transparent pixels with only the frame and the light panels opaque, so the
 * floor showed straight through the middle of the sign. Enclosed transparent
 * pixels were filled with the board's own frame colour, which leaves the cool
 * board untouched because its transparency is an outside margin, not a hole.
 * That is also why the two disagree on `overlay`: the cool board is a cutout that
 * keeps its margin, the warm one is now a solid slab.
 */
export const STOREFRONT_ART: Record<
  StorefrontArtKind,
  FixtureArt & { readonly overlay: boolean }
> = {
  'storefront-fascia': {
    texture: 'storefront-fascia',
    url: '/assets/storefront/storefront-fascia-64x32.png',
    width: 64,
    height: 32,
    overlay: false,
  },
  'sign-warm': {
    texture: 'sign-warm',
    url: '/assets/storefront/sign-warm-96x24.png',
    width: 96,
    height: 24,
    overlay: false,
  },
  'sign-cool': {
    texture: 'sign-cool',
    url: '/assets/storefront/sign-cool-96x24.png',
    width: 96,
    height: 24,
    overlay: true,
  },
};
