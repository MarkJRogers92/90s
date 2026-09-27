#!/usr/bin/env node
/**
 * Frame-rate check for the heaviest scene we have: a Food Court fight with
 * hits, kills, dashes and bloom. Runs once on the GPU and once on Chromium's
 * software renderer (a stand-in for weak machines), sampling real
 * requestAnimationFrame rates. Development-only (needs the debug bridge).
 *
 *   node scripts/perf-fight.mjs <baseUrl> <outDir>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:4180', outDir = 'artifacts/neon-overhaul/perf'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

async function run(label, args) {
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snap = () => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
  await page.goto(`${baseUrl}/?seed=7&fixture=mvp-storefront`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForTimeout(1500);
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2') ?? document.querySelector('canvas')?.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await page.keyboard.down('s'); await page.waitForTimeout(380); await page.keyboard.up('s');
  await page.keyboard.down('d');
  for (let i = 0; i < 300 && (await snap()).roomId !== 'food_court'; i++) await page.waitForTimeout(100);
  const room = (await snap()).roomId;
  await page.keyboard.up('d');
  await page.evaluate(() => {
    window.__fps = [];
    let last = performance.now(); let frames = 0;
    const loop = (now) => { frames += 1; if (now - last >= 500) { window.__fps.push((frames * 1000) / (now - last)); frames = 0; last = now; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const box = await page.locator('canvas').boundingBox();
  let dashShot = false;
  const started = Date.now();
  while (Date.now() - started < 9000) {
    const s = await snap();
    if (s.status !== 'playing' || !s.enemies.length) { await page.waitForTimeout(200); continue; }
    const e = [...s.enemies].sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    const p = await page.evaluate(([x, y]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(x, y), [e.x, e.y]);
    await page.mouse.move(box.x + p.x, box.y + p.y);
    const dx = e.x - s.player.x, dy = e.y - s.player.y;
    for (const [k, on] of [['d', dx > 12], ['a', dx < -12], ['s', dy > 12], ['w', dy < -12]]) { if (on && Math.hypot(dx, dy) > 40) await page.keyboard.down(k); else await page.keyboard.up(k); }
    if (Math.random() < 0.08) {
      await page.keyboard.press('Space');
      if (!dashShot) { await page.waitForTimeout(60); await page.locator('canvas').screenshot({ path: join(outDir, `${label}-dash.png`) }); dashShot = true; }
    }
    await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); await page.waitForTimeout(20);
  }
  for (const k of ['w', 'a', 's', 'd']) await page.keyboard.up(k);
  const fps = await page.evaluate(() => window.__fps);
  const sorted = [...fps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const low = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  console.log(JSON.stringify({ label, room, renderer, samples: fps.length, medianFps: Math.round(median), p10Fps: Math.round(low) }));
  await browser.close();
}

await run('gpu', ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']);
await run('software', ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
