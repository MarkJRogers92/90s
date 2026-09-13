import { circlesOverlap } from '../combat/collision';
import type { RunState, SurfacePatchState } from '../model';
import { WET_DURATION_TICKS } from './constants';
import { applyWet } from './statuses';

export type CreateSurfacePatchRequest = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly ticks: number;
  readonly rootActionId: number;
  readonly sourceItemIds: readonly string[];
};

/**
 * Adds one authored surface patch to the room.
 *
 * The patch is room state, not enemy state, so it is removed by
 * `clearTransientRoomState` and by a run restart exactly like projectiles.
 */
export function createSurfacePatch(
  state: RunState,
  request: CreateSurfacePatchRequest,
): SurfacePatchState {
  const patch: SurfacePatchState = {
    id: state.nextEntityId,
    kind: 'wet',
    x: request.x,
    y: request.y,
    radius: request.radius,
    remainingTicks: Math.max(0, Math.trunc(request.ticks)),
    rootActionId: request.rootActionId,
    sourceItemIds: Object.freeze(Array.from(new Set(request.sourceItemIds)).sort()),
  };
  state.nextEntityId += 1;
  state.surfaces.push(patch);
  return patch;
}

/**
 * Advances every surface by exactly one tick and applies Wet authoritatively.
 *
 * A patch ages before it acts, so a patch created this tick starts Wetting
 * enemies on the following tick and lives for exactly its authored duration.
 * Overlapping enemies are refreshed to the full Wet duration every tick, which
 * is the same "refresh to the longer remaining duration" rule statuses use.
 */
export function updateSurfaces(state: RunState): void {
  if (state.surfaces.length === 0) {
    return;
  }

  const live: SurfacePatchState[] = [];
  for (const patch of state.surfaces) {
    patch.remainingTicks -= 1;
    if (patch.remainingTicks <= 0) {
      continue;
    }
    for (const enemy of state.enemies) {
      if (
        enemy.health > 0 &&
        circlesOverlap(enemy.x, enemy.y, enemy.radius, patch.x, patch.y, patch.radius)
      ) {
        applyWet(enemy, WET_DURATION_TICKS);
      }
    }
    live.push(patch);
  }
  state.surfaces = live;
}
