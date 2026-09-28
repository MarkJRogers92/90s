/**
 * Shift perks: what the janitor's career buys them before a shift starts.
 *
 * The Break Room (outside the simulation) decides which perks are owned; the
 * run only ever sees this plain, clamped description of the starting state,
 * so a perk can never do anything a rule here does not name. Perks are part of
 * the run: they ride the escalator and are written into the checkpoint, so a
 * resumed shift keeps the health cap it started with.
 */
import { PLAYER_MAX_HEALTH, ROOM_CLEAR_HEAL } from './rooms';
import type { MvpRunState } from './types';

export type ShiftPerks = {
  /** Seniority: dollars added to the starting float. */
  readonly bonusCash: number;
  /** Dental Plan: extra maximum health (2 is one heart). */
  readonly bonusHealth: number;
  /** Coffee Break: extra health each cleared room pays out. */
  readonly clearHealBonus: number;
  /** The one item brought from the employee locker, if any. */
  readonly lockerItemId: string | null;
};

export const NO_PERKS: ShiftPerks = { bonusCash: 0, bonusHealth: 0, clearHealBonus: 0, lockerItemId: null };

/** The weapons a janitor may keep in their locker. */
export const LOCKER_ITEM_IDS: readonly string[] = ['pump_soaker', 'foam_ball_blaster', 'party_popper', 'paint_marker'];

export const LOCKER_INSTANCE_ID = 'mvp-locker-item';
export const LOCKER_SOURCE_LOCATION = 'employee_locker';

/** Hard ceilings, generous next to what the Break Room sells, so a save can be checked. */
const MAX_BONUS_CASH = 50;
const MAX_BONUS_HEALTH = 6;
const MAX_CLEAR_HEAL_BONUS = 2;

function clampInt(value: unknown, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(max, number));
}

/** Any input becomes a legal set of perks: out-of-range values clamp, unknown items stay home. */
export function sanitizePerks(value: Partial<ShiftPerks> | null | undefined): ShiftPerks {
  if (!value) return NO_PERKS;
  // Health comes in whole hearts.
  const health = clampInt(value.bonusHealth, MAX_BONUS_HEALTH);
  const locker = typeof value.lockerItemId === 'string' && LOCKER_ITEM_IDS.includes(value.lockerItemId) ? value.lockerItemId : null;
  return {
    bonusCash: clampInt(value.bonusCash, MAX_BONUS_CASH),
    bonusHealth: health - (health % 2),
    clearHealBonus: clampInt(value.clearHealBonus, MAX_CLEAR_HEAL_BONUS),
    lockerItemId: locker,
  };
}

export function hasPerks(perks: ShiftPerks): boolean {
  return perks.bonusCash > 0 || perks.bonusHealth > 0 || perks.clearHealBonus > 0 || perks.lockerItemId !== null;
}

/** The janitor's health cap for this run. */
export function runMaxHealth(state: Pick<MvpRunState, 'perks'>): number {
  return PLAYER_MAX_HEALTH + state.perks.bonusHealth;
}

/** What clearing a fight pays back in health this run. */
export function roomClearHeal(state: Pick<MvpRunState, 'perks'>): number {
  return ROOM_CLEAR_HEAL + state.perks.clearHealBonus;
}
