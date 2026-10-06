// A visual sweep of every room on every floor: the boss wing and the first wing,
// plus each storefront's first shop inside. Dev-only (needs the debug bridge).
//   VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort &
//   node scripts/floor-sweep.mjs [--out artifacts/floor-sweep] [--seed 3] [--floors 1,2,3,4] [--parts boss,first]
// Writes one 1280x800 PNG per room. Look at every image.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:4180');
const out = arg('out', 'artifacts/floor-sweep');
const seed = arg('seed', '3');
const floors = arg('floors', '1,2,3,4').split(',').map(Number);
const parts = arg('parts', 'boss,first').split(',');
const rooms = arg('rooms', 'service_corridor,storefront_a,food_court,storefront_b,back_hall,security_office').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];

async function shoot(name, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await page.goto(`${base}/?fixture=mvp-room&event=none&seed=${seed}&${query}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => {
    const s = window.__DEAD_MALL_DEBUG__?.snapshot();
    return s && !s.cinematic && s.tick > 20;
  }, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3200);
  const box = await page.locator('canvas').boundingBox();
  await page.screenshot({ path: `${out}/${name}.png`, clip: box });
  await page.close();
}

for (const floor of floors) {
  for (const part of parts) {
    for (const room of rooms) {
      const tag = `f${floor}-${part}-${room}`;
      const partQuery = part === 'first' ? '&part=1' : '';
      await shoot(tag, `floor=${floor}${partQuery}&room=${room}&enemies=${room === 'security_office' ? 1 : 0}`);
      if (room.startsWith('storefront') && part === 'boss') await shoot(`${tag}-inside`, `floor=${floor}&room=${room}&store=1`);
      process.stdout.write(`${tag} `);
    }
  }
}
console.log('\nerrors:', errors.length ? errors : 'none');
await browser.close();
