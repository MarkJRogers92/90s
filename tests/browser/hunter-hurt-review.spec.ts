import { expect, test, type Page } from '@playwright/test';
import type { MvpRunDebugSnapshot } from '../../src/debug/DebugBridge';
import { worldToCanvas } from './projection';

const snapshot = (page: Page) => page.evaluate(() => window.__DEAD_MALL_DEBUG__?.snapshot() as MvpRunDebugSnapshot | undefined);

/** Review-only capture. A real catalog laser shot lands outside the charge range.
 * The browser clock is stepped, not combat state: no debug damage or pose override.
 * Pausing between steps preserves the actual rendered frames for screenshots.
 */
test('Bargain Hunter displays all four west hurt frames after a real pursue-phase hit', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [], externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.goto('/?seed=1&fixture=mvp-hunter-hurt');
  await expect(page.getByRole('button', { name: 'Night Shift', exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-04T00:10:00Z'));
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click({ force: true });
  let state: MvpRunDebugSnapshot | undefined;
  for (let attempt = 0; attempt < 3000; attempt++) {
    await page.clock.runFor(16);
    state = await snapshot(page);
    if (state?.actorPresentation?.enemies.some((enemy) => enemy.kind === 'shopper')) break;
  }
  expect(state?.mode).toBe('run');
  expect(state!.tick).toBeLessThan(20);
  const hunter = state!.enemies.find((enemy) => enemy.kind === 'shopper')!;
  expect(hunter).toMatchObject({ health: 18, phase: 'pursue', chargeTicks: 0 });
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  const aim = await worldToCanvas(page, hunter.x, hunter.y);
  await page.mouse.move(box!.x + aim.x, box!.y + aim.y);
  await page.screenshot({ path: testInfo.outputPath('before-hit.png') });
  await page.mouse.down();
  await page.clock.runFor(17);
  await page.mouse.up();

  const seen = new Set<number>();
  const frames: Array<{ tick: number; health: number; phase: string; chargeTicks: number; textureKey: string; row: number; column: number }> = [];
  let hitObserved = false;
  for (let step = 0; step < 120; step++) {
    await page.clock.runFor(16);
    const current = (await snapshot(page))!;
    const enemy = current.enemies.find((value) => value.id === hunter.id)!;
    const actor = current.actorPresentation?.enemies.find((value) => value.id === `enemy:${hunter.id}`);
    if (enemy.health < hunter.health) hitObserved = true;
    if (!actor?.textureKey.endsWith('shopper-hurt')) continue;
    expect(enemy).toMatchObject({ health: 17, phase: 'pursue', chargeTicks: 0 });
    expect(actor.frame.row).toBe(2);
    frames.push({ tick: current.tick, health: enemy.health, phase: enemy.phase, chargeTicks: enemy.chargeTicks, textureKey: actor.textureKey, ...actor.frame });
    if (!seen.has(actor.frame.column)) {
      seen.add(actor.frame.column);
      const path = testInfo.outputPath(`west-hurt-${actor.frame.column}.png`);
      await page.screenshot({ path });
      await testInfo.attach(`west hurt frame ${actor.frame.column}`, { path, contentType: 'image/png' });
    }
    if (seen.size === 4) break;
  }
  await testInfo.attach('live-hurt-evidence', { body: JSON.stringify({ hitObserved, frames, errors, externalRequests }, null, 2), contentType: 'application/json' });
  expect(hitObserved).toBe(true);
  expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
