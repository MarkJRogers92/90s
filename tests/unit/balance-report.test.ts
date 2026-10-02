import { describe, expect, it } from 'vitest';
import { playNight } from '../balance/harness';
import { formatSummary, summarize, wingLabel } from '../balance/report';

const pro = { skill: 'pro', shop: 'none' } as const;

describe('balance report arithmetic', () => {
  const nights = [1, 2, 3, 4].map((seed) => playNight(seed, pro));
  const summary = summarize(pro, nights);

  it('accounts for every night exactly once', () => {
    const { won, dead, stalled } = summary.outcomes;
    expect(won + dead + stalled).toBe(nights.length);
    expect(summary.nights).toBe(nights.length);
    expect(won).toBe(nights.filter((night) => night.outcome === 'won').length);
  });

  it('counts every wing entered, in play order, and never more clears than entries', () => {
    expect(summary.wings[0]!.label).toBe('F1a');
    expect(summary.wings[0]!.entered).toBe(nights.length);
    const labels = summary.wings.map((wing) => wing.label);
    expect(labels).toEqual([...labels].sort((a, b) => Number(a[1]) * 2 + (a[2] === 'a' ? 0 : 1) - (Number(b[1]) * 2 + (b[2] === 'a' ? 0 : 1))));
    for (const wing of summary.wings) {
      expect(wing.won + wing.died + wing.stalled).toBe(wing.entered);
      expect(wing.entered).toBeLessThanOrEqual(nights.length);
    }
    const entries = nights.reduce((sum, night) => sum + night.wings.length, 0);
    expect(summary.wings.reduce((sum, wing) => sum + wing.entered, 0)).toBe(entries);
  });

  it('pins every death to a spot and a killer, and labels wings like the playbook (F1a, F1b, F2a ...)', () => {
    const deaths = summary.outcomes.dead;
    expect(summary.deathSpots.reduce((sum, [, count]) => sum + count, 0)).toBe(deaths);
    expect(summary.killedBy.reduce((sum, [, count]) => sum + count, 0)).toBe(deaths);
    expect(wingLabel({ floor: 1, part: 1 })).toBe('F1a');
    expect(wingLabel({ floor: 3, part: 2 })).toBe('F3b');
  });

  it('prints a markdown section with the bot named and a row per wing', () => {
    const text = formatSummary(summary);
    expect(text).toContain('pro bot');
    expect(text).toContain('| F1a |');
    expect(text.split('\n').filter((line) => line.startsWith('| F')).length).toBe(summary.wings.length);
  });
});
