import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { worldToCanvas } from './projection';
import { CANVAS_START_MS } from './timing';

type PresentationSnapshot = {
  generation: number;
  tick: number;
  paused: boolean;
  roomId: string;
  player: { x: number; y: number };
  enemies: Array<{
    id: number;
    kind: string;
    x: number;
    y: number;
    phase: string;
  }>;
  presentation: null | {
    themeId: string;
    staticDisplayObjectCount: number;
    staticTextureCount: number;
    dynamicDisplayObjectCount: number;
    sceneDisplayObjectCount: number;
    ambience: {
      phase: 'busy' | 'warning' | 'evacuating' | 'empty';
      visibleCount: number;
      inFrameCount: number;
      inFrameIds: string[];
    };
  };
  actorPresentation: null | {
    telegraphs: Array<{ id: string; visible: boolean }>;
  };
};

type EventListener = {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
};

const ARTIFACT_ROOT = 'artifacts/presentation-vertical-slice';

async function snapshot(page: Page): Promise<PresentationSnapshot> {
  return page.evaluate(() => (
    window as unknown as {
      __DEAD_MALL_DEBUG__: { snapshot(): PresentationSnapshot };
    }
  ).__DEAD_MALL_DEBUG__.snapshot());
}

function rejectExternalRequests(page: Page): () => void {
  const external = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '127.0.0.1') {
      external.add(url.href);
    }
  });
  return () => expect([...external], 'playable run made an external request').toEqual([]);
}

async function launchRun(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/?seed=7');
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: CANVAS_START_MS });
  await expect(page.locator('#mvp-run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
  // The evidence is the concourse itself: wait for the clock-in cold open to clear.
  await expect
    // Generous: the cold open runs on frame time, so a loaded machine stretches it.
    .poll(() => snapshot(page).then((state) => (state as { cinematic?: boolean }).cinematic), { timeout: 45_000 })
    .toBe(false);
}

// Night Shift renders a fixed 960x600 stage (the whole room plus the
// storefront band), so native scale is x1 on a 1440x900 viewport.
const STAGE = { width: 960, height: 600 } as const;

async function setIntegerCanvasScale(page: Page, scale: 1 | 2): Promise<void> {
  // Phaser owns the canvas's inline dimensions and may rewrite them after its
  // ResizeObserver runs. An author-level important rule remains authoritative
  // even when that delayed inline update lands under the parallel full gate.
  await page.addStyleTag({ content: `
    #game-host canvas {
      width: ${STAGE.width * scale}px !important;
      height: ${STAGE.height * scale}px !important;
      max-width: none !important;
      max-height: none !important;
    }
  ` });
  await expect.poll(async () => {
    const box = await page.locator('canvas').boundingBox();
    return box ? { width: box.width, height: box.height } : null;
  }).toEqual({ width: STAGE.width * scale, height: STAGE.height * scale });
}

async function moveUntil(
  page: Page,
  key: 'w' | 'a' | 's' | 'd',
  predicate: (state: PresentationSnapshot) => boolean,
  timeout = 20_000,
): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(async () => predicate(await snapshot(page)), {
    timeout,
    intervals: [20],
  }).toBe(true);
  await page.keyboard.up(key);
}

/**
 * Re-centres the janitor on a row with bounded real key taps. Under a loaded
 * parallel gate a held key can outrun the poll by tens of pixels, carrying the
 * janitor past a 96px doorway before keyup; the same correction the
 * night-shift spec uses keeps the east-door approach inside the opening.
 */
async function nudgePlayerY(page: Page, target: number, tolerance = 16): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const y = (await snapshot(page)).player.y;
    if (Math.abs(y - target) <= tolerance) return;
    await page.keyboard.press(y < target ? 's' : 'w', { delay: 25 });
  }
  expect((await snapshot(page)).player.y).toBeCloseTo(target, -1);
}

