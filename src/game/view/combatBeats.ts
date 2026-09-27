/**
 * Combat beats: what the renderer should exaggerate, read from authoritative
 * state.
 *
 * Every function here is pure. It reads telegraph phases and health the
 * simulation already wrote and answers presentation questions — how far into
 * its wind-up is this enemy, did an attack just go off, how long should the
 * frame hold on this hit — without deciding anything about damage or timing.
 * The one effect with a gameplay-adjacent feel, hit stop, is a pause of the
 * fixed-step clock (like the pause menu), never a rule change.
 */
import type { EnemyState } from '../../sim/model';
import {
  BOSS_SLAM_REACH,
  BOSS_SLAM_RECOVER_TICKS,
  BOSS_SLAM_RECOVER_TICKS_PHASE3,
  BOSS_SLAM_TELEGRAPH_TICKS,
  BOSS_VOLLEY_TELEGRAPH_TICKS,
  VOLLEY_ANGLE_OFFSETS_DEGREES,
} from '../../sim/combat/boss';
import { SPITTER_RECOVER_TICKS, SPITTER_TELEGRAPH_TICKS } from '../../sim/combat/enemies';

/** Hangers hurt by touch; this is how close they get before they rear up. */
export const HANGER_WARN_DISTANCE = 72;

export type Windup = {
  readonly kind: 'spit' | 'slam' | 'volley' | 'reach';
  /** 0 when the wind-up starts, 1 the tick it goes off. */
  readonly progress: number;
  readonly aimX: number;
  readonly aimY: number;
  /** Slam only: the authored reach, so the ring is the real hitbox. */
  readonly reach?: number;
  /** Volley only: each shot's angle in radians relative to the aim. */
  readonly angles?: readonly number[];
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function enemyWindups(enemy: EnemyState, player: { readonly x: number; readonly y: number }): Windup[] {
  if (enemy.health <= 0) return [];
  const aim = { aimX: enemy.telegraphAimX, aimY: enemy.telegraphAimY };
  if (enemy.kind === 'spitter') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'spit', progress: clamp01(1 - enemy.phaseTicks / SPITTER_TELEGRAPH_TICKS), ...aim }]
      : [];
  }
  if (enemy.kind === 'lp_manager') {
    const windups: Windup[] = [];
    if (enemy.phase === 'telegraph') {
      windups.push({ kind: 'slam', progress: clamp01(1 - enemy.phaseTicks / BOSS_SLAM_TELEGRAPH_TICKS), reach: BOSS_SLAM_REACH, ...aim });
    }
    const volley = enemy.bossVolleyTelegraphTicks ?? 0;
    if (volley > 0) {
      windups.push({
        kind: 'volley',
        progress: clamp01(1 - volley / BOSS_VOLLEY_TELEGRAPH_TICKS),
        angles: VOLLEY_ANGLE_OFFSETS_DEGREES.map((degrees) => (degrees * Math.PI) / 180),
        ...aim,
      });
    }
    return windups;
  }
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance > HANGER_WARN_DISTANCE) return [];
  const unit = distance > 0 ? { aimX: dx / distance, aimY: dy / distance } : { aimX: 1, aimY: 0 };
  return [{ kind: 'reach', progress: clamp01(1 - (distance - enemy.radius) / (HANGER_WARN_DISTANCE - enemy.radius)), ...unit }];
}

export type TrackedAttack = { readonly phase: EnemyState['phase']; readonly kind: EnemyState['kind']; readonly volley?: number };

export type LandedAttack = {
  readonly id: string;
  readonly kind: 'spit' | 'slam' | 'volley';
  readonly x: number;
  readonly y: number;
  readonly aimX: number;
  readonly aimY: number;
};

