import { expect, test, type Page } from '@playwright/test';
import { CANVAS_START_MS } from './timing';
import { openRunMenu } from './runMenu';
import { worldToCanvas } from './projection';
import type { MvpRunDebugSnapshot } from '../../src/debug/DebugBridge';
const snapshot = (page: Page) => page.evaluate(() => window.__DEAD_MALL_DEBUG__!.snapshot() as MvpRunDebugSnapshot);

async function launch(page: Page) {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: CANVAS_START_MS });
  await expect(page.locator('#mvp-run-hud')).not.toHaveAttribute('hidden');
  await expect.poll(() => snapshot(page).then(state => state.tick)).toBeGreaterThan(5);
}

for (const dpr of [1, 2]) {
  test.describe(`viewport at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('centers the complete stage once through repeated landscape, portrait and ultrawide resizes', async ({ page }) => {
      test.setTimeout(90_000);
      await launch(page);
      for (const [width, height] of [[1280, 720], [1920, 1080], [1920, 1200], [3440, 1440], [800, 600], [390, 844], [844, 390], [1280, 720]]) {
        await page.setViewportSize({ width: width!, height: height! });
        await expect.poll(async () => {
          const canvas = (await page.locator('canvas').boundingBox())!;
          const host = (await page.locator('#game-host').boundingBox())!;
          return Math.abs(canvas.x + canvas.width / 2 - host.x - host.width / 2)
            + Math.abs(canvas.y + canvas.height / 2 - host.y - host.height / 2);
        }).toBeLessThanOrEqual(2);
        const canvas = (await page.locator('canvas').boundingBox())!;
        const host = (await page.locator('#game-host').boundingBox())!;
        expect(canvas.width / canvas.height).toBeCloseTo(1.6, 2);
        expect(canvas.x).toBeGreaterThanOrEqual(host.x - 1);
        expect(canvas.y).toBeGreaterThanOrEqual(host.y - 1);
        expect(canvas.x + canvas.width).toBeLessThanOrEqual(host.x + host.width + 1);
        expect(canvas.y + canvas.height).toBeLessThanOrEqual(host.y + host.height + 1);
        const origin = await worldToCanvas(page, 0, -120);
        const far = await worldToCanvas(page, 960, 480);
        expect(origin.x).toBeCloseTo(0, 0); expect(origin.y).toBeCloseTo(0, 0);
        expect(far.x).toBeCloseTo(canvas.width, 0); expect(far.y).toBeCloseTo(canvas.height, 0);
        await expect(page.locator('#run-menu-toggle')).toBeInViewport();
        await expect(page.locator('#run-fullscreen')).toBeInViewport();
      }
    });
  });
}

test('menu traps focus, pauses without click-through, restores prior state, and hands focus back after Settings', async ({ page }) => {
  await launch(page);
  const prior = await snapshot(page);
  expect(prior.paused).toBe(false);
  await openRunMenu(page);
  const held = await snapshot(page);
  expect(held.paused).toBe(true);
  await expect(page.locator('#run-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#run-menu-panel')))).toBe(true);
  await page.mouse.click(10, 400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  const afterBackdrop = await snapshot(page);
  expect(afterBackdrop.tick).toBe(held.tick);
  expect(afterBackdrop.inventory.revision).toBe(held.inventory.revision);
  expect(afterBackdrop.projectiles).toEqual(held.projectiles);
  await expect(page.locator('#run-menu-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#run-menu-panel')).toBeHidden();
  await expect(page.locator('#run-menu-toggle')).toBeFocused();
  expect((await snapshot(page)).paused).toBe(false);
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).paused).toBe(true);
  await openRunMenu(page);
  await page.locator('#run-menu-close').click();
  expect((await snapshot(page)).paused).toBe(true);
  await openRunMenu(page);
  await page.locator('#mvp-open-settings').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(page.locator('#run-menu-toggle')).toBeFocused();
});

test('fullscreen keeps the settings dialog in its target and reflows on repeated exit', async ({ page }) => {
  await launch(page);
  const available = await page.evaluate(() => Boolean(document.fullscreenEnabled && document.getElementById('app')?.requestFullscreen));
  if (!available) {
    await expect(page.locator('#run-fullscreen')).toBeDisabled();
    return;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#run-fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('app');
    await expect(page.locator('#run-fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await openRunMenu(page);
    await page.locator('#mvp-open-settings').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement?.contains(document.getElementById('settings-panel')))).toBe(true);
    await page.keyboard.press('Escape');
    // Native fullscreen Escape can be consumed before the DOM dialog sees it.
    if (await page.locator('#settings-panel').isVisible()) await page.locator('#settings-close').click();
    await expect(page.locator('#settings-panel')).toBeHidden();
    await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    await expect(page.locator('#run-fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => {
      const c = (await page.locator('canvas').boundingBox())!, h = (await page.locator('#game-host').boundingBox())!;
      return Math.abs(c.x + c.width / 2 - h.x - h.width / 2);
    }).toBeLessThanOrEqual(1);
  }
});

test.describe('coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('utility buttons remain visible touch targets and menu content scrolls', async ({ page }) => {
    await launch(page);
    for (const id of ['#run-menu-toggle', '#run-fullscreen']) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator(id)).toBeInViewport();
    }
    await page.locator('#run-menu-toggle').tap();
    await expect(page.locator('#run-menu-panel')).toBeVisible();
    await expect(page.locator('#run-menu-close')).toBeInViewport();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#mvp-run-inspection summary').tap();
    await page.locator('#mvp-return').scrollIntoViewIfNeeded();
    await expect(page.locator('#mvp-return')).toBeInViewport();
    await page.locator('#run-menu-close').scrollIntoViewIfNeeded();
    await page.locator('#run-menu-close').tap();
    await expect(page.locator('#run-menu-panel')).toBeHidden();
  });
});

for (const width of [320, 390, 844]) {
  test(`store and bench context remain usable without covering the stage at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/?fixture=mvp-storefront&seed=4242');
    await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
    const offers = page.locator('#mvp-run-offers-wrap');
    await expect(offers).toBeVisible({ timeout: CANVAS_START_MS });
    await offers.locator('summary').click();
    const first = page.locator('#mvp-run-offers li').first();
    await expect(first).toBeInViewport();
    const chip = (await offers.locator('summary').boundingBox())!;
    const item = (await first.boundingBox())!;
    expect(item.y).toBeGreaterThanOrEqual(chip.y + chip.height);
    const normalContext = (await page.locator('#mvp-run-hud').boundingBox())!;
    const host = (await page.locator('#game-host').boundingBox())!;
    expect(normalContext.y + normalContext.height).toBeLessThanOrEqual(host.y + 1);
    await offers.locator('summary').click();
    await page.goto('/?fixture=mvp-bench&seed=4242');
    await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: CANVAS_START_MS });
    // The fixture starts at the bench; wait for its input adapter, then use E.
    await expect(page.locator('#mvp-run-hud')).not.toHaveAttribute('hidden');
    await expect.poll(() => snapshot(page).then(state => state.carrier?.mode)).toBe('independent');
    await page.keyboard.press('e');
    await expect(page.locator('#mvp-run-bench')).toBeVisible();
    for (const id of ['#mvp-bench-confirm', '#mvp-bench-cancel']) await expect(page.locator(id)).toBeInViewport();
    const bench = (await page.locator('#mvp-run-bench').boundingBox())!;
    const after = (await page.locator('#game-host').boundingBox())!;
    expect(bench.y + bench.height).toBeLessThanOrEqual(after.y + 1);
    await openRunMenu(page);
    const state = await snapshot(page);
    const confirm = (await page.locator('#mvp-bench-confirm').boundingBox())!;
    await page.mouse.click(confirm.x + confirm.width / 2, confirm.y + confirm.height / 2);
    expect((await snapshot(page)).inventory.revision).toBe(state.inventory.revision);
    await expect(page.locator('#run-menu-panel')).toBeVisible();
  });
}
