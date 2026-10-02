/**
 * The reaction-delay report: `npm run balance:reaction`. Not part of `npm test`.
 *
 *   REACTION_OUT=my.md npm run balance:reaction   # write the markdown elsewhere
 *
 * Written to test-results/reaction.md as well as logged, because vitest hides
 * the log of a passing test (and Playwright empties test-results/, so copy a
 * report worth keeping into docs/neon-overhaul/balance/).
 */
import { describe, it } from 'vitest';
import { REACTIONS, formatSweep, ownerSweep, reactionSweep } from './reaction';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe('reaction-delay report', () => {
  it('sweeps the expert\'s reaction delay against every hazard, with and without the dash', async () => {
    const dash = reactionSweep(true);
    const walk = reactionSweep(false);
    const owner = (dashes: boolean) => ownerSweep(dashes).map((result) => `${result.meanHealthLost.toFixed(1)} hp${result.died > 0 ? `, ${result.died}/${result.fights} died` : ''}`);
    const report = [
      '## Reaction-delay report',
      '',
      'Hit rate by reaction delay in ticks (60 a second). `slack` is the hand-worked ticks a hazard leaves after walking clear.',
      '',
      formatSweep('Walking only (never dashes)', walk),
      '',
      formatSweep('Dashing allowed (the expert dashes when walking cannot get clear)', dash),
      '',
      '### The Mall Owner alone (starting mop, full health, 6 fights): health lost (of 6) and deaths',
      '',
      `| reaction (ticks) | ${REACTIONS.join(' | ')} |`,
      `|---|${REACTIONS.map(() => '---').join('|')}|`,
      `| walking only | ${owner(false).join(' | ')} |`,
      `| dashing allowed | ${owner(true).join(' | ')} |`,
      '',
    ].join('\n');
    console.log(`\n${report}`);
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as {
      mkdirSync(path: string, options: { recursive: boolean }): void;
      writeFileSync(path: string, data: string): void;
    };
    const out = env.REACTION_OUT ?? 'test-results/reaction.md';
    if (out.includes('/')) fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(out, `${report}\n`);
  }, 30 * 60_000);
});
