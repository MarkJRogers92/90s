import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import { moveCircle } from '../combat/movement';
import type { EnemyState } from '../model';
import type { BenchRunState } from './types';

export const CAR_RADIUS = 9;
export const CAR_SPEED = 4;
export const CAR_SEEK_RANGE = 220;
export const CAR_LEASH = 180;
export const CAR_BUMP_DAMAGE = 1;
export const CAR_BUMP_COOLDOWN_TICKS = 45;
export const CAR_RECALL_DISTANCE = 24;

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
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const deltaX = targetX - playerX;
  const deltaY = targetY - playerY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= CAR_LEASH || distance === 0) {
    return { x: targetX, y: targetY };
  }
  const scale = CAR_LEASH / distance;
  return { x: playerX + deltaX * scale, y: playerY + deltaY * scale };
}

function clampToRoom(x: number, y: number, radius: number): { x: number; y: number } {
  return {
    x: Math.max(radius, Math.min(PLAYFIELD_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(PLAYFIELD_HEIGHT - radius, y)),
  };
}

export function moveCarrierToward(state: BenchRunState, targetX: number, targetY: number): void {
  const carrier = state.carrier;
  const player = state.combat.player;
  const leashed = clampToLeash(player.x, player.y, targetX, targetY);
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
    state.combat.walls,
  );
  const settled = clampToRoom(next.x, next.y, carrier.radius);
  carrier.x = settled.x;
  carrier.y = settled.y;
}

/**
 * Restores the leash after the shared combat tick moves the player.
 *
 * The correction is at most one player step during ordinary play. It goes
 * through the same axis-separated wall solver as every other carrier move, so
 * enforcing the leash cannot place the car inside authored solid geometry.
 */
export function enforceCarrierLeash(state: BenchRunState): void {
  const carrier = state.carrier;
  const player = state.combat.player;
  const deltaX = player.x - carrier.x;
  const deltaY = player.y - carrier.y;
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
    state.combat.walls,
  );
  const settled = clampToRoom(next.x, next.y, carrier.radius);
  carrier.x = settled.x;
  carrier.y = settled.y;
}

function carrierTouchesEnemy(state: BenchRunState, enemy: EnemyState): boolean {
  return (
    Math.hypot(enemy.x - state.carrier.x, enemy.y - state.carrier.y) <
    state.carrier.radius + enemy.radius
  );
}

export function updateIndependentCarrier(state: BenchRunState): void {
  const target = selectCarTarget(state.carrier, state.combat.enemies);
  if (target === null) {
    moveCarrierToward(state, state.combat.player.x, state.combat.player.y);
    return;
  }
  const ownerDistance = Math.hypot(
    target.x - state.combat.player.x,
    target.y - state.combat.player.y,
  );
  if (ownerDistance > CAR_LEASH + state.carrier.radius + target.radius) {
    moveCarrierToward(state, state.combat.player.x, state.combat.player.y);
    return;
  }
  moveCarrierToward(state, target.x, target.y);
  if (state.carrier.bumpCooldownTicks <= 0 && carrierTouchesEnemy(state, target)) {
    target.health -= CAR_BUMP_DAMAGE;
    state.carrier.bumpCooldownTicks = CAR_BUMP_COOLDOWN_TICKS;
  }
}

export function updateEmitterCarrier(state: BenchRunState, aimX: number, aimY: number): void {
  const carrier = state.carrier;
  if (carrier.recalling) {
    const distance = Math.hypot(
      carrier.x - state.combat.player.x,
      carrier.y - state.combat.player.y,
    );
    if (distance <= CAR_RECALL_DISTANCE) {
      carrier.recalling = false;
      return;
    }
    moveCarrierToward(state, state.combat.player.x, state.combat.player.y);
    return;
  }
  moveCarrierToward(state, aimX, aimY);
}
