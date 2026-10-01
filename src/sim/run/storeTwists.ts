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
 * Round 35, the seven themed stores:
 * - Sports Locker: a pitching machine winds up and fires balls down the aisle.
 * - Hardware Hut: paint spills in the aisle: slide on them, dry floor grips.
 * - Toy Box: wind-up toys waddle the aisle and shove the janitor aside.
 * - Radio Shed: a band of TV static comes and goes, hiding who stands in it.
 * - Spiral Records: a listening booth puts the janitor in the groove (attacks
 *   recharge twice as fast) once a visit.
 * - Slice Station: the oven warns, then blasts heat along the east wall.
 * - Video World: a rewind tile undoes the last hit taken in the store, once.
 *
 * The twist is room-local like the store alarm: set up on entering a store,
 * dropped on leaving, and never checkpointed. Pure rules over run data.
 */
import { circlesOverlap } from '../combat/collision';
import { moveCircle } from '../combat/movement';
import { playerDashing } from '../combat/dash';
import { normalizedDirection } from '../core/geometry';
import { MANNEQUIN_HEALTH, MANNEQUIN_RADIUS } from '../combat/mannequin';
import { applySticky, createEnemyStatusState } from '../effects/statuses';
import type { EnemyState, Vec2 } from '../model';
import { publishRunFeedback } from './economy';
import { luck } from './luck';
import { runMaxHealth } from './perks';
import { activeStore, INTERIOR_BOUNDS } from './storeInterior';
import type { MvpCommandResult, MvpRunState } from './types';

export type RollingCart = { id: number; x: number; y: number; vx: number; vy: number; hit: number[] };
export type PitchedBall = { id: number; x: number; y: number; vx: number };
export type WindUpToy = { id: number; x: number; y: number; vx: number; bumpCooldown: number };

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
  /** Ticks since the janitor walked in: the clock the cycling twists run on. */
  age: number;
  /** Sports Locker: balls in flight. */
  balls: PitchedBall[];
  nextBallId: number;
  /** Toy Box: the wind-up toys. */
  toys: WindUpToy[];
  /** Spiral Records: ticks spent in the booth, the groove left, and whether it was had. */
  listenTicks: number;
  grooveTicks: number;
  grooveUsed: boolean;
  /** Video World: health last tick, the size of the last hit, and whether the tile was used. */
  lastHealth: number;
  lastHit: number;
  rewindUsed: boolean;
  /** Slice Station: the blast that last burned the janitor (one burn a blast). */
  burnedBlast: number;
  // Round 50: the district stores.
  /** Candy Cauldron: the free sample has been had this visit. */
  sampleUsed: boolean;
  /** Novelty Nook: ticks until each buzzer tile can zap again. */
  buzzerCharge: number[];
  /** Glam Snaps: ticks the janitor stays frozen after the flash. */
  dazzleTicks: number;
  /** Green Thumb: ticks until the cacti can prick a guard again. */
  cactusCooldown: number;
  /** Cocoa Hut: things bought this visit (every second one is free). */
  purchases: number;
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

const PLAYER_INVULNERABILITY_TICKS = 60;

// Sports Locker.
export const PITCHING_MACHINE: Vec2 = { x: INTERIOR_BOUNDS.x + 30, y: AISLE_Y };
export const PITCH_INTERVAL_TICKS = 150;
/** The machine hums and its lane lights up this long before each pitch. */
export const PITCH_WINDUP_TICKS = 40;
export const BALL_SPEED = 6.5;
export const BALL_RADIUS = 7;
export const BALL_DAMAGE_ENEMY = 3;

// Hardware Hut.
export const PAINT_SPILLS: ReadonlyArray<{ readonly x: number; readonly y: number; readonly rx: number; readonly ry: number; readonly color: number }> = [
  { x: 250, y: AISLE_Y, rx: 64, ry: 24, color: 0x3a8aff },
  { x: 480, y: AISLE_Y + 26, rx: 58, ry: 22, color: 0xff6a3a },
  { x: 715, y: AISLE_Y - 6, rx: 64, ry: 24, color: 0xffd84a },
];
/** Grip on wet paint: a little more than butter, so a spill is a stumble, not a rink. */
export const PAINT_GRIP = 0.12;

