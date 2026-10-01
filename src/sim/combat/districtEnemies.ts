/**
 * The district monsters (round 50), one per district (see wing/districts.ts).
 *
 *   Animatronic Elf   (Holiday Village) hops: it marks where it will land,
 *                     leaps, and stomps whoever is under it on landing.
 *   Perfume Spritzer  (Glamour Row) keeps her distance and spritzes a cloud
 *                     at where the janitor stands: a sting on the spot, then a
 *                     lingering cloud that slows walking (not dashing).
 *   Rabid Poodle      (Pet Paradise) rests, crouches, then dashes in a short
 *                     straight line, a little to one side then the other.
 *                     Only the dash bites.
 *   Hockey Goon       (Skate Arena) skates with momentum, body-checks at
 *                     speed, and stops to slap a puck down a locked lane.
 *
 * Every wind-up locks its aim at the start and is drawn by the view, so each
 * one can be read and dodged. Summoned by a mini-boss they arrive with only
 * the basic enemy fields, so every rule here tolerates the optional ones
 * being absent.
 */
import { circleIntersectsRect, normalizedDirection, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import type { EnemyState, RunState, Vec2 } from '../model';
import { effectiveSpeedMultiplier } from '../effects/statuses';
import { playerDashing } from './dash';
import { moveCircle, scaleMovementDelta } from './movement';
import { PERFUME_CLOUD_RADIUS, PERFUME_MAX_CLOUDS, PERFUME_CLOUD_TICKS } from './perfume';

export { PERFUME_CLOUD_RADIUS, PERFUME_CLOUD_TICKS, PERFUME_SLOW, fadePerfume, inPerfume } from './perfume';

const PLAYER_INVULNERABILITY_TICKS = 60;

/** One hit on the janitor, unless they are invulnerable or mid-dash. True when it landed. */
function hurt(state: RunState, damage = 1): boolean {
  if (state.player.invulnerableTicks > 0 || playerDashing(state)) return false;
  state.player.health -= damage;
  state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
  return true;
}

function lockAim(enemy: EnemyState, toward: Vec2): void {
  const aim = normalizedDirection(toward.x - enemy.x, toward.y - enemy.y);
  enemy.telegraphAimX = aim.x === 0 && aim.y === 0 ? 1 : aim.x;
  enemy.telegraphAimY = aim.x === 0 && aim.y === 0 ? 0 : aim.y;
}

function walk(state: RunState, enemy: EnemyState, toward: Vec2, speed: number, sign: 1 | -1 = 1): void {
  const direction = normalizedDirection(toward.x - enemy.x, toward.y - enemy.y);
  const movement = scaleMovementDelta(sign * direction.x * speed, sign * direction.y * speed, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, movement.x, movement.y, state.walls);
  enemy.x = next.x;
  enemy.y = next.y;
}

/* ---- Animatronic Elf --------------------------------------------------- */

export const ELF_HEALTH = 14;
export const ELF_RADIUS = 13;
/** The landing ring shows this long before the leap. */
export const ELF_CROUCH_TICKS = 28;
export const ELF_HOP_TICKS = 22;
export const ELF_REST_TICKS = 44;
export const ELF_HOP_RANGE = 160;
export const ELF_STOMP_RADIUS = 30;

/** Where an elf would land hopping at the janitor: in reach, on the floor, never in a wall. */
export function elfLanding(state: RunState, enemy: EnemyState): Vec2 {
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  const reach = Math.min(distance, ELF_HOP_RANGE);
  const x = Math.max(enemy.radius, Math.min(PLAYFIELD_WIDTH - enemy.radius, enemy.x + (distance === 0 ? 0 : (dx / distance) * reach)));
  const y = Math.max(enemy.radius, Math.min(PLAYFIELD_HEIGHT - enemy.radius, enemy.y + (distance === 0 ? 0 : (dy / distance) * reach)));
  return state.walls.some((wall) => circleIntersectsRect(x, y, enemy.radius, wall)) ? { x: enemy.x, y: enemy.y } : { x, y };
}

export function updateElf(state: RunState, enemy: EnemyState): void {
  if (enemy.phase === 'recover') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      const landing = elfLanding(state, enemy);
      enemy.lobX = landing.x;
      enemy.lobY = landing.y;
      lockAim(enemy, landing);
      enemy.phase = 'telegraph';
      enemy.phaseTicks = ELF_CROUCH_TICKS;
    }
    return;
  }
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      enemy.blinkX = enemy.x;
      enemy.blinkY = enemy.y;
      enemy.phase = 'pursue';
      enemy.chargeTicks = ELF_HOP_TICKS;
    }
    return;
  }
  // In the air: a straight line from take-off to the ring.
  const left = Math.max(0, (enemy.chargeTicks ?? 0) - 1);
  enemy.chargeTicks = left;
  const t = 1 - left / ELF_HOP_TICKS;
  const from = { x: enemy.blinkX ?? enemy.x, y: enemy.blinkY ?? enemy.y };
  const to = { x: enemy.lobX ?? enemy.x, y: enemy.lobY ?? enemy.y };
  enemy.x = from.x + (to.x - from.x) * t;
  enemy.y = from.y + (to.y - from.y) * t;
  if (left > 0) return;
  if (Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= ELF_STOMP_RADIUS + state.player.radius) hurt(state);
  enemy.phase = 'recover';
  enemy.phaseTicks = ELF_REST_TICKS;
}

