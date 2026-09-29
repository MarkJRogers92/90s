import { expect, test, type Page } from '@playwright/test';

/**
 * Void the Warranty: at the Bench Warrant, any two items fuse. Pick them with
 * the number keys (or a click), read the named result, press Enter.
 */
type Snapshot = {
  tick: number;
  cash: number;
  paused: boolean;
  previewOpen: boolean;
  inventory: { inventory: Array<{ kind: string; instanceId: string; recipeId?: string }>; selectedPrimaryInstanceId: string };
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

test('pick two items at the bench, see the named fusion, and fuse it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?fixture=mvp-workbench&seed=11');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);

  await page.keyboard.press('KeyE');
  await expect.poll(() => snapshot(page).then((state) => state.paused)).toBe(true);
  // Tile 2 is the soaker, tile 3 the plasma globe: a signature fusion.
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit3');
  await expect.poll(() => snapshot(page).then((state) => state.previewOpen)).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/neon-overhaul/fusion-bench.png' });
  const before = await snapshot(page);

  await page.keyboard.press('Enter');
  await expect.poll(() => snapshot(page).then((state) => state.inventory.inventory.some((node) => node.recipeId === 'hybrid'))).toBe(true);
  const after = await snapshot(page);
  expect(after.cash).toBeLessThan(before.cash);
  expect(after.paused).toBe(false);
  const hybrid = after.inventory.inventory.find((node) => node.recipeId === 'hybrid')!;
  expect(after.inventory.selectedPrimaryInstanceId).toBe(hybrid.instanceId);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/neon-overhaul/fusion-fused.png' });
  expect(errors).toEqual([]);
});
