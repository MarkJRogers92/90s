/**
 * The local playtest log: finished run records in this browser's storage,
 * off until the player switches it on, never sent anywhere. Every storage
 * call is guarded, so blocked or corrupted storage simply means no log.
 */
import type { DamageSource, RunRecord } from './recorder';

export const PLAYTEST_MAX_RUNS = 50;
const RUNS_KEY = 'dead-mall:playtest:v1';
const ENABLED_KEY = 'dead-mall:playtest:enabled';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class PlaytestLog {
  private readonly storage: StorageLike | null;

  public constructor(storage: StorageLike | null) {
    this.storage = storage;
  }

  public get enabled(): boolean {
    try {
      return this.storage?.getItem(ENABLED_KEY) === 'on';
    } catch {
      return false;
    }
  }

  public setEnabled(enabled: boolean): void {
    try {
      this.storage?.setItem(ENABLED_KEY, enabled ? 'on' : 'off');
    } catch {
      // Storage refused: the log just stays off.
    }
  }

  public runs(): RunRecord[] {
    try {
      const raw = this.storage?.getItem(RUNS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((run): run is RunRecord => typeof run === 'object' && run !== null && (run as RunRecord).version === 1) : [];
    } catch {
      return [];
    }
  }

  /** Adds a finished run when the log is on, keeping only the newest runs. */
  public append(record: RunRecord): void {
    if (!this.enabled) return;
    const runs = [...this.runs(), record].slice(-PLAYTEST_MAX_RUNS);
    try {
      this.storage?.setItem(RUNS_KEY, JSON.stringify(runs));
    } catch {
      // Full or blocked storage: drop the record rather than break the game.
    }
  }

  public clear(): void {
    try {
      this.storage?.removeItem(RUNS_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

export type RunSummary = {
  readonly runs: number;
  readonly wins: number;
  readonly deathsByRoom: Readonly<Record<string, number>>;
  readonly damageBySource: Readonly<Record<DamageSource, number>>;
  readonly avgSecondsByRoom: Readonly<Record<string, number>>;
  readonly topBought: ReadonlyArray<{ readonly name: string; readonly count: number }>;
  /** Player-facing names for the room ids above. */
  readonly roomNames: Readonly<Record<string, string>>;
  /** Round 30: the heist, Loss Prevention, the stores and the boss cards. */
  readonly heist: {
    readonly alarms: Readonly<Record<'escaped' | 'lockedEscaped' | 'locked' | 'dropped', number>>;
    /** Average seconds left on the countdown for clean getaways, or null with none. */
    readonly avgSecondsLeft: number | null;
    readonly peakStars: number;
    readonly stalker: { readonly arrivals: number; readonly writeUps: number; readonly shoves: number };
  };
  readonly stores: ReadonlyArray<{ readonly store: string; readonly visits: number; readonly avgSeconds: number; readonly bought: number; readonly stolen: number }>;
  readonly bossCards: { readonly shown: number; readonly skipped: number; readonly avgSeconds: number | null };
};

export function summarizeRuns(records: readonly RunRecord[]): RunSummary {
  const deathsByRoom: Record<string, number> = {};
  const damageBySource: Record<DamageSource, number> = { hanger: 0, mannequin: 0, static: 0, shopper: 0, mascot: 0, ownerCharge: 0, glob: 0, slam: 0, bossShot: 0, stalker: 0, other: 0 };
  const roomTime: Record<string, { ticks: number; visits: number }> = {};
  const bought = new Map<string, number>();
  const roomNames: Record<string, string> = {};
  for (const record of records) {
    // Upstairs rooms reuse the downstairs ids, so they are keyed apart.
    const key = (roomId: string): string => (record.floor === undefined ? roomId : `${record.floor}:${roomId}`);
    for (const room of record.rooms) roomNames[key(room.roomId)] = room.name;
    if (record.outcome === 'dead') {
      const room = key(record.rooms.at(-1)?.roomId ?? 'unknown');
      deathsByRoom[room] = (deathsByRoom[room] ?? 0) + 1;
    }
    for (const room of record.rooms) {
      for (const source of Object.keys(damageBySource) as DamageSource[]) damageBySource[source] += room.damage[source] ?? 0;
      if (room.leftTick !== null) {
        const entry = (roomTime[key(room.roomId)] ??= { ticks: 0, visits: 0 });
        entry.ticks += room.leftTick - room.enteredTick;
        entry.visits += 1;
      }
    }
    for (const name of record.bought) bought.set(name, (bought.get(name) ?? 0) + 1);
  }
  const avgSecondsByRoom = Object.fromEntries(
    Object.entries(roomTime).map(([id, entry]) => [id, Math.round(entry.ticks / entry.visits / 60)]),
  );
  const alarms = { escaped: 0, lockedEscaped: 0, locked: 0, dropped: 0 };
  const getaways: number[] = [];
  const stalker = { arrivals: 0, writeUps: 0, shoves: 0 };
  const stores = new Map<string, { visits: number; seconds: number; bought: number; stolen: number }>();
  let peakStars = 0;
  let cardsShown = 0;
  let cardsSkipped = 0;
  let cardSeconds = 0;
  for (const record of records) {
    peakStars = Math.max(peakStars, record.peakStars ?? 0);
    for (const alarm of record.alarms ?? []) {
      alarms[alarm.outcome] += 1;
      if (alarm.secondsLeft !== null) getaways.push(alarm.secondsLeft);
    }
    stalker.arrivals += record.stalker?.arrivals ?? 0;
    stalker.writeUps += record.stalker?.writeUps ?? 0;
    stalker.shoves += record.stalker?.shoves ?? 0;
    for (const visit of record.storeVisits ?? []) {
      const entry = stores.get(visit.store) ?? { visits: 0, seconds: 0, bought: 0, stolen: 0 };
      entry.visits += 1;
      entry.seconds += visit.seconds;
      entry.bought += visit.bought;
      entry.stolen += visit.stolen;
      stores.set(visit.store, entry);
    }
    for (const card of record.bossCards ?? []) {
      cardsShown += 1;
      if (card.skipped) cardsSkipped += 1;
      cardSeconds += card.seconds;
    }
  }
  const tenths = (value: number): number => Math.round(value * 10) / 10;
  return {
    heist: {
      alarms,
      avgSecondsLeft: getaways.length ? tenths(getaways.reduce((sum, value) => sum + value, 0) / getaways.length) : null,
      peakStars,
      stalker,
    },
    stores: [...stores].map(([store, entry]) => ({ store, visits: entry.visits, avgSeconds: tenths(entry.seconds / entry.visits), bought: entry.bought, stolen: entry.stolen }))
      .sort((a, b) => b.visits - a.visits),
    bossCards: { shown: cardsShown, skipped: cardsSkipped, avgSeconds: cardsShown ? tenths(cardSeconds / cardsShown) : null },
    runs: records.length,
    wins: records.filter((record) => record.outcome === 'won').length,
    deathsByRoom,
    damageBySource,
    avgSecondsByRoom,
    topBought: [...bought].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    roomNames,
  };
}
