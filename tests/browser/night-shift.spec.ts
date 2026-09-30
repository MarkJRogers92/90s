import { expect, test, type Page } from '@playwright/test';
import { worldToCanvas } from './projection';
import { CANVAS_START_MS } from './timing';

type RunSnapshot = {
  mode: 'run';
  generation: number;
  tick: number;
  paused: boolean;
  status: 'playing' | 'won' | 'dead';
  seed: number;
  roomIndex: number;
  roomId: string;
  floor: 1 | 2 | 3;
  cash: number;
  heat: number;
  suspicion: number;
  player: { x: number; y: number; health: number };
  enemies: Array<{ id: number; kind: string; x: number; y: number; health: number }>;
  carried: unknown[];
  alarm: { shutter: string; ticksLeft: number } | null;
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
    phase?: 'outbound' | 'return';
    velocityX: number;
    velocityY: number;
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
  presentation?: {
    themeId: string | null;
    fallbackCount: number;
    occluderCount: number;
    staticDisplayObjectCount: number;
    staticTextureCount: number;
    dynamicDisplayObjectCount: number;
    sceneDisplayObjectCount: number;
    actorDepths: Array<{ id: string; baseY: number; renderDepth: number }>;
    effectDepths: Array<{ id: string; renderDepth: number }>;
    promptDepths: Array<{ id: string; renderDepth: number }>;
    ambience: {
      phase: 'busy' | 'warning' | 'evacuating' | 'empty';
      visibleCount: number;
      inFrameCount: number;
      inFrameIds: string[];
    };
    depthBands: { tallForeground: number; effect: number; prompt: number };
  };
  concourseAmbience: { phase: 'busy' | 'warning' | 'evacuating' | 'empty'; visibleCount: number } | null;
  actorPresentation?: {
    player: {
      spriteActive: boolean;
      vectorFallbackActive: boolean;
      textureKey: string;
      direction: string;
      frame: { row: number; column: number };
      walking: boolean;
      damageFlicker: boolean;
      mopArcVisible: boolean;
      actorDepth: number;
      mopArcDepth: number | null;
      damageCueVisible: boolean;
      damageCueDepth: number | null;
    } | null;
    hangers: Array<{
      id: string;
      spriteActive: boolean;
      vectorFallbackActive: boolean;
      direction: string;
      frame: { row: number; column: number };
      walking: boolean;
      lungeCueVisible: boolean;
      actorDepth: number;
      lungeCueDepth: number | null;
    }>;
    telegraphs: Array<{ id: string; visible: boolean; effectDepth: number }>;
    activeDeathEffectCount: number;
    depthBands: { tallForeground: number; effect: number };
  };
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
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: CANVAS_START_MS });
  await expect(page.locator('canvas')).toBeVisible({ timeout: CANVAS_START_MS });
  await expect(page.locator('#mvp-run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => runSnapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function offerTexts(page: Page): Promise<string[]> {
  // Offers intentionally live in a collapsed details element. innerText is
  // empty for hidden descendants, while textContent still reports the actual
  // seeded offer data rendered in the DOM.
  return (await page.locator('#mvp-run-offers li').allTextContents()).map((text) => text.trim());
}

async function nudgePlayerY(page: Page, target: number, tolerance = 16): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const y = (await runSnapshot(page)).player.y;
    if (Math.abs(y - target) <= tolerance) return;
    await page.keyboard.press(y < target ? 's' : 'w', { delay: 25 });
  }
  expect((await runSnapshot(page)).player.y).toBeCloseTo(target, -1);
}

