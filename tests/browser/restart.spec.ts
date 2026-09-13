import { expect, test } from '@playwright/test';

type LifecycleSnapshot = {
  generation: number;
  tick: number;
  status: 'playing' | 'won' | 'dead';
  player: { health: number };
  enemies: Array<{ id: number }>;
};

test('ten real UI restarts reuse one scene surface and create fresh run state', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?fixture=restart-proof');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();

  for (let generation = 1; generation <= 10; generation += 1) {
    await expect(page.getByText('Shift complete', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart shift', exact: true })).toBeVisible();

    const snapshot = await page.evaluate(() => {
      const debug = (
        window as unknown as {
          __DEAD_MALL_DEBUG__: { snapshot(): LifecycleSnapshot };
        }
      ).__DEAD_MALL_DEBUG__;
      return debug.snapshot();
    });
    expect(snapshot.generation).toBe(generation);
    expect(snapshot.status).toBe('won');
    expect(snapshot.player.health).toBe(6);
    expect(snapshot.enemies).toHaveLength(0);
    expect(snapshot.tick).toBeLessThanOrEqual(5);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.getByTestId('run-hud').count()).toBe(1);

    if (generation < 10) {
      await page.getByRole('button', { name: 'Restart shift', exact: true }).click();
    }
  }

  expect(pageErrors).toEqual([]);
});
