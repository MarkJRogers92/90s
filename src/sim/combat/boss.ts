import type { EnemyKind, EnemyState, RunState } from '../model';
import {
  circleIntersectsRect,
  normalizedDirection,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from '../core/geometry';
import { moveCircle } from './movement';
import { playerDashing } from './dash';

export const BOSS_MAX_HEALTH = 90;
export const BOSS_RADIUS = 22;
export const BOSS_PURSUE_SPEED_PER_TICK = 0.8;
export const BOSS_PURSUE_TICKS = 60;
export const BOSS_SLAM_TELEGRAPH_TICKS = 36;
export const BOSS_SLAM_REACH = 52;
export const BOSS_SLAM_DAMAGE = 2;
export const BOSS_SLAM_RECOVER_TICKS = 90;
export const BOSS_SLAM_RECOVER_TICKS_PHASE3 = 60;
export const BOSS_VOLLEY_TELEGRAPH_TICKS = 45;
export const BOSS_VOLLEY_COUNT = 5;
export const BOSS_VOLLEY_SPREAD_DEGREES = 60;
export const BOSS_VOLLEY_PROJECTILE_RADIUS = 5;
export const BOSS_VOLLEY_PROJECTILE_DAMAGE = 1;
export const BOSS_VOLLEY_PROJECTILE_SPEED_PER_TICK = 2.5;
export const BOSS_VOLLEY_PROJECTILE_LIFETIME_TICKS = 240;
export const BOSS_VOLLEY_CADENCE_PHASE2 = 150;
export const BOSS_VOLLEY_CADENCE_PHASE3 = 120;
export const BOSS_SUMMON_OFFSETS = [
  { x: 64, y: 0 },
  { x: -64, y: 0 },
] as const;
export const BOSS_SUMMONED_KIND = 'hanger';
export const BOSS_SUMMONED_HEALTH = 12;
export const BOSS_SUMMONED_RADIUS = 14;

/** Offsets in degrees, ascending, for the five-projectile volley fan. */
export const VOLLEY_ANGLE_OFFSETS_DEGREES = [-30, -15, 0, 15, 30] as const;

/**
 * Everything that makes one boss different from another. Loss Prevention's
 * config is exactly the constants above (which stay exported for its tests);
 * the Mall Manager on the upper floor is tougher, reaches further, volleys
 * wider from its first phase, and calls in Bargain Hunters instead of Hangers.
 */
export type BossKind = 'lp_manager' | 'manager';

export type BossConfig = {
  readonly maxHealth: number;
  readonly radius: number;
  readonly pursueSpeedPerTick: number;
  readonly slamTelegraphTicks: number;
  readonly slamReach: number;
  readonly slamDamage: number;
  readonly slamRecoverTicks: number;
  readonly slamRecoverTicksPhase3: number;
  readonly volleyAngles: readonly number[];
  readonly volleySpeedPerTick: number;
  /** Volley cadence per phase; null means no volley in that phase. */
  readonly volleyCadence: readonly [number | null, number, number];
  readonly summonKind: EnemyKind;
  readonly summonHealth: number;
  readonly summonRadius: number;
};

export const BOSS_CONFIGS: Readonly<Record<BossKind, BossConfig>> = {
  lp_manager: {
    maxHealth: BOSS_MAX_HEALTH,
    radius: BOSS_RADIUS,
    pursueSpeedPerTick: BOSS_PURSUE_SPEED_PER_TICK,
    slamTelegraphTicks: BOSS_SLAM_TELEGRAPH_TICKS,
    slamReach: BOSS_SLAM_REACH,
    slamDamage: BOSS_SLAM_DAMAGE,
    slamRecoverTicks: BOSS_SLAM_RECOVER_TICKS,
    slamRecoverTicksPhase3: BOSS_SLAM_RECOVER_TICKS_PHASE3,
    volleyAngles: VOLLEY_ANGLE_OFFSETS_DEGREES,
    volleySpeedPerTick: BOSS_VOLLEY_PROJECTILE_SPEED_PER_TICK,
    volleyCadence: [null, BOSS_VOLLEY_CADENCE_PHASE2, BOSS_VOLLEY_CADENCE_PHASE3],
    summonKind: BOSS_SUMMONED_KIND,
    summonHealth: BOSS_SUMMONED_HEALTH,
    summonRadius: BOSS_SUMMONED_RADIUS,
  },
  manager: {
    maxHealth: 150,
    radius: 24,
    pursueSpeedPerTick: 1.0,
    slamTelegraphTicks: 32,
    slamReach: 64,
    slamDamage: 2,
    slamRecoverTicks: 80,
    slamRecoverTicksPhase3: 54,
    volleyAngles: [-45, -30, -15, 0, 15, 30, 45],
    volleySpeedPerTick: 2.9,
    volleyCadence: [180, 130, 100],
    summonKind: 'shopper',
    summonHealth: 18,
    summonRadius: 16,
  },
};

export function isBossKind(kind: EnemyKind): kind is BossKind {
  return kind === 'lp_manager' || kind === 'manager';
}

export function isBoss(enemy: Pick<EnemyState, 'kind'>): boolean {
  return isBossKind(enemy.kind);
}

export function bossConfigFor(kind: EnemyKind): BossConfig {
  return kind === 'manager' ? BOSS_CONFIGS.manager : BOSS_CONFIGS.lp_manager;
}

/**
 * The same player invulnerability window the existing enemy stage applies
 * after a Hanger touch or an enemy projectile hit. The slam reuses it instead
 * of adding a second rule.
 */
const PLAYER_INVULNERABILITY_TICKS = 60;

/**
 * Boss phase from current health: 1 above 66 percent, 2 from 66 percent down
 * to 34 percent inclusive, 3 below 34 percent. Integer health 40 stays in
 * phase 1, 39 drops to phase 2, 21 holds phase 2, and 20 enters phase 3.
 */
export function bossPhaseForHealth(health: number, maxHealth: number = BOSS_MAX_HEALTH): 1 | 2 | 3 {
  const scaled = health * 100;
  if (scaled > 66 * maxHealth) {
    return 1;
  }
  if (scaled >= 34 * maxHealth) {
    return 2;
  }
  return 3;
}

function lockAimAtPlayer(state: RunState, enemyIndex: number): void {
  const enemy = state.enemies[enemyIndex];
  if (!enemy) {
    return;
  }
  const direction = normalizedDirection(state.player.x - enemy.x, state.player.y - enemy.y);
  enemy.telegraphAimX = direction.x === 0 && direction.y === 0 ? 1 : direction.x;
  enemy.telegraphAimY = direction.x === 0 && direction.y === 0 ? 0 : direction.y;
}

function clampSummon(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_WIDTH - BOSS_SUMMONED_RADIUS, x),
    ),
    y: Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_HEIGHT - BOSS_SUMMONED_RADIUS, y),
    ),
  };
}

