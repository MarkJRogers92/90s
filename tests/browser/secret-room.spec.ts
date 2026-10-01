import { expect, test, type Page } from '@playwright/test';

/** Round 53: the suspicious vending machine opens on the back room. */
type Snapshot = { tick: number; secretPhase: string | null };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

test('E at the suspicious vending machine opens the back room', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?fixture=mvp-secret');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
  await page.keyboard.press('KeyE');
  await expect.poll(() => snapshot(page).then((state) => state.secretPhase)).toBe('fight');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/neon-overhaul/secret-back-room.png' });
  expect(errors).toEqual([]);
});
