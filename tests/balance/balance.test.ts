/**
 * The balance report. Not part of `npm test`: it plays hundreds of nights, so
 * it runs on request.
 *
 *   npm run balance                       # 40 nights, every bot
 *   BALANCE_NIGHTS=200 npm run balance    # more nights, tighter numbers
 *   BALANCE_BOTS=pro:buy:shortcut npm run balance  # bots as skill:shop[:route], comma separated
 *   BALANCE_OUT=my.md npm run balance     # write the markdown elsewhere
 *
 * The report is written to test-results/balance.md (git-ignored) as well as
 * logged, because vitest hides the log of a passing test.
 */
import { describe, it } from 'vitest';
import type { BotRoute, BotShop, BotSkill } from './bot';
import { formatSummary, runBalance } from './report';

// The repo carries no Node typings, so read the environment the way playwright.config.ts does.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const NIGHTS = Number(env.BALANCE_NIGHTS ?? 40);
const DEFAULT_BOTS = 'naive:none,dodger:none,pro:none,pro:buy,pro:buy:shortcut';
const bots = (env.BALANCE_BOTS ?? DEFAULT_BOTS).split(',').map((spec) => {
  const [skill, shop, route] = spec.split(':');
  return { skill: skill as BotSkill, shop: (shop ?? 'none') as BotShop, route: (route ?? 'long') as BotRoute };
});

describe('balance report', () => {
  it(`plays ${NIGHTS} seeded nights per bot and prints the tuning tables`, async () => {
    const seeds = Array.from({ length: NIGHTS }, (_, index) => index + 1);
    const sections = bots.map((options) => formatSummary(runBalance(options, seeds)));
    const report = ['## Balance report', '', ...sections.flatMap((section) => [section, ''])].join('\n');
    console.log(`\n${report}`);
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as {
      mkdirSync(path: string, options: { recursive: boolean }): void;
      writeFileSync(path: string, data: string): void;
    };
    const out = env.BALANCE_OUT ?? 'test-results/balance.md';
    if (out.includes('/')) fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(out, `${report}\n`);
  }, 30 * 60_000);
});
