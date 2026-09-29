/**
 * Each store plays differently inside, not just looks different.
 *
 * - Arcade Annex: one lit cabinet takes $2 a play and sometimes pays out. The
 *   odds favour the house (about $1.90 back per $2), so it is a gamble, not a
 *   money farm.
 * - Cinema Snacks: the floor is buttered. The janitor builds up speed and
 *   keeps sliding after letting go, which makes the run for the door a skate.
 * - Department Outlet: display mannequins stand posed in the aisle. They are
 *   harmless while the janitor browses (and while they are left alone), and
 *   every one of them comes alive when the alarm goes off.
 * - Mall Mart: shopping carts stand in the aisle. Running into one sends it
 *   rolling; a rolling cart knocks a guard back and hurts it.
 *
 * The twist is room-local like the store alarm: set up on entering a store,
 * dropped on leaving, and never checkpointed. Pure rules over run data.
 */
import { circlesOverlap } from '../combat/collision';
import { moveCircle } from '../combat/movement';
import { playerDashing } from '../combat/dash';
import { normalizedDirection } from '../core/geometry';
import { MANNEQUIN_HEALTH, MANNEQUIN_RADIUS } from '../combat/mannequin';
import { createEnemyStatusState } from '../effects/statuses';
import type { EnemyState, Vec2 } from '../model';
import { publishRunFeedback } from './economy';
import { luck } from './luck';
import { activeStore, INTERIOR_BOUNDS } from './storeInterior';
import type { MvpCommandResult, MvpRunState } from './types';

export type RollingCart = { id: number; x: number; y: number; vx: number; vy: number; hit: number[] };

export type StoreTwistState = {
  /** The store this twist belongs to; a different store starts a fresh one. */
  readonly storeId: string;
  /** Cinema Snacks: the janitor's slide velocity. */
  slide: Vec2;
  /** Mall Mart: the carts in the aisle. */
  carts: RollingCart[];
  /** Arcade Annex: plays this visit, and ticks until the cabinet takes another coin. */
  plays: number;
  cabinetCooldown: number;
};

/** The aisle between the two rows of shelves, where the twists stand. */
const AISLE_Y = INTERIOR_BOUNDS.y + Math.round(INTERIOR_BOUNDS.height * 0.5);

// Arcade Annex.
export const ARCADE_PLAY_COST = 2;
/** The lit cabinet: the first display cabinet down the east wall (see roomDressing). */
export const ARCADE_CABINET: Vec2 = { x: INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width - 26, y: INTERIOR_BOUNDS.y + 150 };
export const ARCADE_CABINET_REACH = 64;
export const ARCADE_COOLDOWN_TICKS = 45;
/** Cumulative odds and prizes: most plays lose; the house keeps about 5%. */
export const ARCADE_PRIZES: ReadonlyArray<{ readonly below: number; readonly prize: number; readonly name: string }> = [
  { below: 0.02, prize: 20, name: 'JACKPOT' },
  { below: 0.12, prize: 6, name: 'HIGH SCORE' },
  { below: 0.42, prize: 3, name: 'FREE GAME' },
];

// Cinema Snacks.
/**
 * How much grip the floor gives each tick. The slide settles at walking
 * speed while a direction is held (it never outruns a normal floor), takes a
 * few steps to build, and carries on for about 35 px after letting go.
 */
export const BUTTER_GRIP = 0.09;

// Department Outlet.
export const DISPLAY_MANNEQUIN_SPOTS: readonly Vec2[] = [
  { x: 150, y: AISLE_Y }, { x: 360, y: AISLE_Y }, { x: 600, y: AISLE_Y }, { x: 810, y: AISLE_Y },
];

// Mall Mart.
export const CART_RADIUS = 14;
export const CART_SPOTS: readonly Vec2[] = [{ x: 220, y: AISLE_Y }, { x: 480, y: AISLE_Y - 10 }, { x: 740, y: AISLE_Y }];
export const CART_KICK_SPEED = 7;
export const CART_FRICTION = 0.965;
export const CART_DAMAGE = 4;
export const CART_KNOCKBACK = 30;

