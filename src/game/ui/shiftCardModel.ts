/**
 * The end-of-shift card: what the in-canvas game-over / win screen shows.
 *
 * Pure, derived from the simulation's own terminal summary and run state, so
 * every number on the card is one the run actually recorded.
 */
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';
import { scoreFor } from '../score/score';

export type ShiftCardRow = { readonly label: string; readonly value: string };

export type ShiftCardModel = {
  readonly won: boolean;
  /** A won floor 1: the escalator is running, and RETRY becomes UP THE ESCALATOR. */
  readonly ascend: boolean;
  readonly score: number;
  readonly seconds: number;
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

/**
 * `mallSeed` is the seed the shift clocked in with (what `?seed=` replays);
 * upstairs the run's own seed is the derived Floor 2 one, so the scene passes it.
 */
export function buildShiftCardModel(state: MvpRunState, mallSeed: number = state.seed): ShiftCardModel | null {
  const summary = state.summary;
  if (state.status === 'playing' || !summary) return null;
  const won = summary.status === 'won';
  const upstairs = state.wing.floor === 2;
  const ascend = won && !upstairs;
  const room = state.wing.rooms[summary.roomIndex];
  const where = (room?.store?.name ?? room?.name ?? 'THE MALL').toUpperCase();
  const seconds = Math.floor(summary.tick / TICKS_PER_SECOND);
  const score = scoreFor({
    // A clear on floor 1 is not yet the win: its bonus waits for the top floor.
    won: won && upstairs,
    roomsReached: summary.roomIndex + 1 + (upstairs ? state.wing.rooms.length : 0),
    kills: state.stats.kills,
    bestCombo: state.stats.bestCombo,
    cash: summary.cash,
    heat: summary.heat,
    seconds,
  });
  return {
    won,
    ascend,
    score,
    seconds,
    headline: ascend ? 'FLOOR CLEARED' : won ? 'CLOCKED OUT' : 'SHIFT OVER',
    subline: ascend
      ? 'THE ESCALATOR IS RUNNING...'
      : won
        ? 'MANAGEMENT HAS BEEN TERMINATED'
        : `FELL IN ${where}${upstairs ? ' - FLOOR 2' : ''}`,
    rows: [
      { label: 'TIME', value: formatShiftTime(summary.tick) },
      // How far into the wing the shift got. The cleared count lags on a win
      // (the boss room is not yet marked cleared), which read as 5/6.
      { label: 'REACHED', value: `${upstairs ? 'FLOOR 2 - ' : ''}${summary.roomIndex + 1}/${state.wing.rooms.length}` },
      { label: 'KILLS', value: `${state.stats.kills}` },
      { label: 'BEST COMBO', value: `X${state.stats.bestCombo}` },
      { label: 'CASH', value: `$${summary.cash}` },
      { label: 'HEAT', value: `${summary.heat}` },
      { label: 'BOUGHT', value: namesFor(state, summary.purchasedInstanceIds) },
      { label: 'STOLEN', value: namesFor(state, summary.stolenInstanceIds) },
      { label: 'MALL', value: `#${mallSeed}` },
    ],
  };
}

/**
 * How long the card waits before sliding in: long enough for the death fall
 * or the boss's collapse on its own, but barely at all when a cinematic (the
 * pink slip, the kill cam) has already given that moment its beat.
 */
export function shiftCardDelayMs(won: boolean, afterCinematic = false): number {
  if (afterCinematic) return 150;
  return won ? 900 : 1300;
}
