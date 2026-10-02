/**
 * What can hurt the janitor in the next second or so, and which way to walk to
 * stay clear of all of it at once.
 *
 * The `pro` bot answers one threat at a time by a fixed rule (the nearest
 * wind-up, else the nearest shot), and that is where it loses health to the Mall
 * Owner: it backs off along his locked charge lane, and it steps out of a tray's
 * way while two Mascot lanes cross it. The expert scores a handful of headings
 * against every danger together and takes the safest, so it is a bot that cannot
 * be beaten by that kind of overlap. It reads only authoritative state.
 *
 * Three kinds of danger are modelled, because they are what the monsters that
 * lock a lane or an area before they strike actually do:
 *  - a charge (Mascot Brute, Bargain Hunter, the Owner's turn charge): the
 *    monster stands through its wind-up, then runs a straight line along the
 *    lane it locked, and hurts what it touches on the way;
 *  - a blast (a boss slam, a fallen Volatile elite's fuse, a Roofer's bucket,
 *    a Spritzer's spritz, the Developer's tar in the air): an instant at the
 *    end of a wind-up, fuse or flight, hurting whatever is inside its reach;
 *  - a shot: an enemy projectile flying straight.
 */
import { BOSS_VOLLEY_PROJECTILE_DAMAGE, BOSS_VOLLEY_PROJECTILE_LIFETIME_TICKS, BOSS_VOLLEY_PROJECTILE_RADIUS, bossConfigFor } from '../../src/sim/combat/boss';
import { DASH_DISTANCE, DASH_TICKS } from '../../src/sim/combat/dash';
import { VOLATILE_BURST_DAMAGE, VOLATILE_BURST_RADIUS } from '../../src/sim/combat/eliteTraits';
import { PERFUME_CLOUD_RADIUS, PERFUME_SLOW } from '../../src/sim/combat/perfume';
import { TAR_SPLASH_DAMAGE, TAR_SPLASH_RADIUS } from '../../src/sim/combat/roofer';
import { TAR_SLOW } from '../../src/sim/combat/tar';
import { MASCOT_CHARGE_DAMAGE, MASCOT_CHARGE_SPEED_PER_TICK, MASCOT_CHARGE_TICKS } from '../../src/sim/combat/mascot';
import { SHOPPER_CHARGE_SPEED_PER_TICK, SHOPPER_CHARGE_TICKS } from '../../src/sim/combat/shopper';
import type { EnemyKind, EnemyState, RunState, Vec2 } from '../../src/sim/model';
import { Navigator } from './path';

/**
 * Each danger carries the health it takes and a `key` naming what resolves and
 * the absolute tick it does, which stays the same from one tick to the next while a wind-up counts
 * down, so a bot can tell how long it has been in view (see `reaction`).
 */
export type Danger =
  | { readonly key: string; readonly damage: number; readonly kind: 'charge'; readonly ox: number; readonly oy: number; readonly dx: number; readonly dy: number; readonly speed: number; readonly from: number; readonly ticks: number; readonly reach: number }
  | { readonly key: string; readonly damage: number; readonly kind: 'blast'; readonly x: number; readonly y: number; readonly reach: number; readonly at: number }
  | { readonly key: string; readonly damage: number; readonly kind: 'shot'; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly reach: number; readonly until: number; /** Ticks until it is launched from (x, y); absent for a shot already in the air. */ readonly from?: number };

/** The monsters whose wind-up this module models; the bot's older rules keep the rest. */
export const MODELLED_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['mascot', 'shopper', 'owner', 'lp_manager', 'manager', 'developer', 'roofer', 'spritzer']);

/** How far ahead the janitor looks, in ticks: a 45-tick volley wind-up and the flight of its trays, or a 54-tick bucket. */
export const HORIZON = 72;
/** The janitor's grace after a hit, in ticks: nothing else hurts inside it. */
const GRACE_TICKS = 60;
const PLAYER_SPEED_PER_TICK = 210 / 60;
const LANE_MARGIN = 6;
const BLAST_MARGIN = 8;
const SHOT_MARGIN = 3;
/** Sixteen headings, evenly round the compass. */
const HEADINGS: readonly Vec2[] = Array.from({ length: 16 }, (_, index) => ({ x: Math.cos((index / 16) * Math.PI * 2), y: Math.sin((index / 16) * Math.PI * 2) }));

