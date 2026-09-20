import { expect, test, type Page } from '@playwright/test';

type RunSnapshot = {
  mode: 'run';
  generation: number;
  tick: number;
  paused: boolean;
  status: 'playing' | 'won' | 'dead';
  seed: number;
  roomIndex: number;
  roomId: string;
  cash: number;
  heat: number;
  suspicion: number;
  player: { x: number; y: number; health: number };
  enemies: Array<{ id: number; kind: string; x: number; y: number; health: number }>;
  carried: unknown[];
  inventory: {
    inventory: Array<{
      kind: string;
      instanceId: string;
      itemDefinitionId: string;
      acquisitionKind?: 'purchased' | 'stolen';
    }>;
    cash: number;
    revision: number;
  };
  checkpoint: null | { roomIndex: number; tick: number };
  summary: null | { status: 'won' | 'dead'; roomIndex: number; cash: number; heat: number };
  recentChange: string;
  behaviorTrace: string[];
  carrier: null | {
    mode: 'independent' | 'emitter';
    x: number;
    y: number;
    radius: number;
    recalling: boolean;
  };
  projectiles: Array<{
    id: number;
    x: number;
    y: number;
    radius: number;
    faction: 'enemy' | 'player';
    originX: number;
    originY: number;
  }>;
  previewOpen: boolean;
  audio: {
    created: boolean;
    running: boolean;
    muted: boolean;
    /** Cues actually scheduled as voices, not merely decided. */
    played: number;
  } | null;
};

const CHECKPOINT_KEY = 'dead-mall:mvp-checkpoint:v1';

function collectErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const errors = { pageErrors: [] as string[], consoleErrors: [] as string[] };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
  });
  return errors;
}

async function runSnapshot(page: Page): Promise<RunSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as { __DEAD_MALL_DEBUG__: { snapshot(): RunSnapshot } }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function launchRun(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await waitForRun(page);
}

/** Waits until the run scene, its HUD, and the development bridge are live. */
async function waitForRun(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#mvp-run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => runSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function offerTexts(page: Page): Promise<string[]> {
  return page.locator('#mvp-run-offers li').allInnerTexts();
}

test('launches Night Shift with one canvas, one HUD, and the service corridor', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchRun(page);

  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('mvp-run-hud')).toHaveCount(1);

  const state = await runSnapshot(page);
  expect(state.mode).toBe('run');
  expect(state.roomIndex).toBe(0);
  expect(state.roomId).toBe('service_corridor');
  expect(state.status).toBe('playing');
  expect(state.cash).toBe(30);
  expect(state.checkpoint).toEqual({ roomIndex: 0, tick: 0 });

  await expect(page.locator('#mvp-run-cash')).toContainText('$30');
  await expect(page.locator('#mvp-run-seed')).toContainText(`seed ${state.seed}`);
  await expect(page.locator('#mvp-run-room')).toContainText('Service Corridor');
  await expect(page.locator('#mvp-run-checkpoint')).toContainText('saved');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('kiosk texture loads from the local game asset path', async ({ page }) => {
  const errors = collectErrors(page);
  const kioskResponse = page.waitForResponse((response) =>
    response.url().endsWith('/assets/props/bench-warrant-kiosk.png'),
  );

  await launchRun(page, '/?fixture=mvp-bench&seed=4242');

  expect((await kioskResponse).status()).toBe(200);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('kiosk texture failure keeps the vector fallback playable', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/assets/props/bench-warrant-kiosk.png', (route) => route.abort());

  await launchRun(page, '/?fixture=mvp-bench&seed=4242');

  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('mvp-run-hud')).toHaveCount(1);
  expect((await runSnapshot(page)).roomId).toBe('service_corridor');
  expect(errors.pageErrors).toEqual([]);
});

