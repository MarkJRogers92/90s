/**
 * The wanted level: what Heat means to the rest of the mall.
 *
 * Heat used to only speed up a store camera and shave the score. Now every 20
 * Heat is a star, and a wanted janitor pays for it: mall security joins every
 * fight, and the shops add a surcharge. Heat comes down by laying low
 * (clearing a fight without stealing sheds some), and it rides the escalator.
 *
 * Stolen goods are hot. A stolen item that is still itself (not fused into
 * anything) hits harder, but the mall wants it back: each one keeps the
 * janitor at least one star wanted. Fusing it at the Bench Warrant launders
 * it, because the hybrid is a new thing nobody can prove was taken.
 *
 * Pure rules over run data; nothing here reads the renderer.
 */
import type { FusionInventoryNode, FusionInventoryState } from '../fusion/types';
import { MAX_SECURITY_HEAT } from '../shop/types';

export const HEAT_PER_STAR = 20;
export const MAX_STARS = 5;
/** Heat shed for clearing a fight. */
export const LAY_LOW_COOLING = 10;
/** Dollars added to every shelf price per star. */
export const WANTED_SURCHARGE_PER_STAR = 2;
/** Extra damage a hot (stolen, unfused) weapon deals. */
export const HOT_DAMAGE_BONUS = 1;

type HeatHolder = { heat: number; readonly inventory: FusionInventoryState };

export function wantedStars(heat: number): number {
  return Math.max(0, Math.min(MAX_STARS, Math.floor(heat / HEAT_PER_STAR)));
}

/** Stolen, and still standing on its own: fusion launders it. */
export function isHotNode(node: FusionInventoryNode): boolean {
  return node.kind === 'leaf' && node.acquisitionKind === 'stolen';
}

export function hotItemCount(state: Pick<HeatHolder, 'inventory'>): number {
  return state.inventory.inventory.filter(isHotNode).length;
}

/** Heat can never fall below one star per hot item held. */
export function hotHeatFloor(state: Pick<HeatHolder, 'inventory'>): number {
  return Math.min(MAX_SECURITY_HEAT, hotItemCount(state) * HEAT_PER_STAR);
}

/** Raises Heat to the hot-goods floor, capped like all Heat. */
export function applyHeatFloor(state: HeatHolder): void {
  state.heat = Math.min(MAX_SECURITY_HEAT, Math.max(state.heat, hotHeatFloor(state)));
}

/** Clearing a fight sheds Heat, never below the hot-goods floor. Returns the Heat shed. */
export function layLow(state: HeatHolder): number {
  const before = state.heat;
  state.heat = Math.max(Math.min(before, hotHeatFloor(state)), before - LAY_LOW_COOLING);
  return before - state.heat;
}
