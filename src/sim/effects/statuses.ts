import type { EnemyState, EnemyStatusState, RunState } from '../model';
import { GENERAL_SLOW_FLOOR } from './constants';

/** A fresh, inactive status block. */
export function createEnemyStatusState(): EnemyStatusState {
  return { wetTicks: 0, stickyTicks: 0, stickyMultiplier: 1 };
}

/** Returns the enemy's status block, creating an inactive one on first use. */
export function ensureEnemyStatuses(enemy: EnemyState): EnemyStatusState {
  const existing = enemy.statuses;
  if (existing) {
    return existing;
  }
  const created = createEnemyStatusState();
  enemy.statuses = created;
  return created;
}

function normalizeTicks(ticks: number): number {
  if (!Number.isFinite(ticks)) {
    return 0;
  }
  return Math.max(0, Math.trunc(ticks));
}

/** Applies Wet, refreshing to the longer remaining duration. */
export function applyWet(enemy: EnemyState, ticks: number): void {
  const amount = normalizeTicks(ticks);
  if (amount === 0) {
    return;
  }
  const statuses = ensureEnemyStatuses(enemy);
  statuses.wetTicks = Math.max(statuses.wetTicks, amount);
}

/**
 * Applies Sticky. The strongest (lowest) slow wins, the duration refreshes to
 * the longer remaining value, and no source can push movement below the 0.5
 * general floor.
 */
export function applySticky(
  enemy: EnemyState,
  ticks: number,
  slowMultiplier: number,
  slowFloor: number = GENERAL_SLOW_FLOOR,
): void {
  const amount = normalizeTicks(ticks);
  if (amount === 0) {
    return;
  }
  const statuses = ensureEnemyStatuses(enemy);
  const authoredMultiplier = Number.isFinite(slowMultiplier) ? Math.min(1, slowMultiplier) : 1;
  const authoredFloor = Number.isFinite(slowFloor) ? Math.min(1, slowFloor) : GENERAL_SLOW_FLOOR;
  const floored = Math.max(GENERAL_SLOW_FLOOR, authoredFloor, authoredMultiplier);

  if (statuses.stickyTicks <= 0) {
    statuses.stickyTicks = amount;
    statuses.stickyMultiplier = floored;
    return;
  }
  statuses.stickyTicks = Math.max(statuses.stickyTicks, amount);
  statuses.stickyMultiplier = Math.min(statuses.stickyMultiplier, floored);
}

/** Current movement multiplier from Sticky, or 1 while the enemy is not Sticky. */
export function effectiveSpeedMultiplier(enemy: EnemyState): number {
  const statuses = enemy.statuses;
  if (!statuses || statuses.stickyTicks <= 0) {
    return 1;
  }
  return Math.max(GENERAL_SLOW_FLOOR, Math.min(1, statuses.stickyMultiplier));
}

/**
 * Advances every enemy's statuses by exactly one tick.
 *
 * Statuses applied during a tick are not shortened by that tick, because the
 * central tick runs this before any effect resolves.
 */
export function tickStatuses(state: RunState): void {
  for (const enemy of state.enemies) {
    const statuses = ensureEnemyStatuses(enemy);
    if (statuses.wetTicks > 0) {
      statuses.wetTicks -= 1;
    }
    if (statuses.stickyTicks > 0) {
      statuses.stickyTicks -= 1;
      if (statuses.stickyTicks === 0) {
        statuses.stickyMultiplier = 1;
      }
    }
  }
}