test('offers are identical for one seed and vary across seeds', async ({ page }) => {
  const errors = collectErrors(page);

  await launchRun(page, '/?fixture=mvp-storefront&seed=4242');
  const first = await offerTexts(page);
  expect(first.length).toBeGreaterThan(0);
  expect((await runSnapshot(page)).seed).toBe(4242);

  await launchRun(page, '/?fixture=mvp-storefront&seed=4242');
  expect(await offerTexts(page)).toEqual(first);

  const otherSeedOffers: string[][] = [];
  for (const seed of [7, 99, 2024]) {
    await launchRun(page, `/?fixture=mvp-storefront&seed=${seed}`);
    otherSeedOffers.push(await offerTexts(page));
  }
  expect(otherSeedOffers.some((offers) => offers.join('|') !== first.join('|'))).toBe(true);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real keyboard purchase spends cash and records purchased provenance', async ({ page }) => {
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront');

  const before = await runSnapshot(page);
  const nearby = await page.locator('#mvp-run-nearby').innerText();
  expect(nearby).toMatch(/\$\d+/);
  await page.keyboard.press('e');

  await expect
    .poll(() => runSnapshot(page).then((state) => state.inventory.inventory.length))
    .toBeGreaterThan(before.inventory.inventory.length);

  const after = await runSnapshot(page);
  expect(after.cash).toBeLessThan(before.cash);
  expect(after.inventory.inventory.at(-1)?.acquisitionKind).toBe('purchased');
  await expect(page.locator('#mvp-run-cash')).toContainText(`$${after.cash}`);
  await expect(page.locator('#mvp-run-inventory')).toContainText('purchased');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real keyboard theft secures at the store exit and raises Heat', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront');

  await page.keyboard.press('f');
  await expect.poll(() => runSnapshot(page).then((state) => state.carried.length)).toBe(1);
  await expect(page.locator('#mvp-run-carried')).toContainText('CARRIED');

  const heatBefore = (await runSnapshot(page)).heat;
  await page.keyboard.down('s');
  await expect
    .poll(() => runSnapshot(page).then((state) => state.carried.length), { timeout: 30_000 })
    .toBe(0);
  await page.keyboard.up('s');

  const secured = await runSnapshot(page);
  expect(secured.heat).toBe(heatBefore + 15);
  expect(
    secured.inventory.inventory.some((entry) => entry.acquisitionKind === 'stolen'),
  ).toBe(true);
  await expect(page.locator('#mvp-run-heat')).toContainText(`HEAT ${secured.heat}`);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Continue run resumes the saved seed and boundary', async ({ page }) => {
  const errors = collectErrors(page);
  await launchRun(page, '/?seed=818');
  const launched = await runSnapshot(page);

  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeVisible();
  const continueButton = page.getByRole('button', { name: 'Continue run', exact: true });
  await expect(continueButton).toBeEnabled();

  await continueButton.click();
  await waitForRun(page);
  const resumed = await runSnapshot(page);
  expect(resumed.seed).toBe(launched.seed);
  expect(resumed.roomIndex).toBe(launched.checkpoint?.roomIndex ?? 0);
  expect(resumed.status).toBe('playing');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('an invalid checkpoint disables Continue run and never breaks startup', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"version":99,"seed":"nope"}'),
    CHECKPOINT_KEY,
  );
  await page.reload();

  await expect(page.getByRole('button', { name: 'Continue run', exact: true })).toBeDisabled();
  await launchRun(page);
  expect((await runSnapshot(page)).status).toBe('playing');
  await expect(page.locator('#mvp-run-hud')).toBeVisible();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('ten restarts keep one canvas, one HUD, and a clean run', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page);

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  }

  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('mvp-run-hud')).toHaveCount(1);
  const state = await runSnapshot(page);
  expect(state.generation).toBe(11);
  expect(state.status).toBe('playing');
  expect(state.roomIndex).toBe(0);
  expect(state.cash).toBe(30);
  expect(state.summary).toBeNull();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the security office spawns the Loss Prevention Manager', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-boss-entry&seed=5150');

  await expect
    .poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('security_office');
  const state = await runSnapshot(page);
  expect(state.enemies.some((enemy) => enemy.kind === 'lp_manager')).toBe(true);
  await expect(page.locator('#mvp-run-boss')).toBeVisible();
  await expect(page.locator('#mvp-run-boss')).toContainText(/BOSS: phase [123]/);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('winning the boss run publishes the summary and clears the checkpoint', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-boss-win&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId)).toBe('security_office');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  // Aim to the right of the player, close the gap, and swing for real.
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');

  for (let swing = 0; swing < 12; swing += 1) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(200);
    if ((await runSnapshot(page)).status === 'won') {
      break;
    }
  }

  const state = await runSnapshot(page);
  expect(state.status).toBe('won');
  expect(state.summary?.status).toBe('won');
  expect(state.checkpoint).toBeNull();
  await expect(page.getByTestId('mvp-run-summary')).toBeVisible();
  await expect(page.locator('#mvp-run-summary')).toContainText(/WON|Shift/i);

  await page.getByRole('button', { name: 'Return to title', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue run', exact: true })).toBeDisabled();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('a sealed boss-room door is reported to the player', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-boss-entry&seed=77');

  await expect.poll(() => runSnapshot(page).then((state) => state.roomId)).toBe('security_office');
  // The entry anchor sits inside the room, so walk back to the west doorway the
  // player came through and read the lock state the HUD reports there.
  await page.keyboard.down('a');
  await expect
    .poll(() => page.locator('#mvp-run-controls').innerText(), { timeout: 20_000 })
    .toMatch(/sealed/i);
  await page.keyboard.up('a');
  await expect(page.locator('#mvp-run-nearby')).toContainText(/door/i);
  await expect(page.locator('#mvp-run-controls')).toContainText(/sealed/i);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the run HUD fits 800x600 without horizontal overflow', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchRun(page);

  const layout = await page.evaluate(() => {
    const hud = document.querySelector('#mvp-run-hud') as HTMLElement | null;
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      hudVisible: Boolean(hud) && !hud!.hidden,
      hudScrolls: hud ? hud.scrollHeight > hud.clientHeight : false,
    };
  });

  expect(layout.hudVisible).toBe(true);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  await expect(page.locator('canvas')).toHaveCount(1);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

