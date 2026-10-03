/** Held-item presentation only. Pixel coordinates refer to the unchanged 32×32 icons. */
import { rootItemId } from '../../sim/fusion/hybrid';

export type WeaponPoint = { readonly x: number; readonly y: number };
export type WeaponPose = 'swing' | 'aim' | 'throw';
export type WeaponEffectFamily = 'wet' | 'blunt' | 'slash' | 'energy' | 'water' | 'foam' | 'confetti' | 'rocket' | 'spray' | 'marker' | 'slush' | 'thrown' | 'mechanical';
export type WeaponPresentation = {
  readonly grip: WeaponPoint;
  readonly head: WeaponPoint;
  /** Barrel direction is independent of the grip→muzzle offset on guns. */
  readonly forward: WeaponPoint;
  readonly pose: WeaponPose;
  readonly effectFamily: WeaponEffectFamily;
  /** Reflect across the source X axis on the opposite aim hemisphere. */
  readonly keepUpright: boolean;
  /** Optional rendered tile size before the shared idle/attack multiplier. */
  readonly heldSize?: number;
};
const point = (x: number, y: number): WeaponPoint => ({ x, y });
function held(gx: number, gy: number, hx: number, hy: number, pose: WeaponPose, effectFamily: WeaponEffectFamily, fx = hx - gx, fy = hy - gy): WeaponPresentation {
  return { grip: point(gx, gy), head: point(hx, hy), forward: point(fx, fy), pose, effectFamily, keepUpright: pose === 'aim' };
}

/**
 * Every primary weapon is authored explicitly. Grips were checked against the
 * source pixels, not item names: broom points southeast, mop southwest, foam
 * blaster/nail gun left, and the cutter blade is at the left of its tile.
 * Upright guns retain barrel direction independently of their lower handles.
 * Throwables and novelty props have deliberate carry grips/release edges;
 * those icons cannot supply a literal trigger or muzzle.
 */
export const WEAPON_PRESENTATIONS: Readonly<Record<string, WeaponPresentation>> = {
  janitor_mop: held(23, 9, 8, 24, 'swing', 'wet'),
  broken_broom_handle: held(8, 8, 24, 24, 'swing', 'blunt'),
  box_cutter: { ...held(23, 13, 4, 18, 'swing', 'slash'), heldSize: 20 },
  aluminum_bat: held(7, 25, 25, 7, 'swing', 'blunt'),
  hockey_stick: held(25, 6, 5, 25, 'swing', 'blunt'),
  golf_club: held(5, 28, 24, 5, 'swing', 'blunt'),
  lacrosse_stick: held(16, 26, 16, 7, 'swing', 'blunt'),
  pipe_wrench: held(16, 24, 13, 6, 'swing', 'blunt'),
  claw_hammer: held(7, 26, 23, 7, 'swing', 'blunt'),
  yo_yo: held(16, 24, 16, 13, 'swing', 'blunt'),
  foam_sword: held(7, 25, 24, 7, 'swing', 'slash'),
  electric_guitar: held(23, 9, 10, 24, 'swing', 'blunt'),
  mic_stand: held(16, 23, 16, 7, 'swing', 'blunt'),
  drumsticks: held(16, 19, 8, 6, 'swing', 'blunt'),
  keytar: held(23, 9, 10, 24, 'swing', 'blunt'),
  pizza_cutter: held(23, 25, 11, 10, 'swing', 'slash'),
  pizza_peel: held(16, 24, 16, 12, 'swing', 'blunt'),
  dough_roller: held(7, 25, 18, 14, 'swing', 'blunt'),
  cardboard_standee: held(16, 23, 16, 7, 'swing', 'blunt'),
  late_fee_stamp: held(16, 10, 16, 21, 'swing', 'blunt'),
  candy_cane: held(11, 23, 15, 7, 'swing', 'blunt'),
  rubber_chicken: held(16, 25, 15, 8, 'swing', 'blunt'),
  photo_backdrop: held(16, 23, 16, 11, 'swing', 'blunt'),
  tripod: held(16, 24, 16, 10, 'swing', 'blunt'),
  curling_iron: held(9, 24, 27, 4, 'swing', 'blunt'),
  salon_scissors: held(20, 10, 5, 24, 'swing', 'slash'),
  fish_net: held(8, 27, 16, 10, 'swing', 'blunt'),
  dog_leash: held(16, 11, 6, 26, 'swing', 'blunt'),
  hedge_trimmer: held(22, 9, 7, 24, 'swing', 'slash'),
  figure_skate: held(17, 11, 13, 26, 'swing', 'slash'),
  skate_lace: held(16, 6, 25, 26, 'swing', 'blunt'),
  pretzel_rod: held(16, 25, 16, 6, 'swing', 'blunt'),
  golden_mop: held(24, 7, 10, 24, 'swing', 'wet'),
  power_glove: held(12, 24, 19, 10, 'swing', 'blunt'),
  lightsaber_toy: held(8, 24, 25, 7, 'swing', 'energy'),

  pump_soaker: held(10, 19, 28, 11, 'aim', 'water', 1, 0),
  party_popper: held(16, 23, 16, 10, 'aim', 'confetti', 0, -1),
  bottle_rocket_pack: held(10, 23, 23, 8, 'aim', 'rocket'),
  fire_extinguisher: held(16, 7, 7, 25, 'aim', 'spray', 0, 1),
  paint_marker: held(19, 13, 4, 24, 'aim', 'marker'),
  foam_ball_blaster: held(22, 23, 3, 16, 'aim', 'foam', -1, 0),
  slushie_cup: held(16, 21, 18, 4, 'aim', 'slush', 0, -1),
  tennis_ball_launcher: held(20, 12, 7, 23, 'aim', 'mechanical'),
  dodgeball: held(16, 23, 16, 7, 'throw', 'thrown'),
  football: held(12, 21, 24, 8, 'throw', 'thrown'),
  nail_gun: held(21, 21, 3, 9, 'aim', 'mechanical', -1, 0),
  staple_gun: held(22, 16, 4, 20, 'aim', 'mechanical', -1, 0),
  garden_hose: held(21, 11, 23, 4, 'aim', 'water', 0, -1),
  super_soaker_50: held(8, 21, 27, 13, 'aim', 'water', 1, 0),
  slingshot: held(12, 20, 24, 8, 'aim', 'mechanical'),
  pog_slammer: held(16, 22, 16, 8, 'throw', 'thrown'),
  water_balloons: held(16, 22, 16, 9, 'throw', 'water'),
  laser_pointer: held(19, 12, 4, 27, 'aim', 'energy'),
  boombox: held(16, 12, 27, 19, 'aim', 'energy', 1, 0),
  rc_blimp_remote: held(17, 22, 10, 4, 'aim', 'energy', 0, -1),
  camcorder: held(20, 19, 7, 19, 'aim', 'energy', -1, 0),
  record_toss: held(16, 23, 16, 6, 'throw', 'thrown'),
  cd_shuriken: held(17, 23, 11, 9, 'throw', 'thrown'),
  soda_gun: held(22, 10, 8, 25, 'aim', 'water'),
  pepperoni_launcher: held(10, 23, 26, 6, 'aim', 'mechanical'),
  ketchup_bottle: held(16, 21, 16, 5, 'aim', 'spray', 0, -1),
  vhs_tape: held(11, 22, 26, 12, 'throw', 'thrown'),
  laserdisc: held(16, 23, 16, 7, 'throw', 'thrown'),
  gumball_launcher: held(9, 23, 25, 12, 'aim', 'mechanical', 1, 0),
  jawbreaker: held(16, 23, 16, 7, 'throw', 'thrown'),
  whoopee_cushion: held(16, 23, 27, 16, 'aim', 'spray', 1, 0),
  lava_lamp: held(16, 25, 16, 7, 'aim', 'energy', 0, -1),
  flash_camera: held(16, 22, 16, 6, 'aim', 'energy', 0, -1),
  hairspray: held(16, 22, 16, 4, 'aim', 'spray', 0, -1),
  squeaky_toy: held(11, 20, 23, 14, 'throw', 'thrown'),
  flea_spray: held(15, 21, 22, 5, 'aim', 'spray', 1, 0),
  watering_can: held(22, 16, 4, 12, 'aim', 'water', -1, -1),
  seed_spreader: held(19, 23, 14, 10, 'aim', 'mechanical', 0, -1),
  garden_gnome: held(16, 23, 16, 7, 'throw', 'thrown'),
  hockey_puck: held(16, 23, 16, 9, 'throw', 'thrown'),
  cocoa_thermos: held(16, 21, 16, 8, 'aim', 'slush', 0, -1),
  marshmallow_shooter: held(11, 23, 25, 12, 'aim', 'mechanical', 1, 0),
  super_soaker_cps: held(11, 21, 3, 13, 'aim', 'water', -1, 0),
  game_brick: held(16, 23, 16, 6, 'aim', 'energy', 0, -1),
  laser_tag_rifle: held(8, 21, 28, 12, 'aim', 'energy', 1, 0),
};

