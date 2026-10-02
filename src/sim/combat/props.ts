/**
 * Mall props (round 53): familiar things in a regular fight that behave the
 * same every time, so the room itself is a weapon.
 *
 * - Shopping cart: hit it, shoot it or walk into it and it rolls; a rolling
 *   cart bowls over the first few monsters it meets.
 * - Soda machine: solid. Hit it and it bursts once: a spray that stings, and
 *   a puddle that soaks (Wet) everything standing in it, ready to conduct.
 * - Clothing rack: solid. Hit it and it topples away from the janitor into a
 *   long low wall, flattening whatever it lands on.
 *
 * Runs at the end of the central tick, after this tick's shots have moved.
 */
import { circleIntersectsRect, normalizedDirection } from '../core/geometry';
import type { EnemyState, InputFrame, MallProp, MallPropKind, Rect, RunState, Vec2 } from '../model';
import { ATTACK_ACTIVE_TICKS } from '../effects/constants';
import { createSurfacePatch } from '../effects/surfaces';
import { inAttackCone } from './attack';
import { circlesOverlap } from './collision';
import { moveCircle } from './movement';
import { isPlayerProjectile } from '../effects/playerProjectiles';
import { isBossKind } from './boss';

export const CART_RADIUS = 14;
const CART_HIT_SPEED = 8;
const CART_BUMP_SPEED = 5;
const CART_FRICTION = 0.97;
export const CART_DAMAGE = 5;
const CART_PUSH = 30;
const CART_DAZE_TICKS = 24;

const SODA_HALF = { x: 18, y: 14 };
export const SODA_DAMAGE = 2;
export const SODA_PUDDLE_RADIUS = 90;
const SODA_PUDDLE_TICKS = 600;

const RACK_HALF = { x: 20, y: 9 };
const RACK_LENGTH = 96;
const RACK_THICKNESS = 18;
export const RACK_DAMAGE = 5;
const RACK_DAZE_TICKS = 45;

/** How near a shot has to pass to count as hitting a prop. */
const SHOT_REACH = 34;

export function createProp(id: number, kind: MallPropKind, x: number, y: number): MallProp {
  return { id, kind, x, y, state: 'standing', vx: 0, vy: 0, hit: [] };
}

/** The walls a prop puts in the room: a soda machine, a standing rack, a fallen rack. */
export function propWall(prop: MallProp): Rect | null {
  // Native-size test props: a shallow footprint at their bottom-center anchor.
  const testHalf = prop.kind === 'bakery' ? 30 : prop.kind === 'monitors' ? 24 : prop.kind === 'slush' ? 17 : null;
  if (testHalf !== null) return { x: prop.x - testHalf, y: prop.y - 12, width: testHalf * 2, height: 12 };
  if (prop.kind === 'soda') return { x: prop.x - SODA_HALF.x, y: prop.y - SODA_HALF.y, width: SODA_HALF.x * 2, height: SODA_HALF.y * 2 };
  if (prop.kind !== 'rack') return null;
  if (prop.state !== 'fallen' || !prop.fall) return { x: prop.x - RACK_HALF.x, y: prop.y - RACK_HALF.y, width: RACK_HALF.x * 2, height: RACK_HALF.y * 2 };
  const { axis, sign } = prop.fall;
  const start = sign > 0 ? 0 : -RACK_LENGTH;
  return axis === 'x'
    ? { x: prop.x + start, y: prop.y - RACK_THICKNESS / 2, width: RACK_LENGTH, height: RACK_THICKNESS }
    : { x: prop.x - RACK_THICKNESS / 2, y: prop.y + start, width: RACK_THICKNESS, height: RACK_LENGTH };
}

export function propWalls(props: readonly MallProp[]): Rect[] {
  return props.map(propWall).filter((wall): wall is Rect => wall !== null);
}

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function hurt(enemy: EnemyState, damage: number, daze: number): void {
  enemy.health -= damage;
  if (!isBossKind(enemy.kind)) enemy.dazedTicks = Math.max(enemy.dazedTicks ?? 0, daze);
}

/** Moves a circle out of a rect along the shorter way, if it is inside. */
function pushOut(body: Vec2 & { radius: number }, rect: Rect): void {
  if (!circleIntersectsRect(body.x, body.y, body.radius, rect)) return;
  const options = [
    { x: rect.x - body.radius - 1, y: body.y },
    { x: rect.x + rect.width + body.radius + 1, y: body.y },
    { x: body.x, y: rect.y - body.radius - 1 },
    { x: body.x, y: rect.y + rect.height + body.radius + 1 },
  ];
  options.sort((a, b) => Math.hypot(a.x - body.x, a.y - body.y) - Math.hypot(b.x - body.x, b.y - body.y));
  body.x = options[0]!.x;
  body.y = options[0]!.y;
}