async function stableWorldToCanvas(
  page: Page,
  worldX: number,
  worldY: number,
): Promise<{ x: number; y: number }> {
  let previous: { x: number; y: number; width: number; height: number } | null = null;
  let settled = { x: 0, y: 0 };
  await expect.poll(async () => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const point = await worldToCanvas(page, worldX, worldY);
    const box = await page.locator('canvas').boundingBox();
    if (!box) return false;
    const current = { ...point, width: box.width, height: box.height };
    const stable = previous !== null
      && Math.abs(current.x - previous.x) < 0.01
      && Math.abs(current.y - previous.y) < 0.01
      && Math.abs(current.width - previous.width) < 0.01
      && Math.abs(current.height - previous.height) < 0.01;
    previous = current;
    settled = point;
    return stable;
  }).toBe(true);
  return settled;
}

test('without a seed in the address bar each shift clocks into its own mall', async ({ page }) => {
  const errors = collectErrors(page);
  const seeds = new Set<number>();
  for (let shift = 0; shift < 3; shift += 1) {
    await launchRun(page);
    seeds.add((await runSnapshot(page)).seed);
  }
  // Rolled from a million; three identical rolls would be the old fixed seed.
  expect(seeds.size).toBeGreaterThan(1);
  expect(errors.pageErrors).toEqual([]);
});

