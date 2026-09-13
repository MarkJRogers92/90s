import { expect, test, type Page } from '@playwright/test';

type LabSnapshot = {
  mode: 'shift' | 'lab';
  generation: number;
  tick: number;
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
    statuses?: { wetTicks: number; stickyTicks: number; stickyMultiplier: number };
  }>;
  projectiles: Array<{
    id: number;
    faction: 'player' | 'enemy';
    phase?: 'outbound' | 'return';
    hasBurst?: boolean;
    payload?: { delivery: 'water_projectile' | 'drifting_bubble'; radius: number };
  }>;
  surfaces: Array<{ id: number; kind: 'wet'; radius: number; remainingTicks: number }>;
  inventory: Array<{ instanceId: string; itemId: string }>;
  selectedPrimaryId: string;
  primary: { definitionId: string; name: string; delivery: 'direct' | 'projectile' };
  compatibilityNotes: string[];
  compiledTrace: string[];
  recentChange: string;
  behaviorTrace: string[];
  limitDiagnostics: string[];
};

type CollectedErrors = {
  pageErrors: string[];
  consoleErrors: string[];
};

function collectErrors(page: Page): CollectedErrors {
  const errors: CollectedErrors = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
  });
  return errors;
}

async function snapshot(page: Page): Promise<LabSnapshot> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as {
        __DEAD_MALL_DEBUG__: { snapshot(): LabSnapshot };
      }
    ).__DEAD_MALL_DEBUG__;
    return debug.snapshot();
  });
}

async function launchInteractionLab(page: Page): Promise<void> {
  await page.goto('/');
  const launch = page.getByRole('button', { name: 'Interaction Lab', exact: true });
  await expect(launch).toBeVisible();
  await launch.click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('run-hud')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Interaction Lab' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__));
  await expect.poll(() => snapshot(page).then((state) => state.tick)).toBeGreaterThan(0);
}

async function fireAtWorld(page: Page, worldX: number, worldY: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }
  await page.mouse.move(box.x + (worldX / 960) * box.width, box.y + (worldY / 480) * box.height);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

function ownedItemIds(state: LabSnapshot): string[] {
  return state.inventory.map((instance) => instance.itemId).sort();
}

