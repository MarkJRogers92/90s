/**
 * How far into a blackout the lights are (0 = normal, 1 = dark). Normally the
 * lights cut at once; with reduced flashes the change eases over about a
 * second so the whole room never jumps in brightness. Presentation only.
 */
export const BLACKOUT_FADE_FRAMES = 60;

export function stepBlackoutMix(mix: number, on: boolean, reducedFlashes: boolean): number {
  const target = on ? 1 : 0;
  if (!reducedFlashes) return target;
  const step = 1 / BLACKOUT_FADE_FRAMES;
  return target > mix ? Math.min(target, mix + step) : Math.max(target, mix - step);
}
