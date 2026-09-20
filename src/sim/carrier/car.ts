/**
 * Shared Remote-Control Carrier physics.
 *
 * M4's bench run and M5's MVP run drive the same authored carrier: the same
 * constants, the same seek ordering, the same leash enforcement, the same
 * axis-separated wall solving, and the same recall rule. This module owns that
 * single rule. Each run supplies its own carrier, owner, walls, and enemies, so
 * neither run keeps a second copy of the behaviour.
 *
 * The carrier is deliberately renderer-blind: it mutates positions and enemy
 * health only, and every movement goes through the shared circle-versus-wall
 * solver so enforcing the leash can never place the car inside authored solid
 * geometry.
 */
import { moveCircle } from '../combat/movement';
import { circleIntersectsRect, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import type { EnemyState, Rect, Vec2 } from '../model';

export type CarrierMode = 'independent' | 'emitter';

export type CarrierState = {
  mode: CarrierMode;
  x: number;
  y: number;
  radius: number;
  bumpCooldownTicks: number;
  recalling: boolean;
};

/** The minimal owner view the carrier needs: the leash anchor's position. */
export type CarrierOwner = { readonly x: number; readonly y: number };

export const CAR_RADIUS = 9;
export const CAR_SPEED = 4;
export const CAR_SEEK_RANGE = 220;
export const CAR_LEASH = 180;
export const CAR_BUMP_DAMAGE = 1;
export const CAR_BUMP_COOLDOWN_TICKS = 45;
export const CAR_RECALL_DISTANCE = 24;

/**
 * The fixed order candidate offsets are tried when parking a fresh carrier.
 * Cardinal directions first, then diagonals, so the chosen spot is stable and
 * reads as "beside the owner" rather than on top of them.
 */
const CAR_PARK_OFFSETS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
];

/**
 * The nearest living enemy inside seek range, breaking equal distances by the
 * lower stable entity ID so the choice never depends on array order.
 */
export function selectCarTarget(
  car: { x: number; y: number },
  enemies: readonly EnemyState[],
): EnemyState | null {
  let best: EnemyState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (enemy.health <= 0) {
      continue;
    }
    const distance = Math.hypot(enemy.x - car.x, enemy.y - car.y);
    if (distance > CAR_SEEK_RANGE) {
      continue;
    }
    if (
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && enemy.id < best.id)
    ) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

function clampToLeash(
  owner: CarrierOwner,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const deltaX = targetX - owner.x;
  const deltaY = targetY - owner.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= CAR_LEASH || distance === 0) {
    return { x: targetX, y: targetY };
  }
  const scale = CAR_LEASH / distance;
  return { x: owner.x + deltaX * scale, y: owner.y + deltaY * scale };
}

function clampToRoom(x: number, y: number, radius: number): { x: number; y: number } {
  return {
    x: Math.max(radius, Math.min(PLAYFIELD_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(PLAYFIELD_HEIGHT - radius, y)),
  };
}

/**
 * Moves the carrier one step toward a target, clamped to the owner leash
 * first and to the room second, through the shared wall solver.
 */
export function moveCarrierToward(
  carrier: CarrierState,
  owner: CarrierOwner,
  walls: Rect[],
  targetX: number,
  targetY: number,
): void {
  const leashed = clampToLeash(owner, targetX, targetY);
  const bounded = clampToRoom(leashed.x, leashed.y, carrier.radius);
  const deltaX = bounded.x - carrier.x;
  const deltaY = bounded.y - carrier.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    return;
  }
  const step = Math.min(CAR_SPEED, distance);
  const next = moveCircle(
    carrier,
    carrier.radius,
    (deltaX / distance) * step,
    (deltaY / distance) * step,
    walls,
  );
  const settled = clampToRoom(next.x, next.y, carrier.radius);
  carrier.x = settled.x;
  carrier.y = settled.y;
}

/**
 * Restores the leash after the shared combat tick moves the owner.
 *
 * The correction is at most one owner step during ordinary play. It goes
 * through the same axis-separated wall solver as every other carrier move, so
 * enforcing the leash cannot place the car inside authored solid geometry.
 */
export function enforceCarrierLeash(
  carrier: CarrierState,
  owner: CarrierOwner,
  walls: Rect[],
): void {
  const deltaX = owner.x - carrier.x;
  const deltaY = owner.y - carrier.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= CAR_LEASH || distance === 0) {
    return;
  }
  const correction = distance - CAR_LEASH;
  const next = moveCircle(
    carrier,
    carrier.radius,
    (deltaX / distance) * correction,
    (deltaY / distance) * correction,
    walls,
  );
  const settled = clampToRoom(next.x, next.y, carrier.radius);
  carrier.x = settled.x;
  carrier.y = settled.y;
}