test('launches Night Shift with one canvas, one HUD, and the Opening Concourse', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchRun(page);

  await expect(page.locator('canvas')).toHaveCount(1, { timeout: CANVAS_START_MS });
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
  await expect(page.locator('#mvp-run-room')).toContainText('Opening Concourse');
  await expect(page.locator('#mvp-run-checkpoint')).toContainText('saved');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Opening Concourse keeps its static scene stable and exits through real movement', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?seed=7');
  // Measure the concourse itself, once the clock-in cold open has cleared.
  await expect
    .poll(() => runSnapshot(page).then((state) => (state as { cinematic?: boolean }).cinematic), { timeout: 45_000 })
    .toBe(false);
  const first = await runSnapshot(page);
  expect(first.roomId).toBe('service_corridor');
  expect(first.enemies).toHaveLength(0);
  expect(first.presentation?.themeId).toBe('opening_concourse');
  expect(first.presentation?.occluderCount).toBeGreaterThan(0);
  expect(first.presentation?.staticDisplayObjectCount).toBeGreaterThan(0);
  expect(first.presentation?.actorDepths).toEqual([
    { id: 'player', baseY: first.player.y, renderDepth: 4000 + first.player.y },
  ]);
  expect(first.presentation!.depthBands.effect).toBeGreaterThan(first.presentation!.depthBands.tallForeground);
  expect(first.presentation!.depthBands.prompt).toBeGreaterThan(first.presentation!.depthBands.effect);
  expect(first.presentation?.effectDepths).toContainEqual({ id: 'player', renderDepth: 6001 });
  expect(first.presentation?.promptDepths).toContainEqual({ id: 'bench', renderDepth: 7000 });
  await page.screenshot({ path: testInfo.outputPath('opening-concourse.png') });
  const counts = {
    objects: first.presentation?.staticDisplayObjectCount,
    textures: first.presentation?.staticTextureCount,
    dynamic: first.presentation?.dynamicDisplayObjectCount,
    scene: first.presentation?.sceneDisplayObjectCount,
  };
  await expect.poll(() => runSnapshot(page).then((state) => state.tick), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(first.tick + 300);
  const afterSyncs = await runSnapshot(page);
  expect(afterSyncs.presentation?.staticDisplayObjectCount).toBe(counts.objects);
  expect(afterSyncs.presentation?.staticTextureCount).toBe(counts.textures);
  expect(afterSyncs.presentation?.dynamicDisplayObjectCount).toBe(counts.dynamic);
  expect(afterSyncs.presentation?.sceneDisplayObjectCount).toBe(counts.scene);
  expect(afterSyncs.enemies).toHaveLength(0);

  const northAisle = await worldToCanvas(page, 480, 60);
  await page.mouse.move(northAisle.x, northAisle.y);
  await page.keyboard.down('w');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000 })
    .toBeLessThan(75);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.x), { timeout: 20_000 })
    .toBeGreaterThan(850);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000 })
    .toBeGreaterThan(220);
  await page.keyboard.up('s');
  // A loaded four-worker browser gate can advance several rendered frames
  // between the poll match and keyup. Re-center with bounded real key taps so
  // the east-door approach cannot remain south of its doorway.
  await nudgePlayerY(page, 240);
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 40_000 })
    .toBe('storefront_a');
  await page.keyboard.up('d');
  // Every room now owns a dressed mall view; leaving the opening replaces it.
  expect((await runSnapshot(page)).presentation?.themeId).not.toBe('opening_concourse');
  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await expect.poll(() => runSnapshot(page).then((state) => state.generation)).toBeGreaterThan(first.generation);
  const restarted = await runSnapshot(page);
  expect(restarted.presentation?.staticDisplayObjectCount).toBe(counts.objects);
  expect(restarted.presentation?.dynamicDisplayObjectCount).toBe(counts.dynamic);
  expect(restarted.presentation?.sceneDisplayObjectCount).toBe(counts.scene);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Opening Concourse civilians evacuate monotonically from real input and restart fresh', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?seed=7');
  const first = await runSnapshot(page);
  expect(first.presentation?.ambience).toMatchObject({ phase: 'busy', visibleCount: expect.any(Number) });
  expect(first.presentation!.ambience.visibleCount).toBeGreaterThanOrEqual(4);
  expect(first.presentation!.ambience.visibleCount).toBeLessThanOrEqual(6);

  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.x), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThanOrEqual(530);
  await page.keyboard.up('d');
  expect((await runSnapshot(page)).presentation?.ambience.phase).toBe('warning');
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.x), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThanOrEqual(700);
  await page.keyboard.up('d');
  expect((await runSnapshot(page)).presentation?.ambience.phase).toBe('evacuating');
  await expect.poll(() => runSnapshot(page).then((state) => state.presentation?.ambience.visibleCount), { timeout: 10_000 })
    .toBe(0);

  await page.keyboard.down('w');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000, intervals: [20] })
    .toBeLessThan(75);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.x), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThan(850);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThan(220);
  await page.keyboard.up('s');
  await nudgePlayerY(page, 240);
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 20_000 })
    .toBe('storefront_a');
  await page.keyboard.up('d');
  expect((await runSnapshot(page)).concourseAmbience).toMatchObject({ phase: 'empty', visibleCount: 0 });

  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await expect.poll(() => runSnapshot(page).then((state) => state.generation)).toBeGreaterThan(first.generation);
  expect((await runSnapshot(page)).presentation?.ambience).toMatchObject({
    phase: 'busy', visibleCount: first.presentation!.ambience.visibleCount,
  });
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('actor presentation follows real movement, attack, and the first Food Court fight', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?seed=7');

  const idle = (await runSnapshot(page)).actorPresentation?.player;
  expect(idle).not.toBeNull();
  expect(idle?.spriteActive).toBe(true);
  expect(idle?.vectorFallbackActive).toBe(false);
  expect(idle?.walking).toBe(false);
  // The 64px PixelLab janitor (neon pass) replaced the presentation-slice sheet.
  expect(idle?.textureKey).toBe('neon:player:alex-idle');
  expect(idle?.damageCueVisible).toBe(false);
  expect(idle?.damageCueDepth).toBeNull();

  await page.keyboard.down('w');
  await expect.poll(async () => {
    const player = (await runSnapshot(page)).actorPresentation?.player;
    return player?.walking && player.direction === 'north' && player.textureKey === 'neon:player:alex-walk';
  }).toBe(true);
  const firstWalkFrame = (await runSnapshot(page)).actorPresentation!.player!.frame.column;
  await expect.poll(() => runSnapshot(page).then((state) => state.actorPresentation?.player?.frame.column))
    .not.toBe(firstWalkFrame);
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000, intervals: [20] })
    .toBeLessThan(50);
  await page.keyboard.up('w');

  const beforeAttack = await runSnapshot(page);
  const aim = await worldToCanvas(page, beforeAttack.player.x + 80, beforeAttack.player.y);
  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;
  await page.mouse.move(canvasBox.x + aim.x, canvasBox.y + aim.y);
  await page.mouse.down();
  let observedMopArcDepth: number | null = null;
  let observedTallForeground = 0;
  await expect.poll(async () => {
    const presentation = (await runSnapshot(page)).actorPresentation;
    if (presentation?.player?.mopArcVisible) {
      observedMopArcDepth = presentation.player.mopArcDepth;
      observedTallForeground = presentation.depthBands.tallForeground;
      return true;
    }
    return false;
  }).toBe(true);
  expect(observedMopArcDepth).toBeGreaterThan(observedTallForeground);
  await page.mouse.up();

  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.x), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThan(900);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await expect.poll(() => runSnapshot(page).then((state) => state.player.y), { timeout: 20_000, intervals: [20] })
    .toBeGreaterThan(235);
  await page.keyboard.up('s');
  await nudgePlayerY(page, 240);
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 20_000 })
    .toBe('storefront_a');
  await page.keyboard.up('d');
  await page.keyboard.down('d');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('food_court');
  await page.keyboard.up('d');

  // Keep the snapshot that showed the cue: the cue is brief, so a second
  // snapshot taken later would find it already gone.
  let foodCourt!: NonNullable<Awaited<ReturnType<typeof runSnapshot>>['actorPresentation']>;
  await expect.poll(async () => {
    const presentation = (await runSnapshot(page)).actorPresentation;
    const seen = presentation?.hangers.some((hanger) => hanger.spriteActive && hanger.lungeCueVisible) ?? false;
    if (seen && presentation) foodCourt = presentation;
    return seen;
  }, { timeout: 15_000 }).toBe(true);
  const hanger = foodCourt.hangers.find((candidate) => candidate.spriteActive && candidate.lungeCueVisible);
  expect(hanger?.vectorFallbackActive).toBe(false);
  expect(hanger?.lungeCueDepth).toBeGreaterThan(foodCourt.depthBands.tallForeground);

  let observedDamageDepth: number | null = null;
  let observedTelegraphDepth: number | null = null;
  await expect.poll(async () => {
    const state = await runSnapshot(page);
    const presentation = state.actorPresentation;
    if (state.player.health < 6 && presentation?.player?.damageCueVisible) {
      observedDamageDepth = presentation.player.damageCueDepth;
    }
    const telegraph = presentation?.telegraphs.find((entry) => entry.visible);
    if (telegraph) observedTelegraphDepth = telegraph.effectDepth;
    return observedDamageDepth !== null && observedTelegraphDepth !== null;
  }, { timeout: 15_000, intervals: [20] }).toBe(true);
  expect(observedDamageDepth).toBeGreaterThan(foodCourt.depthBands.tallForeground);
  expect(observedTelegraphDepth).toBeGreaterThan(foodCourt.depthBands.tallForeground);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Opening Concourse sorts the player and carrier by their own feet', async ({ page }) => {
  test.setTimeout(45_000);
  await launchRun(page, '/?fixture=mvp-bench&seed=7');
  await page.keyboard.down('s');
  // Judge one snapshot, taken while the two stand at different heights and the
  // renderer has drawn that same frame. A second read under load could land
  // after the following car has caught up to the janitor's height.
  let state = await runSnapshot(page);
  await expect.poll(async () => {
    state = await runSnapshot(page);
    const depths = state.presentation?.actorDepths ?? [];
    const drawn = (id: string, y: number | undefined) => depths.find((actor) => actor.id === id)?.baseY === y;
    return state.carrier !== null && Math.abs(state.player.y - state.carrier.y) > 1
      && drawn('player', state.player.y) && drawn('carrier', state.carrier.y);
  }, { timeout: 10_000, intervals: [20] }).toBe(true);
  await page.keyboard.up('s');
  const player = state.presentation?.actorDepths.find((actor) => actor.id === 'player');
  const carrier = state.presentation?.actorDepths.find((actor) => actor.id === 'carrier');
  expect(player?.baseY).toBe(state.player.y);
  expect(carrier?.baseY).toBe(state.carrier?.y);
  expect(player?.renderDepth).toBe(4000 + state.player.y);
  expect(carrier?.renderDepth).toBe(4000 + state.carrier!.y);
  expect(player?.renderDepth).not.toBe(carrier?.renderDepth);
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
  await launchRun(page, '/?fixture=mvp-storefront&seed=0');

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

