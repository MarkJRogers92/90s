/**
 * Pure deterministic sight geometry for the M3 stores.
 *
 * Security reads only authored store data and authoritative wing state. Phaser
 * can render the same cone, but never decides whether it sees the player.
 */
import { hasLineOfSight } from '../combat/collision';
import type { Rect, Vec2 } from '../model';
import type { StoreDefinition, StoreSightZone, WingState } from './types';

const EPSILON = 1e-9;

function normalizedRadians(radians: number): number {
  const fullTurn = Math.PI * 2;
  const remainder = radians % fullTurn;
  return remainder < 0 ? remainder + fullTurn : remainder;
}

function smallestAngularDistance(first: number, second: number): number {
  const fullTurn = Math.PI * 2;
  const difference = Math.abs(normalizedRadians(first) - normalizedRadians(second));
  return Math.min(difference, fullTurn - difference);
}

/**
 * Returns the triangular sweep position at a tick. Both endpoints are part of
 * the path, including the turnaround ticks, so replay has no frame ambiguity.
 */
export function securityFacingAtTick(zone: StoreSightZone, tick: number): number {
  const endpointTicks = zone.sweepTicksPerEndpoint;
  if (!Number.isFinite(tick) || endpointTicks <= 0) {
    return zone.centerRadians;
  }

  const period = endpointTicks * 2;
  const phase = ((Math.floor(tick) % period) + period) % period;
  const offset =
    phase <= endpointTicks
      ? -zone.sweepRadians + (2 * zone.sweepRadians * phase) / endpointTicks
      : zone.sweepRadians - (2 * zone.sweepRadians * (phase - endpointTicks)) / endpointTicks;
  return zone.centerRadians + offset;
}

/** Whether a point lies inside an endpoint-inclusive finite sight cone. */
export function isPointInSightCone(
  origin: Vec2,
  facingRadians: number,
  point: Vec2,
  range: number,
  arcDegrees: number,
): boolean {
  if (!Number.isFinite(range) || range < 0 || !Number.isFinite(arcDegrees) || arcDegrees < 0) {
    return false;
  }

  const deltaX = point.x - origin.x;
  const deltaY = point.y - origin.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance > range + EPSILON) {
    return false;
  }
  if (distance <= EPSILON) {
    return true;
  }

  const pointRadians = Math.atan2(deltaY, deltaX);
  const halfArcRadians = (arcDegrees * Math.PI) / 360;
  return smallestAngularDistance(facingRadians, pointRadians) <= halfArcRadians + EPSILON;
}

function containsPoint(rect: Rect, point: Vec2): boolean {
  return (
    point.x >= rect.x - EPSILON &&
    point.x <= rect.x + rect.width + EPSILON &&
    point.y >= rect.y - EPSILON &&
    point.y <= rect.y + rect.height + EPSILON
  );
}

/**
 * A camera mounted on a wall may start on that wall's inner edge. That mounting
 * wall does not occlude its own ray; every other authored wall does.
 */
function isStrictlyInside(rect: Rect, point: Vec2): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function wallsBetweenCameraAndPlayer(walls: readonly Rect[], origin: Vec2, player: Vec2): Rect[] {
  const deltaX = player.x - origin.x;
  const deltaY = player.y - origin.y;
  const distance = Math.hypot(deltaX, deltaY);
  const firstRayPoint =
    distance <= EPSILON
      ? origin
      : {
          x: origin.x + (deltaX / distance) * EPSILON * 10,
          y: origin.y + (deltaY / distance) * EPSILON * 10,
        };

  return walls.filter(
    (wall) => !containsPoint(wall, origin) || isStrictlyInside(wall, firstRayPoint),
  );
}

/** True only when the current store sweep contains an unobstructed player. */
export function canSecuritySeePlayer(state: WingState, store: StoreDefinition): boolean {
  const sweep = state.sweeps.find((candidate) => candidate.storeId === store.id);
  const facingRadians = sweep?.facingRadians ?? securityFacingAtTick(store.sightZone, state.tick);
  const { origin, range, arcDegrees } = store.sightZone;
  const player = { x: state.player.x, y: state.player.y };

  return (
    isPointInSightCone(origin, facingRadians, player, range, arcDegrees) &&
    hasLineOfSight(
      origin.x,
      origin.y,
      player.x,
      player.y,
      wallsBetweenCameraAndPlayer(state.wing.walls, origin, player),
    )
  );
}
