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
  BOSS_SLAM_RECOVER_TICKS,
  BOSS_SLAM_RECOVER_TICKS_PHASE3,
  BOSS_VOLLEY_TELEGRAPH_TICKS,
  bossConfigFor,
  bossPhaseForHealth,
  isBossKind,
} from '../../sim/combat/boss';
import { SPITTER_RECOVER_TICKS, SPITTER_TELEGRAPH_TICKS } from '../../sim/combat/enemies';
import { STATIC_BURST_RADIUS, STATIC_TELEGRAPH_TICKS } from '../../sim/combat/staticEnemy';
import { SHOPPER_CHARGE_TICKS, SHOPPER_TELEGRAPH_TICKS } from '../../sim/combat/shopper';
import { MASCOT_CHARGE_SPEED_PER_TICK, MASCOT_CHARGE_TICKS, MASCOT_TELEGRAPH_TICKS } from '../../sim/combat/mascot';
import { ROOFER_LOB_TICKS, TAR_SPLASH_RADIUS } from '../../sim/combat/roofer';
import { ELF_CROUCH_TICKS, ELF_HOP_TICKS, ELF_STOMP_RADIUS, GOON_WINDUP_TICKS, POODLE_CROUCH_TICKS, POODLE_DASH_SPEED, POODLE_DASH_TICKS, SPRITZ_WINDUP_TICKS } from '../../sim/combat/districtEnemies';
import { PERFUME_CLOUD_RADIUS } from '../../sim/combat/perfume';
import { DASH_TICKS } from '../../sim/combat/dash';
import type { ActorDirection } from './ActorSpriteView';

/** How far a Bargain Hunter's charge carries: the lane the renderer draws. */
const SHOPPER_CHARGE_REACH = SHOPPER_CHARGE_TICKS * 9;

/** How far a Mascot Brute's charge carries. */
const MASCOT_CHARGE_REACH = MASCOT_CHARGE_TICKS * MASCOT_CHARGE_SPEED_PER_TICK;

/** True while the Mall Owner's next attack is its charge rather than a slam. */
export function ownerChargePending(enemy: Pick<EnemyState, 'kind' | 'health' | 'bossAttacks'>): boolean {
  if (enemy.kind !== 'owner') return false;
  const config = bossConfigFor(enemy.kind);
  return config.charge !== undefined && bossPhaseForHealth(enemy.health, config.maxHealth) >= 2 && (enemy.bossAttacks ?? 0) % 2 === 1;
}

/**
 * A blow this big gets the heavy treatment (bigger star, number, shake, hit
 * stop and sound). The starting mop deals 4, so its hits read as the normal,
 * already-exaggerated hit, and anything harder — the broom handle, fusions,
 * lightning chains — stands out.
 */
export const HEAVY_HIT_DAMAGE = 5;

/** Hangers hurt by touch; this is how close they get before they rear up. */
export const HANGER_WARN_DISTANCE = 72;

