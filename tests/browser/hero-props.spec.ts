import { expect, test, type Page } from '@playwright/test';

/**
 * Round 53: a regular fight has props to knock over, and a hero fusion's
 * move shows up the moment it is used.
 */
type Snapshot = {
  tick: number;
  props: Array<{ kind: string; x: number; y: number; state: string }>;
  hero: { records: string[]; decoy: boolean; beams: number; beamCooldown: number } | null;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

async function start(page: Page, hero: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/?fixture=mvp-hero&hero=${hero}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
  return errors;
}

/** Holds the mouse down over the canvas for a moment: one attack. */
async function attack(page: Page): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

test('the food court has all three props, and Greatest Hits builds an orbit of records', async ({ page }) => {
  const errors = await start(page, 'greatest_hits');
  const first = await snapshot(page);
  expect(first.props.map((prop) => prop.kind).sort()).toEqual(['cart', 'rack', 'soda']);
  expect(first.props.every((prop) => prop.state === 'standing')).toBe(true);
  await attack(page);
  await expect.poll(() => snapshot(page).then((state) => state.hero?.records.length ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/neon-overhaul/hero-greatest-hits.png' });
  expect(errors).toEqual([]);
});

test('Movie Night throws its projector beam on the first attack', async ({ page }) => {
  const errors = await start(page, 'movie_night');
  await attack(page);
  await expect.poll(() => snapshot(page).then((state) => state.hero?.beamCooldown ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Comedy Hour throws its chicken on the first attack', async ({ page }) => {
  const errors = await start(page, 'comedy_hour');
  await attack(page);
  await expect.poll(() => snapshot(page).then((state) => state.hero?.decoy ?? false)).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/neon-overhaul/hero-comedy-hour.png' });
  expect(errors).toEqual([]);
});
