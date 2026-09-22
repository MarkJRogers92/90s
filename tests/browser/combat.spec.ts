import { expect, test, type Page } from '@playwright/test';
import { aimPointFor, cameraScrollFor } from '../../src/game/view/viewport';

type DebugSnapshot = {
  audio: { created: boolean; running: boolean; muted: boolean; played: number } | null;
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
  enemies: Array<{
    id: number;
    kind: 'hanger' | 'spitter';
    x: number;
    y: number;
    health: number;
    phase: string;
  }>;
  projectiles: Array<{ id: number }>;
};

async function startShift(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
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

/**
 * The tick of the first frame observed unpaused, read ATOMICALLY with that
 * observation.
 *
 * Polling for `paused === false` and then taking a separate snapshot leaves the
 * game running between the two calls, so the tick recorded is however many
 * frames elapsed in that gap — which is a property of machine load, not of the
 * pause. Reading the tick from the same evaluation that first sees it unpaused
 * is what makes the backlog assertion deterministic.
 */
async function firstUnpausedState(page: Page): Promise<{ tick: number }> {
  const handle = await page.waitForFunction(() => {
    const debug = (
      window as unknown as {
        __DEAD_MALL_DEBUG__: { snapshot(): { paused: boolean; tick: number } };
      }
    ).__DEAD_MALL_DEBUG__;
    const state = debug.snapshot();
    // An object rather than the bare tick: `waitForFunction` treats 0 as falsy
    // and would keep polling.
    return state.paused ? null : { tick: state.tick };
  });
  return (await handle.jsonValue()) as { tick: number };
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

test('scaled canvas pointer aim damages only the intended enemy', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await startShift(page, '/?fixture=pointer-proof');

  await page.keyboard.down('d');
  await expect.poll(() => snapshot(page).then((state) => state.player.x)).toBeGreaterThan(215);
  await page.keyboard.up('d');

  const before = await snapshot(page);
  const target = before.enemies.find((enemy) => enemy.kind === 'spitter');
  const outsideCone = before.enemies.find((enemy) => enemy.kind === 'hanger');
  expect(target).toBeDefined();
  expect(outsideCone).toBeDefined();
  if (!target || !outsideCone) {
    return;
  }

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  // The camera shows a 640x360 window on a 960x480 room, so the target is often
  // off-screen and unclickable. Aim is a direction, so click a short reach along
  // the player-to-target vector instead of the target itself.
  const scroll = cameraScrollFor(before.player.x, before.player.y);
  const point = aimPointFor(before.player, target, scroll, box.width, box.height);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await expect
    .poll(() =>
      snapshot(page).then(
        (state) => state.enemies.find((enemy) => enemy.id === target.id)?.health ?? 0,
      ),
    )
    .toBeLessThan(target.health);
  await page.mouse.up();

  const after = await snapshot(page);
  expect(after.enemies.find((enemy) => enemy.id === outsideCone.id)?.health).toBe(
    outsideCone.health,
  );
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
  const resumed = await firstUnpausedState(page);
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

test('the HUD stat icon loads and the row keeps its text', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const icon = page.waitForResponse((response) =>
    response.url().endsWith('/assets/hud/hud-health.png'),
  );

  await startShift(page);

  expect((await icon).status()).toBe(200);
  // The icon is decoration: the row still names itself in text, so the HUD stays
  // readable if the image never arrives.
  await expect(page.getByTestId('run-hud')).toContainText('HEALTH');
  expect(pageErrors).toEqual([]);
});

test('the sound layer starts on a real gesture in the combat room', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await startShift(page);

  // The unlock listener is attached when the scene is created, which happens in
  // response to the very click that starts the shift — so that click predates it
  // and a further real gesture is needed before the context may start.
  await page.locator('canvas').click({ position: { x: 300, y: 200 } });
  await expect.poll(() => snapshot(page).then((state) => state.audio?.created)).toBe(true);
  await expect.poll(() => snapshot(page).then((state) => state.audio?.muted)).toBe(false);

  // M1 has no mute button, so the key is the only control: it goes straight to
  // the engine rather than through a HUD label that would need keeping in step.
  await page.keyboard.press('m');
  await expect.poll(() => snapshot(page).then((state) => state.audio?.muted)).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(() => snapshot(page).then((state) => state.audio?.muted)).toBe(false);

  // Swing for real. A created context only proves the layer exists; a scheduled
  // voice proves it acted on a cue.
  const playedBefore = (await snapshot(page)).audio?.played ?? 0;
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect
    .poll(() => snapshot(page).then((state) => state.audio?.played ?? 0))
    .toBeGreaterThan(playedBefore);

  expect(pageErrors).toEqual([]);
});
