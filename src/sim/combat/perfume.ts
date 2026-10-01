/**
 * Glamour Row: the clouds a Perfume Spritzer leaves hanging (round 50).
 * Walking through one is slow; a dash is not. Clouds fade after a while.
 * Kept apart from districtEnemies.ts so player movement can read it without
 * a cycle, as tar.ts is for the Roofers.
 */
import type { RunState, Vec2 } from '../model';

export const PERFUME_CLOUD_RADIUS = 46;
export const PERFUME_CLOUD_TICKS = 200;
export const PERFUME_MAX_CLOUDS = 4;
/** Walking speed in a cloud, as a fraction of normal. */
export const PERFUME_SLOW = 0.6;
export function inPerfume(state: Pick<RunState, 'perfume'>, point: Vec2): boolean {
  return (state.perfume ?? []).some((cloud) => Math.hypot(point.x - cloud.x, point.y - cloud.y) <= cloud.radius);
}

export function fadePerfume(state: RunState): void {
  if (!state.perfume?.length) return;
  for (const cloud of state.perfume) cloud.ticks -= 1;
  state.perfume = state.perfume.filter((cloud) => cloud.ticks > 0);
}

