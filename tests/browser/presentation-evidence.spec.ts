import { expect, test, type CDPSession, type Page } from '@playwright/test';

type PresentationSnapshot = {
  generation: number;
  tick: number;
  paused: boolean;
  roomId: string;
  player: { x: number; y: number };
  presentation: null | {
    staticDisplayObjectCount: number;
    staticTextureCount: number;
    dynamicDisplayObjectCount: number;
    sceneDisplayObjectCount: number;
    ambience: {
      phase: 'busy' | 'warning' | 'evacuating' | 'empty';
      visibleCount: number;
    };
  };
  actorPresentation: null | {
    hangers: Array<{ lungeCueVisible: boolean }>;
    telegraphs: Array<{ visible: boolean }>;
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
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('#mvp-run-hud')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function setIntegerCanvasScale(page: Page, scale: 1 | 2): Promise<void> {
  await page.locator('canvas').evaluate((canvas, factor) => {
    canvas.style.width = `${640 * factor}px`;
    canvas.style.height = `${360 * factor}px`;
  }, scale);
  await expect.poll(async () => {
    const box = await page.locator('canvas').boundingBox();
    return box ? { width: box.width, height: box.height } : null;
  }).toEqual({ width: 640 * scale, height: 360 * scale });
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

async function enterFirstCombat(page: Page): Promise<void> {
  await moveUntil(page, 'w', (state) => state.player.y < 50);
  await moveUntil(page, 'd', (state) => state.player.x > 900);
  await moveUntil(page, 's', (state) => state.player.y > 235);
  await moveUntil(page, 'd', (state) => state.roomId === 'storefront_a');
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
  await setIntegerCanvasScale(page, 2);

  const busy = await snapshot(page);
  expect(busy.roomId).toBe('service_corridor');
  expect(busy.presentation?.ambience.phase).toBe('busy');
  expect(busy.presentation?.ambience.visibleCount).toBeGreaterThanOrEqual(4);
  expect(busy.presentation?.ambience.visibleCount).toBeLessThanOrEqual(6);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/opening-busy.png`, fullPage: true });

  await moveUntil(page, 'd', (state) => state.player.x >= 700);
  const evacuation = await snapshot(page);
  expect(evacuation.presentation?.ambience.phase).toBe('evacuating');
  expect(evacuation.presentation?.ambience.visibleCount).toBeGreaterThan(0);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/opening-evacuation.png`, fullPage: true });

  assertLocalOnly();
});

test('captures first combat while a live telegraph is visible', async ({ page }) => {
  test.setTimeout(150_000);
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 1440, height: 900 });
  await setIntegerCanvasScale(page, 2);
  await enterFirstCombat(page);
  await moveUntil(page, 'd', (state) => state.player.x > 300);

  let capturedLiveTelegraph = false;
  await expect.poll(async () => {
    const actors = (await snapshot(page)).actorPresentation;
    const telegraphVisible = Boolean(
      actors?.hangers.some((hanger) => hanger.lungeCueVisible)
      || actors?.telegraphs.some((telegraph) => telegraph.visible),
    );
    if (telegraphVisible && !capturedLiveTelegraph) {
      await page.screenshot({ path: `${ARTIFACT_ROOT}/first-combat.png`, fullPage: true });
      capturedLiveTelegraph = true;
    }
    return capturedLiveTelegraph;
  }, { timeout: 20_000, intervals: [16] }).toBe(true);

  assertLocalOnly();
});

test('captures the compact 800x600 layout at native canvas scale', async ({ page }) => {
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 800, height: 600 });
  await setIntegerCanvasScale(page, 1);

  await expect(page.locator('#mvp-run-health')).toBeVisible();
  await expect(page.locator('#mvp-run-cash')).toBeVisible();
  await expect(page.locator('#mvp-run-heat')).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(800);
  await page.screenshot({ path: `${ARTIFACT_ROOT}/compact-800x600.png`, fullPage: true });

  assertLocalOnly();
});

test('ten restart cycles keep one opening view, stable listeners, and one ambience group', async ({ page }) => {
  test.setTimeout(150_000);
  const assertLocalOnly = rejectExternalRequests(page);
  await launchRun(page, { width: 1440, height: 900 });
  await setIntegerCanvasScale(page, 2);
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
  await moveUntil(page, 'd', (state) => state.roomId === 'storefront_a');
  expect((await snapshot(page)).presentation).toBeNull();

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