export type Windup = {
  readonly kind: 'spit' | 'slam' | 'volley' | 'reach' | 'blink' | 'charge' | 'lob';
  /** 0 when the wind-up starts, 1 the tick it goes off. */
  readonly progress: number;
  readonly aimX: number;
  readonly aimY: number;
  /** Slam only: the authored reach, so the ring is the real hitbox. */
  readonly reach?: number;
  /** Blink and lob: where the Static or the tar bucket will land. */
  readonly targetX?: number;
  readonly targetY?: number;
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
  if (isBossKind(enemy.kind)) {
    const config = bossConfigFor(enemy.kind);
    const windups: Windup[] = [];
    if (enemy.phase === 'telegraph' && ownerChargePending(enemy) && config.charge) {
      windups.push({ kind: 'charge', progress: clamp01(1 - enemy.phaseTicks / config.slamTelegraphTicks), reach: config.charge.ticks * config.charge.speedPerTick, ...aim });
    } else if (enemy.phase === 'telegraph') {
      windups.push({ kind: 'slam', progress: clamp01(1 - enemy.phaseTicks / config.slamTelegraphTicks), reach: config.slamReach, ...aim });
    }
    // The Developer's barrage: a ring under every bucket in the air.
    const lobTicks = config.tarBarrage?.lobTicks ?? 1;
    for (const strike of enemy.tarStrikes ?? []) {
      windups.push({ kind: 'lob', progress: clamp01(1 - strike.ticks / lobTicks), aimX: 0, aimY: 0, targetX: strike.x, targetY: strike.y, reach: TAR_SPLASH_RADIUS });
    }
    const volley = enemy.bossVolleyTelegraphTicks ?? 0;
    if (volley > 0) {
      windups.push({
        kind: 'volley',
        progress: clamp01(1 - volley / BOSS_VOLLEY_TELEGRAPH_TICKS),
        angles: config.volleyAngles.map((degrees) => (degrees * Math.PI) / 180),
        ...aim,
      });
    }
    return windups;
  }
  if (enemy.kind === 'static') {
    // The crackling spot it will blink onto: the janitor's position when it locked on.
    return enemy.phase === 'telegraph'
      ? [{ kind: 'blink', progress: clamp01(1 - enemy.phaseTicks / STATIC_TELEGRAPH_TICKS), aimX: 0, aimY: 0, targetX: enemy.blinkX ?? enemy.x, targetY: enemy.blinkY ?? enemy.y, reach: STATIC_BURST_RADIUS }]
      : [];
  }
  if (enemy.kind === 'roofer') {
    // The bucket in the air: a ring where it will land, locked at the throw.
    return enemy.phase === 'telegraph'
      ? [{ kind: 'lob', progress: clamp01(1 - enemy.phaseTicks / ROOFER_LOB_TICKS), ...aim, targetX: enemy.lobX ?? player.x, targetY: enemy.lobY ?? player.y, reach: TAR_SPLASH_RADIUS }]
      : [];
  }
  // Round 50: the district monsters, each drawn with a shape the player already knows.
  if (enemy.kind === 'elf') {
    // The landing ring, through the crouch and the whole leap.
    const crouch = enemy.phase === 'telegraph';
    const airborne = enemy.phase === 'pursue' && (enemy.chargeTicks ?? 0) > 0;
    if (!crouch && !airborne) return [];
    const progress = crouch ? clamp01(1 - enemy.phaseTicks / ELF_CROUCH_TICKS) * 0.6 : 0.6 + 0.4 * clamp01(1 - (enemy.chargeTicks ?? 0) / ELF_HOP_TICKS);
    return [{ kind: 'lob', progress, ...aim, targetX: enemy.lobX ?? enemy.x, targetY: enemy.lobY ?? enemy.y, reach: ELF_STOMP_RADIUS }];
  }
  if (enemy.kind === 'spritzer') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'lob', progress: clamp01(1 - enemy.phaseTicks / SPRITZ_WINDUP_TICKS), ...aim, targetX: enemy.lobX ?? player.x, targetY: enemy.lobY ?? player.y, reach: PERFUME_CLOUD_RADIUS }]
      : [];
  }
  if (enemy.kind === 'poodle') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'charge', progress: clamp01(1 - enemy.phaseTicks / POODLE_CROUCH_TICKS), reach: POODLE_DASH_TICKS * POODLE_DASH_SPEED, ...aim }]
      : [];
  }
  if (enemy.kind === 'goon') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'spit', progress: clamp01(1 - enemy.phaseTicks / GOON_WINDUP_TICKS), ...aim }]
      : [];
  }
  if (enemy.kind === 'mascot') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'charge', progress: clamp01(1 - enemy.phaseTicks / MASCOT_TELEGRAPH_TICKS), reach: MASCOT_CHARGE_REACH, ...aim }]
      : [];
  }
  if (enemy.kind === 'shopper') {
    return enemy.phase === 'telegraph'
      ? [{ kind: 'charge', progress: clamp01(1 - enemy.phaseTicks / SHOPPER_TELEGRAPH_TICKS), reach: SHOPPER_CHARGE_REACH, ...aim }]
      : [];
  }
  // A watched mannequin is frozen: nothing is coming.
  if (enemy.kind === 'mannequin' && enemy.phase !== 'pursue') return [];
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance > HANGER_WARN_DISTANCE) return [];
  const unit = distance > 0 ? { aimX: dx / distance, aimY: dy / distance } : { aimX: 1, aimY: 0 };
  return [{ kind: 'reach', progress: clamp01(1 - (distance - enemy.radius) / (HANGER_WARN_DISTANCE - enemy.radius)), ...unit }];
}

