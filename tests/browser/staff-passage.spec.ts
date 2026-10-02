import { expect, test, type Page } from '@playwright/test';

/**
 * Round 57: the staff passage. Beside the hatch on a safe concourse, E skips the
 * next fight room for a star of Heat. Seed 7's boss wing has a hatch on its
 * first concourse (rooms 1 to 3), checked against the sim in the unit tests.
 */
type Snapshot = { tick: number; roomIndex: number; heat: number };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

test('E beside the staff hatch skips the next fight and costs a star of Heat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?fixture=mvp-hatch&seed=7');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
  const before = await snapshot(page);
  expect(before.roomIndex).toBe(1);
  expect(before.heat).toBe(0);
  await page.keyboard.press('KeyE');
  await expect.poll(() => snapshot(page).then((state) => state.roomIndex)).toBe(3);
  const after = await snapshot(page);
  expect(after.heat).toBe(20);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/neon-overhaul/staff-passage.png' });
  expect(errors).toEqual([]);
});
