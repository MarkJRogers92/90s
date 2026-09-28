#!/usr/bin/env node
/**
 * Scripted Food Court fight for visual review: walks into the first combat
 * room, then steers toward and swings at the nearest enemy with real input,
 * capturing frames mid-fight. Development-only (needs the debug bridge).
 *
 *   node scripts/playtest-fight.mjs <baseUrl> <outDir>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:4180', outDir = 'artifacts/neon-overhaul'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const snap = () => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
const toCanvas = (x, y) => page.evaluate(([x, y]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(x, y), [x, y]);
await page.goto(`${baseUrl}/?seed=7&fixture=mvp-storefront`);
await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
await page.waitForTimeout(1500);
await page.keyboard.down('s'); await page.waitForTimeout(380); await page.keyboard.up('s');
await page.keyboard.down('d');
for (let i = 0; i < 60 && (await snap()).roomId !== 'food_court'; i++) await page.waitForTimeout(100);
await page.keyboard.up('d');
const box = await page.locator('canvas').boundingBox();
let shots = 0;
const held = new Set();
const hold = async (keys) => {
  for (const k of ['w', 'a', 's', 'd']) {
    if (keys.includes(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    if (!keys.includes(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
  }
};
for (let frame = 0; frame < 260; frame++) {
  const s = await snap();
  if (s.status !== 'playing') break;
  const enemy = [...s.enemies].sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
  const target = enemy ?? (s.tokens?.[0]);
  if (!enemy) {
    await hold([]);
    if (shots < 4) { await page.screenshot({ path: join(outDir, `fight-${shots}.png`) }); shots++; }
    break;
  }
  const p = await toCanvas(enemy.x, enemy.y);
  await page.mouse.move(box.x + p.x, box.y + p.y);
  const dx = enemy.x - s.player.x;
  const dy = enemy.y - s.player.y;
  const keys = [];
  if (Math.hypot(dx, dy) > 34) {
    if (dx > 12) keys.push('d'); if (dx < -12) keys.push('a');
    if (dy > 12) keys.push('s'); if (dy < -12) keys.push('w');
  }
  await hold(keys);
  await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  if ((frame === 40 || frame === 90 || frame === 150) && shots < 3) { await page.screenshot({ path: join(outDir, `fight-${shots}.png`) }); shots++; }
  await page.waitForTimeout(30);
}
await hold([]);
const end = await snap();
console.log(JSON.stringify({ status: end.status, room: end.roomId, hp: end.player.health, enemies: end.enemies.length, cash: end.cash, recent: end.recentChange }));
await page.screenshot({ path: join(outDir, 'fight-end.png') });
await browser.close();
