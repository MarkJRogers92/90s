/**
 * How long a hazard has to be in view before a player can still answer it.
 *
 * Every hazard in the game is dodgeable by a bot that sees it at once. A person
 * has to notice it, decide, and then walk, so what matters is the time a wind-up
 * leaves, and how much of it a reaction eats. This runs the expert with a
 * reaction delay (see `BotOptions.reaction`) against each hazard in the same
 * fixed fights the other duels use and reports the hit rate at each delay: the
 * largest delay that still dodges it (`threshold`) is the figure to set against
 * a person's reaction, and against the hand-worked `slack` in the evidence.
 */
import type { BotOptions } from './bot';
import { crowdSweep, duelSweep, volatileDuel } from './duel';
import { bossFight } from './scenarios';

/** Reaction delays to try, in ticks: 0 to 0.9 s, past the longest wind-up (the Roofer's 54). */
export const REACTIONS: readonly number[] = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54];
/** A delay no hazard waits out: a player who never reacts. */
const NEVER = 100_000;
/** A hazard counts as dodged while its hit rate stays at or under this share of its rate against a player who never reacts. */
export const DODGED_AT_MOST = 0.2;

export type Trial = { readonly hits: number; readonly attacks: number };

export type Hazard = {
  readonly id: string;
  readonly name: string;
  /** Ticks of wind-up (or fuse). */
  readonly windup: number;
  /** The wind-up minus the ticks to walk clear from the worst place to stand: arithmetic on the constants. */
  readonly slack: number;
  readonly trial: (options: BotOptions) => Trial;
};

const bearings = (count: number): number[] => Array.from({ length: count }, (_, index) => (index / count) * Math.PI * 2 + 0.3);

export const HAZARDS: readonly Hazard[] = [
  {
    id: 'spritzer', name: "Perfume Spritzer's spritz", windup: 30, slack: 17,
    trial: (options) => { const r = crowdSweep('spritzer', options); return { hits: r.lobHits, attacks: r.throws }; },
  },
  {
    id: 'fuse', name: "Volatile elite's fuse", windup: 36, slack: 23,
    trial: (options) => {
      const runs = bearings(8).flatMap((bearing) => [60, 120].map((distance) => volatileDuel(options, bearing, distance)));
      return { hits: runs.reduce((sum, lost) => sum + lost, 0), attacks: runs.length };
    },
  },
  {
    id: 'shopper', name: "Bargain Hunter's charge", windup: 34, slack: 26,
    trial: (options) => { const r = duelSweep('shopper', options); return { hits: r.reduce((s, x) => s + x.hits, 0), attacks: r.reduce((s, x) => s + x.attacks, 0) }; },
  },
  {
    id: 'mascot', name: "Mascot Brute's charge", windup: 46, slack: 38,
    trial: (options) => { const r = duelSweep('mascot', options); return { hits: r.reduce((s, x) => s + x.hits, 0), attacks: r.reduce((s, x) => s + x.attacks, 0) }; },
  },
  {
    id: 'roofer', name: "Roofer's bucket", windup: 54, slack: 43,
    trial: (options) => { const r = crowdSweep('roofer', options); return { hits: r.lobHits, attacks: r.throws }; },
  },
];

export type Row = {
  readonly hazard: Hazard;
  /** Hit rate (0 to 1) at each of `REACTIONS`. */
  readonly rates: readonly number[];
  /** Hit rate against a player who never reacts at all: what "dodged" is measured against. */
  readonly unaware: number;
  /** The longest delay whose rate is still within `DODGED_AT_MOST` of the never-reacts rate, with none worse before it; null when even instant is not. */
  readonly threshold: number | null;
};

/** The hit rate of every hazard at every reaction delay. */
export function reactionSweep(dashes: boolean, reactions: readonly number[] = REACTIONS, hazards: readonly Hazard[] = HAZARDS): Row[] {
  return hazards.map((hazard) => {
    const rates = reactions.map((reaction) => {
      const { hits, attacks } = hazard.trial({ skill: 'expert', shop: 'none', reaction, dashes });
      return attacks === 0 ? 0 : hits / attacks;
    });
    // "Still dodged" is measured against what the hazard does to a player who never reacts (a
    // true never: a dash can still save a late reaction), so one that rarely lands anyway is not
    // let off a fixed cut.
    const ignoredTrial = hazard.trial({ skill: 'expert', shop: 'none', reaction: NEVER, dashes });
    const unaware = ignoredTrial.attacks === 0 ? 0 : ignoredTrial.hits / ignoredTrial.attacks;
    const limit = DODGED_AT_MOST * unaware;
    let threshold: number | null = null;
    for (let index = 0; index < reactions.length; index += 1) {
      if (rates[index]! > limit) break;
      threshold = reactions[index]!;
    }
    return { hazard, rates, unaware, threshold };
  });
}

/**
 * Where the janitor stands when the Owner fight begins, as offsets from the
 * entrance: the fight itself does not depend on the seed, so without these six
 * "fights" would be one fight six times.
 */
const OWNER_STARTS: ReadonlyArray<{ readonly dx: number; readonly dy: number }> = [
  { dx: 0, dy: 0 }, { dx: 80, dy: 0 }, { dx: 160, dy: 0 }, { dx: 0, dy: -70 }, { dx: 0, dy: 70 }, { dx: 120, dy: -50 },
];

export type OwnerResult = { readonly meanHealthLost: number; readonly died: number; readonly fights: number };

/**
 * The Mall Owner alone (starting mop, full health), by reaction delay. His
 * volleys and charges all show a wind-up, so this is the compound test: how
 * much of his fight a reaction delay leaves a player. Health lost is capped at
 * the janitor's six.
 */
export function ownerSweep(dashes: boolean, reactions: readonly number[] = REACTIONS, seeds: readonly number[] = [1, 2, 3, 4, 5, 6]): OwnerResult[] {
  return reactions.map((reaction) => {
    const fights = seeds.map((seed, index) => bossFight(seed, { skill: 'expert', shop: 'none', reaction, dashes }, 3, OWNER_STARTS[index % OWNER_STARTS.length]));
    return {
      meanHealthLost: fights.reduce((sum, fight) => sum + Math.min(6, fight.hpLost), 0) / fights.length,
      died: fights.filter((fight) => fight.outcome === 'dead').length,
      fights: fights.length,
    };
  });
}

const pct = (rate: number): string => `${Math.round(rate * 100)}%`;
const seconds = (ticks: number): string => `${(ticks / 60).toFixed(2)} s`;

/** One variant of the sweep as a markdown table. */
export function formatSweep(title: string, rows: readonly Row[], reactions: readonly number[] = REACTIONS): string {
  const lines = [`### ${title}`, ''];
  lines.push(`| hazard | wind-up | slack | ${reactions.map((reaction) => `${reaction}`).join(' | ')} | never reacts | longest reaction that still dodges it |`);
  lines.push(`|---|---|---|${reactions.map(() => '---').join('|')}|---|---|`);
  const last = reactions[reactions.length - 1];
  for (const row of [...rows].sort((a, b) => a.hazard.slack - b.hazard.slack)) {
    const reach = row.threshold === null ? 'none' : `${row.threshold === last ? '≥ ' : ''}${row.threshold} ticks (${seconds(row.threshold)})`;
    lines.push(`| ${row.hazard.name} | ${row.hazard.windup} | ${row.hazard.slack} | ${row.rates.map(pct).join(' | ')} | ${pct(row.unaware)} | ${reach} |`);
  }
  return lines.join('\n');
}
