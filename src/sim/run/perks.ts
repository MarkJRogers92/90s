/**
 * Shift perks: what the janitor's career buys them before a shift starts.
 *
 * The Break Room (outside the simulation) decides which perks are owned; the
 * run only ever sees this plain, clamped description of the starting state,
 * so a perk can never do anything a rule here does not name. Perks are part of
 * the run: they ride the escalator and are written into the checkpoint, so a
 * resumed shift keeps the health cap it started with.
 */
import { DASH_COOLDOWN_TICKS } from '../combat/dash';
import { PLAYER_MAX_HEALTH, ROOM_CLEAR_HEAL } from './rooms';
import { TOKEN_PICKUP_RADIUS } from './tokens';
import { ELITE_SNACK_CHANCE, SNACK_CHANCE } from './luck';
import type { MvpRunState } from './types';
import { GLASS_HEALTH_CUT } from './nightRules';

export type ShiftPerks = {
  /** Seniority: dollars added to the starting float. */
  readonly bonusCash: number;
  /** Dental Plan: extra maximum health (2 is one heart). */
  readonly bonusHealth: number;
  /** Coffee Break: extra health each cleared room pays out. */
  readonly clearHealBonus: number;
  /** New Sneakers: ticks taken off the dash cooldown. */
  readonly dashCooldownCut: number;
  /** Shop-Vac Attachment: extra distance loose change is pulled in from. */
  readonly tokenMagnet: number;
  /** The one item brought from the employee locker, if any. */
  readonly lockerItemId: string | null;
  // Round 49. Absent on older saves, read as 0.
  /** Lookout: extra ticks on every store alarm. */
  readonly alarmBonus?: number;
  /** Deep Pockets: extra stolen items carried at once. */
  readonly carryBonus?: number;
  /** Employee Discount: dollars off every shelf price. */
  readonly shelfDiscount?: number;
  /** Bench Technician: dollars back on every fusion fee (never more than the fee). */
  readonly fusionRebate?: number;
  /** Lucky Penny: percentage points added to the pretzel drop chance. */
  readonly snackBonus?: number;
  /**
   * Charges, spent as the night goes (and so carried and checkpointed as they
   * stand): Second Wind saves a fatal hit, a Fusion Coupon pays a whole fee,
   * a Fake Mustache lifts an item without an alarm.
   */
  readonly secondWinds?: number;
  readonly freeFusions?: number;
  readonly quietGrabs?: number;
};

export const NO_PERKS: ShiftPerks = { bonusCash: 0, bonusHealth: 0, clearHealBonus: 0, dashCooldownCut: 0, tokenMagnet: 0, lockerItemId: null };

/** The weapons a janitor may keep in their locker. */
export const LOCKER_ITEM_IDS: readonly string[] = ['pump_soaker', 'foam_ball_blaster', 'party_popper', 'paint_marker', 'slingshot', 'yo_yo', 'dodgeball', 'garden_hose', 'nail_gun', 'laser_pointer'];

export const LOCKER_INSTANCE_ID = 'mvp-locker-item';
export const LOCKER_SOURCE_LOCATION = 'employee_locker';

/** Hard ceilings, generous next to what the Break Room sells, so a save can be checked. */
const MAX_BONUS_CASH = 50;
const MAX_BONUS_HEALTH = 6;
const MAX_CLEAR_HEAL_BONUS = 2;
const MAX_DASH_COOLDOWN_CUT = 20;
const MAX_TOKEN_MAGNET = 80;
const MAX_ALARM_BONUS = 60;
const MAX_CARRY_BONUS = 2;
const MAX_SHELF_DISCOUNT = 4;
const MAX_FUSION_REBATE = 6;
const MAX_SNACK_BONUS = 30;
const MAX_CHARGES = 2;

/** The round 49 fields, by name, for clamping and checkpoint checks. */
export const EXTRA_PERK_LIMITS = {
  alarmBonus: MAX_ALARM_BONUS,
  carryBonus: MAX_CARRY_BONUS,
  shelfDiscount: MAX_SHELF_DISCOUNT,
  fusionRebate: MAX_FUSION_REBATE,
  snackBonus: MAX_SNACK_BONUS,
  secondWinds: MAX_CHARGES,
  freeFusions: MAX_CHARGES,
  quietGrabs: MAX_CHARGES,
} as const;
export type ExtraPerk = keyof typeof EXTRA_PERK_LIMITS;
export const EXTRA_PERKS = Object.keys(EXTRA_PERK_LIMITS) as ExtraPerk[];

/** A round 49 perk's value this run (0 when absent). */
export function perk(state: Pick<MvpRunState, 'perks'>, name: ExtraPerk): number {
  return state.perks[name] ?? 0;
}

/** Spends one charge of a one-shot perk; false when none is left. */
export function spendCharge(state: Pick<MvpRunState, 'perks'>, name: 'secondWinds' | 'freeFusions' | 'quietGrabs'): boolean {
  if (perk(state, name) <= 0) return false;
  state.perks = { ...state.perks, [name]: perk(state, name) - 1 };
  return true;
}

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
    dashCooldownCut: clampInt(value.dashCooldownCut, MAX_DASH_COOLDOWN_CUT),
    tokenMagnet: clampInt(value.tokenMagnet, MAX_TOKEN_MAGNET),
    lockerItemId: locker,
    // Only the ones that are set, so an older save reads back exactly as it was written.
    ...Object.fromEntries(EXTRA_PERKS.flatMap((name) => {
      const amount = clampInt(value[name], EXTRA_PERK_LIMITS[name]);
      return amount > 0 ? [[name, amount]] : [];
    })),
  };
}

export function hasPerks(perks: ShiftPerks): boolean {
  return perks.bonusCash > 0 || perks.bonusHealth > 0 || perks.clearHealBonus > 0 || perks.dashCooldownCut > 0 || perks.tokenMagnet > 0 || perks.lockerItemId !== null
    || EXTRA_PERKS.some((name) => (perks[name] ?? 0) > 0);
}

/** The janitor's health cap for this run. */
export function runMaxHealth(state: Pick<MvpRunState, 'perks' | 'rule'>): number {
  return PLAYER_MAX_HEALTH + state.perks.bonusHealth - (state.rule === 'glass' ? GLASS_HEALTH_CUT : 0);
}

/** What clearing a fight pays back in health this run. */
export function roomClearHeal(state: Pick<MvpRunState, 'perks' | 'rule'>): number {
  // No Breaks: nobody patches the janitor up.
  return state.rule === 'no_breaks' ? 0 : ROOM_CLEAR_HEAL + state.perks.clearHealBonus;
}

/** Ticks the dash takes to come back after it ends, this run. */
export function runDashCooldown(state: Pick<MvpRunState, 'perks'>): number {
  return DASH_COOLDOWN_TICKS - state.perks.dashCooldownCut;
}

/** How far away loose change starts sliding toward the janitor this run. */
export function tokenMagnetReach(state: Pick<MvpRunState, 'perks'>): number {
  return TOKEN_PICKUP_RADIUS + state.perks.tokenMagnet;
}

/** Lucky Penny: a kill's chance to drop a pretzel this run. */
export function snackChance(state: Pick<MvpRunState, 'perks'>, elite: boolean): number {
  return (elite ? ELITE_SNACK_CHANCE : SNACK_CHANCE) + perk(state, 'snackBonus') / 100;
}
