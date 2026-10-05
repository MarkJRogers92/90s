/**
 * Ambient life for a dressed room's props, as pure functions of the tick.
 *
 * A dead mall is never quite still: palms stir in the air conditioning, the
 * arcade cabinets run their attract modes to nobody, the vending machine
 * buzzes, a kiddie ride rocks on its own, the globe fountain still sprays,
 * and here and there a neon tube is dying. `MallRoomView` applies these to
 * its images and lights; nothing here touches Phaser or the simulation.
 *
 * Every function is deterministic in (tick, seed), so a room looks the same
 * on every visit and the tests can pin the behaviour down.
 */
import type { PropId } from '../presentation/rooms/roomDressing';
import { TICKS_PER_SECOND } from '../../sim/effects/constants';

export type PropMotion = 'sway' | 'screen' | 'fountain' | 'rock';

/** Which kind of ambient life a prop has, or null for a still prop. */
export function propMotion(prop: PropId): PropMotion | null {
  switch (prop) {
    case 'palm':
      return 'sway';
    case 'arcadeCabinet':
    case 'clawMachine':
    case 'vending':
    case 'atm':
    case 'securityDesk':
    case 'photoBooth':
      return 'screen';
    case 'fountain':
      return 'fountain';
    case 'kiddieRide':
      return 'rock';
    default:
      return null;
  }
}

/** A small stable hash, so each prop gets its own phase without randomness. */
export function propSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Palm sway in radians about the pot: two slow, out-of-step breaths. */
export const SWAY_MAX = 0.03;
export function swayAngle(tick: number, seed: number): number {
  const phase = (seed % 628) / 100;
  return SWAY_MAX * (0.65 * Math.sin(tick / 53 + phase) + 0.35 * Math.sin(tick / 23 + phase * 1.7));
}

/**
 * The kiddie ride rocks by itself for a while, then stops, then starts again.
 * Returns radians about its base.
 */
export const ROCK_MAX = 0.07;
const ROCK_CYCLE = 600;
const ROCK_ON = 180;
export function rockAngle(tick: number, seed: number): number {
  const local = (tick + (seed % ROCK_CYCLE)) % ROCK_CYCLE;
  if (local >= ROCK_ON) return 0;
  // Eases in and out so it never snaps.
  const envelope = Math.sin((local / ROCK_ON) * Math.PI);
  return ROCK_MAX * envelope * Math.sin(local / 7);
}

export type ScreenGlow = {
  readonly color: number;
  /** 0..1, for the lightmap. */
  readonly intensity: number;
  /** Light position relative to the prop's base centre, as fractions of its height. */
  readonly heightFraction: number;
};

const ATTRACT = [0xff3fc8, 0x3ff0ff, 0xffd84a, 0x6aff8a] as const;

/** What a screen or display prop is showing this tick. */
export function screenGlow(prop: PropId, tick: number, seed: number, flashes = true): ScreenGlow | null {
  const t = tick + (seed % 997);
  switch (prop) {
    case 'photoBooth': {
      // A warm curtain glow, and now and then four quick camera flashes.
      const local = t % 480;
      const flash = flashes && local < 40 && local % 10 < 3;
      return flash
        ? { color: 0xffffff, intensity: 1, heightFraction: 0.55 }
        : { color: 0xffc890, intensity: 0.35, heightFraction: 0.55 };
    }
    case 'arcadeCabinet': {
      // Attract mode: a new colour every 40 ticks, with a scan flicker.
      const color = ATTRACT[Math.floor(t / 40) % ATTRACT.length]!;
      return { color, intensity: 0.55 + 0.15 * Math.sin(t / 3), heightFraction: 0.7 };
    }
    case 'clawMachine': {
      // A chase of bulbs: pink and yellow trading places.
      const color = Math.floor(t / 12) % 2 === 0 ? 0xff3fc8 : 0xffd84a;
      return { color, intensity: 0.5, heightFraction: 0.75 };
    }
    case 'vending': {
      // A cold fluorescent panel that buzzes and drops out now and then.
      const buzz = t % 360 < 14 && t % 4 < 2;
      return { color: 0xd8f4ff, intensity: buzz ? 0.08 : 0.5, heightFraction: 0.6 };
    }
    case 'atm':
      // INSERT CARD blinking green.
      return { color: 0x6aff8a, intensity: Math.floor(t / 30) % 2 === 0 ? 0.45 : 0.15, heightFraction: 0.65 };
    case 'securityDesk':
      // CCTV monitors: a flat blue-white wash that rolls.
      return { color: 0x9ab8ff, intensity: 0.4 + 0.12 * Math.sin(t / 5), heightFraction: 0.85 };
    default:
      return null;
  }
}

