import { expect, test, type Page } from '@playwright/test';

type BenchSnapshot = {
  mode: 'bench';
  generation: number;
  tick: number;
  paused: boolean;
  status: 'playing' | 'won' | 'dead';
  activeRoom: 'service' | 'test_bay';
  scenarioId: 'clean-soaker' | 'stolen-popper' | 'unsupported-mop';
  player: { x: number; y: number };
  carrier: { mode: 'independent' | 'emitter'; x: number; y: number };
  cash: number;
  revision: number;
  preview: null | {
    fee: number;
    primaryName: string;
    carrierName: string;
    primaryProvenance: 'purchased' | 'stolen';
    carrierProvenance: 'purchased' | 'stolen';
  };
  projectiles: Array<{
    id: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    faction: 'enemy' | 'player';
  }>;
  recentChange: string;
  behaviorTrace: string[];
};

function collectErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const errors = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
  });
  return errors;
}

async function benchSnapshot(page: Page): Promise<BenchSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): BenchSnapshot } }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function launchBench(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Void the Warranty', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#bench-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => benchSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

test('launches void the warranty with one canvas, one HUD, and bench warrant kiosk', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchBench(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('bench-hud')).toHaveCount(1);
  await expect(page.locator('#bench-interaction')).toContainText('BENCH WARRANT');
  const state = await benchSnapshot(page);
  expect(state.mode).toBe('bench');
  expect(state.scenarioId).toBe('clean-soaker');
  expect(state.activeRoom).toBe('service');
  expect(state.cash).toBe(10);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('clean E preview shows exact ingredients and $4 fee, cancel preserves state', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchBench(page);
  await page.keyboard.press('e');
  await expect(
    page.getByRole('heading', { name: 'Emitter Mount preview', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#bench-preview-fee')).toContainText('$4');
  const preview = await benchSnapshot(page).then((state) => state.preview);
  expect(preview).not.toBeNull();
  expect(preview?.fee).toBe(4);
  const before = await benchSnapshot(page);
  await page.getByRole('button', { name: 'Cancel fusion', exact: true }).click();
  const after = await benchSnapshot(page);
  expect(after.preview).toBeNull();
  expect(after.cash).toBe(before.cash);
  expect(after.revision).toBe(before.revision);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('stolen preview charges $6 once, unsupported mop explains and disables confirm', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchBench(page);
  await page.getByRole('button', { name: 'Stolen popper', exact: true }).click();
  await page.keyboard.press('e');
  await expect(
    page.getByRole('heading', { name: 'Emitter Mount preview', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#bench-preview-fee')).toContainText('$6');
  const cashBefore = (await benchSnapshot(page)).cash;
  await page.getByRole('button', { name: 'Confirm fusion', exact: true }).click();
  const confirmed = await benchSnapshot(page);
  expect(confirmed.cash).toBe(cashBefore - 6);
  expect(confirmed.carrier.mode).toBe('emitter');
  await expect(page.locator('#bench-preview')).toBeHidden();
  await expect(page.locator('#bench-confirm')).toBeDisabled();
  await expect(page.getByTestId('bench-hud')).toContainText('stolen');
  await expect
    .poll(() => benchSnapshot(page).then((state) => state.cash))
    .toBe(confirmed.cash);
  const settled = await benchSnapshot(page);
  expect(settled.cash).toBe(confirmed.cash);
  expect(settled.revision).toBe(confirmed.revision);
  await page.getByRole('button', { name: 'Unsupported mop', exact: true }).click();
  await page.keyboard.press('e');
  await expect(page.locator('#bench-preview-reason')).toBeVisible();
  await expect(page.locator('#bench-preview-reason')).toContainText(/projectile primary/i);
  await expect(page.locator('#bench-preview')).toBeHidden();
  await expect(page.locator('#bench-confirm')).toBeDisabled();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('fused car is the sampled projectile origin', async ({ page }) => {
  const errors = collectErrors(page);
  await launchBench(page);
  await page.keyboard.press('e');
  await expect(
    page.getByRole('heading', { name: 'Emitter Mount preview', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm fusion', exact: true }).click();
  await expect
    .poll(() => benchSnapshot(page).then((state) => state.carrier.mode))
    .toBe('emitter');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  await page.mouse.move(
    box.x + (600 / 960) * box.width,
    box.y + (240 / 480) * box.height,
  );
  await page.mouse.down();
  await expect
    .poll(
      () =>
        benchSnapshot(page).then(
          (state) => state.projectiles.filter((shot) => shot.faction === 'player').length,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const state = await benchSnapshot(page);
  await page.mouse.up();
  const shot = state.projectiles.find((entry) => entry.faction === 'player');
  expect(shot).toBeDefined();
  if (!shot) {
    return;
  }
  const originToCarrier = Math.hypot(shot.originX - state.carrier.x, shot.originY - state.carrier.y);
  // Deterministic allowance: the emitter car moves at most 4 units per tick,
  // so 12 ticks of poll/render drift after the firing tick stays within 48 units.
  expect(originToCarrier).toBeLessThanOrEqual(48);
  const originToPlayer = Math.hypot(shot.originX - state.player.x, shot.originY - state.player.y);
  expect(originToCarrier).toBeLessThan(originToPlayer);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('late pickup, recall, doorway transfer, restarts, and return clean up', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchBench(page);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'Confirm fusion', exact: true }).click();
  await expect
    .poll(() => benchSnapshot(page).then((state) => state.carrier.mode))
    .toBe('emitter');
  await page.getByRole('button', { name: 'Acquire late pickup', exact: true }).click();
  await expect(page.getByTestId('bench-hud')).toContainText('Gel Pen');
  await page.keyboard.press('r');
  await expect(page.getByTestId('bench-hud')).toContainText('Recall');
  await page.keyboard.down('d');
  await expect
    .poll(() => benchSnapshot(page).then((state) => state.activeRoom), { timeout: 20_000 })
    .toBe('test_bay');
  await page.keyboard.up('d');
  await expect(page.getByTestId('bench-hud')).toContainText('test bay');
  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Restart bench', exact: true }).click();
  }
  const restarted = await benchSnapshot(page);
  expect(restarted.generation).toBeGreaterThanOrEqual(11);
  expect(restarted.preview).toBeNull();
  expect(restarted.cash).toBe(10);
  expect(restarted.revision).toBe(0);
  expect(restarted.activeRoom).toBe('service');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Void the Warranty', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void the Warranty', exact: true })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('at 1440x900 canvas and HUD share the viewport without horizontal overflow', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await launchBench(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#bench-hud')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 1440);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('at 800x600 the viewport stays exact and HUD scrolls to every control', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchBench(page);
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(viewportWidth).toBe(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 800);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press('e');
  await expect(
    page.getByRole('heading', { name: 'Emitter Mount preview', exact: true }),
  ).toBeVisible();
  for (const name of [
    'Clean soaker',
    'Stolen popper',
    'Unsupported mop',
    'Confirm fusion',
    'Cancel fusion',
    'Acquire late pickup',
    'Restart bench',
    'Return to title',
  ]) {
    const control = page.getByRole('button', { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
  }
  const scrolledOverflow = await page.evaluate(() => document.documentElement.scrollWidth - 800);
  expect(scrolledOverflow).toBeLessThanOrEqual(0);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
