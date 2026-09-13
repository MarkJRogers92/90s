import { expect, test, type Page } from '@playwright/test';

type WingSnapshot = {
  mode: string;
  generation: number;
  tick: number;
  paused: boolean;
  status: 'shopping' | 'left';
  player: { x: number; y: number };
  cash: number;
  startingCash: number;
  heat: number;
  suspicion: number;
  carried: { itemDefinitionId: string; sourceStoreId: string; sourceOfferId: string } | null;
  inventory: Array<{ instanceId: string; itemDefinitionId: string; acquisitionKind: string }>;
  offers: Array<{ id: string; status: string; price: number; itemDefinitionId: string }>;
  recentChange: string;
  behaviorTrace: string[];
  summary: {
    startingCash: number;
    cash: number;
    purchased: Array<{ itemDefinitionId: string }>;
    stolen: Array<{ itemDefinitionId: string }>;
    heat: number;
  } | null;
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

async function wingSnapshot(page: Page): Promise<WingSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): WingSnapshot } }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function launchShop(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Shoplifting Loop', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => wingSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

test('launches the shoplifting loop with one canvas, one HUD, two stores, eight offers', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Shoplifting Loop', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('wing-hud')).toHaveCount(1);
  await expect(page.getByTestId('wing-hud')).toContainText('$30');
  await expect(page.getByTestId('wing-hud')).toContainText('HEAT 0');
  await expect(page.getByText('Homestyle', { exact: true })).toBeVisible();
  await expect(page.getByText('Future Hobby', { exact: true })).toBeVisible();
  expect(await page.getByTestId('wing-offer').count()).toBe(8);
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => wingSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
  const state = await wingSnapshot(page);
  expect(state.cash).toBe(30);
  expect(state.heat).toBe(0);
  expect(state.status).toBe('shopping');
  expect(errors.pageErrors).toEqual([]);
});