/** Pure: which enemy attacks went off between two rendered frames. */
export function diffEnemyAttacks(previous: ReadonlyMap<string, TrackedAttack>, current: readonly EnemyState[]): LandedAttack[] {
  const landed: LandedAttack[] = [];
  for (const enemy of current) {
    const id = String(enemy.id);
    const before = previous.get(id);
    if (!before || enemy.health <= 0) continue;
    const at = { id, x: enemy.x, y: enemy.y, aimX: enemy.telegraphAimX, aimY: enemy.telegraphAimY };
    if (before.phase === 'telegraph' && enemy.phase !== 'telegraph') {
      if (enemy.kind === 'spitter') landed.push({ kind: 'spit', ...at });
      if (enemy.kind === 'lp_manager') landed.push({ kind: 'slam', ...at });
    }
    if (enemy.kind === 'lp_manager' && (before.volley ?? 0) > 0 && (enemy.bossVolleyTelegraphTicks ?? 0) === 0) {
      landed.push({ kind: 'volley', ...at });
    }
  }
  return landed;
}

export function trackAttacks(enemies: readonly EnemyState[]): Map<string, TrackedAttack> {
  return new Map(enemies.map((enemy) => [String(enemy.id), { phase: enemy.phase, kind: enemy.kind, volley: enemy.bossVolleyTelegraphTicks ?? 0 }]));
}

export type HitStopBeat =
  | { readonly kind: 'hit'; readonly heavy: boolean }
  | { readonly kind: 'kill'; readonly boss: boolean }
  | { readonly kind: 'playerHurt' }
  | { readonly kind: 'slam' };

/** Milliseconds the fixed-step clock holds on each beat. */
export const HIT_STOP_MS = {
  hit: 45,
  heavyHit: 70,
  slam: 80,
  kill: 105,
  playerHurt: 160,
  bossKill: 420,
} as const;

/** The longest hold any beat this frame asks for; beats never add up. */
export function hitStopFor(beats: readonly HitStopBeat[]): number {
  let hold = 0;
  for (const beat of beats) {
    const ms = beat.kind === 'hit' ? (beat.heavy ? HIT_STOP_MS.heavyHit : HIT_STOP_MS.hit)
      : beat.kind === 'kill' ? (beat.boss ? HIT_STOP_MS.bossKill : HIT_STOP_MS.kill)
        : beat.kind === 'playerHurt' ? HIT_STOP_MS.playerHurt
          : HIT_STOP_MS.slam;
    hold = Math.max(hold, ms);
  }
  return hold;
}

export const HIT_REACTION_TICKS = 14;

export type SpritePose = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly flash: boolean;
  /** Additive glow while an attack charges. */
  readonly tint?: number;
};

export const REST_POSE: SpritePose = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false };

/**
 * The sprite's reaction `age` ticks after being struck from direction
 * (dirX, dirY): a white flash, a snap back along the hit that springs home,
 * and a squash that overshoots into a stretch. Purely a drawing offset.
 */
export function hitReaction(age: number, dirX: number, dirY: number, heavy: boolean): SpritePose {
  if (age < 0 || age >= HIT_REACTION_TICKS) return REST_POSE;
  const t = age / HIT_REACTION_TICKS;
  const knock = (heavy ? 16 : 10) * (1 - t) * (1 - t);
  const squash = Math.cos(t * Math.PI * 2.5) * (1 - t) * (heavy ? 0.32 : 0.22);
  const length = Math.hypot(dirX, dirY) || 1;
  return {
    offsetX: (dirX / length) * knock,
    offsetY: (dirY / length) * knock,
    scaleX: 1 + squash,
    scaleY: 1 - squash * 0.8,
    flash: age < (heavy ? 5 : 3),
  };
}

/** An additive tint: `color` scaled by `amount` per channel. */
function glow(color: number, amount: number): number {
  const a = clamp01(amount);
  const r = Math.round(((color >> 16) & 0xff) * a);
  const g = Math.round(((color >> 8) & 0xff) * a);
  const b = Math.round((color & 0xff) * a);
  return (r << 16) | (g << 8) | b;
}