async function enterFirstCombat(page: Page): Promise<void> {
  await moveUntil(page, 'w', (state) => state.player.y < 50);
  await moveUntil(page, 'd', (state) => state.player.x > 900);
  await moveUntil(page, 's', (state) => state.player.y > 220);
  await nudgePlayerY(page, 240);
  await moveUntil(page, 'd', (state) => state.roomId === 'storefront_a');
  await nudgePlayerY(page, 240);
  await moveUntil(page, 'd', (state) => state.roomId === 'food_court', 30_000);
}

async function listenerSignature(
  session: CDPSession,
  expression: string,
): Promise<Record<string, number>> {
  const evaluated = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: false,
  }) as { result: { objectId?: string } };
  const objectId = evaluated.result.objectId;
  if (!objectId) {
    throw new Error(`CDP could not resolve listener target: ${expression}`);
  }
  const response = await session.send('DOMDebugger.getEventListeners', {
    objectId,
  }) as { listeners: EventListener[] };
  const signature: Record<string, number> = {};
  for (const listener of response.listeners) {
    const key = `${listener.type}:${listener.useCapture}:${listener.passive}:${listener.once}`;
    signature[key] = (signature[key] ?? 0) + 1;
  }
  return signature;
}

async function pageListenerSignatures(
  session: CDPSession,
): Promise<Record<string, Record<string, number>>> {
  return {
    window: await listenerSignature(session, 'window'),
    document: await listenerSignature(session, 'document'),
    canvas: await listenerSignature(session, "document.querySelector('canvas')"),
  };
}

test('captures the required opening presentation states at integer canvas scale', async ({ page }) => {
  test.setTimeout(150_000);
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 1440, height: 900 });
  await setIntegerCanvasScale(page, 1);

  const busy = await snapshot(page);
  expect(busy.roomId).toBe('service_corridor');
  expect(busy.presentation?.ambience.phase).toBe('busy');
  expect(busy.presentation?.ambience.visibleCount).toBeGreaterThanOrEqual(4);
  expect(busy.presentation?.ambience.visibleCount).toBeLessThanOrEqual(6);
  expect(busy.presentation?.ambience.inFrameCount).toBe(busy.presentation?.ambience.visibleCount);
  expect(busy.presentation?.ambience.inFrameIds).toHaveLength(4);
  expect(new Set(busy.presentation?.ambience.inFrameIds).size).toBe(4);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/opening-busy.png`, fullPage: true });

  await moveUntil(page, 'd', (state) => state.player.x >= 700);
  const evacuation = await snapshot(page);
  expect(evacuation.presentation?.ambience.phase).toBe('evacuating');
  expect(evacuation.presentation?.ambience.visibleCount).toBeGreaterThan(0);
  expect(evacuation.presentation?.ambience.inFrameCount).toBeGreaterThan(0);
  expect(new Set(evacuation.presentation?.ambience.inFrameIds).size)
    .toBe(evacuation.presentation?.ambience.inFrameCount);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/opening-evacuation.png`, fullPage: true });

  assertLocalOnly();
});

test('captures first combat while a live telegraph is visibly on screen', async ({ page }) => {
  test.setTimeout(150_000);
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 1440, height: 900 });
  await setIntegerCanvasScale(page, 1);
  await enterFirstCombat(page);
  await moveUntil(page, 'd', (state) => state.player.x > 300);

  let capturedLiveTelegraph = false;
  await expect.poll(async () => {
    const state = await snapshot(page);
    const actors = state.actorPresentation;
    const telegraphingEnemy = state.enemies.find((enemy) => (
      enemy.kind === 'spitter'
      && enemy.phase === 'telegraph'
      && actors?.telegraphs.some((telegraph) => (
        telegraph.id === `enemy:${enemy.id}` && telegraph.visible
      ))
    ));
    const canvasBox = await page.locator('canvas').boundingBox();
    const projected = telegraphingEnemy
      ? await worldToCanvas(page, telegraphingEnemy.x, telegraphingEnemy.y)
      : null;
    const cueOnScreen = Boolean(
      canvasBox
      && projected
      && projected.x >= 48
      && projected.x <= canvasBox.width - 48
      && projected.y >= 48
      && projected.y <= canvasBox.height - 48
    );
    if (cueOnScreen && !capturedLiveTelegraph) {
      await page.screenshot({ path: `${ARTIFACT_ROOT}/first-combat.png`, fullPage: true });
      capturedLiveTelegraph = true;
    }
    return capturedLiveTelegraph;
  }, { timeout: 20_000, intervals: [16] }).toBe(true);

  assertLocalOnly();
});

