import { describe, expect, it } from 'vitest';
import { playNight, playWing, type BotOptions } from '../balance/harness';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { shortcutFor } from '../../src/sim/run/shortcut';

const careful: BotOptions = { skill: 'dodger', shop: 'none' };
const shopper: BotOptions = { skill: 'dodger', shop: 'buy' };

describe('balance bot (round 57)', () => {
  it('plays a first wing to a result instead of stalling, and replays identically', () => {
    for (const seed of [3, 11, 19]) {
      const first = playWing(createMvpRun(seed, { part: 1 }), careful);
      const again = playWing(createMvpRun(seed, { part: 1 }), careful);
      expect(first.outcome, `seed ${seed}`).not.toBe('stalled');
      expect(first.ticks).toBeGreaterThan(0);
      expect({ outcome: first.outcome, ticks: first.ticks, room: first.reachedRoom }).toEqual({
        outcome: again.outcome,
        ticks: again.ticks,
        room: again.reachedRoom,
      });
    }
  });

  it('leaves the first room: it walks the wing in order, one room at a time', () => {
    const result = playWing(createMvpRun(3, { part: 1 }), careful);
    expect(result.reachedRoom).toBeGreaterThan(1);
    expect(result.record.rooms.length).toBe(result.reachedRoom);
  });

  it('shops only when asked to: a shopper buys goods on top of the starting mop, a careful bot does not', () => {
    const seeds = [3, 11, 19, 27, 35];
    const bought = (options: BotOptions) =>
      seeds.reduce((sum, seed) => sum + playWing(createMvpRun(seed, { part: 1 }), options).record.bought.length, 0);
    // The starting mop is logged as bought, so a bot that never shops owns exactly one per wing.
    expect(bought(careful)).toBe(seeds.length);
    expect(bought(shopper)).toBeGreaterThan(seeds.length);
  });

  it('plays a night wing by wing, carrying gear up the stairs, and stops where the janitor falls', () => {
    const night = playNight(5, careful);
    expect(night.wings.length).toBeGreaterThanOrEqual(1);
    expect(night.wings[0]!.floor).toBe(1);
    const last = night.wings.at(-1)!;
    expect(night.outcome).toBe(last.outcome === 'won' ? night.outcome : last.outcome);
    expect(['won', 'dead', 'stalled']).toContain(night.outcome);
    // Every wing before the last was won: that is how the night got on.
    expect(night.wings.slice(0, -1).every((wing) => wing.outcome === 'won')).toBe(true);
  });

  it('takes the staff passage when told to, and walks past a fight room it would otherwise clear', () => {
    const pro: BotOptions = { skill: 'pro', shop: 'buy' };
    // Seeds whose boss wing has a hatch (checked against the sim, not assumed).
    const seeds = [7, 9, 15].filter((seed) => shortcutFor(createMvpRun(seed).wing) !== null);
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      const long = playWing(createMvpRun(seed), pro);
      const short = playWing(createMvpRun(seed), { ...pro, route: 'shortcut' });
      expect(long.outcome, `seed ${seed} long`).toBe('won');
      expect(short.outcome, `seed ${seed} shortcut`).toBe('won');
      expect(short.record.rooms.length).toBe(long.record.rooms.length - 1);
    }
  });
});
