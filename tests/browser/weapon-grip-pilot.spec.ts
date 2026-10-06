import { expect, test, type Page } from '@playwright/test';
import type { MvpRunDebugSnapshot } from '../../src/debug/DebugBridge';
import { worldToCanvas } from './projection';

const PILOTS = ['janitor_mop', 'box_cutter', 'super_soaker_50', 'laser_pointer', 'laser_tag_rifle', 'lightsaber_toy'] as const;
const FACINGS = [
  { name: 'south', x: 0, y: 1, keys: ['s'] },
  { name: 'southwest', x: -1, y: 1, keys: ['s', 'a'] },
  { name: 'west', x: -1, y: 0, keys: ['a'] },
  { name: 'northwest', x: -1, y: -1, keys: ['w', 'a'] },
  { name: 'north', x: 0, y: -1, keys: ['w'] },
  { name: 'northeast', x: 1, y: -1, keys: ['w', 'd'] },
  { name: 'east', x: 1, y: 0, keys: ['d'] },
  { name: 'southeast', x: 1, y: 1, keys: ['s', 'd'] },
];
type Actor = NonNullable<NonNullable<MvpRunDebugSnapshot['actorPresentation']>['player']> & {
  handAttachment: null | { x: number; y: number; behind: boolean; depth: number; alpha: number };
  heldWeapon: null | { grip: { x: number; y: number }; head: { x: number; y: number }; imageDepth: number };
};
type Sample = { tick: number; player: MvpRunDebugSnapshot['player']; actor: Actor | null; shots: number };
type SamplingWindow = Window & { __GRIP_SAMPLES__?: Sample[]; __GRIP_SAMPLING__?: boolean };
const snapshot = (page: Page) => page.evaluate(() => window.__DEAD_MALL_DEBUG__!.snapshot() as MvpRunDebugSnapshot);

