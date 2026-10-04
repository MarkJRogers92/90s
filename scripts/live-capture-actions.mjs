// Live QA for authored action sheets (roadmap V2/V4): logs the renderer's own sheet/frame
// evidence during real enemy telegraphs, Alex's dash and a ranged shot, and saves crops.
//   VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort &
//   CHROME=/opt/pw-browsers/chromium node scripts/live-capture-actions.mjs [--out artifacts/live-qa/pixellab] [--only owner,santa]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? f : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:4180'), out = arg('out', 'artifacts/live-qa/pixellab');
mkdirSync(out, { recursive: true });
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const report = {};
async function open(query) {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${base}/?${query}`);
  await p.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await p.waitForFunction(() => { const s = window.__DEAD_MALL_DEBUG__?.snapshot(); return s && !s.cinematic && s.tick > 30; }, null, { timeout: 60000 }).catch(() => {});
  return { p, errors, box: await p.locator('canvas').boundingBox() };
}
const snap = (p) => p.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
async function crop(p, box, x, y, file, half = 90) {
  const c = await p.evaluate(([a, d]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(a, d), [x, y]);
  const s = box.width / 960;
  await p.screenshot({ path: `${out}/${file}`, clip: { x: box.x + c.x - half * s, y: box.y + c.y - half * s, width: 2 * half * s, height: 2 * half * s } });
}
const TARGETS = [
  ['fixture=mvp-floor-three-brute&seed=1', 'mascot'], ['fixture=mvp-floor-four-roofer&seed=1', 'roofer'], ['fixture=mvp-district&floor=2&seed=1', 'spritzer'],
  // Bosses: the floor fights, and each district's mini-boss in its Lockdown room.
  ['fixture=mvp-floor-two-boss&seed=1', 'manager'], ['fixture=mvp-floor-three-boss&seed=1', 'owner'], ['fixture=mvp-floor-four-boss&seed=1', 'developer'],
  ['fixture=mvp-district&floor=1&room=security_office&seed=1', 'santa'], ['fixture=mvp-district&floor=2&room=security_office&seed=1', 'glamour_queen'],
  ['fixture=mvp-district&floor=3&room=security_office&seed=1', 'whiskers'], ['fixture=mvp-district&floor=4&room=security_office&seed=1', 'zamboni'],
];
// --only owner,santa limits the run to those kinds (and skips Alex unless "alex" is named).
const only = arg('only', null)?.split(',');
for (const [query, kind] of TARGETS.filter(([, k]) => !only || only.includes(k))) {
  const { p, errors, box } = await open(query);
  const seen = new Set(); const charging = new Set(); let shots = 0; const big = TARGETS.indexOf(TARGETS.find(([, k]) => k === kind)) >= 3;
  for (let i = 0; i < 500; i++) {
    const s = await snap(p); if (s.status !== 'playing') break;
    const ev = s.actorPresentation?.enemies ?? [];
    for (const e of s.enemies) if (e.kind === kind && (e.phase === 'telegraph' || (e.chargeTicks ?? 0) > 0)) {
      const x = ev.find((v) => v.id === `enemy:${e.id}`); if (!x) continue;
      (e.phase === 'telegraph' ? seen : charging).add(`${x.textureKey.split(':').pop()}[${x.frame.column}]`);
      if (shots < 3 && x.textureKey.includes('attack') && x.frame.column >= shots * 2) { await crop(p, box, e.x, e.y - (big ? 70 : 40), `${kind}-${shots}.png`, big ? 130 : 90); shots += 1; }
    }
    await p.waitForTimeout(15);
  }
  report[kind] = { frames: [...seen].sort(), charge: [...charging].sort(), errors: errors.length };
  await p.close();
}
if (!only || only.includes('alex')) { // Alex: dash east while aiming top-left, then fire a ranged weapon.
  const { p, errors, box } = await open('fixture=mvp-water&seed=3');
  await p.mouse.move(box.x + 40, box.y + 40); await p.waitForTimeout(800);
  await p.keyboard.down('d'); await p.waitForTimeout(100); await p.keyboard.press('Space');
  const dash = new Set();
  for (let i = 0; i < 20; i++) { const s = await snap(p); const pl = s.actorPresentation?.player; if (pl) dash.add(`${pl.textureKey.split(':').pop()}[${pl.frame.row},${pl.frame.column}]`); if (i === 2) await crop(p, box, s.player.x, s.player.y - 30, 'alex-dash.png', 70); }
  await p.keyboard.up('d'); await p.waitForTimeout(900);
  const t = await p.evaluate(() => window.__DEAD_MALL_DEBUG__.worldToCanvas(760, 235));
  await p.mouse.move(box.x + t.x, box.y + t.y); await p.keyboard.press('2'); await p.waitForTimeout(300);
  await p.mouse.down(); const aim = new Set(); let shot = false;
  for (let i = 0; i < 25; i++) { const s = await snap(p); const pl = s.actorPresentation?.player; if (pl) aim.add(`${pl.textureKey.split(':').pop()}[${pl.frame.row},${pl.frame.column}]`); if (!shot && pl?.textureKey.includes('aim')) { await crop(p, box, s.player.x + 20, s.player.y - 30, 'alex-aim.png', 70); shot = true; } }
  await p.mouse.up();
  report.alex = { dash: [...dash], aim: [...aim], errors: errors.length };
  await p.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close();