/** Everything in the room that will hurt the janitor within the horizon. */
export function dangersOf(state: RunState): Danger[] {
  const player = state.player;
  const out: Danger[] = [];
  /** The absolute tick that is `left` ticks from now: what a danger resolves at. */
  const at = (left: number): number => state.tick + Math.max(0, left);
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || enemy.dormant || (enemy.stunnedTicks ?? 0) > 0 || (enemy.dazedTicks ?? 0) > 0) continue;
    if (!MODELLED_KINDS.has(enemy.kind)) continue;
    const reach = enemy.radius + player.radius + LANE_MARGIN;
    const dir = { x: enemy.telegraphAimX, y: enemy.telegraphAimY };
    const charging = (enemy.chargeTicks ?? 0) > 0;
    const winding = enemy.phase === 'telegraph';
    if (enemy.kind === 'mascot' || enemy.kind === 'shopper') {
      const speed = enemy.kind === 'mascot' ? MASCOT_CHARGE_SPEED_PER_TICK : SHOPPER_CHARGE_SPEED_PER_TICK;
      const ticks = enemy.kind === 'mascot' ? MASCOT_CHARGE_TICKS : SHOPPER_CHARGE_TICKS;
      const damage = enemy.kind === 'mascot' ? MASCOT_CHARGE_DAMAGE : 1;
      if (charging) out.push({ key: `${enemy.id}:run:${at(enemy.chargeTicks ?? 0)}`, damage, kind: 'charge', ox: enemy.x, oy: enemy.y, dx: dir.x, dy: dir.y, speed, from: 0, ticks: enemy.chargeTicks ?? 0, reach });
      else if (winding) out.push({ key: `${enemy.id}:wind:${at(enemy.phaseTicks)}`, damage, kind: 'charge', ox: enemy.x, oy: enemy.y, dx: dir.x, dy: dir.y, speed, from: Math.max(0, enemy.phaseTicks), ticks, reach });
      continue;
    }
    if (enemy.kind === 'roofer' || enemy.kind === 'spritzer') {
      // The landing spot is locked at the throw, and nothing hurts until it lands.
      if (winding) {
        const splash = enemy.kind === 'roofer' ? TAR_SPLASH_RADIUS : PERFUME_CLOUD_RADIUS;
        out.push({ key: `${enemy.id}:lob:${at(enemy.phaseTicks)}`, damage: enemy.kind === 'roofer' ? TAR_SPLASH_DAMAGE : 1, kind: 'blast', x: enemy.lobX ?? player.x, y: enemy.lobY ?? player.y, reach: splash + BLAST_MARGIN, at: Math.max(0, enemy.phaseTicks) });
      }
      continue;
    }
    // A boss: a charge on every second attack from phase two where it has one (the Owner), the
    // Developer's tar on every second attack where he has it, and a slam on the rest.
    const config = bossConfigFor(enemy.kind);
    // A volley's wind-up (up to 45 ticks) shows where the fan will go: five trays leave him along the locked aim.
    const volleyLeft = enemy.bossVolleyTelegraphTicks ?? 0;
    if (volleyLeft > 0) {
      const base = Math.atan2(enemy.telegraphAimY, enemy.telegraphAimX);
      config.volleyAngles.forEach((degrees, index) => {
        const angle = base + (degrees * Math.PI) / 180;
        out.push({
          key: `${enemy.id}:volley:${at(volleyLeft)}:${index}`, damage: BOSS_VOLLEY_PROJECTILE_DAMAGE, kind: 'shot', x: enemy.x, y: enemy.y,
          vx: Math.cos(angle) * config.volleySpeedPerTick, vy: Math.sin(angle) * config.volleySpeedPerTick,
          reach: BOSS_VOLLEY_PROJECTILE_RADIUS + player.radius + SHOT_MARGIN, from: volleyLeft, until: volleyLeft + BOSS_VOLLEY_PROJECTILE_LIFETIME_TICKS,
        });
      });
    }
    for (const strike of enemy.tarStrikes ?? []) {
      out.push({ key: `${enemy.id}:tar:${strike.x},${strike.y}:${at(strike.ticks)}`, damage: TAR_SPLASH_DAMAGE, kind: 'blast', x: strike.x, y: strike.y, reach: TAR_SPLASH_RADIUS + BLAST_MARGIN, at: Math.max(0, strike.ticks) });
    }
    if (charging && config.charge) {
      out.push({ key: `${enemy.id}:run:${at(enemy.chargeTicks ?? 0)}`, damage: config.charge.damage, kind: 'charge', ox: enemy.x, oy: enemy.y, dx: dir.x, dy: dir.y, speed: config.charge.speedPerTick, from: 0, ticks: enemy.chargeTicks ?? 0, reach });
    } else if (winding) {
      const phase = enemy.bossPhase ?? 1;
      const oddTurn = (enemy.bossAttacks ?? 0) % 2 === 1;
      const chargeNext = config.charge !== undefined && phase >= 2 && oddTurn;
      const barrageNext = !chargeNext && config.tarBarrage !== undefined && (config.tarBarrage.counts[phase - 1] ?? 0) > 0 && oddTurn;
      if (chargeNext && config.charge) out.push({ key: `${enemy.id}:wind:${at(enemy.phaseTicks)}`, damage: config.charge.damage, kind: 'charge', ox: enemy.x, oy: enemy.y, dx: dir.x, dy: dir.y, speed: config.charge.speedPerTick, from: Math.max(0, enemy.phaseTicks), ticks: config.charge.ticks, reach });
      else if (!barrageNext) out.push({ key: `${enemy.id}:wind:${at(enemy.phaseTicks)}`, damage: config.slamDamage, kind: 'blast', x: enemy.x, y: enemy.y, reach: config.slamReach + BLAST_MARGIN, at: Math.max(0, enemy.phaseTicks) });
    }
  }
  // A Volatile elite's fuse: the janitor is hit if still inside when it runs out.
  for (const burst of state.bursts ?? []) {
    out.push({ key: `burst:${burst.x},${burst.y}:${at(burst.fuseTicks)}`, damage: VOLATILE_BURST_DAMAGE, kind: 'blast', x: burst.x, y: burst.y, reach: VOLATILE_BURST_RADIUS + player.radius + SHOT_MARGIN, at: Math.max(0, burst.fuseTicks) });
  }
  for (const shot of state.projectiles) {
    if (shot.faction !== 'enemy') continue;
    out.push({ key: `shot:${shot.id}`, damage: shot.damage, kind: 'shot', x: shot.x, y: shot.y, vx: shot.velocityX, vy: shot.velocityY, reach: shot.radius + player.radius + SHOT_MARGIN, until: shot.remainingTicks });
  }
  return out;
}