// Toy Box.
export const TOY_RADIUS = 10;
export const TOY_SPEED = 0.8;
export const TOY_SHOVE = 18;
export const TOY_BUMP_COOLDOWN_TICKS = 30;
const TOY_SPOTS: readonly number[] = [150, 360, 600, 810];

// Radio Shed.
/** Two bands of static in the gaps between the shelf columns, so no shelf is ever hidden. */
export const STATIC_ZONES: ReadonlyArray<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }> = [
  { x: 280, y: 130, width: 160, height: 120 },
  { x: 540, y: 130, width: 140, height: 120 },
];
export const STATIC_OFF_TICKS = 110;
export const STATIC_ON_TICKS = 140;

// Spiral Records.
export const LISTENING_BOOTH: Vec2 & { readonly radius: number } = { x: 830, y: 330, radius: 30 };
export const LISTEN_TICKS = 90;
export const GROOVE_TICKS = 600;

// Slice Station.
export const OVEN_ZONE = { x: 810, y: 140, width: 100, height: 110 } as const;
const OVEN_IDLE_TICKS = 135;
const OVEN_WARN_TICKS = 45;
const OVEN_BLAST_TICKS = 60;
const OVEN_CYCLE_TICKS = OVEN_IDLE_TICKS + OVEN_WARN_TICKS + OVEN_BLAST_TICKS;
export const OVEN_ENEMY_DAMAGE = 2;
const OVEN_ENEMY_EVERY = 20;

// Video World.
export const REWIND_TILE: Vec2 & { readonly radius: number } = { x: 150, y: 335, radius: 26 };

// ---- Round 50: the district stores. ----------------------------------

// Candy Cauldron.
export const SAMPLE_BOWL: Vec2 & { readonly radius: number } = { x: 830, y: AISLE_Y, radius: 26 };

// Novelty Nook.
export const BUZZER_TILES: ReadonlyArray<Vec2 & { readonly radius: number }> = [
  { x: 300, y: AISLE_Y, radius: 22 }, { x: 480, y: AISLE_Y + 14, radius: 22 }, { x: 660, y: AISLE_Y, radius: 22 },
];
export const BUZZER_STUN_TICKS = 70;
export const BUZZER_RECHARGE_TICKS = 120;

// Glam Snaps.
/** The backdrop lane across the aisle that the studio flash lights up. */
export const STUDIO_FLASH_LANE = { x: INTERIOR_BOUNDS.x, y: AISLE_Y - 34, width: INTERIOR_BOUNDS.width, height: 68 } as const;
export const STUDIO_FLASH_CYCLE_TICKS = 220;
/** The umbrella glows this long before the pop. */
export const STUDIO_FLASH_WARN_TICKS = 50;
export const DAZZLE_TICKS = 36;

// Hair Affair.
export const HAIRSPRAY_ZONES: ReadonlyArray<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }> = [
  { x: 280, y: AISLE_Y - 42, width: 150, height: 84 },
  { x: 540, y: AISLE_Y - 42, width: 150, height: 84 },
];

// Pet Palace.
/** The parrot shouts THIEF: the alarm here is this much shorter. */
export const PARROT_ALARM_CUT = 60;

// Green Thumb.
export const CACTUS_POTS: ReadonlyArray<Vec2 & { readonly radius: number }> = [
  { x: 300, y: AISLE_Y, radius: 18 }, { x: 560, y: AISLE_Y + 20, radius: 18 }, { x: 760, y: AISLE_Y - 12, radius: 18 },
];
export const CACTUS_GUARD_EVERY = 30;

// Skate Shack.
/** Rental skates: each step carries this much further. */
export const SKATE_BOOST = 0.35;

