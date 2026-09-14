import type { RunState } from '../model';
import { updateLpManager } from './boss';
import { normalizedDirection, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { moveCircle, scaleMovementDelta } from './movement';
import {
  circlesOverlap,
  sweptCircleIntersectsCircle,
  sweptCircleIntersectsRect,
} from './collision';

const TICKS_PER_SECOND = 60;
const HANGER_SPEED_PER_TICK = 95 / TICKS_PER_SECOND;
const SPITTER_TELEGRAPH_TICKS = 36;
const SPITTER_RECOVER_TICKS = 90;
const SPITTER_PROJECTILE_SPEED_PER_TICK = 150 / TICKS_PER_SECOND;
const SPITTER_PROJECTILE_LIFETIME_TICKS = 240;
const PLAYER_INVULNERABILITY_TICKS = 60;

function spawnSpitterProjectile(state: RunState, enemyIndex: number): void {
  const enemy = state.enemies[enemyIndex];
  if (!enemy) {
    return;
  }
  state.projectiles.push({
    id: state.nextEntityId,
    x: enemy.x,
    y: enemy.y,
    previousX: enemy.x,
    previousY: enemy.y,
    velocityX: enemy.telegraphAimX * SPITTER_PROJECTILE_SPEED_PER_TICK,
    velocityY: enemy.telegraphAimY * SPITTER_PROJECTILE_SPEED_PER_TICK,
    radius: 5,
    remainingTicks: SPITTER_PROJECTILE_LIFETIME_TICKS,
    faction: 'enemy',
    damage: 1,
  });
  state.nextEntityId += 1;
}

export function updateEnemies(state: RunState): void {
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    if (!enemy || enemy.health <= 0) {
      continue;
    }

    if (enemy.kind === 'lp_manager') {
      updateLpManager(state, index);
      continue;
    }

    if (enemy.kind === 'hanger') {
      const direction = normalizedDirection(state.player.x - enemy.x, state.player.y - enemy.y);
      // Sticky only slows pursuit. Spitter telegraph and firing timings are
      // untouched because they never read a movement multiplier.
      const movement = scaleMovementDelta(
        direction.x * HANGER_SPEED_PER_TICK,
        direction.y * HANGER_SPEED_PER_TICK,
        effectiveSpeedMultiplier(enemy),
      );
      const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
      enemy.x = next.x;
      enemy.y = next.y;
      continue;
    }

    enemy.phaseTicks -= 1;
    if (enemy.phase === 'recover' && enemy.phaseTicks <= 0) {
      const direction = normalizedDirection(state.player.x - enemy.x, state.player.y - enemy.y);
      enemy.phase = 'telegraph';
      enemy.phaseTicks = SPITTER_TELEGRAPH_TICKS;
      enemy.telegraphAimX = direction.x === 0 && direction.y === 0 ? 1 : direction.x;
      enemy.telegraphAimY = direction.x === 0 && direction.y === 0 ? 0 : direction.y;
    } else if (enemy.phase === 'telegraph' && enemy.phaseTicks <= 0) {
      spawnSpitterProjectile(state, index);
      enemy.phase = 'recover';
      enemy.phaseTicks = SPITTER_RECOVER_TICKS;
    }
  }
}

export function resolveEnemyDamage(state: RunState): void {
  if (state.player.invulnerableTicks > 0) {
    return;
  }
  const touchingHanger = state.enemies.some(
    (enemy) =>
      enemy.health > 0 &&
      enemy.kind === 'hanger' &&
      circlesOverlap(
        state.player.x,
        state.player.y,
        state.player.radius,
        enemy.x,
        enemy.y,
        enemy.radius,
      ),
  );
  if (touchingHanger) {
    state.player.health -= 1;
    state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
  }
}

export function updateProjectiles(state: RunState): void {
  const remaining = [];
  for (const projectile of state.projectiles) {
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    projectile.remainingTicks -= 1;
    if (projectile.remainingTicks <= 0) {
      continue;
    }

    projectile.x += projectile.velocityX;
    projectile.y += projectile.velocityY;
    const outsideRoom =
      projectile.x < -projectile.radius ||
      projectile.x > PLAYFIELD_WIDTH + projectile.radius ||
      projectile.y < -projectile.radius ||
      projectile.y > PLAYFIELD_HEIGHT + projectile.radius;
    const struckWall = state.walls.some((wall) =>
      sweptCircleIntersectsRect(
        projectile.previousX,
        projectile.previousY,
        projectile.x,
        projectile.y,
        projectile.radius,
        wall,
      ),
    );
    if (outsideRoom || struckWall) {
      continue;
    }

    if (
      projectile.faction === 'enemy' &&
      sweptCircleIntersectsCircle(
        projectile.previousX,
        projectile.previousY,
        projectile.x,
        projectile.y,
        projectile.radius,
        state.player.x,
        state.player.y,
        state.player.radius,
      )
    ) {
      if (state.player.invulnerableTicks === 0) {
        state.player.health -= projectile.damage;
        state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
      }
      continue;
    }

    remaining.push(projectile);
  }
  state.projectiles = remaining;
}
