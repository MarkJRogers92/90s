import { expect, test, type Page } from '@playwright/test';
import { aimPointFor, cameraScrollFor } from '../../src/game/view/viewport';

type LifecycleSnapshot = {
  generation: number;
  tick: number;
  status: 'playing' | 'won' | 'dead';
  player: { x: number; y: number; health: number; attackCooldownTicks: number };
  enemies: Array<{
    id: number;
    kind: 'hanger' | 'spitter';
    x: number;
    y: number;
    health: number;
  }>;
};

async function snapshot(page: Page): Promise<LifecycleSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as {
        __DEAD_MALL_DEBUG__: { snapshot(): LifecycleSnapshot };
      }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function defeatEnemy(page: Page, kind: 'hanger' | 'spitter'): Promise<void> {
  await expect
    .poll(() => snapshot(page).then((state) => state.player.attackCooldownTicks))
    .toBe(0);
  const before = await snapshot(page);
  const target = before.enemies.find((enemy) => enemy.kind === kind);
  expect(target).toBeDefined();
  if (!target) {
    return;
  }

  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  // Aim along the direction to the target: the camera window is smaller than the
  // room, so the enemy itself may not be clickable.
  const scroll = cameraScrollFor(before.player.x, before.player.y);
  const point = aimPointFor(before.player, target, scroll, box.width, box.height);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await expect
    .poll(() => snapshot(page).then((state) => state.enemies.some((enemy) => enemy.id === target.id)))
    .toBe(false);
  await page.mouse.up();
}

test('ten real UI restarts restore and replay a fresh two-enemy encounter', async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?fixture=restart-proof');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));

  for (let generation = 1; generation <= 10; generation += 1) {
    await expect.poll(() => snapshot(page).then((state) => state.generation)).toBe(generation);
    const fresh = await snapshot(page);
    expect(fresh.status).toBe('playing');
    expect(fresh.player.health).toBe(6);
    expect(fresh.enemies).toHaveLength(2);
    expect(fresh.enemies.map((enemy) => enemy.health)).toEqual([4, 4]);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.getByTestId('run-hud').count()).toBe(1);

    await defeatEnemy(page, 'hanger');
    await defeatEnemy(page, 'spitter');
    await expect(page.getByText('Shift complete', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart shift', exact: true })).toBeVisible();
    expect((await snapshot(page)).status).toBe('won');

    if (generation < 10) {
      await page.getByRole('button', { name: 'Restart shift', exact: true }).click();
    }
  }

  expect(pageErrors).toEqual([]);
});

test('a lost shift restarts into a full-health live encounter on one scene surface', async ({ page }) => {
  await page.goto('/?fixture=death-proof');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));

  await expect(page.getByText('Shift ended', { exact: true })).toBeVisible();
  expect((await snapshot(page)).status).toBe('dead');
  await page.getByRole('button', { name: 'Restart shift', exact: true }).click();

  await expect.poll(() => snapshot(page).then((state) => state.generation)).toBe(2);
  const fresh = await snapshot(page);
  expect(fresh.status).toBe('playing');
  expect(fresh.player.health).toBe(6);
  expect(fresh.enemies).toHaveLength(2);
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
});
