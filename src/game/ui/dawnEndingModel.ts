/**
 * The dawn ending, as pure timing: after the Mall Manager falls the doors
 * slide open on the parking lot at sunrise and the janitor walks out, while
 * three lines come up. The shift is already won; this only decides what the
 * stage shows. Once `done` it holds its last shot, and the CLOCKED OUT card
 * opens over it.
 */
export const ENDING_MS = 6400;
export const ENDING_SKIP_GRACE_MS = 300;
export const DAWN_LINES = ['SHIFT COMPLETE', 'THANKS FOR SHOPPING AT DEAD MALL', 'STORE HOURS: NEVER AGAIN'] as const;
const LINE_AT_MS = [2600, 3800, 5000] as const;
const LINE_FADE_MS = 500;
const FADE_IN_MS = 600;

export type EndingFrame = {
  /** 0 closed, 1 fully open. */
  readonly doors: number;
  readonly walker: { readonly x: number; readonly y: number; readonly scale: number; readonly silhouette: number; readonly frame: number };
  /** 0..1 strength of the sunrise pouring through the doorway. */
  readonly glow: number;
  readonly lines: readonly number[];
  readonly fade: number;
  readonly done: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export function endingFrame(ms: number): EndingFrame {
  const walk = clamp01((ms - 1400) / 4000);
  return {
    doors: easeInOut(clamp01((ms - 400) / 1400)),
    walker: {
      x: 480,
      y: 575 - 185 * walk,
      scale: 2.2 - 1.2 * walk,
      silhouette: clamp01(walk * 1.3),
      frame: Math.floor(ms / 130) % 6,
    },
    glow: 0.4 + 0.6 * easeInOut(clamp01(ms / 5000)),
    lines: LINE_AT_MS.map((at) => clamp01((ms - at) / LINE_FADE_MS)),
    fade: ms < FADE_IN_MS ? 1 - ms / FADE_IN_MS : 0,
    done: ms >= ENDING_MS,
  };
}

export function endingSkippable(ms: number): boolean {
  return ms >= ENDING_SKIP_GRACE_MS;
}
