import { expect, test, type Page } from '@playwright/test';
import { worldToCanvas } from './projection';

/**
 * Round 57: a Volatile elite lights a fuse where it falls, the ring is on screen
 * while it burns, and the blast hurts a janitor who stays inside it. The unit
 * tests cover the rule; this is the browser proof that it reaches the player.
 */
type Snapshot = {
  tick: number;
  player: { health: number };
  enemies: Array<{ id: number; x: number; y: number; health: number }>;
  bursts: Array<{ x: number; y: number; fuseTicks: number }>;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

test('a Volatile elite lights a fuse where it falls, and the blast hurts a janitor who stays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?fixture=mvp-volatile&seed=7');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);

  const before = await snapshot(page);
  expect(before.enemies).toHaveLength(1);
  expect(before.bursts).toHaveLength(0);
  const health = before.player.health;

  // One swing at the elite, with the real mouse.
  const box = (await page.locator('canvas').boundingBox())!;
  const point = await worldToCanvas(page, before.enemies[0]!.x, before.enemies[0]!.y);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();

  // The fuse (0.6 s) is lit where it fell; catch it on screen.
  await page.waitForFunction(
    () => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot().bursts.length > 0,
    null,
    { polling: 'raf', timeout: 3000 },
  );
  await page.screenshot({ path: 'artifacts/neon-overhaul/volatile-burst.png' });

  // Standing 40 px from the blast, the janitor loses one health when it goes off.
  await expect.poll(() => snapshot(page).then((state) => state.player.health), { timeout: 5000 }).toBe(health - 1);
  expect((await snapshot(page)).bursts).toHaveLength(0);
  expect(errors).toEqual([]);
});
