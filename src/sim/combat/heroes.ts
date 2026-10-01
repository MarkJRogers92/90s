/**
 * Hero fusions (round 53): the move each hero signature has on top of its
 * stats. Run from the central tick: `heroAttack` when an attack is accepted,
 * `updateHeroes` every tick, and `luredTo` / `dazed` from the enemy update.
 *
 * - Greatest Hits: every attack adds a record circling the janitor (up to
 *   three) that cuts whatever it passes; the attack after that flings them.
 * - Comedy Hour: an attack throws a rubber chicken (one at a time). Monsters
 *   near it go for it instead of the janitor; when its time is up it bursts.
 * - Movie Night: now and then an attack also throws a projector beam down
 *   the aim line, to the first wall: it hurts and scares stiff all it lights.
 *
 * Bosses take the damage but are never lured or scared.
 */
import { heroOf } from '../fusion/heroes';
import type { EnemyState, HeroState, InputFrame, RunState, Vec2 } from '../model';
import { circleIntersectsRect, normalizedDirection } from '../core/geometry';
import { circlesOverlap } from './collision';
import { isBossKind } from './boss';

// Greatest Hits.
export const RECORD_MAX = 3;
export const RECORD_ORBIT_RADIUS = 46;
export const RECORD_RADIUS = 9;
const RECORD_SPIN = 0.08;
export const RECORD_CUT_DAMAGE = 2;
/** Ticks before the same record can cut the same monster again. */
const RECORD_CUT_COOLDOWN = 20;
export const RECORD_FLING_DAMAGE = 6;
const RECORD_FLING_SPEED = 7;
const RECORD_FLING_TICKS = 70;
const RECORD_FLING_SPREAD = 0.14;

// Comedy Hour.
const DECOY_THROW = 180;
export const DECOY_TICKS = 150;
export const DECOY_LURE_RADIUS = 260;
export const DECOY_BURST_RADIUS = 80;
export const DECOY_BURST_DAMAGE = 8;
const DECOY_BURST_DAZE_TICKS = 30;
const DECOY_BURST_PUSH = 36;
const DECOY_COOLDOWN_TICKS = 120;

// Movie Night.
export const BEAM_COOLDOWN_TICKS = 90;
export const BEAM_LENGTH = 420;
export const BEAM_HALF_WIDTH = 26;
export const BEAM_DAMAGE = 4;
export const BEAM_DAZE_TICKS = 60;
export const BEAM_SHOW_TICKS = 24;

const SHOW_BURST_TICKS = 20;

function heroState(state: RunState): HeroState {
  state.hero ??= { records: [], nextRecordId: 1, decoy: null, decoyCooldown: 0, bursts: [], beams: [], beamCooldown: 0 };
  return state.hero;
}

const blocked = (state: RunState, x: number, y: number, radius: number): boolean =>
  state.walls.some((wall) => circleIntersectsRect(x, y, radius, wall));

/** Scares a monster stiff for `ticks` (never a boss). */
function daze(enemy: EnemyState, ticks: number): void {
  if (isBossKind(enemy.kind)) return;
  enemy.dazedTicks = Math.max(enemy.dazedTicks ?? 0, ticks);
}

/** Called once for each attack the central tick accepts. */
export function heroAttack(state: RunState, input: InputFrame): void {
  const hero = heroOf(state.compiledLoadout.primary.definitionId);
  if (hero === null) return;
  const aim = normalizedDirection(input.aimX - state.player.x, input.aimY - state.player.y);
  const dir = aim.x === 0 && aim.y === 0 ? { x: 1, y: 0 } : aim;
  if (hero === 'greatest_hits') addOrFling(state, dir);
  else if (hero === 'comedy_hour') throwDecoy(state, input, dir);
  else projectBeam(state, dir);
}

function addOrFling(state: RunState, dir: Vec2): void {
  const hero = heroState(state);
  const orbiting = hero.records.filter((record) => record.mode === 'orbit');
  if (orbiting.length >= RECORD_MAX) {
    // The drop: every record flies out down the aim, in a narrow fan.
    const base = Math.atan2(dir.y, dir.x);
    orbiting.forEach((record, index) => {
      const angle = base + (index - (orbiting.length - 1) / 2) * RECORD_FLING_SPREAD;
      record.mode = 'flying';
      record.x = state.player.x;
      record.y = state.player.y;
      record.vx = Math.cos(angle) * RECORD_FLING_SPEED;
      record.vy = Math.sin(angle) * RECORD_FLING_SPEED;
      record.ticks = RECORD_FLING_TICKS;
      record.hits = {};
    });
    return;
  }
  const first = orbiting[0]?.angle ?? 0;
  hero.records.push({ id: hero.nextRecordId, mode: 'orbit', angle: first + (orbiting.length * 2 * Math.PI) / RECORD_MAX, x: state.player.x, y: state.player.y, vx: 0, vy: 0, ticks: 0, hits: {} });
  hero.nextRecordId += 1;
}

function throwDecoy(state: RunState, input: InputFrame, dir: Vec2): void {
  const hero = heroState(state);
  if (hero.decoy !== null || hero.decoyCooldown > 0) return;
  const reach = Math.min(DECOY_THROW, Math.hypot(input.aimX - state.player.x, input.aimY - state.player.y));
  // It lands short of any wall in the way.
  let at = { x: state.player.x, y: state.player.y };
  for (let travelled = 0; travelled < reach; travelled += 4) {
    const next = { x: at.x + dir.x * 4, y: at.y + dir.y * 4 };
    if (blocked(state, next.x, next.y, 10)) break;
    at = next;
  }
  hero.decoy = { x: at.x, y: at.y, ticks: DECOY_TICKS };
}

