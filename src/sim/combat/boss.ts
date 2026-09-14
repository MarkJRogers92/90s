import type { RunState } from '../model';
import {
  circleIntersectsRect,
  normalizedDirection,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from '../core/geometry';
import { moveCircle } from './movement';

export const BOSS_MAX_HEALTH = 60;
export const BOSS_RADIUS = 22;
export const BOSS_PURSUE_SPEED_PER_TICK = 0.5;
export const BOSS_PURSUE_TICKS = 60;
export const BOSS_SLAM_TELEGRAPH_TICKS = 36;
export const BOSS_SLAM_REACH = 44;
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
export const BOSS_SUMMONED_HEALTH = 8;
export const BOSS_SUMMONED_RADIUS = 14;

/** Offsets in degrees, ascending, for the five-projectile volley fan. */
const VOLLEY_ANGLE_OFFSETS_DEGREES = [-30, -15, 0, 15, 30] as const;

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
export function bossPhaseForHealth(health: number): 1 | 2 | 3 {
  const scaled = health * 100;
  if (scaled > 66 * BOSS_MAX_HEALTH) {
    return 1;
  }
  if (scaled >= 34 * BOSS_MAX_HEALTH) {
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

function placeSummon(state: RunState, bossX: number, bossY: number, offsetX: number, offsetY: number): { x: number; y: number } {
  const candidates = [
    { x: offsetX, y: offsetY },
    { x: -offsetX, y: offsetY },
    { x: offsetX, y: -offsetY },
    { x: -offsetX, y: -offsetY },
  ];
  for (const candidate of candidates) {
    const x = Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_WIDTH - BOSS_SUMMONED_RADIUS, bossX + candidate.x),
    );
    const y = Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_HEIGHT - BOSS_SUMMONED_RADIUS, bossY + candidate.y),
    );
    const insideWall = state.walls.some((wall) =>
      circleIntersectsRect(x, y, BOSS_SUMMONED_RADIUS, wall),
    );
    if (!insideWall) {
      return { x, y };
    }
  }
  return {
    x: Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_WIDTH - BOSS_SUMMONED_RADIUS, bossX + offsetX),
    ),
    y: Math.max(
      BOSS_SUMMONED_RADIUS,
      Math.min(PLAYFIELD_HEIGHT - BOSS_SUMMONED_RADIUS, bossY + offsetY),
    ),
  };
}

function summonPhaseThreeHangers(state: RunState, enemyIndex: number): void {
  const boss = state.enemies[enemyIndex];
  if (!boss) {
    return;
  }
  for (const offset of BOSS_SUMMON_OFFSETS) {
    const position = placeSummon(state, boss.x, boss.y, offset.x, offset.y);
    state.enemies.push({
      id: state.nextEntityId,
      kind: BOSS_SUMMONED_KIND,
      x: position.x,
      y: position.y,
      health: BOSS_SUMMONED_HEALTH,
      radius: BOSS_SUMMONED_RADIUS,
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
  const baseAngle = Math.atan2(boss.telegraphAimY, boss.telegraphAimX);
  for (const offsetDegrees of VOLLEY_ANGLE_OFFSETS_DEGREES) {
    const angle = baseAngle + (offsetDegrees * Math.PI) / 180;
    const velocityX = Math.cos(angle) * BOSS_VOLLEY_PROJECTILE_SPEED_PER_TICK;
    const velocityY = Math.sin(angle) * BOSS_VOLLEY_PROJECTILE_SPEED_PER_TICK;
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

  const bossPhase = bossPhaseForHealth(boss.health);
  boss.bossPhase = bossPhase;
  if (bossPhase === 3 && !boss.bossSummoned) {
    summonPhaseThreeHangers(state, enemyIndex);
  }

  if (bossPhase === 1) {
    boss.cooldownTicks = BOSS_VOLLEY_CADENCE_PHASE2;
    boss.bossVolleyTelegraphTicks = 0;
  } else {
    const cadence =
      bossPhase === 3 ? BOSS_VOLLEY_CADENCE_PHASE3 : BOSS_VOLLEY_CADENCE_PHASE2;
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
      direction.x * BOSS_PURSUE_SPEED_PER_TICK,
      direction.y * BOSS_PURSUE_SPEED_PER_TICK,
      state.walls,
    );
    boss.x = next.x;
    boss.y = next.y;
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0 && (boss.bossVolleyTelegraphTicks ?? 0) <= 0) {
      boss.phase = 'telegraph';
      boss.phaseTicks = BOSS_SLAM_TELEGRAPH_TICKS;
      lockAimAtPlayer(state, enemyIndex);
    }
  } else if (boss.phase === 'telegraph') {
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0) {
      if (state.player.invulnerableTicks <= 0) {
        const distance = Math.hypot(state.player.x - boss.x, state.player.y - boss.y);
        if (distance <= BOSS_SLAM_REACH) {
          state.player.health -= BOSS_SLAM_DAMAGE;
          state.player.invulnerableTicks = PLAYER_INVULNERABILITY_TICKS;
        }
      }
      boss.phase = 'recover';
      boss.phaseTicks =
        bossPhase === 3 ? BOSS_SLAM_RECOVER_TICKS_PHASE3 : BOSS_SLAM_RECOVER_TICKS;
    }
  } else {
    boss.phaseTicks -= 1;
    if (boss.phaseTicks <= 0) {
      boss.phase = 'pursue';
      boss.phaseTicks = BOSS_PURSUE_TICKS;
    }
  }
}