const distance = (
  first: { x: number; y: number },
  second: { x: number; y: number },
): number => Math.hypot(first.x - second.x, first.y - second.y);

test('the Bench Warrant kiosk previews and fuses the car, and shots then start at the car', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-bench&seed=4242');

  // The shift owns the car as an independent companion before fusion.
  await expect.poll(() => runSnapshot(page).then((state) => state.carrier?.mode)).toBe(
    'independent',
  );
  await expect(page.locator('#mvp-run-carrier')).toContainText(/independent/i);
  // Recall is not advertised while it would do nothing.
  await expect(page.locator('#mvp-run-controls')).not.toContainText('R RECALL');

  // Press E at the kiosk for real and read the proposal the sim produced.
  await page.keyboard.press('e');
  await expect(page.getByTestId('mvp-run-bench')).toBeVisible();
  await expect(page.locator('#mvp-run-bench')).toContainText('Party Popper');
  await expect(page.locator('#mvp-run-bench')).toContainText('RC Car');
  await expect(page.locator('#mvp-run-bench')).toContainText(/FEE: \$\d+ \(base \$6/);
  expect((await runSnapshot(page)).previewOpen).toBe(true);

  await page.getByRole('button', { name: 'Confirm fusion', exact: true }).click();

  await expect(page.getByTestId('mvp-run-bench')).toBeHidden();
  await expect.poll(() => runSnapshot(page).then((state) => state.carrier?.mode)).toBe('emitter');
  await expect(page.locator('#mvp-run-carrier')).toContainText(/fused emitter mount/i);
  await expect(page.locator('#mvp-run-controls')).toContainText('R RECALL');
  const fused = await runSnapshot(page);
  expect(fused.inventory.inventory.some((node) => node.kind === 'composite')).toBe(true);

  // Steer the car away from the player, then fire: the shot must begin at the
  // car, not at the janitor. Aiming far left drags the car out along the leash
  // without moving the player, so the gap opens without risking a doorway
  // crossing that would re-park the car in another room.
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  await page.mouse.move(box.x + 4, box.y + box.height * 0.5);
  await expect
    .poll(
      async () => {
        const state = await runSnapshot(page);
        return state.carrier ? distance(state.carrier, state.player) : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(100);

  const before = await runSnapshot(page);
  const carAtFire = before.carrier;
  expect(carAtFire).not.toBeNull();
  if (!carAtFire) {
    return;
  }
  // Re-aim just short of the car so it holds roughly still while firing: the
  // car steers toward the pointer, so aiming at its own position stops it
  // drifting during the shot that is being measured.
  await page.mouse.move(
    box.x + (carAtFire.x - 2) * (box.width / 960),
    box.y + carAtFire.y * (box.height / 480),
  );
  await page.waitForTimeout(80);

  await page.mouse.down();
  await page.waitForTimeout(140);
  await page.mouse.up();

  const after = await runSnapshot(page);
  // Only the player's own shots are in question, and the assertion is made
  // against where each shot BEGAN rather than where it has travelled to. A
  // travelled-position comparison is a proxy that a fast shot moving away from
  // its real origin can satisfy, so it could pass for the wrong reason.
  const shots = after.projectiles.filter((shot) => shot.faction === 'player');
  expect(shots.length).toBeGreaterThan(0);
  const carAfter = after.carrier ?? carAtFire;
  for (const shot of shots) {
    const origin = { x: shot.originX, y: shot.originY };
    // The real discriminator: the shot began nearer the car than the player.
    expect(distance(origin, carAfter)).toBeLessThan(distance(origin, after.player));
    // And it plainly did not come from the player's own body, which is where
    // this assertion would have passed before the repair.
    expect(distance(origin, after.player)).toBeGreaterThan(50);
  }

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the sound layer starts on a real gesture and can be muted', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page);

  // The unlock listener is attached when the scene is created, which happens in
  // response to the very click that starts the run — so that click predates it
  // and a further real gesture is needed before the context may start.
  await page.locator('canvas').click({ position: { x: 300, y: 200 } });
  await expect.poll(() => runSnapshot(page).then((state) => state.audio?.created)).toBe(true);
  await expect.poll(() => runSnapshot(page).then((state) => state.audio?.muted)).toBe(false);

  const muteButton = page.getByRole('button', { name: /SOUND:/ });
  await expect(muteButton).toBeVisible();
  await expect(muteButton).toContainText('SOUND: ON');

  await muteButton.click();
  await expect(muteButton).toContainText('SOUND: OFF');
  await expect(muteButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => runSnapshot(page).then((state) => state.audio?.muted)).toBe(true);

  // The keyboard shortcut reaches the same switch.
  await page.keyboard.press('m');
  await expect(muteButton).toContainText('SOUND: ON');
  await expect(muteButton).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => runSnapshot(page).then((state) => state.audio?.muted)).toBe(false);

  // Swing for real with sound live. This must not throw anywhere, and the
  // engine must actually schedule a voice: a created context only proves the
  // layer exists, whereas this proves it acted on a cue.
  const playedBefore = (await runSnapshot(page)).audio?.played ?? 0;
  await page.mouse.move(200, 400);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();

  await expect
    .poll(() => runSnapshot(page).then((state) => state.audio?.played ?? 0))
    .toBeGreaterThan(playedBefore);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('recall is refused before fusion and reported instead of silently ignored', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-bench&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.carrier?.mode)).toBe(
    'independent',
  );

  await page.keyboard.press('r');

  await expect(page.locator('#mvp-run-recent')).toContainText(/after Emitter Mount fusion/i);
  expect((await runSnapshot(page)).carrier?.recalling).toBe(false);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