/** Screens run on mains power: a blackout leaves only a faint standby glow. */
export const BLACKOUT_SCREEN_SCALE = 0.2;

/**
 * A dying neon tube. About one sign in three has a bad tube; it stutters for
 * a moment once every few seconds. Returns an alpha multiplier (1 = steady).
 */
const STUTTER_CYCLE = 420;
const STUTTER_PATTERN = [0.15, 1, 0.1, 0.1, 1, 0.3, 1, 0.05, 1];
const STUTTER_FRAME_TICKS = 3;
export function signFlicker(tick: number, seed: number): number {
  if (seed % 3 !== 0) return 1;
  const local = (tick + (seed % STUTTER_CYCLE)) % STUTTER_CYCLE;
  const index = Math.floor(local / STUTTER_FRAME_TICKS);
  return index < STUTTER_PATTERN.length ? STUTTER_PATTERN[index]! : 1;
}

export type Droplet = { readonly dx: number; readonly dy: number; readonly alpha: number };

/**
 * The globe fountain's spray: droplets thrown up from the rim that fall back
 * into the basin on parabolas, relative to the fountain's base centre and
 * scaled to its drawn size.
 */
export const DROPLET_COUNT = 14;
const DROPLET_LIFE = 48;
export function fountainDroplets(tick: number, seed: number, width: number, height: number): Droplet[] {
  const droplets: Droplet[] = [];
  for (let index = 0; index < DROPLET_COUNT; index += 1) {
    const offset = Math.floor((index * DROPLET_LIFE) / DROPLET_COUNT) + (seed % DROPLET_LIFE);
    const age = (tick + offset) % DROPLET_LIFE;
    const t = age / DROPLET_LIFE;
    // Alternate sides of the globe, each droplet with its own reach.
    const side = index % 2 === 0 ? -1 : 1;
    const reach = (0.18 + 0.1 * ((index * 7) % 5) / 4) * width;
    const rise = 0.42 * height;
    droplets.push({
      dx: side * reach * t,
      // Up from the rim at 55% height, then down past it into the basin.
      dy: -0.55 * height - rise * 4 * t * (1 - t) + 0.35 * height * t * t,
      alpha: t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.7) / 0.3),
    });
  }
  return droplets;
}

/** Expanding ripple rings in the basin: radius fraction 0..1 and alpha. */
export function fountainRipples(tick: number, seed: number): Array<{ readonly scale: number; readonly alpha: number }> {
  const rings = [];
  for (let index = 0; index < 3; index += 1) {
    const t = ((tick + (seed % 90) + index * 30) % 90) / 90;
    rings.push({ scale: 0.3 + 0.7 * t, alpha: 0.5 * (1 - t) });
  }
  return rings;
}

export type Mote = { readonly dx: number; readonly dy: number; readonly alpha: number };

/** Motes per light pool, and the slowest a pool gets them (small lamps don't). */
export const MOTES_PER_LIGHT = 5;
export const MOTE_MIN_RADIUS = 70;
const MOTE_RISE_TICKS = 900;

/**
 * Dust hanging in a light pool: a few specks that climb slowly through the
 * beam, wander side to side, twinkle as they turn, and fade out at its edge.
 * Offsets are in world units from the light's centre, inside `radius`.
 */
export function dustMotes(tick: number, seed: number, radius: number, count = MOTES_PER_LIGHT): Mote[] {
  const reach = radius * 0.55;
  const motes: Mote[] = [];
  for (let index = 0; index < count; index += 1) {
    const key = propSeed(`${seed}:${index}`);
    const home = ((key % 1000) / 1000) * 2 - 1;
    const phase = (key >>> 10) % 628;
    // Climb from the bottom of the pool to the top, then start again below.
    const climb = ((tick + (key % MOTE_RISE_TICKS)) % MOTE_RISE_TICKS) / MOTE_RISE_TICKS;
    const dy = reach * (1 - 2 * climb);
    const dx = reach * 0.8 * home + 10 * Math.sin(tick / 70 + phase / 100);
    const edge = Math.hypot(dx, dy) / reach;
    const twinkle = 0.55 + 0.45 * Math.sin(tick / 23 + phase);
    motes.push({ dx, dy, alpha: Math.max(0, 1 - edge * edge) * twinkle });
  }
  return motes;
}

/** Authored 280/90/90/340 ms light-only cycle, sampled by the existing game tick.
 * The body never moves. Reduced Flashes holds the weak, spark-free first frame.
 */
export function damagedVendingFrame(tick: number, flashes = true): number {
  if (!flashes) return 0;
  const localMs = ((tick % (TICKS_PER_SECOND * 0.8)) * 1000) / TICKS_PER_SECOND;
  return localMs < 280 ? 0 : localMs < 370 ? 1 : localMs < 460 ? 2 : 3;
}