/** How much slower the janitor walks at `at`, `tick` ticks from now, for the tar and perfume still lying there. */
function slowAt(state: RunState, at: Vec2, tick: number): number {
  let slow = 1;
  for (const puddle of state.tar ?? []) if (puddle.ticks > tick && Math.hypot(at.x - puddle.x, at.y - puddle.y) <= puddle.radius) slow *= TAR_SLOW;
  for (const cloud of state.perfume ?? []) if (cloud.ticks > tick && Math.hypot(at.x - cloud.x, at.y - cloud.y) <= cloud.radius) slow *= PERFUME_SLOW;
  return slow;
}

/** Whether a body at `at`, `tick` ticks from now, is hit by `danger`. */
function hits(danger: Danger, at: Vec2, tick: number): boolean {
  if (danger.kind === 'charge') {
    if (tick < danger.from - 1 || tick > danger.from + danger.ticks) return false;
    const run = Math.min(Math.max(tick - danger.from, 0), danger.ticks) * danger.speed;
    return Math.hypot(at.x - (danger.ox + danger.dx * run), at.y - (danger.oy + danger.dy * run)) <= danger.reach;
  }
  if (danger.kind === 'blast') {
    return Math.abs(tick - danger.at) <= 1 && Math.hypot(at.x - danger.x, at.y - danger.y) <= danger.reach;
  }
  const flown = tick - (danger.from ?? 0);
  if (flown < 0 || tick > danger.until) return false;
  return Math.hypot(at.x - (danger.x + danger.vx * flown), at.y - (danger.y + danger.vy * flown)) <= danger.reach;
}

export type PathCost = { readonly cost: number; /** Ticks until the first hit, or null when the path is clear. */ readonly firstHit: number | null };

