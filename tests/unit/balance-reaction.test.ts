import { describe, expect, it } from 'vitest';
import { MASCOT_TELEGRAPH_TICKS } from '../../src/sim/combat/mascot';
import type { RunState } from '../../src/sim/model';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { spawnWaveMonster } from '../../src/sim/run/rooms';
import type { BotOptions } from '../balance/bot';
import { dangersOf } from '../balance/danger';
import { crowdSweep, duelSweep } from '../balance/duel';
import { REACTIONS, reactionSweep, type Hazard } from '../balance/reaction';

const expert = (reaction: number, dashes = true): BotOptions => ({ skill: 'expert', shop: 'none', reaction, dashes });

describe('the expert with a reaction delay (round 57 follow-up): how long a hazard has to be seen before a person can answer it', () => {
  it('names every danger by what resolves and when, so the same wind-up is the same danger from one tick to the next', () => {
    const combat: RunState = createMvpRun(7).room.combat;
    combat.walls = [];
    combat.projectiles = [];
    combat.player.x = 480;
    combat.player.y = 240;
    const mascot = spawnWaveMonster({ slotId: 'm', kind: 'mascot', x: 480, y: 60 }, 11, 1);
    Object.assign(mascot, { phase: 'telegraph', phaseTicks: MASCOT_TELEGRAPH_TICKS, telegraphAimX: 0, telegraphAimY: 1 });
    const spritzer = spawnWaveMonster({ slotId: 's', kind: 'spritzer', x: 800, y: 60 }, 12, 1);
    Object.assign(spritzer, { phase: 'telegraph', phaseTicks: 30, lobX: 480, lobY: 240 });
    combat.enemies = [mascot, spritzer];
    const first = dangersOf(combat).map((danger) => danger.key);
    expect(new Set(first).size).toBe(2);
    // A tick later: the sim has counted both wind-ups down and the clock up.
    combat.tick += 1;
    mascot.phaseTicks -= 1;
    spritzer.phaseTicks -= 1;
    expect(dangersOf(combat).map((danger) => danger.key)).toEqual(first);
  });

  it('has no reaction by default: an expert with no delay named is the expert with a delay of 0', () => {
    const plain = crowdSweep('spritzer', { skill: 'expert', shop: 'none' });
    const zero = crowdSweep('spritzer', expert(0));
    expect(plain).toEqual(zero);
    expect(zero.lobHits).toBe(0);
  });

  it('is hit by a Spritzer once its delay passes what the 0.5 s wind-up leaves (17 ticks of slack): a person who does not dash cannot walk clear', () => {
    const quick = crowdSweep('spritzer', expert(8, false));
    const slow = crowdSweep('spritzer', expert(24, false));
    expect(quick.lobHits / quick.throws, 'reacting in 8 ticks').toBeLessThanOrEqual(0.1);
    expect(slow.lobHits / slow.throws, 'reacting in 24 ticks').toBeGreaterThan(0.6);
  });

  it('can still dash out of a Spritzer\'s spritz that is too late to walk clear of, and that is the only thing that saves it', () => {
    const walking = crowdSweep('spritzer', expert(24, false));
    const dashing = crowdSweep('spritzer', expert(24, true));
    expect(dashing.lobHits).toBeLessThan(walking.lobHits * 0.5);
  });

  it('has time to spare against a Roofer\'s bucket (43 ticks of slack): a slow reaction still walks clear', () => {
    const roofer = crowdSweep('roofer', expert(24, false));
    expect(roofer.lobHits / roofer.throws).toBeLessThanOrEqual(0.1);
  });

  it('is caught by a Mascot Brute\'s lane when it takes a whole wind-up to notice, and is not when it takes half of one', () => {
    const attackRate = (reaction: number) => {
      const results = duelSweep('mascot', expert(reaction, false));
      const attacks = results.reduce((sum, result) => sum + result.attacks, 0);
      return results.reduce((sum, result) => sum + result.hits, 0) / Math.max(1, attacks);
    };
    expect(attackRate(20)).toBeLessThanOrEqual(0.1);
    expect(attackRate(MASCOT_TELEGRAPH_TICKS)).toBeGreaterThan(0.5);
  });

  /** A hazard whose hit rate at each delay is read from `rates`; a player who never reacts (a huge delay) gets the last rate. */
  const steps = (id: string, reactions: readonly number[], rates: readonly number[], slack = 30): Hazard => ({
    id, name: id, windup: 50, slack,
    trial: (options) => {
      const index = reactions.indexOf(options.reaction ?? 0);
      return { hits: rates[index === -1 ? rates.length - 1 : index]! * 100, attacks: 100 };
    },
  });
  const reactions = [0, 10, 20, 30, 40, 50];

  it('measures "still dodged" against what the hazard does to a player who never reacts, so a hazard that rarely lands anyway is not let off', () => {
    // It never exceeds a quarter even when ignored: 20% of that quarter is 5%.
    const [row] = reactionSweep(true, reactions, [steps('rare', reactions, [0, 0.05, 0.1, 0.2, 0.25, 0.25])]);
    expect(row!.rates).toEqual([0, 0.05, 0.1, 0.2, 0.25, 0.25]);
    expect(row!.unaware).toBe(0.25);
    expect(row!.threshold).toBe(10);
    // A hazard that always lands when ignored keeps the plain 20% cut.
    expect(reactionSweep(true, reactions, [steps('sure', reactions, [0, 0.1, 0.2, 0.9, 1, 1])])[0]!.threshold).toBe(20);
    // A hazard that lands even at once has no safe delay.
    expect(reactionSweep(true, reactions, [steps('never', reactions, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5])])[0]!.threshold).toBeNull();
  });

  it('takes the "never reacts" rate from a player who truly never does, not from the last delay tried (a dash can still save a late one)', () => {
    // Never hit however late it reacts (a dash saves even the last column), but hit every time by a player who never reacts at all.
    const dashed: Hazard = { ...steps('dashed', reactions, [0, 0, 0, 0, 0, 0]), trial: (options) => ({ hits: (options.reaction ?? 0) > 1000 ? 100 : 0, attacks: 100 }) };
    const row = reactionSweep(true, reactions, [dashed])[0]!;
    expect(row.unaware).toBe(1);
    expect(row.threshold).toBe(50);
  });

  it('reaches past the longest wind-up: the grid runs to 54 ticks so a Roofer\'s bucket is not cut off', () => {
    expect(REACTIONS[REACTIONS.length - 1]).toBeGreaterThanOrEqual(54);
  });
});