/* ---- Perfume Spritzer -------------------------------------------------- */

export const SPRITZER_HEALTH = 16;
export const SPRITZER_RADIUS = 13;
export const SPRITZ_WINDUP_TICKS = 30;
export const SPRITZ_RECOVER_TICKS = 110;
export const SPRITZ_RANGE = 260;
export const SPRITZER_KEEP_AWAY = 150;
const SPRITZER_WALK = 60 / 60;

/** A spritz lands: a sting for whoever stands in it, and a cloud left hanging. */
export function spritz(state: RunState, x: number, y: number): void {
  if (Math.hypot(state.player.x - x, state.player.y - y) <= PERFUME_CLOUD_RADIUS) hurt(state);
  state.perfume = [...(state.perfume ?? []), { x, y, radius: PERFUME_CLOUD_RADIUS, ticks: PERFUME_CLOUD_TICKS }].slice(-PERFUME_MAX_CLOUDS);
}

export function updateSpritzer(state: RunState, enemy: EnemyState): void {
  const player = state.player;
  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (enemy.phase === 'telegraph') {
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      spritz(state, enemy.lobX ?? player.x, enemy.lobY ?? player.y);
      enemy.phase = 'recover';
      enemy.phaseTicks = SPRITZ_RECOVER_TICKS;
    }
    return;
  }
  if (enemy.phase === 'recover') {
    enemy.phaseTicks -= 1;
    if (distance < SPRITZER_KEEP_AWAY) walk(state, enemy, player, SPRITZER_WALK, -1);
    if (enemy.phaseTicks <= 0) enemy.phase = 'pursue';
    return;
  }
  if (distance <= SPRITZ_RANGE) {
    enemy.phase = 'telegraph';
    enemy.phaseTicks = SPRITZ_WINDUP_TICKS;
    enemy.lobX = player.x;
    enemy.lobY = player.y;
    lockAim(enemy, player);
    return;
  }
  walk(state, enemy, player, SPRITZER_WALK);
}

/* ---- Rabid Poodle ------------------------------------------------------ */

export const POODLE_HEALTH = 12;
export const POODLE_RADIUS = 12;
export const POODLE_REST_TICKS = 36;
export const POODLE_CROUCH_TICKS = 16;
export const POODLE_DASH_TICKS = 18;
export const POODLE_DASH_SPEED = 7;
/** Each dash leans this far off the straight line, alternating sides: still on a janitor who stands still, off one who guesses the wrong way. */
export const POODLE_ZIG_DEGREES = 8;

export function updatePoodle(state: RunState, enemy: EnemyState): void {
  if ((enemy.chargeTicks ?? 0) > 0) {
    const before = { x: enemy.x, y: enemy.y };
    const next = moveCircle(enemy, enemy.radius, enemy.telegraphAimX * POODLE_DASH_SPEED, enemy.telegraphAimY * POODLE_DASH_SPEED, state.walls);
    enemy.x = next.x;
    enemy.y = next.y;
    enemy.chargeTicks = (enemy.chargeTicks ?? 0) - 1;
    const bit = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <= enemy.radius + state.player.radius;
    const blocked = Math.hypot(enemy.x - before.x, enemy.y - before.y) < POODLE_DASH_SPEED * 0.5;
    if (bit) hurt(state);
    if (bit || blocked || enemy.chargeTicks === 0) {
      enemy.chargeTicks = 0;
      enemy.phase = 'recover';
      enemy.phaseTicks = POODLE_REST_TICKS;
    }
    return;
  }
  enemy.phaseTicks -= 1;
  if (enemy.phase === 'telegraph') {
    if (enemy.phaseTicks <= 0) {
      enemy.phase = 'pursue';
      enemy.chargeTicks = POODLE_DASH_TICKS;
    }
    return;
  }
  if (enemy.phaseTicks > 0) return;
  // Crouch, aimed a little to one side of the janitor, the other side next time.
  enemy.cooldownTicks += 1;
  const side = enemy.cooldownTicks % 2 === 0 ? 1 : -1;
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + side * (POODLE_ZIG_DEGREES * Math.PI) / 180;
  enemy.telegraphAimX = Math.cos(angle);
  enemy.telegraphAimY = Math.sin(angle);
  enemy.phase = 'telegraph';
  enemy.phaseTicks = POODLE_CROUCH_TICKS;
}