/**
 * The candidate offset vectors one summon tries, in stable order.
 *
 * The authored offset and its mirror come first, so an unobstructed summon
 * keeps its exact authored position. The two perpendicular rotations of the
 * same authored reach follow: they are only reached when the authored spots
 * are inside solid geometry or already taken by an earlier Hanger in the same
 * burst, which is what stops a summon against a wall from stacking both
 * Hangers on the one reachable point.
 */
function summonCandidateOffsets(
  offsetX: number,
  offsetY: number,
): { x: number; y: number }[] {
  return [
    { x: offsetX, y: offsetY },
    { x: -offsetX, y: offsetY },
    { x: offsetX, y: -offsetY },
    { x: -offsetX, y: -offsetY },
    { x: -offsetY, y: offsetX },
    { x: offsetY, y: -offsetX },
    { x: -offsetY, y: -offsetX },
    { x: offsetY, y: offsetX },
  ];
}

/**
 * One summon position: the first clear candidate that no earlier summon in the
 * same burst already occupies.
 *
 * Candidates are tried in stable order and clamped inside the playfield. A
 * clear candidate another Hanger already holds is remembered but skipped, so a
 * summon burst near a wall spreads out instead of stacking both Hangers on the
 * one reachable spot. If every clear candidate is taken, the remembered one
 * stands; if no candidate is clear at all, the first clamped candidate is
 * returned exactly as before.
 */
function placeSummon(
  state: RunState,
  bossX: number,
  bossY: number,
  offsetX: number,
  offsetY: number,
  occupied: readonly { readonly x: number; readonly y: number }[],
): { x: number; y: number } {
  const candidates = summonCandidateOffsets(offsetX, offsetY);
  let occupiedFallback: { x: number; y: number } | null = null;
  for (const candidate of candidates) {
    const { x, y } = clampSummon(bossX + candidate.x, bossY + candidate.y);
    const insideWall = state.walls.some((wall) =>
      circleIntersectsRect(x, y, BOSS_SUMMONED_RADIUS, wall),
    );
    if (insideWall) {
      continue;
    }
    if (occupied.some((spot) => spot.x === x && spot.y === y)) {
      occupiedFallback = occupiedFallback ?? { x, y };
      continue;
    }
    return { x, y };
  }
  return occupiedFallback ?? clampSummon(bossX + offsetX, bossY + offsetY);
}

function summonPhaseThreeHangers(state: RunState, enemyIndex: number): void {
  const boss = state.enemies[enemyIndex];
  if (!boss) {
    return;
  }
  const config = bossConfigFor(boss.kind);
  const placed: { x: number; y: number }[] = [];
  for (const offset of BOSS_SUMMON_OFFSETS) {
    const position = placeSummon(state, boss.x, boss.y, offset.x, offset.y, placed);
    placed.push(position);
    state.enemies.push({
      id: state.nextEntityId,
      kind: config.summonKind,
      x: position.x,
      y: position.y,
      health: config.summonHealth,
      radius: config.summonRadius,
      phase: 'pursue',
      phaseTicks: 0,
      cooldownTicks: 0,
      telegraphAimX: 0,
      telegraphAimY: 0,
    });
    state.nextEntityId += 1;
  }
  boss.bossSummoned = true;
}

