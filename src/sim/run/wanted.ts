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

/** Cash for each item carried out before the shutter drops (round 32). */
export const GETAWAY_CASH_PER_ITEM = 4;
/** Extra cash for getting away with two or more items in one alarm. */
export const GETAWAY_HAUL_BONUS = 4;

/** What a clean getaway with `items` stolen goods pays on top of the goods. */
export function getawayBonus(items: number): number {
  if (items <= 0) return 0;
  return items * GETAWAY_CASH_PER_ITEM + (items >= 2 ? GETAWAY_HAUL_BONUS : 0);
}

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

/** What the janitor's wanted level means right now (round 57), for the HUD to say plainly. */
export type WantedBrief = {
  readonly stars: number;
  /** Heat still to go before the next star; null at the top. */
  readonly toNextStar: number | null;
  /** Dollars added to every shelf price. */
  readonly surcharge: number;
  /** Extra security guards in a fight: one a star. */
  readonly guards: number;
  readonly hotItems: number;
  /** Hot goods are what keeps the Heat where it is: laying low cannot cool it, only the bench can. */
  readonly heldByHotGoods: boolean;
};

export function wantedBrief(state: HeatHolder): WantedBrief {
  const stars = wantedStars(state.heat);
  const hotItems = hotItemCount(state);
  return {
    stars,
    toNextStar: stars >= MAX_STARS ? null : (stars + 1) * HEAT_PER_STAR - state.heat,
    surcharge: stars * WANTED_SURCHARGE_PER_STAR,
    guards: stars,
    hotItems,
    heldByHotGoods: hotItems > 0 && state.heat <= hotHeatFloor(state),
  };
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
