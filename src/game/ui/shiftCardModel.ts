/**
 * The end-of-shift card: what the in-canvas game-over / win screen shows.
 *
 * Pure, derived from the simulation's own terminal summary and run state, so
 * every number on the card is one the run actually recorded.
 */
import { compositeLeaves } from '../../sim/fusion/inventory';
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';
import { formatDailyDate } from '../run/dailyShift';
import { floorOf } from '../../sim/run/floors';
import { FINAL_FLOOR } from '../../sim/wing/floorSpecs';
import { wantedStars } from '../../sim/run/wanted';
import { scoreFor } from '../score/score';
import type { RunRecord } from '../playtest/recorder';
import { killCamStamp } from './killCamModel';
import { districtSpec } from '../../sim/wing/districts';

export type ShiftCardRow = { readonly label: string; readonly value: string };

export type ShiftCardModel = {
  readonly won: boolean;
  /** A won floor 1 or 2: the escalator is running, and RETRY becomes UP THE ESCALATOR. */
  readonly ascend: boolean;
  /** The next wing is up the stairs (the same floor's boss wing), not the escalator. */
  readonly stairs: boolean;
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
      const match = compositeLeaves(node).find((leaf) => leaf.instanceId === instanceId);
      if (match) return itemDefinitionName(match.itemDefinitionId);
    }
    return 'UNKNOWN ITEM';
  });
  return names.join(', ').toUpperCase();
}

/**
 * The shift's heist in one line, from the playtest recorder's record (which
 * watches every shift, whether or not the log is saving it): getaways and
 * the time they had to spare, lockdowns, and Loss Prevention. Null when the
 * shift stole nothing and never met him, so a clean shift's card stays short.
 */
export function heistRecap(record: RunRecord | null): string | null {
  if (!record) return null;
  const alarms = record.alarms ?? [];
  const got = alarms.filter((alarm) => alarm.outcome === 'escaped' || alarm.outcome === 'lockedEscaped').length;
  const locked = alarms.filter((alarm) => alarm.outcome === 'lockedEscaped' || alarm.outcome === 'locked').length;
  const spare = alarms.flatMap((alarm) => (alarm.secondsLeft === null ? [] : [alarm.secondsLeft]));
  const writeUps = record.stalker?.writeUps ?? 0;
  const shoves = record.stalker?.shoves ?? 0;
  const parts: string[] = [];
  if (got > 0) {
    const best = spare.length > 0 ? ` (${Math.min(...spare).toFixed(1)}S TO SPARE)` : '';
    parts.push(`${got} GETAWAY${got === 1 ? '' : 'S'}${best}`);
  }
  if (locked > 0) parts.push(`LOCKED IN ${locked}X`);
  if (writeUps > 0) parts.push(`WRITTEN UP ${writeUps}X`);
  else if (shoves > 0) parts.push(`SHOVED LP ${shoves}X`);
  return parts.length > 0 ? parts.join(' - ') : null;
}

/**
 * `mallSeed` is the seed the shift clocked in with (what `?seed=` replays);
 * upstairs the run's own seed is the derived Floor 2 one, so the scene passes it.
 */
export function buildShiftCardModel(state: MvpRunState, mallSeed: number = state.seed, dailyDate: string | null = null, record: RunRecord | null = null): ShiftCardModel | null {
  const summary = state.summary;
  if (state.status === 'playing' || !summary) return null;
  const won = summary.status === 'won';
  const floor = floorOf(state);
  // A first wing's Lockdown leads on up the stairs to the same floor's boss (round 45).
  const firstWing = state.wing.part === 1;
  const ascend = won && (firstWing || floor < FINAL_FLOOR);
  // Rooms of every wing below this one: two wings a floor.
  const wingsBelow = (floor - 1) * 2 + (firstWing ? 0 : 1);
  const room = state.wing.rooms[summary.roomIndex];
  const where = (room?.store?.name ?? room?.name ?? 'THE MALL').toUpperCase();
  const seconds = Math.floor(summary.tick / TICKS_PER_SECOND);
  const score = scoreFor({
    // A clear below the final floor is not yet the win: its bonus waits for the last boss.
    won: won && floor === FINAL_FLOOR && !firstWing,
    roomsReached: summary.roomIndex + 1 + wingsBelow * state.wing.rooms.length,
    kills: state.stats.kills,
    bestCombo: state.stats.bestCombo,
    cash: summary.cash,
    heat: summary.heat,
    seconds,
  });
  return {
    won,
    ascend,
    stairs: ascend && firstWing,
    score,
    seconds,
    // A district's mini-boss (round 50) gets its own stamp, the kill cam's.
    headline: ascend && firstWing && state.wing.district ? killCamStamp(districtSpec(state.wing.district).miniBoss) : ascend && firstWing ? 'LOCKDOWN LIFTED' : ascend ? 'FLOOR CLEARED' : won ? 'CLOCKED OUT' : 'SHIFT OVER',
    subline: ascend && firstWing
      ? 'THE STAIRS ARE OPEN...'
      : ascend
      ? 'THE ESCALATOR IS RUNNING...'
      : won
        ? 'THE OWNER HAS LEFT THE BUILDING'
        : `FELL IN ${where}${floor > 1 ? ` - FLOOR ${floor}` : ''}`,
    rows: [
      { label: 'TIME', value: formatShiftTime(summary.tick) },
      // How far into the wing the shift got. The cleared count lags on a win
      // (the boss room is not yet marked cleared), which read as 5/6.
      { label: 'REACHED', value: `${floor > 1 ? `FLOOR ${floor} ` : ''}${firstWing ? 'WING 1 ' : ''}${floor > 1 || firstWing ? '- ' : ''}${summary.roomIndex + 1}/${state.wing.rooms.length}` },
      { label: 'KILLS', value: `${state.stats.kills}` },
      { label: 'BEST COMBO', value: `X${state.stats.bestCombo}` },
      { label: 'CASH', value: `$${summary.cash}` },
      { label: 'WANTED', value: wantedStars(summary.heat) > 0 ? '*'.repeat(wantedStars(summary.heat)) : 'NONE' },
      ...(heistRecap(record) ? [{ label: 'HEIST', value: heistRecap(record)! }] : []),
      { label: 'BOUGHT', value: namesFor(state, summary.purchasedInstanceIds) },
      { label: 'STOLEN', value: namesFor(state, summary.stolenInstanceIds) },
      { label: 'MALL', value: `#${mallSeed}` },
      ...(dailyDate ? [{ label: 'DAILY', value: formatDailyDate(dailyDate) }] : []),
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