function projectBeam(state: RunState, dir: Vec2): void {
  const hero = heroState(state);
  if (hero.beamCooldown > 0) return;
  hero.beamCooldown = BEAM_COOLDOWN_TICKS;
  const { x, y } = state.player;
  let length = 0;
  while (length < BEAM_LENGTH && !blocked(state, x + dir.x * (length + 6), y + dir.y * (length + 6), 2)) length += 6;
  hero.beams.push({ x, y, toX: x + dir.x * length, toY: y + dir.y * length, ticks: BEAM_SHOW_TICKS });
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    const along = (enemy.x - x) * dir.x + (enemy.y - y) * dir.y;
    const across = Math.abs((enemy.x - x) * dir.y - (enemy.y - y) * dir.x);
    if (along < 0 || along > length + enemy.radius || across > BEAM_HALF_WIDTH + enemy.radius) continue;
    enemy.health -= BEAM_DAMAGE;
    daze(enemy, BEAM_DAZE_TICKS);
  }
}

/** Every tick: records spin and fly, the decoy counts down, beams fade. */
export function updateHeroes(state: RunState): void {
  const hero = state.hero;
  if (!hero) return;
  hero.decoyCooldown = Math.max(0, hero.decoyCooldown - 1);
  hero.beamCooldown = Math.max(0, hero.beamCooldown - 1);
  hero.beams = hero.beams.filter((beam) => (beam.ticks -= 1) > 0);
  hero.bursts = hero.bursts.filter((burst) => (burst.ticks -= 1) > 0);
  // A record put away (another weapon in hand) stops orbiting; flung ones finish.
  if (heroOf(state.compiledLoadout.primary.definitionId) !== 'greatest_hits') hero.records = hero.records.filter((record) => record.mode === 'flying');

  for (const record of hero.records) {
    if (record.mode === 'orbit') {
      record.angle += RECORD_SPIN;
      record.x = state.player.x + Math.cos(record.angle) * RECORD_ORBIT_RADIUS;
      record.y = state.player.y + Math.sin(record.angle) * RECORD_ORBIT_RADIUS;
      cut(state, record, RECORD_CUT_DAMAGE, RECORD_CUT_COOLDOWN);
    } else {
      record.x += record.vx;
      record.y += record.vy;
      record.ticks -= 1;
      if (blocked(state, record.x, record.y, RECORD_RADIUS)) record.ticks = 0;
      else cut(state, record, RECORD_FLING_DAMAGE, Infinity);
    }
  }
  hero.records = hero.records.filter((record) => record.mode === 'orbit' || record.ticks > 0);

  if (hero.decoy) {
    hero.decoy.ticks -= 1;
    if (hero.decoy.ticks <= 0) burst(state, hero);
  }
}

function cut(state: RunState, record: HeroState['records'][number], damage: number, cooldown: number): void {
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || !circlesOverlap(record.x, record.y, RECORD_RADIUS, enemy.x, enemy.y, enemy.radius)) continue;
    const last = record.hits[enemy.id];
    if (last !== undefined && state.tick - last < cooldown) continue;
    record.hits[enemy.id] = state.tick;
    enemy.health -= damage;
  }
}

function burst(state: RunState, hero: HeroState): void {
  const decoy = hero.decoy!;
  hero.decoy = null;
  hero.decoyCooldown = DECOY_COOLDOWN_TICKS;
  hero.bursts.push({ x: decoy.x, y: decoy.y, ticks: SHOW_BURST_TICKS });
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || !circlesOverlap(decoy.x, decoy.y, DECOY_BURST_RADIUS, enemy.x, enemy.y, enemy.radius)) continue;
    enemy.health -= DECOY_BURST_DAMAGE;
    daze(enemy, DECOY_BURST_DAZE_TICKS);
    if (isBossKind(enemy.kind)) continue;
    const away = normalizedDirection(enemy.x - decoy.x, enemy.y - decoy.y);
    const to = { x: enemy.x + away.x * DECOY_BURST_PUSH, y: enemy.y + away.y * DECOY_BURST_PUSH };
    if (!blocked(state, to.x, to.y, enemy.radius)) {
      enemy.x = to.x;
      enemy.y = to.y;
    }
  }
}

/** Where a monster is drawn to instead of the janitor, if anywhere: the decoy, when near (never a boss). */
export function luredTo(state: RunState, enemy: EnemyState): Vec2 | null {
  const decoy = state.hero?.decoy;
  if (!decoy || isBossKind(enemy.kind)) return null;
  return Math.hypot(enemy.x - decoy.x, enemy.y - decoy.y) <= DECOY_LURE_RADIUS ? decoy : null;
}

/**
 * Runs one monster's update as if the janitor stood at `lure`: it chases and
 * aims at the chicken. The janitor cannot be hurt through it meanwhile (its
 * real body is elsewhere); touching the real janitor still hurts as usual.
 */
export function withLure(state: RunState, lure: Vec2, update: () => void): void {
  const player = state.player;
  const { x, y, invulnerableTicks } = player;
  player.x = lure.x;
  player.y = lure.y;
  player.invulnerableTicks = Number.MAX_SAFE_INTEGER;
  try {
    update();
  } finally {
    player.x = x;
    player.y = y;
    player.invulnerableTicks = invulnerableTicks;
  }
}
