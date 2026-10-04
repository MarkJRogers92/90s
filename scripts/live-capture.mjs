// Live visual QA: launches Night Shift on a fixture in a real Chromium, waits for the
// clock-in to pass, and saves screenshots. Dev-only; needs the debug bridge build:
//   VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
//   node scripts/live-capture.mjs --fixture mvp-back-hall --out artifacts/live-qa/back-hall
// Options: --base URL, --seed N, --fixture NAME, --out PREFIX, --wait MS,
//          --attack (swing at the nearest enemy and capture its reaction frames),
//          --target KIND (with --attack: only go after this enemy kind, e.g. hanger).
// CHROME=/path/to/chromium overrides the browser binary.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:4180');
const seed = arg('seed', '1');
const fixture = arg('fixture', '');
const out = arg('out', 'artifacts/live-qa/capture');
const wait = Number(arg('wait', '3500'));
const attack = process.argv.includes('--attack');
const targetKind = arg('target', '');
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/?seed=${seed}${fixture ? `&fixture=${fixture}` : ''}`);
await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
await page.waitForFunction(() => Boolean(window.__DEAD_MALL_DEBUG__?.snapshot), null, { timeout: 30_000 });
await page.waitForFunction(() => !window.__DEAD_MALL_DEBUG__.snapshot().cinematic && window.__DEAD_MALL_DEBUG__.snapshot().tick > 30, null, { timeout: 30_000 }).catch(() => {});
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(wait);
const snap = () => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
let state = await snap();
await page.screenshot({ path: `${out}-room.png` });
console.log(JSON.stringify({ room: state.roomId, tick: state.tick, enemies: (state.enemies ?? []).map((e) => `${e.kind}@${Math.round(e.x)},${Math.round(e.y)}:${e.health}`) }));

if (attack) {
  const canvas = await page.locator('canvas').boundingBox();
  const toPage = async (x, y) => {
    const p = await page.evaluate(([wx, wy]) => window.__DEAD_MALL_DEBUG__.worldToCanvas?.(wx, wy) ?? { x: wx, y: wy }, [x, y]);
    return { x: canvas.x + p.x, y: canvas.y + p.y };
  };
  // Walk toward the nearest live enemy, swinging when in reach; capture frames after each hit.
  let shots = 0;
  for (let step = 0; step < 240 && shots < 6; step += 1) {
    state = await snap();
    const me = state.player;
    const foes = (state.enemies ?? []).filter((e) => e.health > 0 && (!targetKind || e.kind === targetKind));
    if (!foes.length || state.status !== 'playing') break;
    const target = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    const aim = await toPage(target.x, target.y - 20);
    await page.mouse.move(aim.x, aim.y);
    const dist = Math.hypot(target.x - me.x, target.y - me.y);
    const keys = dist > 50 ? [target.x > me.x + 8 ? 'd' : target.x < me.x - 8 ? 'a' : null, target.y > me.y + 8 ? 's' : target.y < me.y - 8 ? 'w' : null].filter(Boolean) : [];
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(80);
    for (const k of keys) await page.keyboard.up(k);
    if (dist <= 70) {
      const before = target.health;
      await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
      for (let poll = 0; poll < 12; poll += 1) {
        const now = await snap();
        const hit = (now.enemies ?? []).find((e) => e.id === target.id);
        if (hit && hit.health < before) {
          const at = await toPage(hit.x, hit.y - 24);
          const clip = { x: Math.max(0, at.x - 110), y: Math.max(0, at.y - 110), width: 220, height: 220 };
          // Sample the renderer's own evidence through the flinch, and grab the first
          // frame that shows a native hurt texture (screenshots are too slow to burst).
          const seen = [];
          let framed = false;
          for (let f = 0; f < 40; f += 1) {
            const actors = await page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot().actorPresentation?.enemies ?? []);
            const mine = actors.find((a) => a.id === `enemy:${hit.id}`);
            if (mine) seen.push(`${mine.textureKey.split(':').pop()}[${mine.frame.column}]`);
            if (!framed && mine?.textureKey.includes('hurt')) {
              // Re-centre on where it is now: an attacking enemy may have lunged since the hit.
              const live = (await snap()).enemies.find((e) => e.id === hit.id) ?? hit;
              const now = await toPage(live.x, live.y - 24);
              const liveClip = { x: Math.max(0, now.x - 150), y: Math.max(0, now.y - 150), width: 300, height: 300 };
              await page.screenshot({ path: `${out}-hit-${shots}-${hit.kind}-zoom.png`, clip: liveClip });
              framed = true;
            }
          }
          if (!framed) await page.screenshot({ path: `${out}-hit-${shots}-${hit.kind}-zoom.png`, clip });
          console.log(JSON.stringify({ hit: shots, kind: hit.kind, frames: [...new Set(seen)] }));
          await page.screenshot({ path: `${out}-hit-${shots}.png` });
          shots += 1;
          break;
        }
      }
    }
  }
  console.log(JSON.stringify({ hitShots: shots }));
}
console.log(JSON.stringify({ errors }));
await browser.close();