function carrierTouchesEnemy(carrier: CarrierState, enemy: EnemyState): boolean {
  return Math.hypot(enemy.x - carrier.x, enemy.y - carrier.y) < carrier.radius + enemy.radius;
}

/**
 * Independent mode: seek the nearest eligible enemy inside seek range, bump it
 * on contact subject to the cooldown, and return to the owner when no target is
 * eligible or the target sits too far outside the leash to be reached.
 */
export function updateIndependentCarrier(
  carrier: CarrierState,
  owner: CarrierOwner,
  walls: Rect[],
  enemies: readonly EnemyState[],
): void {
  const target = selectCarTarget(carrier, enemies);
  if (target === null) {
    moveCarrierToward(carrier, owner, walls, owner.x, owner.y);
    return;
  }
  const ownerDistance = Math.hypot(target.x - owner.x, target.y - owner.y);
  if (ownerDistance > CAR_LEASH + carrier.radius + target.radius) {
    moveCarrierToward(carrier, owner, walls, owner.x, owner.y);
    return;
  }
  moveCarrierToward(carrier, owner, walls, target.x, target.y);
  if (carrier.bumpCooldownTicks <= 0 && carrierTouchesEnemy(carrier, target)) {
    target.health -= CAR_BUMP_DAMAGE;
    carrier.bumpCooldownTicks = CAR_BUMP_COOLDOWN_TICKS;
  }
}

/**
 * Emitter mode: steer the firing origin toward the aim point, unless a recall
 * is in flight, in which case return to the owner until within recall distance.
 */
export function updateEmitterCarrier(
  carrier: CarrierState,
  owner: CarrierOwner,
  walls: Rect[],
  aimX: number,
  aimY: number,
): void {
  if (carrier.recalling) {
    const distance = Math.hypot(carrier.x - owner.x, carrier.y - owner.y);
    if (distance <= CAR_RECALL_DISTANCE) {
      carrier.recalling = false;
      return;
    }
    moveCarrierToward(carrier, owner, walls, owner.x, owner.y);
    return;
  }
  moveCarrierToward(carrier, owner, walls, aimX, aimY);
}

/**
 * The explicit projectile origin a fused Emitter Mount fires from.
 *
 * Returns null while no fused carrier exists, so the shared combat tick keeps
 * originating shots at the player and no caller has to branch on item data.
 */
export function emitterProjectileOrigin(
  carrier: CarrierState | null,
): Vec2 | null {
  if (carrier === null || carrier.mode !== 'emitter') {
    return null;
  }
  return { x: carrier.x, y: carrier.y };
}

/** A carrier at rest beside its owner, or null while the run owns none. */
export function createCarrierAt(x: number, y: number, mode: CarrierMode): CarrierState {
  return {
    mode,
    x,
    y,
    radius: CAR_RADIUS,
    bumpCooldownTicks: 0,
    recalling: false,
  };
}

/**
 * The deterministic parking spot for a carrier that has just been acquired or
 * has followed its owner through a doorway.
 *
 * Candidates are tried in a fixed order and the first valid one wins, so the
 * same owner position and walls always produce the same spot and a replay stays
 * reproducible. A spot is valid when the car is inside the playfield and
 * outside authored solid geometry; the owner's own position is the final
 * fallback, which is valid because the owner already occupies it.
 */
export function findCarrierSpawn(
  owner: CarrierOwner,
  ownerRadius: number,
  walls: readonly Rect[],
): Vec2 {
  const distance = ownerRadius + CAR_RADIUS + 4;
  for (const offset of CAR_PARK_OFFSETS) {
    const length = Math.hypot(offset.x, offset.y);
    const x = owner.x + (offset.x / length) * distance;
    const y = owner.y + (offset.y / length) * distance;
    if (!insidePlayfield(x, y, CAR_RADIUS)) {
      continue;
    }
    if (walls.some((wall) => circleIntersectsRect(x, y, CAR_RADIUS, wall))) {
      continue;
    }
    return { x, y };
  }
  return { x: owner.x, y: owner.y };
}

function insidePlayfield(x: number, y: number, radius: number): boolean {
  return (
    x >= radius &&
    x <= PLAYFIELD_WIDTH - radius &&
    y >= radius &&
    y <= PLAYFIELD_HEIGHT - radius
  );
}
