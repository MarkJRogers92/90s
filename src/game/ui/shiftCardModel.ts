/**
 * The end-of-shift card: what the in-canvas game-over / win screen shows.
 *
 * Pure, derived from the simulation's own terminal summary and run state, so
 * every number on the card is one the run actually recorded.
 */
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';

export type ShiftCardRow = { readonly label: string; readonly value: string };

export type ShiftCardModel = {
  readonly won: boolean;
  readonly headline: string;
  readonly subline: string;
  readonly rows: readonly ShiftCardRow[];
};

const TICKS_PER_SECOND = 60;

export function formatShiftTime(ticks: number): string {
  const seconds = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Display names for summary instance ids, resolved against the inventory. */
function namesFor(state: MvpRunState, instanceIds: readonly string[]): string {
  if (instanceIds.length === 0) return 'NOTHING';
  const names = instanceIds.map((instanceId) => {
    for (const node of state.inventory.inventory) {
      if (node.kind === 'leaf' && node.instanceId === instanceId) return itemDefinitionName(node.itemDefinitionId);
      if (node.kind === 'composite') {
        if (node.primary.instanceId === instanceId) return itemDefinitionName(node.primary.itemDefinitionId);
        if (node.carrier.instanceId === instanceId) return itemDefinitionName(node.carrier.itemDefinitionId);
      }
    }
    return 'UNKNOWN ITEM';
  });
  return names.join(', ').toUpperCase();
}

export function buildShiftCardModel(state: MvpRunState): ShiftCardModel | null {
  const summary = state.summary;
  if (state.status === 'playing' || !summary) return null;
  const won = summary.status === 'won';
  const room = state.wing.rooms[summary.roomIndex];
  const where = (room?.store?.name ?? room?.name ?? 'THE MALL').toUpperCase();
  return {
    won,
    headline: won ? 'CLOCKED OUT' : 'SHIFT OVER',
    subline: won ? 'LOSS PREVENTION HAS BEEN PREVENTED' : `FELL IN ${where}`,
    rows: [
      { label: 'TIME', value: formatShiftTime(summary.tick) },
      // How far into the wing the shift got. The cleared count lags on a win
      // (the boss room is not yet marked cleared), which read as 5/6.
      { label: 'REACHED', value: `${summary.roomIndex + 1}/${state.wing.rooms.length}` },
      { label: 'CASH', value: `$${summary.cash}` },
      { label: 'HEAT', value: `${summary.heat}` },
      { label: 'BOUGHT', value: namesFor(state, summary.purchasedInstanceIds) },
      { label: 'STOLEN', value: namesFor(state, summary.stolenInstanceIds) },
    ],
  };
}
