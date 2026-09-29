/**
 * The pink slip, as pure timing and copy: when the janitor dies, a Notice of
 * Termination flutters down once the death fall has played, lands, takes a
 * FIRED stamp, then drops away for the SHIFT OVER card. The reason on it is
 * whatever landed the last blow, told the way a mall would.
 */
import type { DamageSource } from '../playtest/recorder';

export const PINK_SLIP_MS = 3500;
export const SLIP_STAMP_AT_MS = 2000;
export const SLIP_SKIP_GRACE_MS = 300;
const FALL_AT_MS = 900;
const LAND_AT_MS = 1800;
const EXIT_AT_MS = 3000;
const REST_Y = 300;

export type PinkSlipFrame = {
  /** Centre of the slip on the 600 px stage. */
  readonly y: number;
  readonly rotation: number;
  readonly stampAlpha: number;
  readonly stampScale: number;
  readonly done: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t;

export function pinkSlipFrame(ms: number): PinkSlipFrame {
  const fall = clamp01((ms - FALL_AT_MS) / (LAND_AT_MS - FALL_AT_MS));
  const exit = easeIn(clamp01((ms - EXIT_AT_MS) / (PINK_SLIP_MS - EXIT_AT_MS)));
  const y = ms < FALL_AT_MS ? -300 : REST_Y - 600 * (1 - easeOut(fall)) + 620 * exit;
  // Paper sways side to side as it drops, the swing dying away as it lands.
  const rotation = ms < LAND_AT_MS ? 0.35 * Math.sin((ms - FALL_AT_MS) / 110) * (1 - fall) - 0.05 * fall : -0.05;
  const stampAge = ms - SLIP_STAMP_AT_MS;
  return {
    y,
    rotation,
    stampAlpha: stampAge < 0 ? 0 : 1,
    stampScale: stampAge < 0 ? 2.2 : 1 + 1.2 * (1 - easeOut(clamp01(stampAge / 150))),
    done: ms >= PINK_SLIP_MS,
  };
}

const REASONS: Record<DamageSource, string> = {
  hanger: 'EXCESSIVE CONTACT WITH MERCHANDISE',
  mannequin: 'INSUBORDINATION TOWARD A DISPLAY',
  static: 'FAILURE TO ADJUST THE ANTENNA',
  shopper: 'BLOCKING A DOORBUSTER',
  mascot: 'DISRESPECTING THE MASCOT',
  ownerCharge: 'HOSTILE TAKEOVER',
  glob: 'SLIPPED ON AN UNREPORTED SPILL',
  slam: 'DISRESPECTING LOSS PREVENTION',
  bossShot: 'DISRESPECTING LOSS PREVENTION',
  other: 'GENERAL POOR ATTITUDE',
};

/** Why Alex was let go, from what landed the last blow (bosses by floor). */
export function pinkSlipReason(source: DamageSource | null, floor: 1 | 2 | 3): string {
  if ((source === 'slam' || source === 'bossShot') && floor === 3) return 'HOSTILE TAKEOVER';
  if ((source === 'slam' || source === 'bossShot') && floor === 2) return 'DISAGREEING WITH MANAGEMENT';
  return REASONS[source ?? 'other'];
}