/** What the log says on walking in, so a twist never ambushes the janitor. */
export const TWIST_HINTS: Readonly<Record<string, string>> = {
  'arcade-annex': 'One cabinet still takes coins: $2 a play.',
  'cinema-snacks': 'The floor is buttered: expect to slide.',
  'department-outlet': 'The display mannequins are very still. For now.',
  'mall-mart': 'Carts in the aisle: run into one to send it rolling.',
  'sports-locker': 'The pitching machine is still on. Mind the aisle.',
  'hardware-hut': 'Wet paint in the aisle: it is slippery.',
  'toy-box': 'Wind-up toys on the loose. They will get underfoot.',
  'radio-shed': 'The TVs are on the fritz: static can hide anyone.',
  'spiral-records': 'Stand in the listening booth to get in the groove.',
  'slice-station': 'The oven by the east wall runs hot. Watch for the glow.',
  'video-world': 'A REWIND tile by the door: it undoes your last hit here.',
  'candy-cauldron': 'Free samples in the bowl by the east wall. One per customer.',
  'novelty-nook': 'Joy buzzers in the aisle tiles: guards who step on one get zapped.',
  'glam-snaps': 'Smile! The studio flash pops across the aisle. Watch the umbrella glow.',
  'hair-affair': 'Hairspray hangs in the aisle: guards wading through it get stuck.',
  'pet-palace': 'The parrot is watching. It will shout THIEF the moment you grab.',
  'green-thumb': 'Cactus pots in the aisle: they prick anyone who touches them.',
  'skate-shack': 'Rental skates by the door: you move faster in here.',
  'cocoa-hut': 'Punch card: every second thing you buy here is free.',
};

