import { expect, test, type Page } from '@playwright/test';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { roomStores, storeEntrance } from '../../src/sim/run/storeInterior';
import type { MvpRunState } from '../../src/sim/run/types';
import type { MvpRunDebugSnapshot } from '../../src/debug/DebugBridge';
import { walkTo } from './keyboardNavigation';
import { worldToCanvas } from './projection';
import { roomBoundaryCheckpoint } from './roomBoundaryCheckpoint';

const snapshot = (page: Page) => page.evaluate(() => {
  const state = window.__DEAD_MALL_DEBUG__!.snapshot() as MvpRunDebugSnapshot;
  if (!state.presentation) throw new Error('Normal run presentation is not ready');
  return { ...state, presentation: state.presentation };
});

/** Resume a genuine room-boundary save through the ordinary Continue button.
 * No fixture query or live-game state writes are used by this normal-route gate. */
async function resume(page: Page, run: MvpRunState): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript((checkpoint) => localStorage.setItem('dead-mall:mvp-checkpoint:v1', checkpoint), JSON.stringify(roomBoundaryCheckpoint(run)));
  await page.goto(`/?seed=${run.seed}`);
  await expect(page.getByRole('button', { name: 'Continue run', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue run', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.__DEAD_MALL_DEBUG__?.snapshot();
    return state?.mode === 'run' && state.presentation !== null;
  });
  expect((await snapshot(page)).presentationLoadFailures).toBe(0);
  return errors;
}

function shopBoundary(storeId: string): { run: MvpRunState; index: number } {
  for (const part of [undefined, 1] as const) for (let seed = 1; seed <= 40; seed++) {
    const run = createMvpRun(seed, part ? { part } : {});
    const roomIndex = run.wing.rooms.findIndex((room) => roomStores(room).some((store) => store.templateId === storeId));
    if (roomIndex < 0) continue;
    moveToRoom(run, roomIndex, 'west');
    return { run, index: roomStores(run.wing.rooms[roomIndex]!).findIndex((store) => store.templateId === storeId) };
  }
  throw new Error(`No normal store boundary for ${storeId}`);
}

for (const [storeId, kind] of [['slice-station', 'bakery'], ['candy-cauldron', 'slush']] as const) {
  test(`${kind} renders, breaks and clears through ordinary ${storeId} doorways`, async ({ page }) => {
    test.setTimeout(90_000);
    const { run, index } = shopBoundary(storeId);
    const errors = await resume(page, run);
    expect((await snapshot(page)).props).toHaveLength(0);
    const entrance = storeEntrance(index);
    await walkTo(page, entrance.x, 64);
    await page.keyboard.press('w', { delay: 500 });
    await expect.poll(() => snapshot(page).then((state) => state.props.map((prop) => prop.kind))).toEqual([kind]);
    await page.waitForTimeout(4500);
    const first = await snapshot(page), prop = first.props[0]!;
    const image = first.presentation.propImages.find((entry) => entry.id === 'prop:1')!;
    expect(image).toMatchObject({ x: prop.x, y: prop.y, originX: 0.5, originY: 1, scaleX: 1, scaleY: 1 });
    await page.screenshot({ path: `artifacts/normal-props/${kind}-intact.png` });
    await walkTo(page, prop.x, prop.y - 45);
    const target = await worldToCanvas(page, prop.x, prop.y - 6);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.mouse.down();
    await expect.poll(() => snapshot(page).then((state) => state.props[0]?.state)).toBe('broken');
    await page.mouse.up();
    const broken = await snapshot(page);
    expect(broken.presentation.propImages.find((entry) => entry.id === 'prop:1')).toMatchObject({ x: image.x, y: image.y, originX: image.originX, originY: image.originY, scaleX: 1, scaleY: 1, depth: image.depth });
    expect(broken.presentation.propImages.find((entry) => entry.id === 'prop:1')!.texture).toContain('damaged');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/normal-props/${kind}-damaged.png` });
    await walkTo(page, 480, prop.y - 45);
    await walkTo(page, 480, 330);
    await page.keyboard.press('s', { delay: 550 });
    await expect.poll(() => snapshot(page).then((state) => state.props.length)).toBe(0);
    expect((await snapshot(page)).presentation.propImages).toHaveLength(0);
    await walkTo(page, entrance.x, 64);
    await page.keyboard.press('w', { delay: 500 });
    await expect.poll(() => snapshot(page).then((state) => state.props[0]?.state)).toBe('standing');
    expect(errors).toEqual([]);
  });
}

test('normal Security Office checkpoint renders one native monitor bank', async ({ page }) => {
  const run = createMvpRun(7);
  moveToRoom(run, 5, 'west');
  const errors = await resume(page, run);
  const state = await snapshot(page);
  expect(state.roomId).toBe('security_office');
  expect(state.props.map((prop) => prop.kind)).toEqual(['monitors']);
  expect(state.presentation.propImages.find((entry) => entry.id === 'prop:1')).toMatchObject({ x: 550, y: 60, originX: 0.5, originY: 1, scaleX: 1, scaleY: 1 });
  // Capture the live room before the pause card covers the monitor bank.
  await page.screenshot({ path: 'artifacts/normal-props/monitors-intact.png' });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
