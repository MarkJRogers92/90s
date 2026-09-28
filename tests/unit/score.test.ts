import { describe, expect, it } from 'vitest';
import { BestRunStore, scoreFor } from '../../src/game/score/score';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  public getItem(key: string): string | null { return this.map.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.map.set(key, value); }
}

const base = { won: false, roomsReached: 3, kills: 5, bestCombo: 6, cash: 20, heat: 0, seconds: 200 };

describe('score', () => {
  it('rewards going further, killing, combos and cash', () => {
    const s = scoreFor(base);
    expect(scoreFor({ ...base, roomsReached: 4 })).toBeGreaterThan(s);
    expect(scoreFor({ ...base, kills: 6 })).toBeGreaterThan(s);
    expect(scoreFor({ ...base, bestCombo: 10 })).toBeGreaterThan(s);
    expect(scoreFor({ ...base, cash: 30 })).toBeGreaterThan(s);
  });

  it('pays a big bonus for winning, more for winning fast', () => {
    const slow = scoreFor({ ...base, won: true, roomsReached: 6, seconds: 400 });
    const fast = scoreFor({ ...base, won: true, roomsReached: 6, seconds: 150 });
    expect(slow).toBeGreaterThan(scoreFor({ ...base, roomsReached: 6 }) + 900);
    expect(fast).toBeGreaterThan(slow);
  });

  it('costs a little for heat and never goes negative', () => {
    expect(scoreFor({ ...base, heat: 40 })).toBeLessThan(scoreFor(base));
    expect(scoreFor({ won: false, roomsReached: 0, kills: 0, bestCombo: 0, cash: 0, heat: 999, seconds: 0 })).toBe(0);
  });
});

describe('best run', () => {
  it('keeps the highest score and says when a run beats it', () => {
    const store = new BestRunStore(new MemoryStorage());
    expect(store.best()).toBeNull();
    expect(store.submit({ score: 500, won: false, seconds: 120 })).toBe(true);
    expect(store.submit({ score: 300, won: false, seconds: 90 })).toBe(false);
    expect(store.best()?.score).toBe(500);
    expect(store.submit({ score: 900, won: true, seconds: 180 })).toBe(true);
    expect(store.best()).toMatchObject({ score: 900, won: true });
  });

  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const store = new BestRunStore(blocked);
    expect(store.best()).toBeNull();
    expect(() => store.submit({ score: 1, won: false, seconds: 1 })).not.toThrow();
  });
});
