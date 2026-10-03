// The roadmap's V0 live visual sweep: every presentation surface that unit tests
// cannot judge, captured from the real game in a real Chromium. Dev-only.
//   VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort &
//   CHROME=/opt/pw-browsers/chromium node scripts/live-qa-sweep.mjs [--out artifacts/live-qa/sweep]
// Writes PNGs plus sweep.json (console errors and per-shot notes). Look at every image.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:4180');
const out = arg('out', 'artifacts/live-qa/sweep');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const report = [];

async function launch(viewport, query) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/?${query}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => {
    const s = window.__DEAD_MALL_DEBUG__?.snapshot();
    return s && !s.cinematic && s.tick > 30;
  }, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { page, errors };
}
const snap = (page) => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
async function toPage(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  const p = await page.evaluate(([wx, wy]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(wx, wy), [x, y]);
  return { x: box.x + p.x, y: box.y + p.y, scale: box.width / 960, box };
}
async function crop(page, name, wx, wy, size = 240) {
  const c = await toPage(page, wx, wy);
  const half = (size * c.scale) / 2;
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: Math.max(0, c.x - half), y: Math.max(0, c.y - half), width: half * 2, height: half * 2 } });
}
async function done(name, page, errors, notes = {}) {
  report.push({ name, errors, ...notes });
  await page.close();
}

// 1. Weapon grips and attack effects: every arsenal weapon aimed east at a target, mid-attack.
{
  const { page, errors } = await launch({ width: 1280, height: 800 }, 'fixture=mvp-arsenal&seed=1');
  await page.screenshot({ path: `${out}/arsenal-dock-1280x800.png` });
  const target = await toPage(page, 760, 200);
  await page.mouse.move(target.x, target.y);
  const shots = [];
  for (let slot = 1; slot <= 9; slot += 1) {
    await page.keyboard.press(String(slot));
    await page.waitForTimeout(150);
    const before = await snap(page);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await crop(page, `weapon-${slot}`, before.player.x + 40, before.player.y - 20, 200);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const after = await snap(page);
    shots.push({ slot, equipped: after.inventory?.selectedPrimaryInstanceId ?? null });
  }
  await done('arsenal', page, errors, { shots });
}

// 2. The wanted strip at five stars (Loss Prevention follows) and the dock beside it.
{
  const { page, errors } = await launch({ width: 1280, height: 800 }, 'fixture=mvp-wanted&seed=1');
  const box = await page.locator('canvas').boundingBox();
  await page.screenshot({ path: `${out}/wanted-five-stars.png`, clip: { x: box.x, y: box.y + box.height * 0.72, width: box.width * 0.6, height: box.height * 0.28 } });
  await page.screenshot({ path: `${out}/wanted-five-stars-full.png` });
  const s = await snap(page);
  await done('wanted', page, errors, { heat: s.heat });
}

// 3. Floor 2: the Static's native hurt strip and CRT debris, in its own room lighting.
{
  const { page, errors } = await launch({ width: 1280, height: 800 }, 'fixture=mvp-floor-two-lobby&seed=1');
  await page.screenshot({ path: `${out}/floor-two-room.png` });
  let hits = 0;
  for (let step = 0; step < 260 && hits < 3; step += 1) {
    const s = await snap(page);
    if (s.status !== 'playing') break;
    const foe = (s.enemies ?? []).filter((e) => e.health > 0 && e.kind === 'static')
      .sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!foe) break;
    const aim = await toPage(page, foe.x, foe.y - 30);
    await page.mouse.move(aim.x, aim.y);
    const d = Math.hypot(foe.x - s.player.x, foe.y - s.player.y);
    const keys = d > 50 ? [foe.x > s.player.x + 8 ? 'd' : foe.x < s.player.x - 8 ? 'a' : null, foe.y > s.player.y + 8 ? 's' : foe.y < s.player.y - 8 ? 'w' : null].filter(Boolean) : [];
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(80);
    for (const k of keys) await page.keyboard.up(k);
    if (d <= 70) {
      await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
      const now = await snap(page);
      const hit = (now.enemies ?? []).find((e) => e.id === foe.id);
      if (!hit || hit.health < foe.health) { await crop(page, `static-hit-${hits}`, foe.x, foe.y - 30, 200); hits += 1; }
    }
  }
  await done('floor-two-static', page, errors, { staticHits: hits });
}

// 4. Menu, fullscreen control and stage centring on a phone, a 16:9 desktop and an ultrawide.
for (const [w, h] of [[390, 844], [1920, 1080], [3440, 1440]]) {
  const { page, errors } = await launch({ width: w, height: h }, 'seed=1');
  await page.screenshot({ path: `${out}/stage-${w}x${h}.png` });
  await page.locator('#run-menu-toggle').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/menu-${w}x${h}.png` });
  const geometry = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const g = document.querySelector('#game-host').getBoundingClientRect();
    const t = document.querySelector('.run-toolbar').getBoundingClientRect();
    return { offCentreX: Math.round(c.x + c.width / 2 - g.x - g.width / 2), toolbar: [t.x, t.y, t.width, t.height].map(Math.round), canvas: [c.x, c.y, c.width, c.height].map(Math.round) };
  });
  await done(`viewport-${w}x${h}`, page, errors, geometry);
}

writeFileSync(`${out}/sweep.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map((r) => ({ name: r.name, errors: r.errors.length, ...Object.fromEntries(Object.entries(r).filter(([k]) => !['name', 'errors', 'shots'].includes(k))) }))));
await browser.close();
