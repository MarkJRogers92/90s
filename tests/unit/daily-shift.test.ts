import { describe, expect, it } from 'vitest';
import {
  DAILY_KEY,
  DailyStore,
  dailySeed,
  formatDailyDate,
  parseDaily,
  recordDaily,
  summarizeDaily,
} from '../../src/game/run/dailyShift';

class MemoryStorage {
  public data = new Map<string, string>();
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('daily seed', () => {
  it('is stable for a date and differs between dates', () => {
    expect(dailySeed('2026-09-28')).toBe(dailySeed('2026-09-28'));
    expect(dailySeed('2026-09-28')).not.toBe(dailySeed('2026-09-29'));
  });
  it('is a short positive integer that can be typed back in', () => {
    for (const date of ['2026-01-01', '2026-09-28', '2031-12-31', 'garbage']) {
      const seed = dailySeed(date);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(999_999);
    }
  });
});

describe('formatDailyDate', () => {
  it('formats as an upper-case month and day', () => {
    expect(formatDailyDate('2026-09-28')).toBe('SEP 28');
    expect(formatDailyDate('2026-01-05')).toBe('JAN 5');
  });
  it('falls back to the raw text when unreadable', () => {
    expect(formatDailyDate('nope')).toBe('NOPE');
  });
});

describe('recordDaily', () => {
  it('starts a day: first attempt is a best', () => {
    const result = recordDaily([], { date: '2026-09-28', score: 500, won: false, seconds: 40 });
    expect(result.newBest).toBe(true);
    expect(result.days).toEqual([{ date: '2026-09-28', bestScore: 500, won: false, seconds: 40, attempts: 1 }]);
  });
  it('counts attempts and keeps the higher score', () => {
    const first = recordDaily([], { date: '2026-09-28', score: 500, won: false, seconds: 40 });
    const worse = recordDaily(first.days, { date: '2026-09-28', score: 300, won: true, seconds: 10 });
    expect(worse.newBest).toBe(false);
    expect(worse.days[0]).toEqual({ date: '2026-09-28', bestScore: 500, won: false, seconds: 40, attempts: 2 });
    const better = recordDaily(worse.days, { date: '2026-09-28', score: 900, won: true, seconds: 300 });
    expect(better.newBest).toBe(true);
    expect(better.days[0]).toEqual({ date: '2026-09-28', bestScore: 900, won: true, seconds: 300, attempts: 3 });
  });
  it('keeps only the last seven days', () => {
    let days = recordDaily([], { date: '2026-09-01', score: 1, won: false, seconds: 1 }).days;
    for (let d = 2; d <= 9; d += 1) {
      days = recordDaily(days, { date: `2026-09-0${d}`, score: 1, won: false, seconds: 1 }).days;
    }
    expect(days).toHaveLength(7);
    expect(days.some((day) => day.date === '2026-09-01')).toBe(false);
    expect(days.some((day) => day.date === '2026-09-09')).toBe(true);
  });
});

describe('parseDaily and DailyStore', () => {
  it('tolerates junk', () => {
    expect(parseDaily(null)).toEqual([]);
    expect(parseDaily('{nope')).toEqual([]);
    expect(parseDaily('{"version":1,"days":[{"date":5},{"date":"2026-09-28","bestScore":10,"won":true,"seconds":3,"attempts":2}]}')).toEqual([
      { date: '2026-09-28', bestScore: 10, won: true, seconds: 3, attempts: 2 },
    ]);
  });
  it('round-trips through storage under the versioned key', () => {
    const storage = new MemoryStorage();
    const store = new DailyStore(storage);
    expect(store.today('2026-09-28')).toBeNull();
    const result = store.submit('2026-09-28', { score: 700, won: true, seconds: 200 });
    expect(result).toBe(true);
    expect(DAILY_KEY).toBe('dead-mall:daily:v1');
    expect(storage.data.has(DAILY_KEY)).toBe(true);
    expect(store.today('2026-09-28')?.attempts).toBe(1);
  });
  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const store = new DailyStore(blocked);
    expect(store.today('2026-09-28')).toBeNull();
    expect(() => store.submit('2026-09-28', { score: 1, won: false, seconds: 1 })).not.toThrow();
    expect(new DailyStore(null).today('2026-09-28')).toBeNull();
  });
});

describe('summarizeDaily', () => {
  it('reads not yet worked', () => {
    expect(summarizeDaily('2026-09-28', null)).toBe('DAILY SHIFT · SEP 28 · NOT YET WORKED');
  });
  it('reads best and attempts', () => {
    expect(summarizeDaily('2026-09-28', { date: '2026-09-28', bestScore: 2340, won: false, seconds: 9, attempts: 3 })).toBe('DAILY SHIFT · SEP 28 · BEST 2,340 · 3 ATTEMPTS');
    expect(summarizeDaily('2026-09-28', { date: '2026-09-28', bestScore: 5, won: false, seconds: 9, attempts: 1 })).toBe('DAILY SHIFT · SEP 28 · BEST 5 · 1 ATTEMPT');
  });
});
