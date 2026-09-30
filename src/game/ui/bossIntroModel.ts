/**
 * The boss title card, as pure timing and copy. Walking into a boss room
 * holds the fight clock for a beat: letterbox bars close in, the camera leans
 * toward the boss, and a mall-directory plaque slides in naming who runs this
 * floor, with the name flickering on like a neon tube. Any key cuts it short.
 *
 * Pure: `BossIntro` draws from this and nothing else.
 */
import type { BossKind } from '../../sim/combat/boss';

/** Round 35: players skipped the 2 s card at 1.2-1.3 s, so it now runs about that long. */
export const BOSS_INTRO_MS = 1400;
export const BOSS_INTRO_ZOOM = 1.25;
/** Ignore presses for this long, so the step through the door never skips it. */
export const BOSS_INTRO_SKIP_GRACE_MS = 350;
const BARS = 64;
const IN_MS = 380;
const OUT_MS = 300;
const PLATE_AT_MS = 180;
const PLATE_SLIDE_MS = 260;
const NAME_AT_MS = 380;
/** The tube stutters on over this long before it holds. */
const FLICKER_MS = 300;

export type BossIntroCopy = {
  /** The directory line: floor and room, like the board by the escalator. */
  readonly directory: string;
  readonly name: string;
  readonly tagline: string;
  /** Neon colour of the name, as a CSS hex. */
  readonly color: string;
};

export function bossIntroCopy(kind: BossKind): BossIntroCopy {
  switch (kind) {
    // The taglines are the in-canvas HUD's original boss cards, which this replaces.
    case 'owner':
      return { directory: "LEVEL 3 - OWNER'S SUITE", name: 'THE MALL OWNER', tagline: 'EVERYTHING YOU SEE IS MINE. INCLUDING YOU.', color: '#ff2a3a' };
    case 'manager':
      return { directory: 'LEVEL 2 - MANAGEMENT OFFICES', name: 'THE MALL MANAGER', tagline: 'THE CUSTOMER IS NEVER RIGHT.', color: '#ff2a3a' };
    default:
      return { directory: 'LEVEL 1 - SECURITY OFFICE', name: 'LOSS PREVENTION', tagline: 'NO REFUNDS. NO EXCHANGES. NO SURVIVORS.', color: '#ff2a3a' };
  }
}

/**
 * The plaque's mugshot: a square crop of the boss's south-facing idle frame,
 * head and shoulders. Every boss sheet puts the figure's head within the top
 * few percent of its frame and fills about half of it with shoulders and
 * chest, so one crop fits all three.
 */
export function portraitCrop(frameSize: number): { readonly x: number; readonly y: number; readonly size: number } {
  const size = Math.round(frameSize * 0.56);
  return { x: Math.round((frameSize - size) / 2), y: Math.round(frameSize * 0.02), size };
}

export type BossIntroFrame = {
  readonly zoom: number;
  /** Letterbox bar height in stage pixels. */
  readonly bars: number;
  /** Plate slide: 0 off-screen left to 1 in place. */
  readonly plate: number;
  readonly plateAlpha: number;
  /** Whether the neon name is lit this frame (it stutters on). */
  readonly nameLit: boolean;
  readonly done: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/** A fixed stutter: on, off, on, on, off, then held on. */
const FLICKER = [true, false, true, true, false, true, false, true];

export function bossIntroFrame(ms: number): BossIntroFrame {
  const into = easeOut(clamp01(ms / IN_MS));
  const out = easeInOut(clamp01((ms - (BOSS_INTRO_MS - OUT_MS)) / OUT_MS));
  const presence = into * (1 - out);
  const nameAge = ms - NAME_AT_MS;
  const flickerIndex = Math.floor((nameAge / FLICKER_MS) * FLICKER.length);
  return {
    zoom: 1 + (BOSS_INTRO_ZOOM - 1) * presence,
    bars: Math.round(BARS * presence),
    plate: easeOut(clamp01((ms - PLATE_AT_MS) / PLATE_SLIDE_MS)) * (1 - out),
    plateAlpha: 1 - out,
    nameLit: nameAge >= 0 && (flickerIndex >= FLICKER.length || FLICKER[flickerIndex] === true) && out < 1,
    done: ms >= BOSS_INTRO_MS,
  };
}
