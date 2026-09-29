/**
 * The shift score and the local best run.
 *
 * Pure scoring over what the run recorded: how far you got, kills, your best
 * Cleanup Combo, cash in hand, and a big bonus for clocking out (bigger when
 * fast), plus a bonus per wanted star: stealing is a risk that pays. The best
 * run is kept in this browser only.
 */
import { wantedStars } from '../../sim/run/wanted';

/** Score for each wanted star the shift ended with. */
export const WANTED_STAR_SCORE = 60;

export type ScoreInput = {
  readonly won: boolean;
  readonly roomsReached: number;
  readonly kills: number;
  readonly bestCombo: number;
  readonly cash: number;
  readonly heat: number;
  readonly seconds: number;
};

export function scoreFor(input: ScoreInput): number {
  const win = input.won ? 1000 + Math.max(0, 480 - input.seconds) * 3 : 0;
  const total = input.roomsReached * 100 + input.kills * 25 + input.bestCombo * 10 + input.cash * 2 + win + wantedStars(input.heat) * WANTED_STAR_SCORE;
  return Math.max(0, Math.round(total));
}

export type BestRun = { readonly score: number; readonly won: boolean; readonly seconds: number };

const KEY = 'dead-mall:best-run:v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class BestRunStore {
  private readonly storage: StorageLike | null;

  public constructor(storage: StorageLike | null) {
    this.storage = storage;
  }

  public best(): BestRun | null {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<BestRun>;
      return typeof parsed.score === 'number' ? { score: parsed.score, won: parsed.won === true, seconds: Number(parsed.seconds) || 0 } : null;
    } catch {
      return null;
    }
  }

  /** Records the run if it is the new best; returns whether it was. */
  public submit(run: BestRun): boolean {
    const current = this.best();
    if (current && current.score >= run.score) return false;
    try {
      this.storage?.setItem(KEY, JSON.stringify(run));
    } catch {
      // Storage refused: the best simply is not remembered.
    }
    return true;
  }
}

export function browserBestRuns(): BestRunStore {
  try {
    return new BestRunStore(window.localStorage);
  } catch {
    return new BestRunStore(null);
  }
}
