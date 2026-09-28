/**
 * The clock-in cold open, as pure timing: a punch card slides up into the
 * time clock, KA-CHUNK, it comes back out stamped a minute or two before
 * midnight, NIGHT SHIFT comes up, and the overlay fades off the concourse.
 *
 * It does not hold the run: the opening concourse is calm, the simulation
 * keeps going underneath, and the first key both clears it and reaches the
 * game. It plays for a fresh shift only.
 */
export const CLOCK_IN_MS = 3200;
export const PUNCH_AT_MS = 1100;
/** The time clock's card slot on the 600 px stage: the card shows only below it. */
export const SLOT_Y = 335;
const FADE_OUT_MS = 600;

export type ClockInFrame = {
  /** The card's top edge on the 600 px stage. */
  readonly cardY: number;
  readonly stamped: boolean;
  /** 0..1 shake and flash on the punch. */
  readonly jolt: number;
  readonly titleAlpha: number;
  /** Opacity of the whole overlay (fades in, then off the concourse). */
  readonly alpha: number;
  readonly done: boolean;
};

export type ClockInReason = 'launch' | 'new-shift' | 'retry';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** Where the card sits: rising from below the stage into the slot, then easing back out. */
const CARD_START = 640;
const CARD_IN_SLOT = 225;
const CARD_OUT = 290;

export function clockInFrame(ms: number): ClockInFrame {
  const rise = easeOut(clamp01((ms - 150) / (PUNCH_AT_MS - 150)));
  const lift = easeOut(clamp01((ms - PUNCH_AT_MS - 120) / 500));
  const cardY = ms < PUNCH_AT_MS ? CARD_START + (CARD_IN_SLOT - CARD_START) * rise : CARD_IN_SLOT + (CARD_OUT - CARD_IN_SLOT) * lift;
  const sincePunch = ms - PUNCH_AT_MS;
  return {
    cardY,
    stamped: ms >= PUNCH_AT_MS,
    jolt: sincePunch >= 0 && sincePunch < 220 ? 1 - sincePunch / 220 : 0,
    titleAlpha: clamp01((ms - (PUNCH_AT_MS + 250)) / 400),
    alpha: ms < 200 ? ms / 200 : 1 - clamp01((ms - (CLOCK_IN_MS - FADE_OUT_MS)) / FADE_OUT_MS),
    done: ms >= CLOCK_IN_MS,
  };
}

/** A minute or two before midnight, the same for the same mall. */
export function clockInTime(seed: number): string {
  const minute = 57 + (Math.abs(Math.trunc(seed)) % 3);
  return `11:${minute} PM`;
}

export function shouldClockIn(start: { readonly reason: ClockInReason; readonly fixture: string | null; readonly restored: boolean }): boolean {
  return start.reason !== 'retry' && start.fixture === null && !start.restored;
}