/* ---- Hockey Goon ------------------------------------------------------- */

export const GOON_HEALTH = 22;
export const GOON_RADIUS = 14;
export const GOON_PUSH = 0.12;
export const GOON_MAX_SPEED = 3.2;
export const GOON_FRICTION = 0.97;
/** Faster than this, touching the janitor is a body check. */
export const GOON_CHECK_SPEED = 2;
export const GOON_SHOT_CADENCE = 160;
export const GOON_WINDUP_TICKS = 30;
export const PUCK_SPEED = 5;
export const PUCK_RADIUS = 5;
const PUCK_LIFETIME = 120;

export function updateGoon(state: RunState, enemy: EnemyState): void {
  const player = state.player;
  let vx = enemy.vx ?? 0;
  let vy = enemy.vy ?? 0;
  if (enemy.phase === 'telegraph') {
    // Digging in for the shot: the skates bite and it slows to a stop.
    vx *= 0.85;
    vy *= 0.85;
    enemy.phaseTicks -= 1;
    if (enemy.phaseTicks <= 0) {
      state.projectiles.push({
        id: state.nextEntityId,
        x: enemy.x,
        y: enemy.y,
        previousX: enemy.x,
        previousY: enemy.y,
        velocityX: enemy.telegraphAimX * PUCK_SPEED,
        velocityY: enemy.telegraphAimY * PUCK_SPEED,
        radius: PUCK_RADIUS,
        remainingTicks: PUCK_LIFETIME,
        faction: 'enemy',
        damage: 1,
      });
      state.nextEntityId += 1;
      enemy.phase = 'pursue';
      enemy.cooldownTicks = GOON_SHOT_CADENCE;
    }
  } else {
    // Arriving, it skates a beat before its first shot.
    if (enemy.phase === 'recover') {
      enemy.phaseTicks -= 1;
      if (enemy.phaseTicks <= 0) {
        enemy.phase = 'pursue';
        enemy.cooldownTicks = GOON_SHOT_CADENCE / 2;
      }
    }
    const direction = normalizedDirection(player.x - enemy.x, player.y - enemy.y);
    vx = vx * GOON_FRICTION + direction.x * GOON_PUSH;
    vy = vy * GOON_FRICTION + direction.y * GOON_PUSH;
    const speed = Math.hypot(vx, vy);
    if (speed > GOON_MAX_SPEED) {
      vx = (vx / speed) * GOON_MAX_SPEED;
      vy = (vy / speed) * GOON_MAX_SPEED;
    }
    if (enemy.phase === 'pursue') enemy.cooldownTicks -= 1;
    if (enemy.phase === 'pursue' && enemy.cooldownTicks <= 0) {
      enemy.phase = 'telegraph';
      enemy.phaseTicks = GOON_WINDUP_TICKS;
      lockAim(enemy, player);
    }
  }
  const scaled = scaleMovementDelta(vx, vy, effectiveSpeedMultiplier(enemy));
  const next = moveCircle(enemy, enemy.radius, scaled.x, scaled.y, state.walls);
  // Into the boards: the momentum goes.
  if (Math.abs(next.x - enemy.x) < Math.abs(scaled.x) * 0.5) vx *= -0.3;
  if (Math.abs(next.y - enemy.y) < Math.abs(scaled.y) * 0.5) vy *= -0.3;
  enemy.x = next.x;
  enemy.y = next.y;
  // A body check at speed, then it bounces off.
  const touching = Math.hypot(player.x - enemy.x, player.y - enemy.y) <= enemy.radius + player.radius;
  if (touching && Math.hypot(vx, vy) >= GOON_CHECK_SPEED && hurt(state)) {
    vx *= -0.5;
    vy *= -0.5;
  }
  enemy.vx = vx;
  enemy.vy = vy;
}