/**
 * What walking (or dashing) along `heading` for the horizon would cost, in
 * health: each hit the path takes, counted once however long the contact, with
 * the janitor's 60 ticks of grace after it (nothing else lands inside it, as in
 * the sim) and what grace they already have. A step into a wall stays put, as the
 * sim's movement does, and walking through tar or perfume is slower. A dash is the
 * janitor's own: invulnerable for its 12 ticks and not slowed, so only what is met
 * after it counts.
 */
export function pathCost(state: RunState, dangers: readonly Danger[], heading: Vec2 | null, dash = false): PathCost {
  const player = state.player;
  let at: Vec2 = { x: player.x, y: player.y };
  let cost = 0;
  let firstHit: number | null = null;
  let graceUntil = player.invulnerableTicks ?? 0;
  const dashPerTick = DASH_DISTANCE / DASH_TICKS;
  for (let tick = 1; tick <= HORIZON; tick += 1) {
    if (heading !== null) {
      // A dash is not slowed by tar or perfume; walking is.
      const stride = dash && tick <= DASH_TICKS ? dashPerTick : PLAYER_SPEED_PER_TICK * slowAt(state, at, tick);
      const next = { x: at.x + heading.x * stride, y: at.y + heading.y * stride };
      if (Navigator.clear(state.walls, player.radius, next)) at = next;
    }
    if ((dash && tick <= DASH_TICKS) || tick <= graceUntil) continue;
    // Whatever lands first takes its health; the grace it starts covers anything else at the same moment.
    let taken = 0;
    for (const danger of dangers) if (hits(danger, at, tick)) taken = Math.max(taken, danger.damage);
    if (taken > 0) {
      cost += taken;
      firstHit ??= tick;
      graceUntil = tick + GRACE_TICKS;
    }
  }
  return { cost, firstHit };
}

export type Escape = { readonly heading: Vec2 | null; readonly dash: boolean };

/**
 * The way to go, given where the bot wanted to go (`intended`, null to stand):
 * the same if it is safe, otherwise the safest of sixteen headings, a dash
 * when the dash is the only clean way out (unless `allowDash` is off, for a
 * player who does not use one). Null when nothing needs doing.
 *
 * `previous` is the heading chosen last tick, if it was an escape: it is kept
 * while it is still as good as the best. Without that, two headings that clear
 * a lane equally well trade places every tick on the smallest change and the
 * janitor shuffles in place inside the lane.
 */
export function escapeFrom(state: RunState, dangers: readonly Danger[], intended: Vec2 | null, previous: Escape | null = null, allowDash = true): Escape | null {
  if (dangers.length === 0) return null;
  const wanted = pathCost(state, dangers, intended);
  if (wanted.cost === 0) return null;

  const dot = (heading: Vec2 | null): number => (heading && intended ? heading.x * intended.x + heading.y * intended.y : 0);
  let best: { heading: Vec2 | null; cost: number; first: number | null; dash: boolean } = { heading: intended, cost: wanted.cost, first: wanted.firstHit, dash: false };
  const consider = (heading: Vec2 | null, dash: boolean): void => {
    const result = pathCost(state, dangers, heading, dash);
    // Cheaper wins; on a tie, the one nearest to where the bot wanted to go, and walking beats dashing.
    if (result.cost < best.cost || (result.cost === best.cost && !dash && !best.dash && dot(heading) > dot(best.heading) + 1e-9)) {
      best = { heading, cost: result.cost, first: result.firstHit, dash };
    }
  };
  consider(null, false);
  for (const heading of HEADINGS) consider(heading, false);
  // Stay the course: last tick's way out, if it is still no worse than the best found.
  if (previous !== null && !previous.dash && previous.heading !== null && pathCost(state, dangers, previous.heading).cost <= best.cost) {
    best = { heading: previous.heading, cost: best.cost, first: best.first, dash: false };
  }
  // A dash is worth its cooldown only when walking still gets hit, and soon.
  if (allowDash && (state.player.dashCooldownTicks ?? 0) === 0 && best.cost > 0 && (best.first ?? HORIZON) <= 10) {
    for (const heading of HEADINGS) {
      const result = pathCost(state, dangers, heading, true);
      if (result.cost < best.cost) best = { heading, cost: result.cost, first: result.firstHit, dash: true };
    }
  }
  return { heading: best.heading, dash: best.dash };
}

