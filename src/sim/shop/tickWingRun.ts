/**
 * Authoritative fixed-step update for the M3 shopping wing.
 *
 * This module deliberately owns movement, contextual command selection,
 * security, and terminal transition ordering. Renderers provide only a plain
 * input frame and read the resulting state.
 */
import { sweptCircleIntersectsRect } from '../combat/collision';
import { moveCircle } from '../combat/movement';
import { normalizedDirection } from '../core/geometry';
import type { Rect, Vec2 } from '../model';
import { beginTheft, buyOffer, confiscateTheft, leaveWing, secureTheft } from './commands';
import { canSecuritySeePlayer, securityFacingAtTick } from './security';
import {
  MAX_SUSPICION,
  WING_INTERACTION_RANGE,
  WING_PLAYER_SPEED,
  clampSuspicion,
  findStore,
} from './types';
import type { ShopOfferRuntime, StoreDefinition, WingCommandResult, WingState } from './types';

const TICKS_PER_SECOND = 60;

/** Renderer-neutral held input for one fixed simulation tick. */
export type WingInputFrame = {
  moveX: number;
  moveY: number;
  interact: boolean;
  steal: boolean;
};

/** Clears persistent interaction levels after blur, pause, or confiscation. */
export function clearWingHeldActions(state: WingState): void {
  state.heldActions = { interact: false, steal: false };
}

function distanceToPoint(first: Vec2, second: Vec2): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** The contextual merchandise candidate, ordered by distance then stable ID. */
export function nearestAvailableOffer(state: WingState): ShopOfferRuntime | undefined {
  return state.offers
    .filter(
      (offer) =>
        offer.status === 'available' &&
        distanceToPoint(state.player, offer.position) <= WING_INTERACTION_RANGE,
    )
    .sort((first, second) => {
      const distanceDifference =
        distanceToPoint(state.player, first.position) - distanceToPoint(state.player, second.position);
      if (distanceDifference !== 0) {
        return distanceDifference;
      }
      return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
    })[0];
}

function distanceToRect(point: Vec2, rect: Rect): number {
  const closestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function isNearMallExit(state: WingState): boolean {
  return distanceToRect(state.player, state.wing.mallExit.bounds) <= WING_INTERACTION_RANGE;
}

/**
 * True only for a downward crossing through the source store's authored door.
 * The y threshold is the exit's first edge: once the player crosses it in the
 * actual x span, the command runs immediately rather than waiting for a later
 * corridor position.
 */
export function crossedStoreExit(
  previousPosition: Vec2,
  position: Vec2,
  playerRadius: number,
  store: StoreDefinition,
): boolean {
  const exit = store.exit.bounds;
  const deltaY = position.y - previousPosition.y;
  if (
    deltaY <= 0 ||
    previousPosition.y >= exit.y ||
    position.y < exit.y ||
    !sweptCircleIntersectsRect(
      previousPosition.x,
      previousPosition.y,
      position.x,
      position.y,
      playerRadius,
      exit,
    )
  ) {
    return false;
  }

  const crossingProgress = (exit.y - previousPosition.y) / deltaY;
  const crossingX = previousPosition.x + (position.x - previousPosition.x) * crossingProgress;
  return crossingX >= exit.x && crossingX <= exit.x + exit.width;
}

function advanceSecuritySweeps(state: WingState): void {
  for (const sweep of state.sweeps) {
    const store = findStore(state.wing, sweep.storeId);
    if (!store) {
      continue;
    }
    const endpointTicks = store.sightZone.sweepTicksPerEndpoint;
    const period = endpointTicks * 2;
    const phase = state.tick % period;
    sweep.facingRadians = securityFacingAtTick(store.sightZone, state.tick);
    sweep.direction = phase < endpointTicks ? 1 : -1;
  }
}

function publishFeedback(state: WingState, feedback: string, updateRecentChange = true): void {
  if (updateRecentChange) {
    state.recentChange = feedback;
  }
  state.behaviorTrace.push(`[t${state.tick}] ${feedback}`);
}

function preserveRejectedActionFeedback(state: WingState, result: WingCommandResult): boolean {
  if (result.accepted) {
    return false;
  }
  publishFeedback(state, result.reason);
  return true;
}

function resolveContextualAction(
  state: WingState,
  interactPressed: boolean,
  stealPressed: boolean,
): boolean {
  const offer = nearestAvailableOffer(state);
  if (interactPressed) {
    if (offer) {
      return preserveRejectedActionFeedback(state, buyOffer(state, offer.id));
    } else if (isNearMallExit(state)) {
      return preserveRejectedActionFeedback(state, leaveWing(state));
    }
    return false;
  }
  if (stealPressed && offer) {
    return preserveRejectedActionFeedback(state, beginTheft(state, offer.id));
  }
  return false;
}

function secureCrossedTheft(state: WingState, previousPosition: Vec2): void {
  const carried = state.carried;
  if (!carried) {
    return;
  }
  const store = findStore(state.wing, carried.sourceStoreId);
  if (
    store &&
    crossedStoreExit(previousPosition, state.player, state.player.radius, store) &&
    secureTheft(state).accepted
  ) {
    // The command's exact wording is the readable one-frame secured feedback.
  }
}

function updateSecurity(state: WingState, preserveActionFeedback: boolean): void {
  const carried = state.carried;
  if (!carried) {
    state.suspicion = 0;
    return;
  }
  const store = findStore(state.wing, carried.sourceStoreId);
  if (!store) {
    return;
  }

  if (canSecuritySeePlayer(state, store)) {
    const gain = 0.5 * (1 + state.heat / 100);
    state.suspicion = clampSuspicion(state.suspicion + gain);
    publishFeedback(state, 'Seen by security.', !preserveActionFeedback);
  } else {
    state.suspicion = clampSuspicion(state.suspicion - 0.75);
    publishFeedback(state, 'Hidden from security.', !preserveActionFeedback);
  }

  if (state.suspicion >= MAX_SUSPICION) {
    confiscateTheft(state);
  }
}

/**
 * Applies exactly one deterministic wing tick:
 * reject, tick/reset feedback, move, sweep, contextual action, secure,
 * detect, then publish feedback/trace.
 */
export function tickWingRun(state: WingState, input: WingInputFrame): void {
  if (state.paused || state.status !== 'shopping') {
    return;
  }

  state.tick += 1;
  state.recentChange = '';

  const interactPressed = input.interact && !state.heldActions.interact;
  const stealPressed = input.steal && !state.heldActions.steal;
  state.heldActions = { interact: input.interact, steal: input.steal };

  const previousPosition = { x: state.player.x, y: state.player.y };
  const direction = normalizedDirection(input.moveX, input.moveY);
  if (direction.x !== 0 || direction.y !== 0) {
    state.player.facing = direction;
  }
  const nextPosition = moveCircle(
    state.player,
    state.player.radius,
    direction.x * (WING_PLAYER_SPEED / TICKS_PER_SECOND),
    direction.y * (WING_PLAYER_SPEED / TICKS_PER_SECOND),
    [...state.wing.walls],
  );
  state.player.x = nextPosition.x;
  state.player.y = nextPosition.y;

  advanceSecuritySweeps(state);
  const preserveActionFeedback = resolveContextualAction(state, interactPressed, stealPressed);
  secureCrossedTheft(state, previousPosition);
  updateSecurity(state, preserveActionFeedback);
}
