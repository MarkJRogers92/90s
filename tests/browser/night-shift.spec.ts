import { expect, test, type Page } from '@playwright/test';

type RunSnapshot = {
  mode: 'run';
  generation: number;
  tick: number;
  paused: boolean;
  status: 'playing' | 'won' | 'dead';
  seed: number;
  roomIndex: number;
  roomId: string;
  cash: number;
  heat: number;
  suspicion: number;
  player: { x: number; y: number; health: number };
  enemies: Array<{ id: number; kind: string; x: number; y: number; health: number }>;
  carried: unknown[];
  inventory: {
    inventory: Array<{
      kind: string;
      instanceId: string;
      itemDefinitionId: string;
      acquisitionKind?: 'purchased' | 'stolen';
    }>;
    cash: number;
    revision: number;
  };
  checkpoint: null | { roomIndex: number; tick: number };
  summary: null | { status: 'won' | 'dead'; roomIndex: number; cash: number; heat: number };
  recentChange: string;
  behaviorTrace: string[];
};

const CHECKPOINT_KEY = 'dead-mall:mvp-checkpoint:v1';

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

async function runSnapshot(page: Page): Promise<RunSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): RunSnapshot } }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function launchRun(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await waitForRun(page);
}

/** Waits until the run scene, its HUD, and the development bridge are live. */
async function waitForRun(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#mvp-run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => runSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function offerTexts(page: Page): Promise<string[]> {
  return page.locator('#mvp-run-offers li').allInnerTexts();
}

test('launches Night Shift with one canvas, one HUD, and the service corridor', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchRun(page);

  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('mvp-run-hud')).toHaveCount(1);

  const state = await runSnapshot(page);
  expect(state.mode).toBe('run');
  expect(state.roomIndex).toBe(0);
  expect(state.roomId).toBe('service_corridor');
  expect(state.status).toBe('playing');
  expect(state.cash).toBe(30);
  expect(state.checkpoint).toEqual({ roomIndex: 0, tick: 0 });

  await expect(page.locator('#mvp-run-cash')).toContainText('$30');
  await expect(page.locator('#mvp-run-seed')).toContainText(`seed ${state.seed}`);
  await expect(page.locator('#mvp-run-room')).toContainText('Service Corridor');
  await expect(page.locator('#mvp-run-checkpoint')).toContainText('saved');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('offers are identical for one seed and vary across seeds', async ({ page }) => {
  const errors = collectErrors(page);

  await launchRun(page, '/?fixture=mvp-storefront&seed=4242');
  const first = await offerTexts(page);
  expect(first.length).toBeGreaterThan(0);
  expect((await runSnapshot(page)).seed).toBe(4242);

  await launchRun(page, '/?fixture=mvp-storefront&seed=4242');
  expect(await offerTexts(page)).toEqual(first);

  const otherSeedOffers: string[][] = [];
  for (const seed of [7, 99, 2024]) {
    await launchRun(page, `/?fixture=mvp-storefront&seed=${seed}`);
    otherSeedOffers.push(await offerTexts(page));
  }
  expect(otherSeedOffers.some((offers) => offers.join('|') !== first.join('|'))).toBe(true);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real keyboard purchase spends cash and records purchased provenance', async ({ page }) => {
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront');

  const before = await runSnapshot(page);
  const nearby = await page.locator('#mvp-run-nearby').innerText();
  expect(nearby).toMatch(/\$\d+/);
  await page.keyboard.press('e');

  await expect
    .poll(() => runSnapshot(page).then((state) => state.inventory.inventory.length))
    .toBeGreaterThan(before.inventory.inventory.length);

  const after = await runSnapshot(page);
  expect(after.cash).toBeLessThan(before.cash);
  expect(after.inventory.inventory.at(-1)?.acquisitionKind).toBe('purchased');
  await expect(page.locator('#mvp-run-cash')).toContainText(`$${after.cash}`);
  await expect(page.locator('#mvp-run-inventory')).toContainText('purchased');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real keyboard theft secures at the store exit and raises Heat', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront');

  await page.keyboard.press('f');
  await expect.poll(() => runSnapshot(page).then((state) => state.carried.length)).toBe(1);
  await expect(page.locator('#mvp-run-carried')).toContainText('CARRIED');

  const heatBefore = (await runSnapshot(page)).heat;
  await page.keyboard.down('s');
  await expect
    .poll(() => runSnapshot(page).then((state) => state.carried.length), { timeout: 30_000 })
    .toBe(0);
  await page.keyboard.up('s');

  const secured = await runSnapshot(page);
  expect(secured.heat).toBe(heatBefore + 15);
  expect(
    secured.inventory.inventory.some((entry) => entry.acquisitionKind === 'stolen'),
  ).toBe(true);
  await expect(page.locator('#mvp-run-heat')).toContainText(`HEAT ${secured.heat}`);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Continue run resumes the saved seed and boundary', async ({ page }) => {
  const errors = collectErrors(page);
  await launchRun(page, '/?seed=818');
  const launched = await runSnapshot(page);

  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeVisible();
  const continueButton = page.getByRole('button', { name: 'Continue run', exact: true });
  await expect(continueButton).toBeEnabled();

  await continueButton.click();
  await waitForRun(page);
  const resumed = await runSnapshot(page);
  expect(resumed.seed).toBe(launched.seed);
  expect(resumed.roomIndex).toBe(launched.checkpoint?.roomIndex ?? 0);
  expect(resumed.status).toBe('playing');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('an invalid checkpoint disables Continue run and never breaks startup', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"version":99,"seed":"nope"}'),
    CHECKPOINT_KEY,
  );
  await page.reload();

  await expect(page.getByRole('button', { name: 'Continue run', exact: true })).toBeDisabled();
  await launchRun(page);
  expect((await runSnapshot(page)).status).toBe('playing');
  await expect(page.locator('#mvp-run-hud')).toBeVisible();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('ten restarts keep one canvas, one HUD, and a clean run', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page);

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  }

  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('mvp-run-hud')).toHaveCount(1);
  const state = await runSnapshot(page);
  expect(state.generation).toBe(11);
  expect(state.status).toBe('playing');
  expect(state.roomIndex).toBe(0);
  expect(state.cash).toBe(30);
  expect(state.summary).toBeNull();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the security office spawns the Loss Prevention Manager', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-boss-entry&seed=5150');

  await expect
    .poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('security_office');
  const state = await runSnapshot(page);
  expect(state.enemies.some((enemy) => enemy.kind === 'lp_manager')).toBe(true);
  await expect(page.locator('#mvp-run-boss')).toBeVisible();
  await expect(page.locator('#mvp-run-boss')).toContainText(/BOSS: phase [123]/);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