export type TrackedAttack = { readonly phase: EnemyState['phase']; readonly kind: EnemyState['kind']; readonly volley?: number; readonly stunned?: number };

export type LandedAttack = {
  readonly id: string;
  readonly kind: 'spit' | 'slam' | 'volley' | 'quake';
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
      // The Owner's charge is not a slam: it goes off as it hits the wall.
      if (isBossKind(enemy.kind) && !((enemy.chargeTicks ?? 0) > 0)) landed.push({ kind: 'slam', ...at });
    }
    // A brute (or the Owner) running into a wall: the room shakes.
    if ((enemy.kind === 'mascot' || enemy.kind === 'owner') && (enemy.stunnedTicks ?? 0) > 0 && (before.stunned ?? 0) === 0) {
      landed.push({ kind: 'quake', ...at });
    }
    if (isBossKind(enemy.kind) && (before.volley ?? 0) > 0 && (enemy.bossVolleyTelegraphTicks ?? 0) === 0) {
      landed.push({ kind: 'volley', ...at });
    }
  }
  return landed;
}

export function trackAttacks(enemies: readonly EnemyState[]): Map<string, TrackedAttack> {
  return new Map(enemies.map((enemy) => [String(enemy.id), { phase: enemy.phase, kind: enemy.kind, volley: enemy.bossVolleyTelegraphTicks ?? 0, stunned: enemy.stunnedTicks ?? 0 }]));
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
export function glow(color: number, amount: number): number {
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
    } else if (windup.kind === 'blink') {
      // Static: the body flickers out of phase as the jump charges.
      const flick = tick % 3 === 0 ? 0.25 * p : 0;
      next = { offsetX: tremble * 2, offsetY: 0, scaleX: 1 + flick, scaleY: 1 - flick * 0.6, flash: p > 0.9, tint: glow(0x40e0ff, p * 0.8) };
    } else if (windup.kind === 'charge') {
      // Bargain Hunter: rears back against the lane before it goes.
      next = { offsetX: -windup.aimX * 8 * p + tremble, offsetY: -windup.aimY * 6 * p, scaleX: 1 + 0.12 * p, scaleY: 1 - 0.08 * p, flash: p > 0.92, tint: glow(0xffc040, p * 0.6) };
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
/** Where a charge or lob telegraph snaps from anticipation to its release frames. */
export const WINDUP_RELEASE_AT = 0.85;
/** During an active charge the release frames alternate this often (a stride). */
export const CHARGE_STRIDE_TICKS = 4;

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
  // Charges and lobs (Mascot, Bargain Hunter, Poodle, Spritzer, Roofer, Elf) release when
  // the telegraph ends, so their sheet anticipates over most of it and snaps to the
  // release frames in the last 15% (roadmap V2).
  // A boss's lobs are tar buckets already in the air while it walks on, not its own throw.
  const boss = isBossKind(enemy.kind);
  const lunge = windups.find((windup) => windup.kind === 'charge' || (windup.kind === 'lob' && !boss));
  if (lunge) {
    if (lunge.progress < WINDUP_RELEASE_AT) return Math.min(windupFrames - 1, Math.floor((lunge.progress / WINDUP_RELEASE_AT) * windupFrames));
    return Math.min(frames - 1, windupFrames + Math.floor(((lunge.progress - WINDUP_RELEASE_AT) / (1 - WINDUP_RELEASE_AT)) * release));
  }
  // The charge itself (Bargain Hunter, Mascot, Poodle, boss charges) runs after the warning
  // as `pursue` with chargeTicks left: keep the release pose, stepping between its frames,
  // rather than dropping back to the walk sheet mid-lunge.
  if ((enemy.chargeTicks ?? 0) > 0) return windupFrames + (Math.floor(tick / CHARGE_STRIDE_TICKS) % release);
  if (enemy.phase !== 'recover') return null;
  const recoverTicks = enemy.kind === 'spitter'
    ? SPITTER_RECOVER_TICKS
    : enemy.bossPhase === 3 ? BOSS_SLAM_RECOVER_TICKS_PHASE3 : BOSS_SLAM_RECOVER_TICKS;
  const since = recoverTicks - enemy.phaseTicks;
  if (since < 0 || since >= ATTACK_RELEASE_TICKS) return null;
  return Math.min(frames - 1, windupFrames + Math.floor((since / ATTACK_RELEASE_TICKS) * release));
}

/** Ticks per frame of the janitor's hurt flinch. */
export const PLAYER_HURT_TICKS_PER_FRAME = 3;
/** Milliseconds per frame of the death fall; the clock stops at game over. */
export const PLAYER_DEATH_MS_PER_FRAME = 110;

export type PlayerBodyAction = {
  readonly sheet: 'swing' | 'hurt' | 'death' | 'dash' | 'aim';
  readonly column: number;
  /** Overrides the aim-facing row: a dash draws along its own direction. */
  readonly direction?: ActorDirection;
};

/**
 * Which of the janitor's action sheets to draw, or null for walk/idle.
 * Death overrides everything and holds its last frame; a hit interrupts a
 * swing; the swing scrubs in step with the visible swing. A sheet with zero
 * frames is not loaded and is skipped.
 */
export function playerBodyAction(
  input: { readonly swing: number | null; readonly hurtAge: number | null; readonly deadMs: number | null; readonly dashAge?: number | null; readonly aim?: number | null },
  frames: { readonly swing: number; readonly hurt: number; readonly death: number; readonly dash?: number; readonly aim?: number },
): PlayerBodyAction | null {
  if (input.deadMs !== null && frames.death > 0) {
    return { sheet: 'death', column: Math.min(frames.death - 1, Math.floor(Math.max(0, input.deadMs) / PLAYER_DEATH_MS_PER_FRAME)) };
  }
  if (input.hurtAge !== null && frames.hurt > 0 && input.hurtAge >= 0 && input.hurtAge < frames.hurt * PLAYER_HURT_TICKS_PER_FRAME) {
    return { sheet: 'hurt', column: Math.floor(input.hurtAge / PLAYER_HURT_TICKS_PER_FRAME) };
  }
  // The authored dash (roadmap V4) spans the sim's dash window and outranks a swing.
  const dashFrames = frames.dash ?? 0;
  if (input.dashAge != null && dashFrames > 0 && input.dashAge >= 0 && input.dashAge < DASH_TICKS) {
    return { sheet: 'dash', column: Math.min(dashFrames - 1, Math.floor((input.dashAge / DASH_TICKS) * dashFrames)) };
  }
  // A ranged shot (roadmap V4, PixelLab): straight to the arms-forward frames, then hold.
  const aimFrames = frames.aim ?? 0;
  if (input.aim != null && aimFrames > 0) {
    return { sheet: 'aim', column: Math.max(0, aimFrames - (input.aim < 0.5 ? 2 : 1)) };
  }
  if (input.swing !== null && frames.swing > 0) {
    return { sheet: 'swing', column: Math.min(frames.swing - 1, Math.floor(clamp01(input.swing) * frames.swing)) };
  }
  return null;
}

/** A dashing janitor stretches along the motion and squashes vertically. */
export function dashPose(player: { readonly dashTicks?: number }): SpritePose {
  return (player.dashTicks ?? 0) > 0 ? { offsetX: 0, offsetY: -2, scaleX: 1.14, scaleY: 0.9, flash: false } : REST_POSE;
}