function spawnVolley(state: RunState, enemyIndex: number): void {
  const boss = state.enemies[enemyIndex];
  if (!boss) {
    return;
  }
  if (boss.telegraphAimX === 0 && boss.telegraphAimY === 0) {
    lockAimAtPlayer(state, enemyIndex);
  }
  const config = bossConfigFor(boss.kind);
  const baseAngle = Math.atan2(boss.telegraphAimY, boss.telegraphAimX);
  for (const offsetDegrees of config.volleyAngles) {
    const angle = baseAngle + (offsetDegrees * Math.PI) / 180;
    const velocityX = Math.cos(angle) * config.volleySpeedPerTick;
    const velocityY = Math.sin(angle) * config.volleySpeedPerTick;
    state.projectiles.push({
      id: state.nextEntityId,
      x: boss.x,
      y: boss.y,
      previousX: boss.x,
      previousY: boss.y,
      velocityX,
      velocityY,
      radius: BOSS_VOLLEY_PROJECTILE_RADIUS,
      remainingTicks: BOSS_VOLLEY_PROJECTILE_LIFETIME_TICKS,
      faction: 'enemy',
      damage: BOSS_VOLLEY_PROJECTILE_DAMAGE,
    });
    state.nextEntityId += 1;
  }
}

/**
 * Deterministic Loss Prevention Manager update, called from the existing
 * enemy stage. Phase is recomputed from current health every tick, the slam
 * runs on phase/phaseTicks with its aim locked at telegraph start, and the
 * volley runs on cooldownTicks with its own 45-tick locked telegraph window,
 * exposed as `bossVolleyTelegraphTicks` so a renderer or test can see the
 * wind-up. A charging volley defers the slam wind-up until it clears. The boss
 * never damages by body contact; only the slam and volley shots do.
 */
export function updateLpManager(state: RunState, enemyIndex: number): void {
  const boss = state.enemies[enemyIndex];
  if (!boss || boss.health <= 0) {
    return;
  }

  const config = bossConfigFor(boss.kind);
  const bossPhase = bossPhaseForHealth(boss.health, config.maxHealth);
  boss.bossPhase = bossPhase;
  if (bossPhase === 3 && !boss.bossSummoned) {
    summonPhaseThreeHangers(state, enemyIndex);
  }

  const phaseCadence = config.volleyCadence[bossPhase - 1] ?? null;
  if (phaseCadence === null) {
    boss.cooldownTicks = config.volleyCadence[1];
    boss.bossVolleyTelegraphTicks = 0;
  } else {
    const cadence = phaseCadence;
    if (!Number.isFinite(boss.cooldownTicks)) {
      boss.cooldownTicks = cadence;
    }
    boss.cooldownTicks -= 1;
    if (boss.cooldownTicks <= 0) {
      spawnVolley(state, enemyIndex);
      boss.cooldownTicks = cadence;
      boss.bossVolleyTelegraphTicks = 0;
    } else {
      boss.bossVolleyTelegraphTicks =
        boss.cooldownTicks <= BOSS_VOLLEY_TELEGRAPH_TICKS ? boss.cooldownTicks : 0;
      if (boss.cooldownTicks === BOSS_VOLLEY_TELEGRAPH_TICKS) {
        lockAimAtPlayer(state, enemyIndex);
      }
    }
  }

  if (boss.phase === 'pursue') {
    const direction = normalizedDirection(state.player.x - boss.x, state.player.y - boss.y);
    const next = moveCircle(
      boss,
      boss.radius,
      direction.x * config.pursueSpeedPerTick,
      direction.y * config.pursueSpeedPerTick,
      state.walls,
    );
    boss.x = next.x;
    boss.y = next.y;
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0 && (boss.bossVolleyTelegraphTicks ?? 0) <= 0) {
      boss.phase = 'telegraph';
      boss.phaseTicks = config.slamTelegraphTicks;
      lockAimAtPlayer(state, enemyIndex);
    }
  } else if (boss.phase === 'telegraph') {
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0) {
      if (state.player.invulnerableTicks <= 0 && !playerDashing(state)) {
        const distance = Math.hypot(state.player.x - boss.x, state.player.y - boss.y);
        if (distance <= config.slamReach) {
          state.player.health -= config.slamDamage;
          state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
        }
      }
      boss.phase = 'recover';
      boss.phaseTicks =
        bossPhase === 3 ? config.slamRecoverTicksPhase3 : config.slamRecoverTicks;
    }
  } else {
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0) {
      boss.phase = 'pursue';
      boss.phaseTicks = BOSS_PURSUE_TICKS;
    }
  }
}
