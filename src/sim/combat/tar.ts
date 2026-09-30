/**
 * Hot tar on the roof (Floor 4): puddles the Roofer's buckets leave behind.
 * Walking through one is slow; a dash is not. Puddles dry up after a while.
 * Kept apart from roofer.ts so player movement can read it without a cycle.
 */
import type { RunState, Vec2 } from '../model';

/** Walking speed in tar, as a fraction of normal. */
export const TAR_SLOW = 0.55;
export const TAR_PUDDLE_RADIUS = 46;
export const TAR_PUDDLE_TICKS = 300;
/** Older puddles dry up first once a room has this many. */
export const TAR_MAX_PUDDLES = 6;

export function inTar(state: Pick<RunState, 'tar'>, point: Vec2): boolean {
  return (state.tar ?? []).some((puddle) => Math.hypot(point.x - puddle.x, point.y - puddle.y) <= puddle.radius);
}

export function spillTar(state: RunState, x: number, y: number): void {
  const tar = [...(state.tar ?? []), { x, y, radius: TAR_PUDDLE_RADIUS, ticks: TAR_PUDDLE_TICKS }];
  state.tar = tar.slice(-TAR_MAX_PUDDLES);
}

export function dryTar(state: RunState): void {
  if (!state.tar?.length) return;
  for (const puddle of state.tar) puddle.ticks -= 1;
  state.tar = state.tar.filter((puddle) => puddle.ticks > 0);
}