const UNKNOWN_PRESENTATION = held(16, 16, 28, 16, 'aim', 'mechanical', 1, 0);
/** Hybrids and nested hybrids share the exact presentation of their displayed root icon. */
export function weaponPresentation(definitionId: string): WeaponPresentation {
  const root = rootItemId(definitionId);
  return Object.hasOwn(WEAPON_PRESENTATIONS, root) ? WEAPON_PRESENTATIONS[root]! : UNKNOWN_PRESENTATION;
}
export type HeldWeaponTransform = {
  readonly presentation: WeaponPresentation;
  readonly grip: WeaponPoint;
  readonly head: WeaponPoint;
  readonly angle: number;
  readonly rotation: number;
  readonly scale: number;
  readonly flipY: boolean;
  readonly originX: number;
  readonly originY: number;
};

/** Pure geometry shared by the held image and head/nozzle-attached effects. */
export function heldWeaponTransform(input: {
  readonly definitionId: string;
  readonly aimAngle: number;
  readonly gripX: number;
  readonly gripY: number;
  readonly scale: number;
}): HeldWeaponTransform {
  const p = weaponPresentation(input.definitionId);
  const naturalFacing = p.forward.x < 0 ? -1 : 1;
  const flipY = p.keepUpright && Math.cos(input.aimAngle) * naturalFacing < -1e-8;
  const ySign = flipY ? -1 : 1;
  const rotation = input.aimAngle - Math.atan2(p.forward.y * ySign, p.forward.x);
  const dx = (p.head.x - p.grip.x) * input.scale;
  const dy = (p.head.y - p.grip.y) * input.scale * ySign;
  return {
    presentation: p, grip: point(input.gripX, input.gripY),
    head: point(input.gripX + Math.cos(rotation) * dx - Math.sin(rotation) * dy,
      input.gripY + Math.sin(rotation) * dx + Math.cos(rotation) * dy),
    angle: input.aimAngle, rotation, scale: input.scale, flipY,
    originX: p.grip.x / 32,
    // Phaser flips the frame around its centre, not the custom origin. Reflect
    // the origin too so the authored grip remains exactly at the hand anchor.
    originY: (flipY ? 32 - p.grip.y : p.grip.y) / 32,
  };
}
