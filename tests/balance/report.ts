/**
 * Turns many bot nights into the numbers a tuning round needs: how far each
 * kind of bot gets, where it dies, what hurts it, and what it earns and spends.
 *
 * Pure functions of the bot's results; nothing here runs the game. The shapes
 * line up with the playtest log's own (`RunRecord`) on purpose, so a bot's
 * table and a human's pasted log can be read side by side.
 */
import type { DamageSource } from '../../src/game/playtest/recorder';
import { playNight, type BotOptions, type NightResult, type WingResult } from './harness';

export type WingLabel = string;

export type WingStats = {
  readonly label: WingLabel;
  /** Nights that got this far. */
  readonly entered: number;
  readonly won: number;
  readonly died: number;
  readonly stalled: number;
  /** Mean minutes of play in the wing. */
  readonly meanMinutes: number;
  /** Mean health lost in the wing, and which sources took it, most first. */
  readonly meanDamage: number;
  readonly damageBySource: ReadonlyArray<readonly [DamageSource, number]>;
  /** Mean cash in hand when the wing ended. */
  readonly meanCashLeft: number;
};

export type BalanceSummary = {
  readonly options: BotOptions;
  readonly nights: number;
  readonly outcomes: { readonly won: number; readonly dead: number; readonly stalled: number };
  readonly wings: readonly WingStats[];
  /** Where the janitor fell: `label room name`, most deaths first. */
  readonly deathSpots: ReadonlyArray<readonly [string, number]>;
  readonly killedBy: ReadonlyArray<readonly [string, number]>;
};

export const wingLabel = (wing: Pick<WingResult, 'floor' | 'part'>): WingLabel => `F${wing.floor}${wing.part === 1 ? 'a' : 'b'}`;

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
const rank = (counts: Map<string, number>): Array<readonly [string, number]> => [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const bump = (counts: Map<string, number>, key: string, by = 1): void => void counts.set(key, (counts.get(key) ?? 0) + by);

/** Wing labels in play order: F1a, F1b, F2a, ... */
const wingOrder = (label: WingLabel): number => Number(label[1]) * 2 + (label[2] === 'a' ? 0 : 1);

export function summarize(options: BotOptions, nights: readonly NightResult[]): BalanceSummary {
  const outcomes = { won: 0, dead: 0, stalled: 0 };
  const byWing = new Map<WingLabel, WingResult[]>();
  const deathSpots = new Map<string, number>();
  const killedBy = new Map<string, number>();
  for (const night of nights) {
    outcomes[night.outcome] += 1;
    for (const wing of night.wings) {
      const label = wingLabel(wing);
      byWing.set(label, [...(byWing.get(label) ?? []), wing]);
    }
    const last = night.wings.at(-1);
    if (night.outcome === 'dead' && last) {
      const room = last.record.rooms.at(-1)?.name ?? 'unknown';
      bump(deathSpots, `${wingLabel(last)} ${room}`);
      bump(killedBy, String(last.record.killedBy ?? 'unknown'));
    }
  }
  const wings: WingStats[] = [...byWing.entries()]
    .sort((a, b) => wingOrder(a[0]) - wingOrder(b[0]))
    .map(([label, results]) => {
      const damage = new Map<string, number>();
      const perWing = results.map((wing) => {
        let total = 0;
        for (const room of wing.record.rooms) {
          for (const [source, amount] of Object.entries(room.damage)) {
            if (amount > 0) bump(damage, source, amount);
            total += amount;
          }
        }
        return total;
      });
      return {
        label,
        entered: results.length,
        won: results.filter((wing) => wing.outcome === 'won').length,
        died: results.filter((wing) => wing.outcome === 'dead').length,
        stalled: results.filter((wing) => wing.outcome === 'stalled').length,
        meanMinutes: mean(results.map((wing) => wing.ticks / 3600)),
        meanDamage: mean(perWing),
        damageBySource: rank(new Map([...damage].map(([source, total]) => [source, total / results.length]))) as Array<readonly [DamageSource, number]>,
        meanCashLeft: mean(results.map((wing) => wing.cashLeft)),
      };
    });
  return { options, nights: nights.length, outcomes, wings, deathSpots: rank(deathSpots), killedBy: rank(killedBy) };
}

/** Plays `seeds` nights with one bot and summarizes them. */
export function runBalance(options: BotOptions, seeds: readonly number[]): BalanceSummary {
  return summarize(options, seeds.map((seed) => playNight(seed, options)));
}

const pct = (part: number, whole: number): string => (whole === 0 ? '-' : `${Math.round((part / whole) * 100)}%`);
const one = (value: number): string => value.toFixed(1);

/** One summary as a markdown section. */
export function formatSummary(summary: BalanceSummary): string {
  const { options, nights, outcomes } = summary;
  const lines: string[] = [];
  lines.push(`### ${options.skill} bot, shopping: ${options.shop}, route: ${options.route ?? 'long'} (${nights} nights)`);
  lines.push('');
  lines.push(`Nights won ${pct(outcomes.won, nights)} (${outcomes.won}), died ${pct(outcomes.dead, nights)} (${outcomes.dead}), stalled ${pct(outcomes.stalled, nights)} (${outcomes.stalled}).`);
  lines.push('');
  lines.push('| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const wing of summary.wings) {
    const top = wing.damageBySource.slice(0, 3).map(([source, amount]) => `${source} ${one(amount)}`).join(', ');
    lines.push(`| ${wing.label} | ${wing.entered} | ${pct(wing.won, wing.entered)} | ${wing.died} | ${wing.stalled} | ${one(wing.meanMinutes)} | ${one(wing.meanDamage)} | ${top || '-'} | $${Math.round(wing.meanCashLeft)} |`);
  }
  if (summary.deathSpots.length > 0) {
    lines.push('');
    lines.push(`Deaths: ${summary.deathSpots.slice(0, 8).map(([spot, count]) => `${spot} (${count})`).join('; ')}.`);
    lines.push(`Killed by: ${summary.killedBy.map(([source, count]) => `${source} (${count})`).join(', ')}.`);
  }
  return lines.join('\n');
}
