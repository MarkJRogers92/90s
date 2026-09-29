/**
 * The boss kill cam, as pure timing. When a boss falls the shift is already
 * won and the simulation has stopped; this only decides how the moment is
 * shown: a white flash, the camera pushing in on the body, letterbox bars, a
 * rubber-stamp verdict, and the death fall itself in slow motion. The end card
 * waits until `done`.
 */
import type { BossKind } from '../../sim/combat/boss';

export const KILL_CAM_MS = 2300;
export const KILL_CAM_ZOOM = 1.7;
/** Real milliseconds of slow motion, and how fast effects run during it. */
const SLOW_MS = 1200;
const SLOW_RATE = 0.3;
const PUSH_IN_MS = 320;
const PULL_OUT_MS = 420;
const STAMP_AT_MS = 380;
const STAMP_SLAM_MS = 140;
const BARS = 56;

export type KillCamFrame = {
  readonly zoom: number;
  /** Letterbox bar height in stage pixels. */
  readonly bars: number;
  readonly flash: number;
  readonly stampAlpha: number;
  readonly stampScale: number;
  readonly done: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export function killCamFrame(ms: number): KillCamFrame {
  const pullOut = clamp01((ms - (KILL_CAM_MS - PULL_OUT_MS)) / PULL_OUT_MS);
  const pushIn = easeOut(clamp01(ms / PUSH_IN_MS));
  const presence = pushIn * (1 - easeInOut(pullOut));
  const stampAge = ms - STAMP_AT_MS;
  const slam = clamp01(stampAge / STAMP_SLAM_MS);
  return {
    zoom: 1 + (KILL_CAM_ZOOM - 1) * presence,
    bars: Math.round(BARS * presence),
    flash: clamp01(1 - ms / 220),
    stampAlpha: stampAge < 0 ? 0 : 1 - pullOut,
    stampScale: stampAge < 0 ? 2.4 : 1 + 1.4 * (1 - easeOut(slam)),
    done: ms >= KILL_CAM_MS,
  };
}

/** Effect time for `realMs` since the kill: slow at first, then full speed. */
export function slowMoMs(realMs: number): number {
  return realMs < SLOW_MS ? realMs * SLOW_RATE : SLOW_MS * SLOW_RATE + (realMs - SLOW_MS);
}

export function killCamStamp(kind: BossKind): string {
  return kind === 'owner' ? 'GOING OUT OF BUSINESS' : kind === 'manager' ? "YOU'RE FIRED" : 'LOSS PREVENTED';
}