test('real keyboard grab sounds the alarm, and running out the door secures it for a star of Heat', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront&seed=0');

  await page.keyboard.press('f');
  await expect.poll(() => runSnapshot(page).then((state) => state.carried.length)).toBe(1);
  await expect(page.locator('#mvp-run-carried')).toContainText('CARRIED');
  const ringing = await runSnapshot(page);
  expect(ringing.alarm).toMatchObject({ shutter: 'open' });
  expect(ringing.enemies.some((enemy) => enemy.kind === 'shopper')).toBe(true);

  const heatBefore = (await runSnapshot(page)).heat;
  await page.keyboard.down('s');
  await expect
    .poll(() => runSnapshot(page).then((state) => state.carried.length), { timeout: 30_000 })
    .toBe(0);
  await page.keyboard.up('s');

  const secured = await runSnapshot(page);
  expect(secured.heat).toBe(heatBefore + 20);
  expect(secured.alarm).toBeNull();
  expect(
    secured.inventory.inventory.some((entry) => entry.acquisitionKind === 'stolen'),
  ).toBe(true);
  await expect(page.locator('#mvp-run-heat')).toContainText(`HEAT ${secured.heat}`);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('a janitor who lingers after the grab is locked in behind the shutter', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-storefront&seed=0');
  await page.keyboard.press('f');
  await expect.poll(() => runSnapshot(page).then((state) => state.alarm?.shutter ?? null)).toBe('open');
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: 'artifacts/neon-overhaul/heist-alarm.png' });
  await expect
    .poll(() => runSnapshot(page).then((state) => state.alarm?.shutter ?? state.status), { timeout: 20_000 })
    .toBe('closed');
  const locked = await runSnapshot(page);
  expect(locked.heat).toBeGreaterThanOrEqual(20);
  expect(locked.carried).toHaveLength(1);
  await page.screenshot({ path: 'artifacts/neon-overhaul/heist-locked.png' });
  expect(errors.pageErrors).toEqual([]);
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

  await expect(page.locator('canvas')).toHaveCount(1, { timeout: CANVAS_START_MS });
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

