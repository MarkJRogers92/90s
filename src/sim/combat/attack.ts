import type { InputFrame, RunState } from '../model';
import { normalizedDirection } from '../core/geometry';
import { hasLineOfSight } from './collision';

export const MOP_RANGE = 70;
export const MOP_HALF_ANGLE_RADIANS = (40 * Math.PI) / 180;
export const MOP_DAMAGE = 4;
export const MOP_COOLDOWN_TICKS = 27;

export function inAttackCone(
  originX: number,
  originY: number,
  aimX: number,
  aimY: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
  range: number,
  halfAngleRadians: number,
): boolean {
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance > range + targetRadius) {
    return false;
  }
  if (distance === 0) {
    return true;
  }

  let aimDirectionX = aimX - originX;
  let aimDirectionY = aimY - originY;
  const aimLength = Math.hypot(aimDirectionX, aimDirectionY);
  if (aimLength === 0) {
    aimDirectionX = 1;
    aimDirectionY = 0;
  } else {
    aimDirectionX /= aimLength;
    aimDirectionY /= aimLength;
  }
  return (deltaX * aimDirectionX + deltaY * aimDirectionY) / distance >= Math.cos(halfAngleRadians);
}

export function updatePlayerFacing(state: RunState, input: InputFrame): void {
  const direction = normalizedDirection(input.aimX - state.player.x, input.aimY - state.player.y);
  if (direction.x !== 0 || direction.y !== 0) {
    state.player.facing = direction;
  }
}

export function performMopAttack(state: RunState, input: InputFrame): void {
  if (!input.fire || state.player.attackCooldownTicks > 0) {
    return;
  }

  state.player.attackCooldownTicks = MOP_COOLDOWN_TICKS;
  state.player.attackActiveTicks = 6;

  for (const enemy of state.enemies) {
    if (
      enemy.health > 0 &&
      inAttackCone(
        state.player.x,
        state.player.y,
        input.aimX,
        input.aimY,
        enemy.x,
        enemy.y,
        enemy.radius,
        MOP_RANGE,
        MOP_HALF_ANGLE_RADIANS,
      ) &&
      hasLineOfSight(state.player.x, state.player.y, enemy.x, enemy.y, state.walls)
    ) {
      enemy.health -= MOP_DAMAGE;
    }
  }
}