test('real keyboard purchase deducts cash and records provenance', async ({ page }) => {
  const errors = collectErrors(page);
  await launchShop(page, '/?fixture=m3-buy-proof');
  const before = await wingSnapshot(page);
  expect(before.cash).toBe(30);
  await expect(page.getByTestId('wing-hud')).toContainText('$30');
  await page.keyboard.press('e');
  await expect
    .poll(() => wingSnapshot(page).then((state) => state.cash))
    .toBeLessThan(before.cash);
  const after = await wingSnapshot(page);
  expect(after.inventory).toHaveLength(1);
  expect(after.inventory[0]?.acquisitionKind).toBe('purchased');
  await expect(page.getByTestId('wing-hud')).toContainText(`$${after.cash}`);
  await expect(page.getByTestId('wing-hud')).toContainText('PURCHASED 1');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real keyboard theft and store exit secures the item and raises Heat', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await launchShop(page, '/?fixture=m3-steal-proof');
  await page.keyboard.press('f');
  await expect.poll(() => wingSnapshot(page).then((state) => state.carried)).not.toBeNull();
  await expect(page.getByTestId('wing-hud')).toContainText('CARRIED');
  const heatBefore = (await wingSnapshot(page)).heat;
  await page.keyboard.down('a');
  await page.waitForTimeout(500);
  await page.keyboard.up('a');
  await page.keyboard.down('s');
  await page.waitForTimeout(2000);
  await page.keyboard.up('s');
  await expect
    .poll(() => wingSnapshot(page).then((state) => state.inventory.length), { timeout: 20_000 })
    .toBe(1);
  const secured = await wingSnapshot(page);
  expect(secured.carried).toBeNull();
  expect(secured.inventory[0]?.acquisitionKind).toBe('stolen');
  expect(secured.heat).toBe(heatBefore + 15);
  await expect(page.getByTestId('wing-hud')).toContainText(`HEAT ${secured.heat}`);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('confiscation raises Heat, restores the offer, and continues the run', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await launchShop(page, '/?fixture=m3-caught-proof');
  await expect.poll(() => wingSnapshot(page).then((state) => state.carried)).not.toBeNull();
  await expect
    .poll(() => wingSnapshot(page).then((state) => state.heat), { timeout: 30_000 })
    .toBe(25);
  const caught = await wingSnapshot(page);
  expect(caught.carried).toBeNull();
  expect(caught.inventory).toHaveLength(0);
  expect(caught.status).toBe('shopping');
  await expect(page.getByTestId('wing-hud')).toContainText('HEAT 25');
  await expect(page.getByTestId('wing-hud')).toContainText('Confiscated');
  const offer = caught.offers.find((candidate) => candidate.id === 'homestyle-mop');
  expect(offer?.status).toBe('available');
  const xBefore = caught.player.x;
  await page.keyboard.down('d');
  await expect
    .poll(() => wingSnapshot(page).then((state) => state.player.x))
    .toBeGreaterThan(xBefore + 5);
  await page.keyboard.up('d');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('mall exit shows an accurate purchased, stolen, cash, and Heat summary', async ({ page }) => {
  const errors = collectErrors(page);
  await launchShop(page, '/?fixture=m3-exit-proof');
  const before = await wingSnapshot(page);
  expect(before.status).toBe('shopping');
  await page.keyboard.press('e');
  await expect.poll(() => wingSnapshot(page).then((state) => state.status)).toBe('left');
  const left = await wingSnapshot(page);
  expect(left.summary).not.toBeNull();
  await expect(page.getByTestId('wing-summary')).toBeVisible();
  await expect(page.getByTestId('wing-summary')).toContainText(`$${left.summary?.cash}`);
  await expect(page.getByTestId('wing-summary')).toContainText(`HEAT ${left.summary?.heat}`);
  expect(left.summary?.purchased.length).toBeGreaterThan(0);
  expect(left.summary?.stolen.length).toBeGreaterThan(0);
  for (const item of left.summary?.purchased ?? []) {
    await expect(page.getByTestId('wing-summary')).toContainText('purchased');
    expect(item.itemDefinitionId.length).toBeGreaterThan(0);
  }
  for (const item of left.summary?.stolen ?? []) {
    await expect(page.getByTestId('wing-summary')).toContainText('stolen');
    expect(item.itemDefinitionId.length).toBeGreaterThan(0);
  }
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('ten restarts keep one canvas, one HUD, and clean state', async ({ page }) => {
  test.setTimeout(90_000);
  collectErrors(page);
  await launchShop(page);
  for (let generation = 1; generation <= 10; generation += 1) {
    await expect.poll(() => wingSnapshot(page).then((state) => state.generation)).toBe(generation);
    const state = await wingSnapshot(page);
    expect(state.status).toBe('shopping');
    expect(state.cash).toBe(30);
    expect(state.heat).toBe(0);
    expect(state.inventory).toHaveLength(0);
    expect(state.carried).toBeNull();
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.getByTestId('wing-hud').count()).toBe(1);
    expect(await page.getByTestId('wing-offer').count()).toBe(8);
    if (generation < 10) {
      await page.getByRole('button', { name: 'Restart loop', exact: true }).click();
    }
  }
});

test('800 by 600 has no overflow and keeps the loop readable', async ({ page }) => {
  collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchShop(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('wing-hud')).toBeVisible();
  await expect(page.getByText('Homestyle', { exact: true })).toBeVisible();
  await expect(page.getByText('Future Hobby', { exact: true })).toBeVisible();
  expect(await page.getByTestId('wing-offer').count()).toBe(8);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('pause and blur clear held input without replaying a backlog', async ({ page }) => {
  collectErrors(page);
  await launchShop(page);
  await page.keyboard.down('d');
  await expect
    .poll(() => wingSnapshot(page).then((state) => state.player.x))
    .toBeGreaterThan(485);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => wingSnapshot(page).then((state) => state.paused)).toBe(true);
  const paused = await wingSnapshot(page);
  await page.waitForTimeout(200);
  const still = await wingSnapshot(page);
  expect(still.tick).toBe(paused.tick);
  expect(still.player.x).toBe(paused.player.x);
  await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  await expect.poll(() => wingSnapshot(page).then((state) => state.paused)).toBe(false);
  const resumedX = (await wingSnapshot(page)).player.x;
  await page.waitForTimeout(200);
  const settled = await wingSnapshot(page);
  expect(Math.abs(settled.player.x - resumedX)).toBeLessThan(8);
});

test('return to title restores the start screen with all actions enabled', async ({ page }) => {
  collectErrors(page);
  await launchShop(page);
  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start shift', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Interaction Lab', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shoplifting Loop', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start shift', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Interaction Lab', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Shoplifting Loop', exact: true })).toBeEnabled();
});

test('M1 Start shift still launches its preserved room', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
});

test('M2 Interaction Lab still launches its preserved panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Interaction Lab', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('run-hud')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Interaction Lab' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
});