test('up the escalator, the Management Suite spawns the Mall Manager', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-two-boss&seed=5150');

  await expect
    .poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('security_office');
  const state = await runSnapshot(page);
  expect(state.enemies.some((enemy) => enemy.kind === 'manager')).toBe(true);
  expect(state.enemies.some((enemy) => enemy.kind === 'lp_manager')).toBe(false);
  await expect(page.locator('#mvp-run-boss')).toContainText('HP 150/150');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the escalator ride holds the run still until it ends or is skipped', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-boss-win&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.roomId)).toBe('security_office');
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  for (let swing = 0; swing < 12 && (await runSnapshot(page)).status !== 'won'; swing += 1) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  expect((await runSnapshot(page)).status).toBe('won');

  // FLOOR CLEARED (after the kill cam): Enter takes the escalator.
  await expect
    .poll(async () => {
      // Press only while still downstairs, so no extra press can skip the ride.
      const before = await runSnapshot(page);
      if (before.status === 'won') await page.keyboard.press('Enter');
      return runSnapshot(page).then((state) => `${state.status}:${state.roomId}`);
    }, { timeout: 15_000, intervals: [400] })
    .toBe('playing:service_corridor');
  const boarded = (await runSnapshot(page)).tick;
  await page.waitForTimeout(1000);
  // Mid-ride the run is upstairs but its clock has not moved.
  expect((await runSnapshot(page)).tick).toBe(boarded);

  await page.keyboard.press('Space');
  await expect.poll(() => runSnapshot(page).then((state) => state.tick), { timeout: 3000 }).toBeGreaterThan(boarded);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

async function swingUntilWon(page: Page): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  for (let swing = 0; swing < 16 && (await runSnapshot(page)).status !== 'won'; swing += 1) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(160);
  }
  expect((await runSnapshot(page)).status).toBe('won');
}