/**
 * How a charging enemy is drawn: exaggerated anticipation. The body swells or
 * rises as the wind-up fills, trembles near the end, glows the attack's
 * colour, and flashes white on the last ticks so the release is unmissable.
 */
export function windupPose(windups: readonly Windup[], tick: number): SpritePose {
  let pose: SpritePose = REST_POSE;
  for (const windup of windups) {
    const p = windup.progress;
    const tremble = p > 0.6 ? (tick % 2 === 0 ? 1 : -1) * 1.5 * p : 0;
    let next: SpritePose;
    if (windup.kind === 'spit') {
      next = { offsetX: tremble, offsetY: 0, scaleX: 1 + 0.3 * p, scaleY: 1 + 0.18 * p, flash: p > 0.92, tint: glow(0x50ff40, p * 0.7) };
    } else if (windup.kind === 'slam') {
      next = { offsetX: tremble, offsetY: -16 * p, scaleX: 1 + 0.1 * p, scaleY: 1 + 0.14 * p, flash: p > 0.94, tint: glow(0xffa030, p * 0.6) };
    } else if (windup.kind === 'volley') {
      next = { offsetX: tremble * 0.5, offsetY: 0, scaleX: 1 + 0.06 * p, scaleY: 1 + 0.06 * p, flash: false, tint: glow(0xff3fc8, p * 0.55) };
    } else {
      next = { offsetX: windup.aimX * 7 * p, offsetY: windup.aimY * 5 * p - 4 * p, scaleX: 1 - 0.08 * p, scaleY: 1 + 0.26 * p, flash: false, tint: glow(0xff2020, p * 0.6) };
    }
    pose = combinePoses(pose, next);
  }
  return pose;
}

/** Layers two poses: offsets add, scales multiply, the brighter glow wins. */
export function combinePoses(a: SpritePose, b: SpritePose): SpritePose {
  const tint = a.tint === undefined ? b.tint : b.tint === undefined ? a.tint : Math.max(a.tint, b.tint);
  const combined: SpritePose = {
    offsetX: a.offsetX + b.offsetX,
    offsetY: a.offsetY + b.offsetY,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
    flash: a.flash || b.flash,
  };
  return tint === undefined ? combined : { ...combined, tint };
}

/** Ticks the release half of an attack animation plays after the attack fires. */
export const ATTACK_RELEASE_TICKS = 14;

/**
 * Which column of an enemy's attack sheet to draw, or null for its normal
 * walk/idle art. The wind-up scrubs the first two-thirds of the sheet in step
 * with the authored telegraph, so the strike frame lands on the tick the
 * simulation fires; the last third plays during the first ticks of recovery.
 * A hanger's strike loops while it is touching distance from the janitor.
 */
export function attackFrameFor(enemy: EnemyState, windups: readonly Windup[], frames: number, tick: number): number | null {
  if (frames < 2 || enemy.health <= 0) return null;
  const release = Math.max(1, Math.floor(frames / 3));
  const windupFrames = frames - release;
  if (enemy.kind === 'hanger') {
    const reach = windups.find((windup) => windup.kind === 'reach');
    return reach && reach.progress > 0.55 ? Math.floor(tick / 3) % frames : null;
  }
  const charge = windups.find((windup) => windup.kind === 'spit' || windup.kind === 'slam');
  if (charge) return Math.min(windupFrames - 1, Math.floor(charge.progress * windupFrames));
  if (enemy.phase !== 'recover') return null;
  const recoverTicks = enemy.kind === 'spitter'
    ? SPITTER_RECOVER_TICKS
    : enemy.bossPhase === 3 ? BOSS_SLAM_RECOVER_TICKS_PHASE3 : BOSS_SLAM_RECOVER_TICKS;
  const since = recoverTicks - enemy.phaseTicks;
  if (since < 0 || since >= ATTACK_RELEASE_TICKS) return null;
  return Math.min(frames - 1, windupFrames + Math.floor((since / ATTACK_RELEASE_TICKS) * release));
}
