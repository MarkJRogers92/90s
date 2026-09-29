/**
 * Cues that help the player read their own state: when the dash is ready, a
 * hint to use it when an attack is coming at them, the last-heart heartbeat,
 * and enemies visibly arriving when a room starts. Pure: every answer comes
 * from state the simulation already wrote.
 */
import { DASH_COOLDOWN_TICKS } from '../../sim/combat/dash';
import { REST_POSE, type SpritePose, type Windup } from './combatBeats';

/** After this many dashes the player knows the key; the hint retires. */
export const DASH_HINT_LIMIT = 3;
/** Health at or below which the heartbeat starts (one heart = 2 health). */
export const LOW_HEALTH = 2;
/** Ticks an enemy takes to rise into a room when the room starts. */
export const SPAWN_IN_TICKS = 18;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** 1 when a dash can start, rising from 0 as the cooldown runs out. */
export function dashReadiness(player: { readonly dashCooldownTicks?: number }, cooldownTicks = DASH_COOLDOWN_TICKS): number {
  return clamp01(1 - (player.dashCooldownTicks ?? 0) / cooldownTicks);
}

type Point = { readonly x: number; readonly y: number };

/** Is this wind-up about to hit the janitor where they stand? */
function threatens(enemy: Point, windup: Windup, player: Point): boolean {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (windup.kind === 'slam') return distance <= (windup.reach ?? 0) + 12;
  if (windup.kind === 'blink') {
    return Math.hypot(player.x - (windup.targetX ?? enemy.x), player.y - (windup.targetY ?? enemy.y)) <= (windup.reach ?? 0) + 8;
  }
  if (windup.kind === 'charge') {
    if (distance === 0 || distance > (windup.reach ?? 0) + 40) return false;
    return (dx * windup.aimX + dy * windup.aimY) / distance > 0.9;
  }
  if (windup.kind === 'spit' || windup.kind === 'volley') {
    if (distance === 0 || distance > 320) return false;
    const along = (dx * windup.aimX + dy * windup.aimY) / distance;
    // Within about 25 degrees of the aim (the volley's fan is wider).
    return along > (windup.kind === 'volley' ? 0.8 : 0.9);
  }
  return false;
}

/**
 * Whether to pop the SPACE DASH hint over the janitor: an attack past a third
 * of its wind-up is aimed at them, a dash is ready, and they have not yet
 * dashed enough times to have learned it.
 */
export function shouldHintDash(
  threats: ReadonlyArray<{ readonly enemy: Point; readonly windups: readonly Windup[] }>,
  player: Point,
  readiness: number,
  dashesSoFar: number,
): boolean {
  if (dashesSoFar >= DASH_HINT_LIMIT || readiness < 1) return false;
  return threats.some(({ enemy, windups }) => windups.some((windup) => windup.progress > 0.3 && threatens(enemy, windup, player)));
}

/** Milliseconds between heartbeats at this health, or null for none. */
export function heartbeatIntervalMs(health: number): number | null {
  if (health <= 0 || health > LOW_HEALTH) return null;
  return health <= 1 ? 560 : 820;
}

/** An enemy rising into the room: flattened and flashing, then springing up. */
export function spawnInPose(age: number): SpritePose {
  if (age < 0 || age >= SPAWN_IN_TICKS) return REST_POSE;
  const t = age / SPAWN_IN_TICKS;
  const rise = 1 - (1 - t) * (1 - t);
  const overshoot = Math.sin(t * Math.PI) * 0.12;
  return {
    offsetX: 0,
    offsetY: 0,
    scaleX: 1.3 - 0.3 * rise - overshoot * 0.5,
    scaleY: 0.2 + 0.8 * rise + overshoot,
    flash: age < 6,
  };
}