async function launch(page: Page, weapon: string, hurt = false): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.goto(`/?seed=1&fixture=mvp-grip-pilot&gripWeapon=${weapon}${hurt ? '&gripHurt=1' : ''}`);
  await expect(page.getByRole('button', { name: 'Night Shift', exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-06T00:10:00Z'));
  await page.getByRole('button', { name: 'Night Shift', exact: true }).click({ force: true });
  for (let step = 0; step < 3000; step++) {
    await page.clock.runFor(16);
    const ready = await page.evaluate(() => {
      const s = window.__DEAD_MALL_DEBUG__?.snapshot();
      return s?.mode === 'run' && s.actorPresentation?.player?.spriteActive;
    });
    if (ready) break;
  }
  const state = await snapshot(page);
  expect(state.roomId).toBe('food_court');
  expect(state.inventory.selectedPrimaryInstanceId).toBe(`grip-${weapon}`);
  expect(state.presentationLoadFailures).toBe(0);
  await page.addStyleTag({ content: '#game-host canvas { width: 960px !important; height: 600px !important; max-width: none !important; max-height: none !important; }' });
  await page.clock.runFor(32);
  await page.evaluate(() => {
    const w = window as SamplingWindow;
    w.__GRIP_SAMPLES__ = [];
    w.__GRIP_SAMPLING__ = true;
    const sample = () => {
      if (!w.__GRIP_SAMPLING__) return;
      const s = window.__DEAD_MALL_DEBUG__?.snapshot();
      if (s?.mode === 'run') w.__GRIP_SAMPLES__!.push({ tick: s.tick, player: s.player, actor: s.actorPresentation?.player as Actor ?? null, shots: s.projectiles.filter(p => p.faction === 'player').length });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
async function aim(page: Page, x: number, y: number): Promise<void> {
  const s = await snapshot(page);
  const point = await worldToCanvas(page, s.player.x + x * 120, s.player.y + y * 120);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + point.x, box.y + point.y);
}
async function sampleFor(page: Page, ms: number): Promise<Sample[]> {
  await page.evaluate(() => { (window as SamplingWindow).__GRIP_SAMPLES__ = []; });
  await page.clock.runFor(ms);
  return page.evaluate(() => (window as SamplingWindow).__GRIP_SAMPLES__!);
}
function attached(samples: Sample[], label: string): void {
  expect(samples.length, `${label}: real render samples`).toBeGreaterThan(5);
  for (const sample of samples) {
    const actor = sample.actor;
    expect(actor?.spriteActive, `${label}: sprite tick ${sample.tick}`).toBe(true);
    expect(actor?.handAttachment, `${label}: resolved displayed palm tick ${sample.tick}`).toBeTruthy();
    expect(actor?.heldWeapon, `${label}: held image tick ${sample.tick}`).toBeTruthy();
    const hand = actor!.handAttachment!, held = actor!.heldWeapon!;
    expect(held.grip.x, `${label}: grip x tick ${sample.tick}`).toBeCloseTo(hand.x, 7);
    expect(held.grip.y, `${label}: grip y tick ${sample.tick}`).toBeCloseTo(hand.y, 7);
    expect(held.imageDepth, `${label}: palm layer tick ${sample.tick}`).toBe(hand.depth + (hand.behind ? -1 : 1));
  }
}

for (const weapon of PILOTS) {
  test(`${weapon}: real movement, continuous attacks, and backpedalling keep every rendered grip on the hand in eight facings`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await launch(page, weapon);
    const report: Array<{ facing: string; phase: string; samples: Sample[] }> = [];
    for (const facing of FACINGS) {
      await aim(page, facing.x, facing.y);
      const idle = await sampleFor(page, 320);
      attached(idle, `${weapon} ${facing.name} idle`);
      expect(idle.at(-1)?.actor?.direction).toBe(facing.name);
      report.push({ facing: facing.name, phase: 'idle', samples: idle });
      for (const key of facing.keys) await page.keyboard.down(key);
      const walking = await sampleFor(page, 520);
      for (const key of facing.keys) await page.keyboard.up(key);
      attached(walking, `${weapon} ${facing.name} walk`);
      expect(walking.some(s => s.actor?.textureKey.endsWith('alex-walk'))).toBe(true);
      expect(Math.hypot(walking.at(-1)!.player.x - walking[0]!.player.x, walking.at(-1)!.player.y - walking[0]!.player.y)).toBeGreaterThan(15);
      report.push({ facing: facing.name, phase: 'walk', samples: walking });
      await aim(page, facing.x, facing.y);
      const reverse = facing.keys.map(k => ({ w: 's', s: 'w', a: 'd', d: 'a' })[k]!);
      for (const key of reverse) await page.keyboard.down(key);
      await page.mouse.down();
      const attacking = await sampleFor(page, 650);
      await page.mouse.up();
      for (const key of reverse) await page.keyboard.up(key);
      attached(attacking, `${weapon} ${facing.name} backpedal attack`);
      const active = attacking.filter(s => s.actor?.textureKey.endsWith('alex-aim') || s.actor?.textureKey.endsWith('alex-swing'));
      expect(active.length).toBeGreaterThan(5);
      expect(active.every(s => s.actor?.direction === facing.name)).toBe(true);
      const delta = { x: attacking.at(-1)!.player.x - attacking[0]!.player.x, y: attacking.at(-1)!.player.y - attacking[0]!.player.y };
      expect(delta.x * facing.x + delta.y * facing.y, 'backpedal travelled opposite firing direction').toBeLessThan(-15);
      report.push({ facing: facing.name, phase: 'continuous-attack-backpedal', samples: attacking });
      await sampleFor(page, 350);
    }
    // Dash west while aiming east: the displayed dash direction owns the palm/depth.
    await aim(page, 1, 0);
    await page.keyboard.down('a');
    await page.keyboard.press('Space');
    const dashing = await sampleFor(page, 260);
    await page.keyboard.up('a');
    attached(dashing, `${weapon} dash`);
    const dash = dashing.filter(s => s.actor?.textureKey.endsWith('alex-dash'));
    expect(dash.length).toBeGreaterThan(2);
    expect(dash.every(s => s.actor?.direction === 'west')).toBe(true);
    report.push({ facing: 'west', phase: 'dash-while-aiming-east', samples: dashing });
    await testInfo.attach('rendered-frame-evidence', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}

test('a real enemy hit interrupts the pilot with an attached native hurt animation', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await launch(page, 'laser_pointer', true);
  const before = await snapshot(page);
  await aim(page, -1, 0);
  const samples = await sampleFor(page, 2500);
  const hurt = samples.filter(s => s.actor?.textureKey.endsWith('alex-hurt'));
  expect(Math.min(...samples.map(s => s.player.health))).toBeLessThan(before.player.health);
  expect(hurt.length).toBeGreaterThan(5);
  attached(hurt, 'real hit hurt');
  expect([...new Set(hurt.map(s => s.actor!.frame.column))].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  await testInfo.attach('real-hurt-evidence', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});