test('beating the Mall Manager clears Floor 2 and rides the escalator up to Floor 3', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-two-boss-win&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.enemies.some((enemy) => enemy.kind === 'manager'))).toBe(true);
  expect((await runSnapshot(page)).floor).toBe(2);
  await swingUntilWon(page);

  // Kill cam, then FLOOR CLEARED: Enter takes the escalator to the food court.
  await expect
    .poll(async () => {
      const before = await runSnapshot(page);
      if (before.status === 'won' && before.floor === 2) await page.keyboard.press('Enter');
      return runSnapshot(page).then((state) => `${state.status}:${state.floor}:${state.roomId}`);
    }, { timeout: 30_000, intervals: [700] })
    .toBe('playing:3:service_corridor');
  const boarded = (await runSnapshot(page)).tick;
  await page.waitForTimeout(800);
  // Mid-ride the run is on Floor 3 but its clock has not moved.
  expect((await runSnapshot(page)).tick).toBe(boarded);
  await page.keyboard.press('Space');
  await expect.poll(() => runSnapshot(page).then((state) => state.tick), { timeout: 3000 }).toBeGreaterThan(boarded);

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the Food Court After Dark boss room spawns the Mall Owner', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-three-boss&seed=5150');
  await expect
    .poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('security_office');
  const state = await runSnapshot(page);
  expect(state.floor).toBe(3);
  expect(state.enemies.some((enemy) => enemy.kind === 'owner')).toBe(true);
  await expect(page.locator('#mvp-run-boss')).toContainText('HP 210/210');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('beating the Mall Owner clears Floor 3 and rides the escalator up to the Roof', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-three-boss-win&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.enemies.some((enemy) => enemy.kind === 'owner'))).toBe(true);
  await swingUntilWon(page);

  // Kill cam, then FLOOR CLEARED (not CLOCKED OUT): Enter takes the escalator to the Roof.
  await expect
    .poll(async () => {
      const before = await runSnapshot(page);
      if (before.status === 'won' && before.floor === 3) await page.keyboard.press('Enter');
      return runSnapshot(page).then((state) => `${state.status}:${state.floor}:${state.roomId}`);
    }, { timeout: 30_000, intervals: [700] })
    .toBe('playing:4:service_corridor');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the Roof boss room spawns the Developer', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-four-boss&seed=5150');
  await expect
    .poll(() => runSnapshot(page).then((state) => state.roomId), { timeout: 30_000 })
    .toBe('security_office');
  const state = await runSnapshot(page);
  expect(state.floor).toBe(4);
  expect(state.enemies.some((enemy) => enemy.kind === 'developer')).toBe(true);
  await expect(page.locator('#mvp-run-boss')).toContainText('HP 240/240');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('beating the Developer plays out to the CLOCKED OUT card, and a new shift starts from it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-floor-four-boss-win&seed=4242');
  await expect.poll(() => runSnapshot(page).then((state) => state.enemies.some((enemy) => enemy.kind === 'developer'))).toBe(true);
  await swingUntilWon(page);

  // Kill cam, the walk out at dawn, then the card: R starts a new shift.
  await expect
    .poll(async () => {
      const before = await runSnapshot(page);
      if (before.status === 'won') await page.keyboard.press('KeyR');
      return runSnapshot(page).then((state) => `${state.status}:${state.floor}:${state.roomIndex}`);
    }, { timeout: 30_000, intervals: [700] })
    .toBe('playing:1:0');

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('dying hands over a pink slip, then the SHIFT OVER card retries the same mall', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await launchRun(page, '/?fixture=mvp-last-heart&seed=7');
  // One point of health in the food court fight: standing still ends the shift.
  await expect.poll(() => runSnapshot(page).then((state) => state.status), { timeout: 30_000 }).toBe('dead');
  await expect
    .poll(async () => {
      const before = await runSnapshot(page);
      if (before.status === 'dead') await page.keyboard.press('KeyR');
      return runSnapshot(page).then((state) => `${state.status}:${state.roomIndex}:${state.seed}`);
    }, { timeout: 20_000, intervals: [600] })
    .toBe('playing:0:7');

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
    const drawer = document.querySelector('#mvp-run-inspection') as HTMLDetailsElement | null;
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      hudVisible: Boolean(hud) && !hud!.hidden,
      drawerClosed: drawer ? !drawer.open : false,
    };
  });

  expect(layout.hudVisible).toBe(true);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.drawerClosed).toBe(true);
  await expect(page.locator('#mvp-run-health')).toBeVisible();
  await expect(page.locator('#mvp-run-cash')).toBeVisible();
  await expect(page.locator('#mvp-run-heat')).toBeVisible();
  await expect(page.locator('#mvp-run-room')).toBeVisible();
  await expect(page.locator('#mvp-run-objective')).toBeVisible();
  await expect(page.locator('#mvp-run-nearby')).toBeVisible();
  await page.getByText('Inspect shift details', { exact: true }).click();
  await expect(page.locator('#mvp-run-inspection')).toHaveAttribute('open', '');
  await page.getByText('Inspect shift details', { exact: true }).click();
  await expect(page.locator('#mvp-run-inspection')).not.toHaveAttribute('open', '');
  await expect(page.getByText('Inspect shift details', { exact: true })).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: CANVAS_START_MS });

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the compact HUD is separated from the canvas and keeps the full room identity at 1440x900', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await launchRun(page);

  const canvas = await page.locator('canvas').boundingBox();
  const hud = await page.locator('#mvp-run-hud').boundingBox();
  expect(canvas).not.toBeNull();
  expect(hud).not.toBeNull();
  if (!canvas || !hud) {
    return;
  }
  expect(hud.y + hud.height).toBeLessThanOrEqual(canvas.y);
  const roomIdentity = await page.locator('#mvp-run-room').evaluate((room) => ({
    text: room.textContent,
    unclipped: room.scrollWidth <= room.clientWidth && room.scrollHeight <= room.clientHeight,
  }));
  expect(roomIdentity.text).toContain('Opening Concourse');
  expect(roomIdentity.unclipped).toBe(true);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('store offer details stay collapsed until opened at 800x600', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchRun(page, '/?fixture=mvp-storefront&seed=4242');

  const offers = page.locator('#mvp-run-offers-wrap');
  await expect(offers).toBeVisible();
  await expect(offers).not.toHaveAttribute('open', '');
  await expect(page.locator('#mvp-run-offers li').first()).toBeHidden();
  await page.getByText('Store offers', { exact: true }).click();
  await expect(offers).toHaveAttribute('open', '');
  await expect(page.locator('#mvp-run-offers li').first()).toBeVisible();
  await page.getByText('Store offers', { exact: true }).click();
  await expect(offers).not.toHaveAttribute('open', '');
  await expect(page.getByText('Store offers', { exact: true })).toBeFocused();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the compact HUD keeps pause and restart reachable from real input', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchRun(page, '/?seed=5150');
  const before = await runSnapshot(page);

  await page.keyboard.press('Escape');
  await expect.poll(() => runSnapshot(page).then((state) => state.paused)).toBe(true);
  await expect(page.locator('#mvp-run-controls')).toContainText(/PAUSED/i);
  await page.keyboard.press('Escape');
  await expect.poll(() => runSnapshot(page).then((state) => state.paused)).toBe(false);

  await page.getByRole('button', { name: 'Restart run', exact: true }).click();
  await expect.poll(() => runSnapshot(page).then((state) => state.generation)).toBeGreaterThan(before.generation);
  await expect(page.locator('#mvp-run-checkpoint')).toContainText('saved');
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('real canvas input stays aimed while the janitor moves and after resizing', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchRun(page, '/?fixture=mvp-bench&seed=4242');

  // Night Shift frames the whole room like an Isaac room: the camera holds
  // still while the janitor walks, so a world point keeps its canvas spot.
  const fixedWorldPoint = { x: 0, y: 0 };
  const before = await runSnapshot(page);
  const beforeMove = await worldToCanvas(page, fixedWorldPoint.x, fixedWorldPoint.y);
  await page.keyboard.down('d');
  await page.waitForTimeout(1_200);
  await page.keyboard.up('d');
  const afterMove = await runSnapshot(page);
  const afterMoveProjection = await worldToCanvas(page, fixedWorldPoint.x, fixedWorldPoint.y);
  expect(afterMove.player.x - before.player.x).toBeGreaterThan(50);
  expect(Math.abs(afterMoveProjection.x - beforeMove.x)).toBeLessThan(1);

  await page.setViewportSize({ width: 1120, height: 760 });
  const target = { x: afterMove.player.x + 100, y: afterMove.player.y };
  // Chromium reports the new element box before Phaser has consumed the
  // resize on its next frame. Aim only after both halves of the projection
  // contract agree, exactly as a visible frame presented to a user does.
  const point = await stableWorldToCanvas(page, target.x, target.y);
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  expect(point.x).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(box.width);
  expect(point.y).toBeGreaterThan(0);
  expect(point.y).toBeLessThan(box.height);

  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await expect
    .poll(async () => {
      const directions = (await runSnapshot(page)).projectiles
        .filter(
          (candidate) => candidate.faction === 'player' && candidate.phase === 'outbound',
        )
        .map((shot) => {
          const directionToTarget = {
            x: target.x - shot.originX,
            y: target.y - shot.originY,
          };
          const targetLength = Math.hypot(directionToTarget.x, directionToTarget.y);
          const attackLength = Math.hypot(shot.velocityX, shot.velocityY);
          return targetLength === 0 || attackLength === 0
            ? -1
            : (shot.velocityX * directionToTarget.x + shot.velocityY * directionToTarget.y) /
              (attackLength * targetLength);
        });
      return directions.length === 0 ? -1 : Math.max(...directions);
    })
    // A normalized dot product of 0.85 keeps the projectile within 32 degrees
    // of the live world target, rejecting the broad forward-half-plane false
    // positives that a simple positive dot product admitted.
    .toBeGreaterThan(0.85);
  await page.mouse.up();

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
  const point = await worldToCanvas(page, carAtFire.x - 2, carAtFire.y);
  await page.mouse.move(box.x + point.x, box.y + point.y);
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
  await expect.poll(() => runSnapshot(page).then((state) => state.audio?.running)).toBe(true);

  // Swing for real with sound live. This must not throw anywhere, and the
  // engine must actually schedule a voice: a created context only proves the
  // layer exists, whereas this proves it acted on a cue.
  // The unlocking canvas click can also start a silent first swing before its
  // AudioContext finishes resuming. Let that real attack's 27-tick cooldown
  // clear so this assertion always measures a fresh, audible action.
  await page.waitForTimeout(550);
  const playedBefore = (await runSnapshot(page)).audio?.played ?? 0;
  const beforeSwing = await runSnapshot(page);
  const swingPoint = await worldToCanvas(page, beforeSwing.player.x + 80, beforeSwing.player.y);
  const swingCanvas = await page.locator('canvas').boundingBox();
  expect(swingCanvas).not.toBeNull();
  if (!swingCanvas) return;
  await page.mouse.move(swingCanvas.x + swingPoint.x, swingCanvas.y + swingPoint.y);
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
