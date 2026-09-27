#!/usr/bin/env node
/**
 * Captures the combat beats for visual review: a spitter wind-up, a hit
 * landing, a kill, the janitor getting hurt, and the boss slam. Drives real
 * input through the debug bridge. Development-only.
 *
 *   node scripts/capture-beats.mjs <baseUrl> <outDir>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:4180', outDir = 'artifacts/neon-overhaul/beats'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const snap = () => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
const toCanvas = (x, y) => page.evaluate(([x, y]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(x, y), [x, y]);
const shot = (name) => page.locator('canvas').screenshot({ path: join(outDir, `${name}.png`) });
const taken = new Set();
const once = async (name) => { if (!taken.has(name)) { taken.add(name); await shot(name); } };

async function fight(fixture, frames, { approach = true } = {}) {
  await page.goto(`${baseUrl}/?seed=7${fixture ? `&fixture=${fixture}` : ''}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForTimeout(1500);
  if (!fixture || fixture === 'mvp-storefront') {
    await page.keyboard.down('s'); await page.waitForTimeout(380); await page.keyboard.up('s');
    await page.keyboard.down('d');
    for (let i = 0; i < 60 && (await snap()).roomId !== 'food_court'; i++) await page.waitForTimeout(100);
    await page.keyboard.up('d');
  }
  const box = await page.locator('canvas').boundingBox();
  const held = new Set();
  const hold = async (keys) => {
    for (const k of ['w', 'a', 's', 'd']) {
      if (keys.includes(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (!keys.includes(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
    }
  };
  let last = await snap();
  let corpseIn = -1;
  for (let frame = 0; frame < frames; frame++) {
    const s = await snap();
    if (s.status !== 'playing') break;
    const hurt = s.player.health < last.player.health;
    const hit = s.enemies.some((e) => { const b = last.enemies.find((o) => o.id === e.id); return b && e.health < b.health; });
    const kill = s.enemies.length < last.enemies.length;
    if (hurt) await once(`${fixture ?? 'foodcourt'}-hurt`);
    if (kill) { await once(`${fixture ?? 'foodcourt'}-kill`); if (corpseIn < 0) corpseIn = 4; }
    if (corpseIn > 0 && --corpseIn === 0) await once(`${fixture ?? 'foodcourt'}-corpse`);
    else if (hit) await once(`${fixture ?? 'foodcourt'}-hit`);
    const charging = s.enemies.find((e) => e.phase === 'telegraph');
    if (charging) await once(`${fixture ?? 'foodcourt'}-windup-${charging.kind}`);
    last = s;
    const enemy = [...s.enemies].sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!enemy) break;
    const p = await toCanvas(enemy.x, enemy.y);
    await page.mouse.move(box.x + p.x, box.y + p.y);
    const dx = enemy.x - s.player.x;
    const dy = enemy.y - s.player.y;
    const keys = [];
    if (approach && Math.hypot(dx, dy) > 34) {
      if (dx > 12) keys.push('d'); if (dx < -12) keys.push('a');
      if (dy > 12) keys.push('s'); if (dy < -12) keys.push('w');
    }
    await hold(keys);
    await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
    await page.waitForTimeout(20);
  }
  await hold([]);
}

await fight('mvp-storefront', 260);
await fight('mvp-boss-entry', 320);
console.log([...taken].join('\n'));
await browser.close();
