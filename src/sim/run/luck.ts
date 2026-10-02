/**
 * Seeded luck for run features that must not disturb the wing generator's
 * fixed draw order: Clearance elites and snack drops. Each draw is an
 * independent hash of (seed, purpose, a, b), so the same shift always rolls
 * the same elites and the same pretzels, and adding a roll never reshuffles
 * the mall.
 */
import { createWingRng, nextUnitFloat } from '../wing/rng';

/** A regular enemy's chance to arrive as a glowing CLEARANCE elite. */
export const ELITE_CHANCE = 0.18;
export const ELITE_HEALTH_MULTIPLIER = 2;
export const ELITE_TOKEN_MULTIPLIER = 2;
/** Chance a kill drops a food-court pretzel (heals half a heart). */
export const SNACK_CHANCE = 0.2;
export const ELITE_SNACK_CHANCE = 0.6;

function saltOf(purpose: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < purpose.length; i += 1) hash = Math.imul(hash ^ purpose.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

/** A deterministic draw in [0, 1). */
export function luck(seed: number, purpose: string, a: number, b: number): number {
  const mixed = (Math.imul((seed | 0) ^ saltOf(purpose), 0x9e3779b1) ^ Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35)) >>> 0;
  const rng = createWingRng(mixed);
  nextUnitFloat(rng);
  return nextUnitFloat(rng);
}