test('captures the compact 800x600 layout at native canvas scale', async ({ page }) => {
  const assertLocalOnly = rejectExternalRequests(page);
  // A 960px stage cannot sit at integer scale inside 800px, so the compact
  // capture keeps Phaser's own FIT scaling and asserts no overflow instead.
  await launchRun(page, { width: 800, height: 600 });

  await expect(page.locator('#mvp-run-health')).toBeVisible();
  await expect(page.locator('#mvp-run-cash')).toBeVisible();
  await expect(page.locator('#mvp-run-heat')).toBeVisible();
  const layout = await page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('#mvp-run-hud')!;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
    const room = document.querySelector<HTMLElement>('#mvp-run-room')!;
    const hudBox = hud.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    return {
      separated: hudBox.bottom <= canvasBox.top,
      fullRoomVisible: room.scrollWidth <= room.clientWidth && room.scrollHeight <= room.clientHeight,
    };
  });
  expect(layout.separated).toBe(true);
  expect(layout.fullRoomVisible).toBe(true);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(800);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/compact-800x600.png`, fullPage: true });

  assertLocalOnly();
});

test('ten restart cycles keep one opening view, stable listeners, and one ambience group', async ({ page }) => {
  // About 80 s alone; four parallel software-GL browsers on four cores take
  // three times that, so the budget has to cover a loaded gate.
  test.setTimeout(360_000);
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 1440, height: 900 });
  await setIntegerCanvasScale(page, 1);
  const session = await page.context().newCDPSession(page);
  const first = await snapshot(page);
  expect(first.presentation).not.toBeNull();
  const baselinePresentation = first.presentation;
  const baselineListeners = await pageListenerSignatures(session);
  console.log('Task 8 lifecycle baseline', JSON.stringify({
    presentation: baselinePresentation,
    listeners: baselineListeners,
  }));

  // The run is forward-only. Leave the opening through real input, then use
  // the supported restart control to return to a new opening-flow instance.
  await moveUntil(page, 'w', (state) => state.player.y < 50);
  await moveUntil(page, 'd', (state) => state.player.x > 850);
  await moveUntil(page, 's', (state) => state.player.y > 220);
  // Under a loaded gate the held S overshoots the 96px east door; re-centre on
  // it the way enterFirstCombat does (this is why the test flaked in parallel).
  await nudgePlayerY(page, 240);
  await moveUntil(page, 'd', (state) => state.roomId === 'storefront_a');
  // Every room now owns a dressed mall view; leaving the opening replaces it.
  expect((await snapshot(page)).presentation?.themeId).not.toBe('opening_concourse');

  let generation = first.generation;
  for (let cycle = 1; cycle <= 10; cycle += 1) {
    await page.getByRole('button', { name: 'Restart run', exact: true }).click();
    generation += 1;
    await expect.poll(() => snapshot(page).then((state) => state.generation)).toBe(generation);
    const restarted = await snapshot(page);
    expect(restarted.roomId).toBe('service_corridor');
    expect(restarted.presentation).toEqual(baselinePresentation);
    expect(restarted.presentation?.ambience).toEqual(first.presentation?.ambience);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.getByTestId('mvp-run-hud').count()).toBe(1);
    expect(await pageListenerSignatures(session)).toEqual(baselineListeners);
  }

  await session.detach();
  assertLocalOnly();
});
