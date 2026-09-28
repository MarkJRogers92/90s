/**
 * The Daily Shift: one mall per calendar day, the same for everyone, with a
 * standard-issue kit (no Break Room perks) and a small local record of how
 * today (and the last week) went.
 *
 * Pure launcher-side logic: the date picks the seed, the simulation generates
 * everything from it as usual. The record lives in this browser only.
 */
export const DAILY_KEY = 'dead-mall:daily:v1';
const KEEP_DAYS = 7;
const MAX_SEED = 999_999;

/** A stable short seed for a `YYYY-MM-DD` date (FNV-1a over the text). */
export function dailySeed(date: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 1 + (hash % MAX_SEED);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** `2026-09-28` becomes `SEP 28`. */
export function formatDailyDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${Number(match[3])}` : date.toUpperCase();
}

export type DailyRecord = {
  readonly date: string;
  readonly bestScore: number;
  readonly won: boolean;
  readonly seconds: number;
  readonly attempts: number;
};

export type DailyRun = { readonly score: number; readonly won: boolean; readonly seconds: number };

/** Folds one finished daily run into the records; returns whether it beat the day's best. */
export function recordDaily(days: readonly DailyRecord[], run: DailyRun & { readonly date: string }): { days: DailyRecord[]; newBest: boolean } {
  const existing = days.find((day) => day.date === run.date);
  const newBest = !existing || run.score > existing.bestScore;
  const next: DailyRecord = existing && !newBest
    ? { ...existing, attempts: existing.attempts + 1 }
    : { date: run.date, bestScore: run.score, won: run.won, seconds: run.seconds, attempts: (existing?.attempts ?? 0) + 1 };
  const merged = [...days.filter((day) => day.date !== run.date), next].sort((a, b) => a.date.localeCompare(b.date));
  return { days: merged.slice(-KEEP_DAYS), newBest };
}

function parseDay(value: unknown): DailyRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== 'string' || typeof v.bestScore !== 'number' || !Number.isFinite(v.bestScore)) return null;
  const attempts = Number(v.attempts);
  return {
    date: v.date,
    bestScore: Math.max(0, Math.round(v.bestScore)),
    won: v.won === true,
    seconds: Math.max(0, Math.round(Number(v.seconds) || 0)),
    attempts: Number.isFinite(attempts) ? Math.max(1, Math.round(attempts)) : 1,
  };
}

export function parseDaily(raw: string | null): DailyRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { days?: unknown };
    if (!parsed || !Array.isArray(parsed.days)) return [];
    return parsed.days.map(parseDay).filter((day): day is DailyRecord => day !== null).slice(-KEEP_DAYS);
  } catch {
    return [];
  }
}

/** The title's daily line. */
export function summarizeDaily(date: string, record: DailyRecord | null): string {
  const head = `DAILY SHIFT · ${formatDailyDate(date)}`;
  if (!record) return `${head} · NOT YET WORKED`;
  return `${head} · BEST ${record.bestScore.toLocaleString('en-US')} · ${record.attempts} ATTEMPT${record.attempts === 1 ? '' : 'S'}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class DailyStore {
  public constructor(private readonly storage: StorageLike | null) {}

  private load(): DailyRecord[] {
    try {
      return parseDaily(this.storage?.getItem(DAILY_KEY) ?? null);
    } catch {
      return [];
    }
  }

  public today(date: string): DailyRecord | null {
    return this.load().find((day) => day.date === date) ?? null;
  }

  /** Records a finished daily run; returns whether it is the day's new best. */
  public submit(date: string, run: DailyRun): boolean {
    const result = recordDaily(this.load(), { ...run, date });
    try {
      this.storage?.setItem(DAILY_KEY, JSON.stringify({ version: 1, days: result.days }));
    } catch {
      // Storage refused: the daily simply is not remembered.
    }
    return result.newBest;
  }
}

export function browserDaily(): DailyStore {
  try {
    return new DailyStore(window.localStorage);
  } catch {
    return new DailyStore(null);
  }
}
