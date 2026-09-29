import { expect, test, type Page } from '@playwright/test';
import { dailySeed, formatDailyDate } from '../../src/game/run/dailyShift';

/**
 * The Daily Shift: today's mall, the same for everyone, standard issue (no
 * Break Room perks), with an attempts/best record kept in this browser.
 */
const CAREER_KEY = 'dead-mall:career:v1';
const DAILY_KEY = 'dead-mall:daily:v1';

type Snapshot = { status: 'playing' | 'won' | 'dead'; tick: number; seed: number; cash: number; player: { health: number } };

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function collectErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const errors = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text());
  });
  return errors;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

async function daily(page: Page): Promise<{ days: Array<Record<string, unknown>> } | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as { days: Array<Record<string, unknown>> } | null, DAILY_KEY);
}

async function startDaily(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Daily Shift/ }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

test('the title shows the daily line and a Daily Shift button', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const date = formatDailyDate(today());
  await expect(page.locator('#daily-run')).toHaveText(`DAILY SHIFT · ${date} · NOT YET WORKED`);
  await expect(page.getByRole('button', { name: `Daily Shift · ${date}` })).toBeVisible();
  await page.screenshot({ path: 'artifacts/neon-overhaul/daily-title.png' });
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('a Daily Shift uses the date seed and ignores Break Room perks', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, stubs: 50, perks: { seniority: 2, dental: 1 } })), CAREER_KEY);
  await page.reload();
  await startDaily(page);
  const state = await snapshot(page);
  expect(state.seed).toBe(dailySeed(today()));
  // Dental Plan would add a heart (8): standard issue is 6.
  expect(state.player.health).toBe(6);
  // Same mall as a plain `?seed=` shift, without the Seniority float.
  await page.goto(`/?seed=${dailySeed(today())}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((s) => s.tick)).toBeGreaterThan(0);
  const perked = await snapshot(page);
  expect(perked.cash).toBeGreaterThan(state.cash);
  expect(perked.player.health).toBe(8);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('dying on the Daily Shift records an attempt and shows the daily row', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?fixture=mvp-last-heart');
  await startDaily(page);
  await expect.poll(() => snapshot(page).then((state) => state.status), { timeout: 30_000 }).toBe('dead');
  await expect.poll(() => daily(page), { timeout: 15_000 }).not.toBeNull();
  const record = (await daily(page))!.days[0]!;
  expect(record).toMatchObject({ date: today(), attempts: 1, won: false });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'artifacts/neon-overhaul/daily-card.png' });

  // Retry keeps today's mall and counts the next attempt when it ends.
  await page.keyboard.press('KeyT');
  await expect(page.locator('#daily-run')).toContainText('1 ATTEMPT');
  await expect(page.locator('#daily-run')).toContainText(`DAILY SHIFT · ${formatDailyDate(today())} · BEST`);
});