/** The twist for the store the janitor is in, created on first use. */
function twistFor(state: MvpRunState): StoreTwistState | null {
  const store = activeStore(state);
  if (store === null) {
    state.room.twist = null;
    return null;
  }
  if (state.room.twist?.storeId === store.templateId) return state.room.twist;
  const twist: StoreTwistState = {
    storeId: store.templateId,
    slide: { x: 0, y: 0 },
    carts: [],
    plays: 0,
    cabinetCooldown: 0,
    age: 0,
    balls: [],
    nextBallId: 1,
    toys: [],
    listenTicks: 0,
    grooveTicks: 0,
    grooveUsed: false,
    lastHealth: state.room.combat.player.health,
    lastHit: 0,
    rewindUsed: false,
    burnedBlast: -1,
    sampleUsed: false,
    buzzerCharge: BUZZER_TILES.map(() => 0),
    dazzleTicks: 0,
    cactusCooldown: 0,
    purchases: 0,
  };
  state.room.twist = twist;
  const hint = TWIST_HINTS[store.templateId];
  if (hint) publishRunFeedback(state, hint);
  if (store.templateId === 'department-outlet') poseMannequins(state);
  if (store.templateId === 'mall-mart') {
    twist.carts = CART_SPOTS.map((spot, index) => ({ id: index + 1, x: spot.x, y: spot.y, vx: 0, vy: 0, hit: [] }));
  }
  if (store.templateId === 'toy-box') {
    twist.toys = TOY_SPOTS.map((x, index) => ({ id: index + 1, x, y: AISLE_Y + (index % 2 === 0 ? -8 : 8), vx: index % 2 === 0 ? TOY_SPEED : -TOY_SPEED, bumpCooldown: 0 }));
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
  twist.age += 1;
  switch (twist.storeId) {
    case 'cinema-snacks':
      slideOnButter(state, twist, previousPosition);
      break;
    case 'sports-locker':
      pitchBalls(state, twist);
      break;
    case 'hardware-hut':
      slipOnPaint(state, twist, previousPosition);
      break;
    case 'toy-box':
      waddleToys(state, twist);
      break;
    case 'spiral-records':
      listenInTheBooth(state, twist);
      break;
    case 'slice-station':
      runTheOven(state, twist);
      break;
    case 'video-world':
      rewindTheTape(state, twist);
      break;
    case 'department-outlet':
      wakeTheDisplays(state);
      break;
    case 'mall-mart':
      rollCarts(state, twist, previousPosition);
      break;
    case 'candy-cauldron':
      takeASample(state, twist);
      break;
    case 'novelty-nook':
      buzzTheTiles(state, twist);
      break;
    case 'glam-snaps':
      popTheFlash(state, twist, previousPosition);
      break;
    case 'hair-affair':
      sprayTheAisle(state);
      break;
    case 'green-thumb':
      prickWithCacti(state, twist);
      break;
    case 'skate-shack':
      skate(state, previousPosition);
      break;
    default:
      break;
  }
}

/**
 * Butter: the step the janitor meant to take only nudges a slide, and the
 * slide is what actually moves them. A dash still goes where it points.
 */
function slideOnButter(state: MvpRunState, twist: StoreTwistState, previous: Vec2, grip = BUTTER_GRIP): void {
  const combat = state.room.combat;
  const player = combat.player;
  if (playerDashing(combat)) {
    twist.slide = { x: player.x - previous.x, y: player.y - previous.y };
    return;
  }
  const meant = { x: player.x - previous.x, y: player.y - previous.y };
  twist.slide = {
    x: twist.slide.x * (1 - grip) + meant.x * grip,
    y: twist.slide.y * (1 - grip) + meant.y * grip,
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

/** Lands a hazard's hit on the janitor unless a dash or fresh invulnerability covers them. */
function hurtJanitor(state: MvpRunState): boolean {
  const combat = state.room.combat;
  if (combat.player.invulnerableTicks > 0 || playerDashing(combat)) return false;
  combat.player.health -= 1;
  combat.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
  return true;
}

/** Sports Locker: whether the machine is winding up for its next pitch (the lane lights). */
export function pitchWindingUp(twist: StoreTwistState): boolean {
  return twist.storeId === 'sports-locker' && twist.age % PITCH_INTERVAL_TICKS >= PITCH_INTERVAL_TICKS - PITCH_WINDUP_TICKS;
}

function pitchBalls(state: MvpRunState, twist: StoreTwistState): void {
  const combat = state.room.combat;
  if (twist.age % PITCH_INTERVAL_TICKS === 0) {
    twist.balls.push({ id: twist.nextBallId, x: PITCHING_MACHINE.x + 20, y: PITCHING_MACHINE.y, vx: BALL_SPEED });
    twist.nextBallId += 1;
  }
  const right = INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width - BALL_RADIUS;
  twist.balls = twist.balls.filter((ball) => {
    ball.x += ball.vx;
    if (ball.x >= right) return false;
    const player = combat.player;
    if (circlesOverlap(ball.x, ball.y, BALL_RADIUS, player.x, player.y, player.radius) && hurtJanitor(state)) return false;
    const enemy = combat.enemies.find((candidate) => candidate.health > 0 && circlesOverlap(ball.x, ball.y, BALL_RADIUS, candidate.x, candidate.y, candidate.radius));
    if (enemy) {
      enemy.health = Math.max(0, enemy.health - BALL_DAMAGE_ENEMY);
      return false;
    }
    return true;
  });
}

function inSpill(point: Vec2): boolean {
  return PAINT_SPILLS.some((spill) => ((point.x - spill.x) / spill.rx) ** 2 + ((point.y - spill.y) / spill.ry) ** 2 <= 1);
}

/** Hardware Hut: wet paint is butter; dry floor grips at once. */
function slipOnPaint(state: MvpRunState, twist: StoreTwistState, previous: Vec2): void {
  if (!inSpill(previous) && !inSpill(state.room.combat.player)) {
    twist.slide = { x: 0, y: 0 };
    return;
  }
  slideOnButter(state, twist, previous, PAINT_GRIP);
}

function waddleToys(state: MvpRunState, twist: StoreTwistState): void {
  const combat = state.room.combat;
  const player = combat.player;
  const left = INTERIOR_BOUNDS.x + 30;
  const right = INTERIOR_BOUNDS.x + INTERIOR_BOUNDS.width - 30;
  for (const toy of twist.toys) {
    if (toy.bumpCooldown > 0) toy.bumpCooldown -= 1;
    const next = moveCircle(toy, TOY_RADIUS, toy.vx, 0, combat.walls);
    if (next.x === toy.x || next.x <= left || next.x >= right) toy.vx = -toy.vx;
    toy.x = Math.max(left, Math.min(right, next.x));
    if (toy.bumpCooldown > 0 || playerDashing(combat)) continue;
    if (!circlesOverlap(toy.x, toy.y, TOY_RADIUS, player.x, player.y, player.radius)) continue;
    // Underfoot: the toy shoves the janitor aside and waddles off the other way.
    const away = player.x === toy.x && player.y === toy.y ? { x: -Math.sign(toy.vx) || 1, y: 0 } : normalizedDirection(player.x - toy.x, player.y - toy.y);
    const shoved = moveCircle(player, player.radius, away.x * TOY_SHOVE, away.y * TOY_SHOVE, combat.walls);
    player.x = shoved.x;
    player.y = shoved.y;
    toy.vx = -toy.vx;
    toy.bumpCooldown = TOY_BUMP_COOLDOWN_TICKS;
  }
}

/** Radio Shed: whether the static is up and covers this point (the view hides enemies there). */
export function staticHides(state: MvpRunState, point: Vec2): boolean {
  const twist = state.room.twist;
  if (!twist || twist.storeId !== 'radio-shed') return false;
  if (twist.age % (STATIC_OFF_TICKS + STATIC_ON_TICKS) < STATIC_OFF_TICKS) return false;
  return STATIC_ZONES.some((zone) => point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height);
}

function listenInTheBooth(state: MvpRunState, twist: StoreTwistState): void {
  const player = state.room.combat.player;
  if (twist.grooveTicks > 0) {
    twist.grooveTicks -= 1;
    // In the groove: attacks recharge twice as fast.
    if (player.attackCooldownTicks > 0) player.attackCooldownTicks -= 1;
    return;
  }
  const inBooth = Math.hypot(player.x - LISTENING_BOOTH.x, player.y - LISTENING_BOOTH.y) <= LISTENING_BOOTH.radius;
  if (!inBooth || twist.grooveUsed) {
    twist.listenTicks = 0;
    return;
  }
  twist.listenTicks += 1;
  if (twist.listenTicks >= LISTEN_TICKS) {
    twist.grooveTicks = GROOVE_TICKS;
    twist.grooveUsed = true;
    publishRunFeedback(state, 'IN THE GROOVE: attacks recharge twice as fast for 10 seconds.');
  }
}

/** Slice Station: where the oven is in its cycle. */
export function ovenPhase(twist: StoreTwistState): 'idle' | 'warn' | 'blast' {
  const at = twist.age % OVEN_CYCLE_TICKS;
  return at < OVEN_IDLE_TICKS ? 'idle' : at < OVEN_IDLE_TICKS + OVEN_WARN_TICKS ? 'warn' : 'blast';
}

function inOvenZone(point: Vec2): boolean {
  return point.x >= OVEN_ZONE.x && point.x <= OVEN_ZONE.x + OVEN_ZONE.width && point.y >= OVEN_ZONE.y && point.y <= OVEN_ZONE.y + OVEN_ZONE.height;
}

function runTheOven(state: MvpRunState, twist: StoreTwistState): void {
  if (ovenPhase(twist) !== 'blast') return;
  const combat = state.room.combat;
  const blast = Math.floor(twist.age / OVEN_CYCLE_TICKS);
  if (twist.burnedBlast !== blast && inOvenZone(combat.player) && hurtJanitor(state)) twist.burnedBlast = blast;
  if (twist.age % OVEN_ENEMY_EVERY !== 0) return;
  for (const enemy of combat.enemies) {
    if (enemy.health > 0 && inOvenZone(enemy)) enemy.health = Math.max(0, enemy.health - OVEN_ENEMY_DAMAGE);
  }
}

function rewindTheTape(state: MvpRunState, twist: StoreTwistState): void {
  const player = state.room.combat.player;
  if (player.health < twist.lastHealth) twist.lastHit = twist.lastHealth - player.health;
  const onTile = Math.hypot(player.x - REWIND_TILE.x, player.y - REWIND_TILE.y) <= REWIND_TILE.radius;
  if (onTile && !twist.rewindUsed && twist.lastHit > 0 && player.health > 0) {
    player.health = Math.min(runMaxHealth(state), player.health + twist.lastHit);
    twist.rewindUsed = true;
    twist.lastHit = 0;
    publishRunFeedback(state, 'REWOUND: that last hit never happened.');
  }
  twist.lastHealth = player.health;
}

/* ---- Round 50: the district stores' twists --------------------------- */

const within = (point: Vec2, spot: Vec2 & { readonly radius: number }, extra = 0): boolean => Math.hypot(point.x - spot.x, point.y - spot.y) <= spot.radius + extra;
const inRect = (point: Vec2, rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

/** Candy Cauldron: one free sample a visit, half a heart, only when it helps. */
function takeASample(state: MvpRunState, twist: StoreTwistState): void {
  const player = state.room.combat.player;
  if (twist.sampleUsed || !within(player, SAMPLE_BOWL, player.radius) || player.health >= runMaxHealth(state)) return;
  twist.sampleUsed = true;
  player.health += 1;
  publishRunFeedback(state, 'A free sample. Half a heart back.');
}

/** Novelty Nook: a guard on a charged tile is buzzed still; the janitor only hears it. */
function buzzTheTiles(state: MvpRunState, twist: StoreTwistState): void {
  twist.buzzerCharge = twist.buzzerCharge.map((ticks) => Math.max(0, ticks - 1));
  BUZZER_TILES.forEach((tile, index) => {
    if (twist.buzzerCharge[index]! > 0) return;
    const victim = state.room.combat.enemies.find((enemy) => enemy.health > 0 && !enemy.dormant && within(enemy, tile));
    if (!victim) return;
    victim.stunnedTicks = BUZZER_STUN_TICKS;
    victim.chargeTicks = 0;
    victim.phase = 'recover';
    twist.buzzerCharge[index] = BUZZER_RECHARGE_TICKS;
  });
}

/** Glam Snaps: where the studio flash is in its cycle. */
export function studioFlashPhase(twist: StoreTwistState): 'idle' | 'warn' | 'pop' {
  const position = twist.age % STUDIO_FLASH_CYCLE_TICKS;
  if (position === 0) return 'pop';
  return position >= STUDIO_FLASH_CYCLE_TICKS - STUDIO_FLASH_WARN_TICKS ? 'warn' : 'idle';
}

/** Glam Snaps: the pop freezes anyone in the backdrop lane for a beat, guards included. */
function popTheFlash(state: MvpRunState, twist: StoreTwistState, previous: Vec2): void {
  const combat = state.room.combat;
  const player = combat.player;
  if (twist.dazzleTicks > 0) {
    twist.dazzleTicks -= 1;
    player.x = previous.x;
    player.y = previous.y;
  }
  if (studioFlashPhase(twist) !== 'pop') return;
  if (inRect(player, STUDIO_FLASH_LANE) && !playerDashing(combat)) {
    twist.dazzleTicks = DAZZLE_TICKS;
    publishRunFeedback(state, 'FLASH! Hold that pose.');
  }
  for (const enemy of combat.enemies) {
    if (enemy.health > 0 && inRect(enemy, STUDIO_FLASH_LANE)) {
      enemy.stunnedTicks = Math.max(enemy.stunnedTicks ?? 0, DAZZLE_TICKS);
      enemy.chargeTicks = 0;
    }
  }
}

/** Hair Affair: the haze glues guards in place while they wade through it. */
function sprayTheAisle(state: MvpRunState): void {
  for (const enemy of state.room.combat.enemies) {
    if (enemy.health > 0 && HAIRSPRAY_ZONES.some((zone) => inRect(enemy, zone))) applySticky(enemy, 30, 0.5, 0.4);
  }
}

/** Green Thumb: a cactus pricks the janitor (and shoves them off it) and any guard it touches. */
function prickWithCacti(state: MvpRunState, twist: StoreTwistState): void {
  const combat = state.room.combat;
  const player = combat.player;
  for (const pot of CACTUS_POTS) {
    if (!within(player, pot, player.radius)) continue;
    hurtJanitor(state);
    const away = normalizedDirection(player.x - pot.x, player.y - pot.y);
    const push = away.x === 0 && away.y === 0 ? { x: 0, y: 1 } : away;
    const next = moveCircle(player, player.radius, push.x * 12, push.y * 12, combat.walls);
    player.x = next.x;
    player.y = next.y;
  }
  if (twist.cactusCooldown > 0) {
    twist.cactusCooldown -= 1;
    return;
  }
  let pricked = false;
  for (const enemy of combat.enemies) {
    if (enemy.health > 0 && !enemy.dormant && CACTUS_POTS.some((pot) => within(enemy, pot, enemy.radius))) {
      enemy.health = Math.max(0, enemy.health - 1);
      pricked = true;
    }
  }
  if (pricked) twist.cactusCooldown = CACTUS_GUARD_EVERY;
}

/** Skate Shack: every step glides a little further (a dash goes where it points). */
function skate(state: MvpRunState, previous: Vec2): void {
  const combat = state.room.combat;
  const player = combat.player;
  if (playerDashing(combat)) return;
  const next = moveCircle(player, player.radius, (player.x - previous.x) * SKATE_BOOST, (player.y - previous.y) * SKATE_BOOST, combat.walls);
  player.x = next.x;
  player.y = next.y;
}
