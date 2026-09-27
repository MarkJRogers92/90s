#!/usr/bin/env node
/**
 * Visual capture harness for the neon overhaul.
 *
 *   node scripts/capture.mjs <baseUrl> <outDir> [fixture...]
 *
 * Launches Night Shift at 1440x900 and 800x600, optionally walks the janitor
 * through a debug fixture, and writes full-page PNGs. Development-only: the
 * fixtures and debug bridge exist only when VITE_ENABLE_DEBUG_BRIDGE=true.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:4180', outDir = 'artifacts/neon-overhaul', ...shots] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const SHOTS = {
  opening: { fixture: null, walk: [['d', 900]], wait: 1200 },
  'opening-compact': { fixture: null, viewport: { width: 800, height: 600 }, walk: [['d', 600]], wait: 1200 },
  storefront: { fixture: 'mvp-storefront', walk: [], wait: 1600 },
  bench: { fixture: 'mvp-bench', walk: [], wait: 1600 },
  foodcourt: { fixture: 'mvp-storefront', walk: [['s', 380], ['d', 2600]], wait: 1600, settle: 1400 },
  boss: { fixture: 'mvp-boss-entry', walk: [['d', 900]], wait: 2500 },
};

const browser = await chromium.launch();
for (const name of shots.length ? shots : Object.keys(SHOTS)) {
  const shot = SHOTS[name];
  if (!shot) continue;
  const page = await browser.newPage({ viewport: shot.viewport ?? { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/?seed=7${shot.fixture ? `&fixture=${shot.fixture}` : ''}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForTimeout(shot.wait);
  for (const [key, ms] of shot.walk) {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(shot.settle ?? 2800);
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path });
  console.log(`${path}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
  await page.close();
}
await browser.close();
