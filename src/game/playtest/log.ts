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
};

export function summarizeRuns(records: readonly RunRecord[]): RunSummary {
  const deathsByRoom: Record<string, number> = {};
  const damageBySource: Record<DamageSource, number> = { hanger: 0, mannequin: 0, glob: 0, slam: 0, bossShot: 0, other: 0 };
  const roomTime: Record<string, { ticks: number; visits: number }> = {};
  const bought = new Map<string, number>();
  const roomNames: Record<string, string> = {};
  for (const record of records) {
    for (const room of record.rooms) roomNames[room.roomId] = room.name;
    if (record.outcome === 'dead') {
      const room = record.rooms.at(-1)?.roomId ?? 'unknown';
      deathsByRoom[room] = (deathsByRoom[room] ?? 0) + 1;
    }
    for (const room of record.rooms) {
      for (const source of Object.keys(damageBySource) as DamageSource[]) damageBySource[source] += room.damage[source] ?? 0;
      if (room.leftTick !== null) {
        const entry = (roomTime[room.roomId] ??= { ticks: 0, visits: 0 });
        entry.ticks += room.leftTick - room.enteredTick;
        entry.visits += 1;
      }
    }
    for (const name of record.bought) bought.set(name, (bought.get(name) ?? 0) + 1);
  }
  const avgSecondsByRoom = Object.fromEntries(
    Object.entries(roomTime).map(([id, entry]) => [id, Math.round(entry.ticks / entry.visits / 60)]),
  );
  return {
    runs: records.length,
    wins: records.filter((record) => record.outcome === 'won').length,
    deathsByRoom,
    damageBySource,
    avgSecondsByRoom,
    topBought: [...bought].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    roomNames,
  };
}
