/**
 * M4 bench-run adapters over the shared carrier physics.
 *
 * The behaviour itself lives in `src/sim/carrier/car.ts`, so the M5 MVP run
 * drives the same authored rule instead of a second copy. These wrappers bind
 * the shared functions to a `BenchRunState`, keeping M4's call sites, exported
 * names, and constant values exactly as they were.
 */
import {
  CAR_BUMP_COOLDOWN_TICKS,
  CAR_BUMP_DAMAGE,
  CAR_LEASH,
  CAR_RADIUS,
  CAR_RECALL_DISTANCE,
  CAR_SEEK_RANGE,
  CAR_SPEED,
  enforceCarrierLeash as enforceSharedCarrierLeash,
  moveCarrierToward as moveSharedCarrierToward,
  selectCarTarget,
  updateEmitterCarrier as updateSharedEmitterCarrier,
  updateIndependentCarrier as updateSharedIndependentCarrier,
} from '../carrier/car';
import type { BenchRunState } from './types';

export {
  CAR_BUMP_COOLDOWN_TICKS,
  CAR_BUMP_DAMAGE,
  CAR_LEASH,
  CAR_RADIUS,
  CAR_RECALL_DISTANCE,
  CAR_SEEK_RANGE,
  CAR_SPEED,
  selectCarTarget,
};

export function moveCarrierToward(
  state: BenchRunState,
  targetX: number,
  targetY: number,
): void {
  moveSharedCarrierToward(
    state.carrier,
    state.combat.player,
    state.combat.walls,
    targetX,
    targetY,
  );
}

export function enforceCarrierLeash(state: BenchRunState): void {
  enforceSharedCarrierLeash(state.carrier, state.combat.player, state.combat.walls);
}

export function updateIndependentCarrier(state: BenchRunState): void {
  updateSharedIndependentCarrier(
    state.carrier,
    state.combat.player,
    state.combat.walls,
    state.combat.enemies,
  );
}

export function updateEmitterCarrier(
  state: BenchRunState,
  aimX: number,
  aimY: number,
): void {
  updateSharedEmitterCarrier(
    state.carrier,
    state.combat.player,
    state.combat.walls,
    aimX,
    aimY,
  );
}