test('launches the interaction lab from its own visible action on one canvas and panel', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchInteractionLab(page);

  const state = await snapshot(page);
  expect(state.mode).toBe('lab');
  expect(state.status).toBe('playing');
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
  expect(await page.getByRole('region', { name: 'Interaction Lab' }).count()).toBe(1);
  await expect(page.getByRole('button', { name: 'Start shift', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Interaction Lab' })).toBeVisible();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the interaction lab stays frozen to the original eight item cards', async ({ page }) => {
  const errors = collectErrors(page);
  await launchInteractionLab(page);
  const lab = page.getByRole('region', { name: 'Interaction Lab' });

  await expect(lab.locator('[data-item-id]')).toHaveCount(8);
  for (const m4Id of ['receipt_wallet', 'fanny_pack', 'rc_car', 'party_popper']) {
    await expect(lab.locator(`[data-item-id="${m4Id}"]`)).toHaveCount(0);
  }
  expect(await page.locator('canvas').count()).toBe(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Soaker + Bath + Rewinder fires one authoritative outbound/return burst from the canvas', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await launchInteractionLab(page);
  const lab = page.getByRole('region', { name: 'Interaction Lab' });

  const before = await snapshot(page);
  await lab.getByRole('button', { name: 'Soaker + Bath + Rewinder', exact: true }).click();
  await expect.poll(() => snapshot(page).then((state) => state.primary.definitionId)).toBe(
    'pump_soaker',
  );

  const preset = await snapshot(page);
  expect(preset.generation).toBeGreaterThan(before.generation);
  expect(ownedItemIds(preset)).toEqual(['bubble_bath', 'pump_soaker', 'vhs_rewinder']);
  expect(preset.primary.delivery).toBe('projectile');
  expect(preset.tick).toBeLessThan(before.tick + 30);

  const target = preset.enemies.find((enemy) => enemy.kind === 'spitter');
  expect(target).toBeDefined();
  if (!target) {
    return;
  }
  await fireAtWorld(page, target.x, target.y);

  await expect
    .poll(
      () =>
        snapshot(page).then(
          (state) =>
            state.projectiles.filter(
              (projectile) => projectile.faction === 'player' && projectile.phase === 'outbound',
            ).length,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  const outbound = await snapshot(page);
  const shot = outbound.projectiles.find((projectile) => projectile.faction === 'player');
  expect(shot?.payload?.delivery).toBe('drifting_bubble');

  await expect
    .poll(
      () =>
        snapshot(page).then((state) =>
          state.projectiles.some(
            (projectile) => projectile.faction === 'player' && projectile.phase === 'return',
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  await expect.poll(() => snapshot(page).then((state) => state.surfaces.length), {
    timeout: 20_000,
  }).toBe(1);
  await expect
    .poll(
      () =>
        snapshot(page).then(
          (state) => state.projectiles.filter((projectile) => projectile.faction === 'player').length,
        ),
      { timeout: 15_000 },
    )
    .toBe(0);

  const after = await snapshot(page);
  expect(after.behaviorTrace.filter((line) => /burst/.test(line))).toHaveLength(1);
  expect(after.behaviorTrace.some((line) => /began return pass/.test(line))).toBe(true);
  expect(after.surfaces[0]?.kind).toBe('wet');
  expect(after.surfaces[0]?.radius).toBe(48);
  expect(after.recentChange).toMatch(/burst/i);

  await expect(lab.getByText(/began return pass/i).first()).toBeVisible();
  await expect(lab.getByRole('status').first()).toContainText(/burst/i);
  await expect(page.getByTestId('run-hud')).toContainText(/RECENT:/);
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('Mop + Rewinder keeps a direct primary and explains the rewinder limit', async ({ page }) => {
  const errors = collectErrors(page);
  await launchInteractionLab(page);
  const lab = page.getByRole('region', { name: 'Interaction Lab' });

  await lab.getByRole('button', { name: 'Mop + Rewinder', exact: true }).click();
  await expect.poll(() => snapshot(page).then((state) => state.primary.definitionId)).toBe(
    'janitor_mop',
  );

  const state = await snapshot(page);
  expect(state.primary.delivery).toBe('direct');
  expect(ownedItemIds(state)).toEqual(['janitor_mop', 'vhs_rewinder']);
  expect(state.compatibilityNotes.join(' ')).toMatch(/VHS Rewinder/);
  expect(state.compatibilityNotes.join(' ')).toMatch(/projectile/i);

  await expect(lab.getByText(/limited applicability/i).first()).toBeVisible();
  await expect(lab.getByText(/VHS Rewinder/i).first()).toBeVisible();
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
  expect(await page.getByRole('region', { name: 'Interaction Lab' }).count()).toBe(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('a real ownership toggle and primary selection reset into a fresh deterministic run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await launchInteractionLab(page);
  const lab = page.getByRole('region', { name: 'Interaction Lab' });

  await lab.getByRole('button', { name: 'Soaker + Bath + Rewinder', exact: true }).click();
  await expect.poll(() => snapshot(page).then((state) => state.primary.definitionId)).toBe(
    'pump_soaker',
  );
  const beforeToggle = await snapshot(page);

  await lab.getByRole('checkbox', { name: 'Owned: Gel Pen Pack' }).check();
  await expect
    .poll(() => snapshot(page).then((state) => state.generation))
    .toBe(beforeToggle.generation + 1);

  const afterToggle = await snapshot(page);
  expect(ownedItemIds(afterToggle)).toEqual([
    'bubble_bath',
    'gel_pens',
    'pump_soaker',
    'vhs_rewinder',
  ]);
  expect(afterToggle.primary.definitionId).toBe('pump_soaker');
  // A fresh deterministic run: authoritative trace and transient state reset.
  expect(afterToggle.behaviorTrace).toEqual([]);
  expect(afterToggle.surfaces).toEqual([]);
  expect(afterToggle.enemies.map((enemy) => enemy.health)).toEqual([8, 8]);

  await lab.getByRole('radio', { name: 'Primary: Associate-Issue Mop' }).check();
  await expect.poll(() => snapshot(page).then((state) => state.primary.definitionId)).toBe(
    'janitor_mop',
  );
  const afterPrimary = await snapshot(page);
  expect(afterPrimary.generation).toBe(afterToggle.generation + 1);
  expect(afterPrimary.primary.delivery).toBe('direct');
  expect(ownedItemIds(afterPrimary)).toContain('janitor_mop');

  await expect(lab.getByRole('radio', { name: 'Primary: Bubble-Bath Concentrate' })).toBeDisabled();
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test('the interaction lab stays usable at 800x600 without horizontal overflow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await launchInteractionLab(page);
  const lab = page.getByRole('region', { name: 'Interaction Lab' });

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const canvasBox = await page.locator('canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox?.width ?? 0).toBeLessThanOrEqual(800);
  expect(canvasBox?.x ?? -1).toBeGreaterThanOrEqual(0);

  const labBox = await lab.boundingBox();
  expect(labBox).not.toBeNull();
  expect(labBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((labBox?.x ?? 0) + (labBox?.width ?? 0)).toBeLessThanOrEqual(801);

  const preset = lab.getByRole('button', { name: 'Mop + Rewinder', exact: true });
  await preset.scrollIntoViewIfNeeded();
  await expect(preset).toBeVisible();
  await preset.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => snapshot(page).then((state) => state.primary.definitionId)).toBe(
    'janitor_mop',
  );

  const toggle = lab.getByRole('checkbox', { name: 'Owned: Cracked Plasma Globe' });
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeEnabled();

  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.getByTestId('run-hud').count()).toBe(1);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