/** Something struck `prop`, travelling `dir`. */
function strike(state: RunState, prop: MallProp, dir: Vec2): void {
  if (prop.kind === 'cart') {
    prop.state = 'rolling';
    prop.vx = dir.x * CART_HIT_SPEED;
    prop.vy = dir.y * CART_HIT_SPEED;
    prop.hit = [];
    return;
  }
  if (prop.state !== 'standing') return;
  if (prop.kind === 'bakery' || prop.kind === 'monitors' || prop.kind === 'slush') {
    prop.state = 'broken';
    prop.brokenTick = state.tick;
    return;
  }
  if (prop.kind === 'soda') {
    prop.state = 'broken';
    createSurfacePatch(state, { x: prop.x, y: prop.y, radius: SODA_PUDDLE_RADIUS, ticks: SODA_PUDDLE_TICKS, rootActionId: 0, sourceItemIds: [] });
    for (const enemy of state.enemies) {
      if (enemy.health > 0 && circlesOverlap(prop.x, prop.y, SODA_PUDDLE_RADIUS, enemy.x, enemy.y, enemy.radius)) hurt(enemy, SODA_DAMAGE, 0);
    }
    return;
  }
  // A rack falls the way it was pushed, along whichever axis the push mostly was.
  const standing = propWall(prop)!;
  prop.state = 'fallen';
  prop.fall = Math.abs(dir.x) >= Math.abs(dir.y) ? { axis: 'x', sign: dir.x >= 0 ? 1 : -1 } : { axis: 'y', sign: dir.y >= 0 ? 1 : -1 };
  const fallen = propWall(prop)!;
  state.walls = state.walls.filter((wall) => !sameRect(wall, standing));
  state.walls.push(fallen);
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || !circleIntersectsRect(enemy.x, enemy.y, enemy.radius, fallen)) continue;
    hurt(enemy, RACK_DAMAGE, RACK_DAZE_TICKS);
    pushOut(enemy, fallen);
  }
  pushOut(state.player, fallen);
}

/** The props' turn: what the janitor hit, carts on the move. */
export function updateProps(state: RunState, input: InputFrame): void {
  const props = state.props;
  if (!props || props.length === 0) return;
  const player = state.player;
  const primary = state.compiledLoadout.primary;
  // A swing that started this tick hits the props in its arc.
  if (primary.delivery === 'direct' && player.attackActiveTicks === ATTACK_ACTIVE_TICKS && input.fire) {
    const dir = normalizedDirection(input.aimX - player.x, input.aimY - player.y);
    for (const prop of props) {
      if (inAttackCone(player.x, player.y, input.aimX, input.aimY, prop.x, prop.y, 18, primary.range, primary.halfAngleRadians)) {
        // It goes the way it was swung at: from the janitor through the prop.
        const away = normalizedDirection(prop.x - player.x, prop.y - player.y);
        strike(state, prop, away.x === 0 && away.y === 0 ? dir : away);
      }
    }
  }
  // A shot that reaches a prop is spent on it.
  state.projectiles = state.projectiles.filter((shot) => {
    if (!isPlayerProjectile(shot)) return true;
    const prop = props.find((candidate) => Math.hypot(shot.x - candidate.x, shot.y - candidate.y) <= SHOT_REACH + shot.radius && !(candidate.kind !== 'cart' && candidate.state !== 'standing'));
    if (!prop) return true;
    strike(state, prop, normalizedDirection(shot.velocityX, shot.velocityY));
    return false;
  });
  for (const prop of props) if (prop.kind === 'cart') rollCart(state, prop, input);
}

function rollCart(state: RunState, cart: MallProp, input: InputFrame): void {
  const player = state.player;
  // Walking into a still cart shoves it off.
  const walking = input.moveX !== 0 || input.moveY !== 0;
  if (cart.state === 'standing' && walking && circlesOverlap(player.x, player.y, player.radius, cart.x, cart.y, CART_RADIUS)) {
    const away = normalizedDirection(cart.x - player.x, cart.y - player.y);
    cart.state = 'rolling';
    cart.vx = away.x * CART_BUMP_SPEED;
    cart.vy = away.y * CART_BUMP_SPEED;
    cart.hit = [];
  }
  if (cart.state !== 'rolling') return;
  const next = moveCircle(cart, CART_RADIUS, cart.vx, cart.vy, state.walls);
  if (Math.abs(next.x - (cart.x + cart.vx)) > 0.01) cart.vx = -cart.vx * 0.4;
  if (Math.abs(next.y - (cart.y + cart.vy)) > 0.01) cart.vy = -cart.vy * 0.4;
  cart.x = next.x;
  cart.y = next.y;
  cart.vx *= CART_FRICTION;
  cart.vy *= CART_FRICTION;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || cart.hit.includes(enemy.id)) continue;
    if (!circlesOverlap(cart.x, cart.y, CART_RADIUS, enemy.x, enemy.y, enemy.radius)) continue;
    cart.hit.push(enemy.id);
    hurt(enemy, CART_DAMAGE, CART_DAZE_TICKS);
    if (!isBossKind(enemy.kind)) {
      const push = normalizedDirection(cart.vx, cart.vy);
      const moved = moveCircle(enemy, enemy.radius, push.x * CART_PUSH, push.y * CART_PUSH, state.walls);
      enemy.x = moved.x;
      enemy.y = moved.y;
    }
    cart.vx *= 0.6;
    cart.vy *= 0.6;
  }
  if (Math.hypot(cart.vx, cart.vy) < 0.4) {
    cart.state = 'standing';
    cart.vx = 0;
    cart.vy = 0;
  }
}
