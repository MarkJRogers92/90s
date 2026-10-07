import { describe, expect, it } from 'vitest';
import type { BotOptions } from '../balance/bot';
import { duelSweep } from '../balance/duel';
import { bossFight } from '../balance/scenarios';

const pro: BotOptions = { skill: 'pro', shop: 'none' };
const expert: BotOptions = { skill: 'expert', shop: 'none' };
const SEEDS = [1, 2, 3];

describe('the expert bot (round 57 follow-up): every lane, slam and shot scored at once', () => {
  it('the pro bot dies to the Mall Owner every time since round 59 (it lost 4 health before): his Suite has a desk and two pillars now, and it retreats into them along his charge lane', () => {
    for (const seed of SEEDS) {
      const fight = bossFight(seed, pro);
      expect(fight.outcome).toBe('dead');
    }
  });

  it('takes at most 2 health from the Owner, and fewer than the pro bot', () => {
    for (const seed of SEEDS) {
      const fight = bossFight(seed, expert);
      expect(fight.outcome, `seed ${seed}`).toBe('won');
      expect(fight.hpLost, `seed ${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it('is hit no more than the pro bot by a lone Mascot Brute or Bargain Hunter, from every side', () => {
    for (const kind of ['mascot', 'shopper'] as const) {
      const hits = (options: BotOptions) => duelSweep(kind, options).reduce((sum, result) => sum + result.hits, 0);
      expect(hits(expert), kind).toBeLessThanOrEqual(hits(pro));
    }
  });

  it('does not dodge forever: it kills a lone Mascot Brute in the open, most of the time, inside the cap', () => {
    const results = duelSweep('mascot', expert);
    expect(results.filter((result) => result.killed).length).toBeGreaterThanOrEqual(Math.ceil(results.length * 0.75));
  });
});
