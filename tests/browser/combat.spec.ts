import { expect, test, type Page } from '@playwright/test';

type DebugSnapshot = {
  tick: number;
  paused: boolean;
  status: 'playing' | 'won' | 'dead';
  player: {
    x: number;
    y: number;
    health: number;
    attackCooldownTicks: number;
    attackActiveTicks: number;
  };
  enemies: Array<{ id: number; kind: 'hanger' | 'spitter'; health: number; phase: string }>;
  projectiles: Array<{ id: number }>;
};

async function startShift(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('run-hud')).toBeVisible();
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function snapshot(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as {
        __DEAD_MALL_DEBUG__: { snapshot(): DebugSnapshot };
      }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

test('real keyboard input moves the authoritative visible run', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startShift(page);

  const before = await snapshot(page);
  await page.keyboard.down('d');
  await expect.poll(() => snapshot(page).then((state) => state.player.x)).toBeGreaterThan(
    before.player.x + 5,
  );
  await page.keyboard.up('d');

  expect(pageErrors).toEqual([]);
});

test('real pointer input aims and starts one mop cooldown', async ({ page }) => {
  await startShift(page);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect
    .poll(() => snapshot(page).then((state) => state.player.attackCooldownTicks))
    .toBeGreaterThan(0);
  await page.mouse.up();
});

test('Escape and blur pause without replaying held input or a time backlog', async ({ page }) => {
  await startShift(page);
  await page.keyboard.down('d');
  await expect.poll(() => snapshot(page).then((state) => state.player.x)).toBeGreaterThan(185);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => snapshot(page).then((state) => state.paused)).toBe(true);
  const paused = await snapshot(page);
  await page.waitForTimeout(150);
  const stillPaused = await snapshot(page);
  expect(stillPaused.tick).toBe(paused.tick);
  expect(stillPaused.player.x).toBe(paused.player.x);

  await page.keyboard.up('d');
  await page.bringToFront();
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Escape');
  await expect.poll(() => snapshot(page).then((state) => state.paused)).toBe(false);
  const resumed = await snapshot(page);
  expect(resumed.tick - paused.tick).toBeLessThanOrEqual(5);

  await page.keyboard.press('Escape');
  await expect.poll(() => snapshot(page).then((state) => state.paused)).toBe(true);
});

test('canvas stays within the resized browser viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await startShift(page);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(800);
  expect(box?.height).toBeLessThanOrEqual(568);
});