/** What the log says on walking in, so a twist never ambushes the janitor. */
export const TWIST_HINTS: Readonly<Record<string, string>> = {
  'arcade-annex': 'One cabinet still takes coins: $2 a play.',
  'cinema-snacks': 'The floor is buttered: expect to slide.',
  'department-outlet': 'The display mannequins are very still. For now.',
  'mall-mart': 'Carts in the aisle: run into one to send it rolling.',
};

/** The twist for the store the janitor is in, created on first use. */
function twistFor(state: MvpRunState): StoreTwistState | null {
  const store = activeStore(state);
  if (store === null) {
    state.room.twist = null;
    return null;
  }
  if (state.room.twist?.storeId === store.templateId) return state.room.twist;
  const twist: StoreTwistState = { storeId: store.templateId, slide: { x: 0, y: 0 }, carts: [], plays: 0, cabinetCooldown: 0 };
  state.room.twist = twist;
  const hint = TWIST_HINTS[store.templateId];
  if (hint) publishRunFeedback(state, hint);
  if (store.templateId === 'department-outlet') poseMannequins(state);
  if (store.templateId === 'mall-mart') {
    twist.carts = CART_SPOTS.map((spot, index) => ({ id: index + 1, x: spot.x, y: spot.y, vx: 0, vy: 0, hit: [] }));
  }
  return twist;
}

function poseMannequins(state: MvpRunState): void {
  const combat = state.room.combat;
  for (const spot of DISPLAY_MANNEQUIN_SPOTS) {
    const id = combat.nextEntityId;
    combat.nextEntityId += 1;
    const mannequin: EnemyState = {
      id,
      kind: 'mannequin',
      x: spot.x,
      y: spot.y,
      health: MANNEQUIN_HEALTH,
      radius: MANNEQUIN_RADIUS,
      phase: 'recover',
      phaseTicks: 0,
      cooldownTicks: 0,
      telegraphAimX: 0,
      telegraphAimY: 0,
      statuses: createEnemyStatusState(),
      dormant: true,
    };
    combat.enemies.push(mannequin);
  }
}

/** True when the janitor can reach the Arcade Annex's lit cabinet. */
export function nearArcadeCabinet(state: MvpRunState): boolean {
  if (activeStore(state)?.templateId !== 'arcade-annex') return false;
  const player = state.room.combat.player;
  return Math.hypot(player.x - ARCADE_CABINET.x, player.y - ARCADE_CABINET.y) <= ARCADE_CABINET_REACH;
}

