import { expect, test, type Page } from '@playwright/test';
import { worldToCanvas } from './projection';
import { PROP_TEST_ASSETS } from '../../src/game/presentation/propTestAssets';
import { walkTo } from './keyboardNavigation';

type ImageEvidence = { id: string; texture: string; x: number; y: number; originX: number; originY: number; scaleX: number; scaleY: number; depth: number; alpha: number; effectFrame: number | null };
type Snapshot = { generation: number; tick: number; roomIndex: number; player: { x: number; y: number }; props: Array<{ kind: string; x: number; y: number; state: string; brokenTick?: number }>; presentation: { propImages: ImageEvidence[] }; presentationLoadFailures: number };
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => window.__DEAD_MALL_DEBUG__!.snapshot() as unknown as Snapshot);

test('three exact sprite pairs break once, collide, sort, clean up and reset through real input', async ({ page }) => {
  // Three props, each walked around in short overshoot-safe key pulses (keyboardNavigation.ts):
  // ~2.7 min serially in a cloud container, so 90 s always timed out.
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?fixture=mvp-prop-test&seed=1');
  await page.evaluate(() => localStorage.setItem('dead-mall:mvp-checkpoint:v1', 'keep-existing-checkpoint'));
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  const first = await snapshot(page);
  expect(first.props.map((prop) => prop.kind)).toEqual(['bakery', 'monitors', 'slush']);
  expect(first.presentationLoadFailures).toBe(0);
  await page.waitForTimeout(4500); // Let the ordinary arrival title fade before the review capture.
  await page.screenshot({ path: 'artifacts/prop-test-room/intact.png' });
  const effects = ['glass-break', 'machine-chip', 'soda-rupture'];
  for (let index = 0; index < first.props.length; index++) {
    const prop = first.props[index]!;
    // Approach from south, walk into its footprint, then swing the actual mop.
    await walkTo(page, prop.x, prop.y + 60);
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    const blocked = await snapshot(page);
    expect(blocked.player.y).toBeGreaterThanOrEqual(prop.y + 10);
    const intact = blocked.presentation.propImages.find((image) => image.id === `prop:${index + 1}`)!;
    expect(intact).toMatchObject({ x: prop.x, y: prop.y, originX: 0.5, originY: 1, scaleX: 1, scaleY: 1, alpha: 1 });
    const point = await worldToCanvas(page, prop.x, prop.y - 6);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + point.x, box.y + point.y);
    await page.mouse.down();
    const handle = await page.waitForFunction((i) => {
      const state = window.__DEAD_MALL_DEBUG__!.snapshot() as unknown as Snapshot;
      return state.props[i]?.state === 'broken' && state.presentation.propImages.some((image) => image.id === `prop-fx:${i + 1}`) ? state : false;
    }, index);
    const broken = await handle.jsonValue() as Snapshot;
    await handle.dispose();
    const damaged = broken.presentation.propImages.find((image) => image.id === `prop:${index + 1}`)!;
    expect(damaged).toMatchObject({ x: intact.x, y: intact.y, originX: intact.originX, originY: intact.originY, scaleX: 1, scaleY: 1, depth: intact.depth });
    expect(damaged.texture).toContain('damaged');
    const effect = broken.presentation.propImages.find((image) => image.id === `prop-fx:${index + 1}`)!;
    expect(effect.texture).toContain(effects[index]);
    expect(effect.depth).toBeGreaterThan(damaged.depth);
    await page.screenshot({ path: `artifacts/prop-test-room/${prop.kind}-break.png` });
    // Keep swinging: no second break timestamp or respawned burst.
    await page.waitForTimeout(850);
    await page.mouse.up();
    const repeated = await snapshot(page);
    expect(repeated.props[index]?.brokenTick).toBe(broken.props[index]?.brokenTick);
    expect(repeated.presentation.propImages.some((image) => image.id === `prop-fx:${index + 1}`)).toBe(false);
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    expect((await snapshot(page)).player.y).toBeGreaterThanOrEqual(prop.y + 10);
    // Walk around the prop; behind it the normal occlusion fade makes the body readable.
    await walkTo(page, prop.x + 75, prop.y + 60);
    await walkTo(page, prop.x + 75, prop.y - 80);
    await walkTo(page, prop.x, prop.y - 80);
    await page.keyboard.down('s');
    await page.waitForTimeout(550);
    await page.keyboard.up('s');
    const behind = await snapshot(page);
    expect(behind.presentation.propImages.find((image) => image.id === `prop:${index + 1}`)!.alpha).toBeLessThan(0.6);
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    await walkTo(page, prop.x + 75, prop.y - 80);
    await walkTo(page, prop.x + 75, prop.y + 60);
  }
  await page.screenshot({ path: 'artifacts/prop-test-room/damaged.png' });
  // Use the ordinary east doorway, then return. Room-local props rebuild intact.
  await walkTo(page, 910, 240);
  await page.keyboard.down('d');
  await expect.poll(() => snapshot(page).then((s) => s.roomIndex)).toBe(1);
  await page.keyboard.up('d');
  expect((await snapshot(page)).presentation.propImages).toHaveLength(0);
  await page.keyboard.down('a');
  await expect.poll(() => snapshot(page).then((s) => s.roomIndex)).toBe(0);
  await page.keyboard.up('a');
  expect((await snapshot(page)).props.every((prop) => prop.state === 'standing')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('dead-mall:mvp-checkpoint:v1'))).toBe('keep-existing-checkpoint');
  const generation = (await snapshot(page)).generation;
  await page.keyboard.press('r');
  await expect.poll(() => snapshot(page).then((s) => s.generation)).toBe(generation + 1);
  expect((await snapshot(page)).props.map((prop) => prop.kind)).toEqual(['bakery', 'monitors', 'slush']);
  expect((await snapshot(page)).props.every((prop) => prop.state === 'standing')).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  expect((await snapshot(page)).props.every((prop) => prop.state === 'standing')).toBe(true);
  expect(errors).toEqual([]);
});

test('ordinary Night Shift keeps its opening room and preloads the approved normal-room art', async ({ page }) => {
  const testAssets: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/assets/prop-test/')) testAssets.push(request.url()); });
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  expect((await snapshot(page)).props.some((prop) => ['bakery', 'monitors', 'slush'].includes(prop.kind))).toBe(false);
  expect([...new Set(testAssets.map((url) => new URL(url).pathname))].sort()).toEqual(PROP_TEST_ASSETS.map((asset) => asset.url).sort());
  expect((await snapshot(page)).presentationLoadFailures).toBe(0);
});
