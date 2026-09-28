/**
 * The escalator ride between floors, as pure timing: where the janitor stands,
 * how far the steps have rolled, where the two rows of shops are, and when the
 * UPPER LEVEL sign lights. The simulation has already moved the run upstairs;
 * this only decides what the 960x600 stage shows while it plays, so it can be
 * tested without Phaser.
 */
export const RIDE_MS = 3600;
/** The press that chose the escalator must not also skip the ride. */
export const RIDE_SKIP_GRACE_MS = 300;
const FADE_MS = 420;

/** The escalator runs up the stage from bottom-left to top-right. */
export const ESCALATOR = {
  bottom: { x: 170, y: 520 },
  top: { x: 800, y: 150 },
} as const;

export type RideFrame = {
  readonly rider: { readonly x: number; readonly y: number };
  /** Pixels the steps have travelled up the incline. */
  readonly stepScroll: number;
  /** The downstairs shop row's top edge (sliding down and out). */
  readonly lowerShopsY: number;
  /** The upstairs shop row's top edge (sliding down into view). */
  readonly upperShopsY: number;
  readonly titleAlpha: number;
  /** 0..1 black over everything, closing out the ride. */
  readonly fade: number;
  readonly done: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export function rideFrame(ms: number): RideFrame {
  const t = clamp01(ms / RIDE_MS);
  // A gentle start and stop, like stepping on and off.
  const along = easeInOut(t);
  const rider = {
    x: ESCALATOR.bottom.x + (ESCALATOR.top.x - ESCALATOR.bottom.x) * along,
    y: ESCALATOR.bottom.y + (ESCALATOR.top.y - ESCALATOR.bottom.y) * along,
  };
  // The camera rises with the janitor: the ground floor drops away below
  // while the upper floor's shops come down into frame.
  const rise = along * 420;
  return {
    rider,
    stepScroll: ms * 0.09,
    lowerShopsY: 360 + rise,
    upperShopsY: -300 + rise,
    titleAlpha: clamp01((t - 0.5) / 0.15),
    fade: ms >= RIDE_MS - FADE_MS ? clamp01((ms - (RIDE_MS - FADE_MS)) / FADE_MS) : 0,
    done: ms >= RIDE_MS,
  };
}

export function rideSkippable(ms: number): boolean {
  return ms >= RIDE_SKIP_GRACE_MS;
}