/** One play on the lit cabinet: $2 in, maybe a prize out. */
export function playArcadeCabinet(state: MvpRunState): MvpCommandResult {
  const twist = twistFor(state);
  if (twist === null || !nearArcadeCabinet(state)) return { accepted: false, reason: 'There is no cabinet here.' };
  if (twist.cabinetCooldown > 0) return { accepted: false, reason: 'The cabinet is still playing.' };
  if (state.cash < ARCADE_PLAY_COST) return { accepted: false, reason: `A play costs $${ARCADE_PLAY_COST}.` };
  twist.plays += 1;
  twist.cabinetCooldown = ARCADE_COOLDOWN_TICKS;
  const roll = luck(state.seed, 'arcade', state.roomIndex, twist.plays + state.tick);
  const prize = ARCADE_PRIZES.find((entry) => roll < entry.below) ?? null;
  state.cash += (prize?.prize ?? 0) - ARCADE_PLAY_COST;
  state.inventory = { ...state.inventory, cash: state.cash };
  const message = prize ? `${prize.name}! The cabinet pays out $${prize.prize}.` : 'GAME OVER. The cabinet keeps your $2.';
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * One tick of the store's twist, after combat. `previousPosition` is where
 * the janitor stood before this tick's movement.
 */
export function updateStoreTwist(state: MvpRunState, previousPosition: Vec2): void {
  const twist = twistFor(state);
  if (twist === null) return;
  if (twist.cabinetCooldown > 0) twist.cabinetCooldown -= 1;
  switch (twist.storeId) {
    case 'cinema-snacks':
      slideOnButter(state, twist, previousPosition);
      break;
    case 'department-outlet':
      wakeTheDisplays(state);
      break;
    case 'mall-mart':
      rollCarts(state, twist, previousPosition);
      break;
    default:
      break;
  }
}

/**
 * Butter: the step the janitor meant to take only nudges a slide, and the
 * slide is what actually moves them. A dash still goes where it points.
 */
function slideOnButter(state: MvpRunState, twist: StoreTwistState, previous: Vec2): void {
  const combat = state.room.combat;
  const player = combat.player;
  if (playerDashing(combat)) {
    twist.slide = { x: player.x - previous.x, y: player.y - previous.y };
    return;
  }
  const meant = { x: player.x - previous.x, y: player.y - previous.y };
  twist.slide = {
    x: twist.slide.x * (1 - BUTTER_GRIP) + meant.x * BUTTER_GRIP,
    y: twist.slide.y * (1 - BUTTER_GRIP) + meant.y * BUTTER_GRIP,
  };
  if (Math.hypot(twist.slide.x, twist.slide.y) < 0.05) twist.slide = { x: 0, y: 0 };
  const next = moveCircle(previous, player.radius, twist.slide.x, twist.slide.y, combat.walls);
  // A wall stops the slide along that axis.
  if (next.x === previous.x) twist.slide.x = 0;
  if (next.y === previous.y) twist.slide.y = 0;
  player.x = next.x;
  player.y = next.y;
}

/** The alarm, or a blow, brings every display to life. */
function wakeTheDisplays(state: MvpRunState): void {
  const alarm = state.alarm !== null;
  for (const enemy of state.room.combat.enemies) {
    if (!enemy.dormant) continue;
    if (alarm || enemy.health < MANNEQUIN_HEALTH) enemy.dormant = false;
  }
}

function rollCarts(state: MvpRunState, twist: StoreTwistState, previous: Vec2): void {
  const combat = state.room.combat;
  const player = combat.player;
  const moved = Math.hypot(player.x - previous.x, player.y - previous.y) > 0.5;
  for (const cart of twist.carts) {
    // Running into a standing cart sends it off, away from the janitor.
    const speed = Math.hypot(cart.vx, cart.vy);
    if (moved && speed < 1 && circlesOverlap(player.x, player.y, player.radius, cart.x, cart.y, CART_RADIUS)) {
      const away = normalizedDirection(cart.x - player.x, cart.y - player.y);
      cart.vx = away.x * CART_KICK_SPEED;
      cart.vy = away.y * CART_KICK_SPEED;
      cart.hit = [];
    }
    if (cart.vx === 0 && cart.vy === 0) continue;
    const next = moveCircle(cart, CART_RADIUS, cart.vx, cart.vy, combat.walls);
    if (next.x === cart.x) cart.vx = 0;
    if (next.y === cart.y) cart.vy = 0;
    cart.x = next.x;
    cart.y = next.y;
    cart.vx *= CART_FRICTION;
    cart.vy *= CART_FRICTION;
    if (Math.hypot(cart.vx, cart.vy) < 0.4) {
      cart.vx = 0;
      cart.vy = 0;
      continue;
    }
    // A rolling cart bowls over whoever it meets, once per push.
    for (const enemy of combat.enemies) {
      if (enemy.health <= 0 || cart.hit.includes(enemy.id)) continue;
      if (!circlesOverlap(cart.x, cart.y, CART_RADIUS, enemy.x, enemy.y, enemy.radius)) continue;
      cart.hit.push(enemy.id);
      enemy.health = Math.max(0, enemy.health - CART_DAMAGE);
      const push = normalizedDirection(cart.vx, cart.vy);
      const knocked = moveCircle(enemy, enemy.radius, push.x * CART_KNOCKBACK, push.y * CART_KNOCKBACK, combat.walls);
      enemy.x = knocked.x;
      enemy.y = knocked.y;
      cart.vx *= 0.5;
      cart.vy *= 0.5;
    }
  }
}
