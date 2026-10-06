#!/usr/bin/env node
/** Browser evidence for the hand-attachment / three-laser pilot.
 * Requires the normal debug Vite build; never changes combat state or forces a
 * production pose. Motion uses real pointer/keyboard input and samples the
 * renderer every RAF. Contact sheets instantiate the production views in an
 * isolated browser scene and must not be mistaken for live-combat evidence.
 *
 * VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
 * PW_CHROMIUM_PATH=/usr/bin/chromium node scripts/weapon-grip-capture.mjs
 * --base URL --out DIR --mode all|motion|sheets
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:4180');
const out = arg('out', 'artifacts/weapon-grip-pilot');
const mode = arg('mode', 'all');
assert(['all', 'motion', 'sheets'].includes(mode), 'mode must be all, motion, or sheets');
mkdirSync(out, { recursive: true });
const PILOTS = ['janitor_mop', 'box_cutter', 'super_soaker_50', 'laser_pointer', 'laser_tag_rifle', 'lightsaber_toy'];
const FACINGS = [
  { name: 'south', x: 0, y: 1, keys: ['s'] }, { name: 'southwest', x: -1, y: 1, keys: ['s', 'a'] },
  { name: 'west', x: -1, y: 0, keys: ['a'] }, { name: 'northwest', x: -1, y: -1, keys: ['w', 'a'] },
  { name: 'north', x: 0, y: -1, keys: ['w'] }, { name: 'northeast', x: 1, y: -1, keys: ['w', 'd'] },
  { name: 'east', x: 1, y: 0, keys: ['d'] }, { name: 'southeast', x: 1, y: 1, keys: ['s', 'd'] },
];
const evidence = { status: 'in-progress', generatedAt: new Date().toISOString(), base, nativeScale: '960×600 game stage, one CSS pixel per game pixel, deviceScaleFactor=1', motions: [], sheets: [] };
let browser;
const snap = page => page.evaluate(() => window.__DEAD_MALL_DEBUG__.snapshot());
async function aim(page, x, y) {
  const s = await snap(page);
  const pos = await page.evaluate(([x, y]) => window.__DEAD_MALL_DEBUG__.worldToCanvas(x, y), [s.player.x + x * 120, s.player.y + y * 120]);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + pos.x, box.y + pos.y);
}
async function phase(page, label, duration) {
  await page.evaluate(label => { window.__GRIP_PHASE__ = label; document.querySelector('#grip-qa-label').textContent = label; }, label);
  await page.waitForTimeout(duration);
}
function validate(samples, weapon) {
  assert(samples.length > 20, `${weapon}: no meaningful live render sample coverage`);
  // Logical transform equality, not a framebuffer pixel measurement. Phaser
  // roundPixels can snap the body differently from a rotated/scaled icon.
  let maxGripError = 0;
  const sources = {};
  for (const sample of samples) {
    const a = sample.actor, hand = a?.handAttachment, held = a?.heldWeapon;
    assert(hand && held && a.spriteActive, `${weapon}: missing actual displayed hand/weapon at tick ${sample.tick}`);
    const err = Math.hypot(held.grip.x - hand.x, held.grip.y - hand.y);
    maxGripError = Math.max(err, maxGripError);
    assert(err < 1e-7, `${weapon}: detached grip at tick ${sample.tick}: ${err}`);
    assert.equal(held.imageDepth, hand.depth + (hand.behind ? -1 : 1), `${weapon}: incorrect displayed hand layer`);
    const key = `${a.textureKey}/${a.direction}`;
    sources[key] ??= new Set(); sources[key].add(a.frame.column);
  }
  return { frames: samples.length, maxGripError, sourceFrames: Object.fromEntries(Object.entries(sources).map(([key, cols]) => [key, [...cols].sort((a, b) => a - b)])) };
}
async function captureMotion(weapon, hurt = false) {
  const id = `${weapon}${hurt ? '-hurt' : ''}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: join(out, 'video'), size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin) externalRequests.push(u.href); });
  await page.goto(`${base}/?seed=1&fixture=mvp-grip-pilot&gripWeapon=${weapon}${hurt ? '&gripHurt=1' : ''}`);
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
  await page.waitForFunction(() => window.__DEAD_MALL_DEBUG__?.snapshot().actorPresentation?.player?.heldWeapon, null, { timeout: 30000 });
  assert.equal((await snap(page)).inventory.selectedPrimaryInstanceId, `grip-${weapon}`);
  await page.addStyleTag({ content: '#game-host canvas { width: 960px !important; height: 600px !important; max-width: none !important; max-height: none !important; } #grip-qa-label { position: fixed; left: 12px; top: 8px; z-index: 99999; font: 16px monospace; color: #edfaf7; background: #10222c; padding: 8px; }' });
  await page.evaluate(() => {
    const label = document.createElement('div'); label.id = 'grip-qa-label'; document.body.append(label);
    window.__GRIP_PHASE__ = 'settle'; window.__GRIP_SAMPLES__ = []; window.__GRIP_SAMPLE_RUNNING__ = true;
    const tick = () => {
      if (!window.__GRIP_SAMPLE_RUNNING__) return;
      const s = window.__DEAD_MALL_DEBUG__.snapshot();
      window.__GRIP_SAMPLES__.push({ phase: window.__GRIP_PHASE__, tick: s.tick, player: s.player, actor: s.actorPresentation.player, shots: s.projectiles.filter(p => p.faction === 'player') });
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await phase(page, `${id} | native 1×`, 100);
  const native = await page.locator('canvas').boundingBox();
  assert.equal(native.width, 960); assert.equal(native.height, 600);
  if (hurt) {
    await aim(page, -1, 0);
    await phase(page, `${id} | ordinary enemy projectile → six-frame hurt`, 3000);
  } else {
    for (const f of FACINGS) {
      await aim(page, f.x, f.y);
      await phase(page, `${weapon} | ${f.name} idle`, 360);
      await page.locator('canvas').screenshot({ path: join(out, `${weapon}-${f.name}-native.png`) });
      for (const key of f.keys) await page.keyboard.down(key);
      await phase(page, `${weapon} | ${f.name} walk`, 500);
      for (const key of f.keys) await page.keyboard.up(key);
      await aim(page, f.x, f.y);
      const reverse = f.keys.map(k => ({ w: 's', s: 'w', a: 'd', d: 'a' })[k]);
      for (const key of reverse) await page.keyboard.down(key);
      await page.mouse.down();
      await phase(page, `${weapon} | ${f.name} continuous attack + backpedal`, 560);
      await page.mouse.up();
      for (const key of reverse) await page.keyboard.up(key);
      await phase(page, `${weapon} | ${f.name} recover`, 350);
    }
    await aim(page, 1, 0); await page.keyboard.down('a'); await page.keyboard.press('Space');
    await phase(page, `${weapon} | dash west while aiming east`, 350);
    await page.keyboard.up('a');
  }
  const samples = await page.evaluate(() => { window.__GRIP_SAMPLE_RUNNING__ = false; return window.__GRIP_SAMPLES__; });
  const stats = validate(samples, id);
  if (hurt) {
    const frames = samples.filter(s => s.actor.textureKey.endsWith('alex-hurt'));
    assert(frames.length > 5, 'real hurt animation was not observed');
    assert.deepEqual([...new Set(frames.map(s => s.actor.frame.column))].sort(), [0, 1, 2, 3, 4, 5]);
  } else {
    for (const f of FACINGS) {
      const moving = samples.filter(s => s.phase === `${weapon} | ${f.name} continuous attack + backpedal`);
      assert(moving.some(s => /alex-(aim|swing)$/.test(s.actor.textureKey)), `${weapon}/${f.name}: no actual attack pose`);
      const first = moving[0].player, last = moving.at(-1).player;
      assert((last.x - first.x) * f.x + (last.y - first.y) * f.y < -10, `${weapon}/${f.name}: did not move backwards`);
    }
    assert(samples.some(s => s.actor.textureKey.endsWith('alex-dash') && s.actor.direction === 'west'), `${weapon}: cross-aim dash not shown`);
  }
  const video = page.video();
  await context.close();
  await video.saveAs(join(out, `${id}-motion.webm`));
  writeFileSync(join(out, `${id}-frames.json`), JSON.stringify({ ...stats, errors, externalRequests, samples }, null, 2));
  evidence.motions.push({ weapon: id, ...stats, errors, externalRequests, video: `${id}-motion.webm` });
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ motion: id, ...stats }));
}

async function captureSheets() {
  const page = await browser.newPage({ viewport: { width: 1160, height: 1670 }, deviceScaleFactor: 1 });
  await page.goto(base);
  // Vite has already optimized Phaser for main.ts. Importing the production
  // classes uses that same module; no copied rendering math or mock images.
  const ids = await page.evaluate(async () => Object.keys((await import('/src/game/view/weaponPresentation.ts')).WEAPON_PRESENTATIONS));
  assert.equal(ids.length, 80, 'update the evidence scope if the catalog changes');
  for (const pose of ['idle', 'active']) {
    for (let start = 0; start < ids.length; start += 16) {
      const batch = ids.slice(start, start + 16);
      const result = await page.evaluate(async ({ batch, pose }) => {
        const Phaser = (await import('/node_modules/.vite/deps/phaser.js')).default;
        const { ActorSpriteView, ACTOR_DIRECTION_ORDER } = await import('/src/game/view/ActorSpriteView.ts');
        const { WeaponView } = await import('/src/game/view/WeaponView.ts');
        const { WEAPON_PRESENTATIONS } = await import('/src/game/view/weaponPresentation.ts');
        const { NEON_ASSETS, CHARACTER_ASSETS, PLAYER_TEXTURE_KEYS, itemIconKey } = await import('/src/game/presentation/assets.ts');
        if (window.__GRIP_SHEET_GAME__) { window.__GRIP_SHEET_GAME__.destroy(true); await new Promise(resolve => setTimeout(resolve, 100)); }
        document.body.innerHTML = '<div id="grip-sheet"></div>';
        document.body.style.cssText = 'margin:0;background:#0d1820';
        const evidence = [];
        return await new Promise((resolve, reject) => {
          const game = new Phaser.Game({ type: Phaser.CANVAS, width: 1160, height: batch.length * 96 + 90, parent: 'grip-sheet', pixelArt: true, backgroundColor: '#0d1820', banner: false, audio: { noAudio: true }, scene: {
            preload() {
              const keys = new Set([...Object.values(PLAYER_TEXTURE_KEYS), ...batch.map(itemIconKey)]);
              for (const asset of [...NEON_ASSETS, ...CHARACTER_ASSETS]) if (keys.has(asset.key)) this.load.image(asset.key, asset.url);
              this.load.on('loaderror', file => reject(new Error(`missing sheet asset ${file.key}`)));
            },
            create() {
              try {
                this.add.text(12, 8, `ALL 80 HELD ROOTS × 8 FACINGS | ${pose.toUpperCase()} | native 1× | production ActorSpriteView + WeaponView`, { font: '14px monospace', color: '#bff5e0' });
                ACTOR_DIRECTION_ORDER.forEach((direction, col) => this.add.text(222 + col * 116, 38, direction, { font: '11px monospace', color: '#87bcae' }).setOrigin(0.5));
                batch.forEach((id, row) => {
                  const p = WEAPON_PRESENTATIONS[id], delivery = p.pose === 'swing' ? 'direct' : 'projectile';
                  this.add.text(10, 94 + row * 96, id, { font: '12px monospace', color: '#deece8' });
                  ACTOR_DIRECTION_ORDER.forEach((direction, col) => {
                    const x = 222 + col * 116, y = 138 + row * 96;
                    const angle = Math.PI / 2 + col * Math.PI / 4;
                    const key = pose === 'idle' ? PLAYER_TEXTURE_KEYS.idle : delivery === 'direct' ? PLAYER_TEXTURE_KEYS.swing : PLAYER_TEXTURE_KEYS.aim;
                    const source = this.textures.get(key).getSourceImage();
                    const size = key === PLAYER_TEXTURE_KEYS.idle ? source.height : source.height / 8;
                    const frame = pose === 'idle' ? { row: 0, column: col } : { row: col, column: delivery === 'direct' ? 3 : 2 };
                    const spec = { textureKey: key, frameWidth: size, frameHeight: size, scale: 1, feetY: (size - 64) / 2 + 64 * 0.84 };
                    const actor = new ActorSpriteView(this, spec);
                    const visual = { direction, walking: false, attackLean: 0, damageFlicker: false, damageFeedback: false, lunge: 0, bobY: 0 };
                    actor.sync({ id, kind: 'alex', x, y, moveX: 0, moveY: 0, attackTicks: 0, damaged: false, phase: 'idle' }, frame, visual, true, 10, spec);
                    const attachment = actor.handAt();
                    if (!attachment) throw new Error(`${id}/${direction}: missing production palm`);
                    const weapon = new WeaponView(this), effects = this.add.graphics();
                    const state = { x, y, facingX: Math.cos(angle), facingY: Math.sin(angle), attackActiveTicks: pose === 'idle' ? 0 : 6, definitionId: id, delivery, range: 72, halfAngleRadians: 0.7, attachment };
                    if (pose === 'active') weapon.noteAttack(state, 0);
                    weapon.sync(state, pose === 'active' ? 7 : 0, effects, 10, true, true, pose === 'active' && delivery !== 'direct');
                    const held = weapon.headAt();
                    const error = held ? Math.hypot(held.grip.x - attachment.x, held.grip.y - attachment.y) : Infinity;
                    if (error > 1e-7) throw new Error(`${id}/${direction}: grip error ${error}`);
                    evidence.push({ id, direction, texture: key, frame, attachment, held, error });
                  });
                });
                this.game.events.once('postrender', () => resolve(evidence));
              } catch (error) { reject(error); }
            },
          } });
          window.__GRIP_SHEET_GAME__ = game;
        });
      }, { batch, pose });
      const name = `all-weapons-${pose}-${String(start + 1).padStart(2, '0')}-${String(start + batch.length).padStart(2, '0')}.png`;
      await page.locator('canvas').screenshot({ path: join(out, name) });
      evidence.sheets.push({ name, pose, cells: result.length, roots: batch, geometry: result });
      console.log(JSON.stringify({ sheet: name, cells: result.length }));
    }
  }
  await page.close();
}
try {
  browser = await chromium.launch(process.env.PW_CHROMIUM_PATH || process.env.CHROME ? { executablePath: process.env.PW_CHROMIUM_PATH || process.env.CHROME } : {});
  if (mode !== 'sheets') {
    for (const weapon of PILOTS) await captureMotion(weapon);
    await captureMotion('laser_pointer', true);
  }
  if (mode !== 'motion') await captureSheets();
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = String(error);
  throw error;
} finally {
  writeFileSync(join(out, 'evidence-summary.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
}
