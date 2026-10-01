/**
 * The Mall Walker (round 48): a regular who still does laps before the doors
 * open, and has not noticed the mall died.
 *
 * Calm, it power-walks a fixed loop around where it started and ignores the
 * janitor; a calm walker never blocks clearing a room. Bump into it or hit it
 * and it is `provoked` for good: it chases faster than a Hanger and hurts on
 * touch, then steps back a beat (WALKER_BACKOFF_TICKS) after each hit. It
 * carries the most change of any regular, so starting that fight is a choice.
 */
import { normalizedDirection } from '../core/geometry';
import { createEnemyStatusState, effectiveSpeedMultiplier } from '../effects/statuses';
import type { EnemyState, RunState } from '../model';
import { moveCircle, scaleMovementDelta } from './movement';

export const WALKER_HEALTH = 16;
export const WALKER_RADIUS = 14;
export const WALKER_PATROL_SPEED_PER_TICK = 70 / 60;
export const WALKER_CHASE_SPEED_PER_TICK = 120 / 60;
/** Ticks it holds still after landing a hit, so one bump is one hit. */
export const WALKER_BACKOFF_TICKS = 45;
/** Half the loop's width and height around its starting spot. */
const LOOP_HALF_WIDTH = 110;
const LOOP_HALF_HEIGHT = 50;
/** Its loop, as offsets from home: clockwise around a rectangle. */
const LOOP: readonly (readonly [number, number])[] = [
  [-LOOP_HALF_WIDTH, -LOOP_HALF_HEIGHT],
  [LOOP_HALF_WIDTH, -LOOP_HALF_HEIGHT],
  [LOOP_HALF_WIDTH, LOOP_HALF_HEIGHT],
  [-LOOP_HALF_WIDTH, LOOP_HALF_HEIGHT],
];

export function spawnWalker(id: number, x: number, y: number, health = WALKER_HEALTH): EnemyState {
  return {
    id,
    kind: 'walker',
    x,
    y,
    health,
    radius: WALKER_RADIUS,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    statuses: createEnemyStatusState(),
    homeX: x,
    homeY: y,
    patrolIndex: 0,
    calmHealth: health,
  };
}

/** A walker that has not been bumped or hit: harmless, and not a fight. */
export function calmWalker(enemy: EnemyState): boolean {
  return enemy.kind === 'walker' && enemy.provoked !== true;
}

function step(state: RunState, enemy: EnemyState, toX: number, toY: number, speed: number): number {
  const direction = normalizedDirection(toX - enemy.x, toY - enemy.y);
  const movement = scaleMovementDelta(direction.x * speed, direction.y * speed, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  const moved = Math.hypot(next.x - enemy.x, next.y - enemy.y);
  enemy.x = next.x;
  enemy.y = next.y;
  return moved;
}

export function updateWalker(state: RunState, enemy: EnemyState): void {
  if (!enemy.provoked) {
    // Hit by anything, or walked into by the janitor: that was the last straw.
    const touched = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= enemy.radius + state.player.radius;
    if (enemy.health < (enemy.calmHealth ?? enemy.health) || touched) {
      enemy.provoked = true;
      // The bump itself does not hurt: it turns before it swings.
      enemy.stunnedTicks = WALKER_BACKOFF_TICKS;
      enemy.phase = 'telegraph';
      return;
    }
    const [dx, dy] = LOOP[enemy.patrolIndex ?? 0]!;
    const targetX = (enemy.homeX ?? enemy.x) + dx;
    const targetY = (enemy.homeY ?? enemy.y) + dy;
    const moved = step(state, enemy, targetX, targetY, WALKER_PATROL_SPEED_PER_TICK);
    // At the corner, or stuck on a wall: on to the next corner.
    if (Math.hypot(targetX - enemy.x, targetY - enemy.y) < 4 || moved < WALKER_PATROL_SPEED_PER_TICK * 0.25) {
      enemy.patrolIndex = ((enemy.patrolIndex ?? 0) + 1) % LOOP.length;
    }
    return;
  }
  if ((enemy.stunnedTicks ?? 0) > 0) {
    enemy.stunnedTicks = (enemy.stunnedTicks ?? 0) - 1;
    enemy.phase = 'recover';
    return;
  }
  enemy.phase = 'pursue';
  step(state, enemy, state.player.x, state.player.y, WALKER_CHASE_SPEED_PER_TICK);
}
