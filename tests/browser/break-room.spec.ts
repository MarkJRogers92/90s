import { expect, test, type Page } from '@playwright/test';

/**
 * The Break Room: Pay Stubs earned on shift buy perks and locker weapons on
 * the title screen, the next shift starts with them, and cleared floors are
 * pinned to the Employee of the Month wall.
 */
const CAREER_KEY = 'dead-mall:career:v1';

type Snapshot = {
  status: 'playing' | 'won' | 'dead';
  tick: number;
  cash: number;
  roomIndex: number;
  player: { health: number };
  enemies: Array<{ kind: string }>;
  inventory: { inventory: Array<{ instanceId: string; itemDefinitionId: string }>; selectedPrimaryInstanceId?: string };
};

function collectErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const errors = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text());
  });
  return errors;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): Snapshot } }).__DEAD_MALL_DEBUG__.snapshot());
}

async function career(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown> | null, CAREER_KEY);
}

async function startShift(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

test('stubs buy a perk and a locker weapon, and the next shift starts with both', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=11');
  // Baseline: what this mall hands a janitor with no perks.
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, stubs: 0 })), CAREER_KEY);
  await startShift(page);
  const plain = await snapshot(page);
  await page.goto('/?seed=11');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, stubs: 40 })), CAREER_KEY);
  await page.reload();

  await expect(page.getByRole('button', { name: 'Break Room · 40 stubs' })).toBeVisible();
  await page.getByRole('button', { name: /Break Room/ }).click();
  const room = page.getByRole('dialog', { name: 'Break Room' });
  await expect(room).toBeVisible();
  await room.getByRole('button', { name: /Enroll in SENIORITY for 6 pay stubs/ }).click();
  await room.getByRole('button', { name: /Buy PUMP-ACTION SOAKER for 8 pay stubs/ }).click();
  await expect(room.getByRole('status')).toContainText('in your locker');
  await expect(room.getByRole('button', { name: 'In hand' })).toBeVisible();
  expect(await career(page)).toMatchObject({ stubs: 26, perks: { seniority: 1 }, lockerEquipped: 'pump_soaker' });
  await page.screenshot({ path: 'artifacts/neon-overhaul/break-room.png' });
  await page.keyboard.press('Escape');
  await expect(room).toBeHidden();

  await startShift(page);
  const perked = await snapshot(page);
  expect(perked.cash).toBe(plain.cash + 5);
  expect(perked.inventory.inventory.some((node) => node.instanceId === 'mvp-locker-item' && node.itemDefinitionId === 'pump_soaker')).toBe(true);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the Dental Plan adds a heart to the run', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 1, perks: { dental: 1 } })), CAREER_KEY);
  await startShift(page);
  expect((await snapshot(page)).player.health).toBe(8);
});

test('a shift that dies still gets paid, with no photo', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?fixture=mvp-last-heart&seed=7');
  await startShift(page);
  await expect.poll(() => snapshot(page).then((state) => state.status), { timeout: 30_000 }).toBe('dead');
  await expect.poll(() => career(page), { timeout: 15_000 }).toMatchObject({ shifts: 1, wall: [] });
  const paid = await career(page);
  expect(Number(paid?.stubs)).toBeGreaterThan(0);
});

test('beating the Mall Manager pins up the first Employee of the Month', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?fixture=mvp-floor-two-boss-win&seed=4242');
  await startShift(page);
  await expect.poll(() => snapshot(page).then((state) => state.enemies.some((enemy) => enemy.kind === 'manager'))).toBe(true);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  for (let swing = 0; swing < 16 && (await snapshot(page)).status !== 'won'; swing += 1) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(160);
  }
  expect((await snapshot(page)).status).toBe('won');

  // The card settles the night: a clock-out is paid in full and photographed.
  await expect.poll(() => career(page), { timeout: 40_000, intervals: [500] }).toMatchObject({ shifts: 1, clockOuts: 1, floorClears: 1 });
  const record = await career(page);
  expect(Number(record?.stubs)).toBeGreaterThanOrEqual(20);
  expect((record?.wall as unknown[]).length).toBe(1);
  // Let the card finish counting up, then keep it as evidence.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'artifacts/neon-overhaul/break-room-card.png' });

  await page.keyboard.press('KeyT');
  await expect(page.getByRole('button', { name: 'Night Shift', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Break Room/ }).click();
  const room = page.getByRole('dialog', { name: 'Break Room' });
  await expect(room.locator('.br-polaroid.is-best')).toHaveCount(1);
  await expect(room.locator('.br-polaroid.is-best')).toContainText('CLOCKED OUT');
  await expect(room.locator('.br-plaque')).toContainText('ALEX');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
