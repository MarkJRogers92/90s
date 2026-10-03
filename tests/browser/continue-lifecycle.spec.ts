import { openRunMenu } from './runMenu';
import { expect, test, type Page } from '@playwright/test';
import { CANVAS_START_MS } from './timing';

const CHECKPOINT_KEY = 'dead-mall:mvp-checkpoint:v1';

async function waitForRun(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toBeVisible({ timeout: CANVAS_START_MS });
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect(page.locator('#mvp-run-hud')).not.toHaveAttribute('hidden', { timeout: CANVAS_START_MS });
}

test('Continue hides the ended HUD during loading and resumes the living checkpoint', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=mvp-last-heart&seed=7');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await waitForRun(page);
  await expect(page.locator('#mvp-run-health')).toHaveText('0 / 6', { timeout: 30_000 });
  await expect(page.locator('#mvp-run-summary')).toContainText('Shift ended');
  const saved = await page.evaluate((key) => localStorage.getItem(key), CHECKPOINT_KEY);
  expect(saved).not.toBeNull();
  const checkpoint = JSON.parse(saved!);
  expect(checkpoint.playerHealth).toBeGreaterThan(0);
  await openRunMenu(page);
  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeVisible();
  // Remove the death fixture without reloading away the old HUD.
  await page.evaluate(() => history.replaceState(null, '', '/?seed=7'));
  const continueButton = page.getByRole('button', { name: 'Continue run', exact: true });
  await expect(continueButton).toBeEnabled();

  let releaseAssets!: () => void;
  let sawAsset!: () => void;
  const held = new Promise<void>((resolve) => { releaseAssets = resolve; });
  const requested = new Promise<void>((resolve) => { sawAsset = resolve; });
  await page.route('**/assets/neon/**', async (route) => {
    sawAsset();
    await held;
    await route.continue();
  });
  try {
    await continueButton.click();
    await requested;
    await expect(page.locator('#mvp-run-hud')).toHaveAttribute('hidden', '', { timeout: 1_000 });
    await expect(page.locator('#mvp-run-summary')).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), CHECKPOINT_KEY)).toBe(saved);
    await page.screenshot({ path: testInfo.outputPath('continue-loading.png') });
  } finally {
    releaseAssets();
  }
  await waitForRun(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => {
    const state = window.__DEAD_MALL_DEBUG__?.snapshot();
    return state?.mode === 'run' && state.paused;
  })).toBe(true);
  const resumed = await page.evaluate(() => window.__DEAD_MALL_DEBUG__?.snapshot());
  if (resumed?.mode !== 'run') throw new Error('Expected a resumed Night Shift.');
  expect(resumed?.status).toBe('playing');
  expect(resumed?.player.health).toBe(checkpoint.playerHealth);
  await expect(page.locator('#mvp-run-room')).toContainText(`(${checkpoint.roomIndex + 1} / 6)`);
  await expect(page.locator('#mvp-run-seed')).toContainText(`seed ${checkpoint.seed}`);
  await expect(page.locator('#mvp-run-cash')).toContainText(`$${checkpoint.cash}`);
  await expect(page.locator('#mvp-run-summary')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('continue-resumed-paused.png') });
  expect(errors).toEqual([]);
});

test('a zero-health checkpoint disables Continue without deleting saved progress', async ({ page }) => {
  await page.goto('/?seed=73');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await waitForRun(page);
  await openRunMenu(page);
  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  const saved = await page.evaluate((key) => {
    const checkpoint = JSON.parse(localStorage.getItem(key)!);
    checkpoint.playerHealth = 0;
    const raw = JSON.stringify(checkpoint);
    localStorage.setItem(key, raw);
    return raw;
  }, CHECKPOINT_KEY);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue run', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), CHECKPOINT_KEY)).toBe(saved);
});
