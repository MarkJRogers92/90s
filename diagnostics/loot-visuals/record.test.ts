import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {} }));
import { LootView } from '../../src/game/view/LootView';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { collectTokens } from '../../src/sim/run/tokens';
import { collectItemDrops } from '../../src/sim/run/drops';
import { runMaxHealth } from '../../src/sim/run/perks';
import { itemIconKey } from '../../src/game/presentation/assets';
import { usableTextureKey } from '../../src/game/presentation/assetFallback';
import { presentationDepth } from '../../src/game/presentation/depth';
import { ensureFxTextures, FX_TEXTURES } from '../../src/game/presentation/neon/proceduralTextures';
import type { MallTokenPickup } from '../../src/sim/run/tokens';

type Command = { kind: string; color: string | number; alpha: number; points: number[] };
type Texture = { key: string; width: number; height: number; commands: Command[] };
const generated: Record<string, Texture> = {};
class RecordedImage {
  kind = 'image'; texture: { key: string }; x = 0; y = 0; scaleX = 1; scaleY = 1;
  alpha = 1; depth = 0; visible = true; destroyed = false; originX = .5; originY = .5;
  constructor(key: string) { this.texture = { key }; }
  setTexture(key: string) { this.texture.key = key; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setAlpha(n: number) { this.alpha = n; return this; }
  setDepth(n: number) { this.depth = n; return this; }
  setOrigin(x = .5, y = x) { this.originX = x; this.originY = y; return this; }
  setVisible(b: boolean) { this.visible = b; return this; }
  destroy() { this.destroyed = true; }
}
class RecordedGraphics {
  kind = 'graphics'; commands: Command[] = []; color = 0; alpha = 1; depth = 0; destroyed = false;
  setDepth(n: number) { this.depth = n; return this; }
  clear() { this.commands = []; return this; }
  fillStyle(color: number, alpha = 1) { this.color = color; this.alpha = alpha; return this; }
  fillRect(...points: number[]) { this.commands.push({ kind: 'rect', color: this.color, alpha: this.alpha, points }); return this; }
  fillTriangle(...points: number[]) { this.commands.push({ kind: 'triangle', color: this.color, alpha: this.alpha, points }); return this; }
  destroy() { this.destroyed = true; }
}
const skipped = new Set([FX_TEXTURES.light, FX_TEXTURES.lightHard, FX_TEXTURES.shadow, FX_TEXTURES.spark,
  'floor:concrete', 'floor:checker', 'floor:linoleum', 'floor:gravel', 'floor:ice']);
function makeScene() {
  const images: RecordedImage[] = []; const graphics: RecordedGraphics[] = [];
  const clock = { now: 0 };
  const scene = {
    time: clock,
    textures: {
      exists: (key: string) => key.startsWith('neon:item:') || skipped.has(key) || !!generated[key],
      get: (key: string) => ({ key }),
      createCanvas: (key: string, width: number, height: number) => {
        const texture = generated[key] = { key, width, height, commands: [] };
        const context = { fillStyle: '#000000', fillRect: (x: number, y: number, w: number, h: number) => {
          texture.commands.push({ kind: 'rect', color: context.fillStyle, alpha: 1, points: [x, y, w, h] });
        } };
        return { getContext: () => context, refresh: () => {} };
      },
    },
    add: {
      image: (x: number, y: number, key: string) => { const image = new RecordedImage(key).setPosition(x, y); images.push(image); return image; },
      graphics: () => { const g = new RecordedGraphics(); graphics.push(g); return g; },
    },
  } as unknown as Phaser.Scene;
  const lights: object[] = []; const shadows: object[] = [];
  const layers = {
    light: (light: object) => lights.push(light),
    shadow: (id: string, x: number, y: number, scale: number) => shadows.push({ id, x, y, scale }),
  };
  return { scene, images, graphics, layers, clock, lights, shadows };
}
const root = 'diagnostics/loot-visuals';
// Frozen from this exact review baseline, so regeneration works after integration too.
const baselineCommit = 'c873f4bdbc0c190c471b17e270934eb7b9795092';
const baselineBody = readFileSync(`${root}/baseline-drawTokens.js.txt`, 'utf8');
const baseline = new Function('itemIconKey', 'usableTextureKey', 'FX_TEXTURES', 'presentationDepth', 'runMaxHealth',
  `return function(state) {${baselineBody}}`)(itemIconKey, usableTextureKey, FX_TEXTURES, presentationDepth, runMaxHealth);
const tokens: Record<string, MallTokenPickup> = {
  cash: { id: 'cash', x: 480, y: 260, value: 4, droppedTick: 0 },
  snack: { id: 'snack', x: 480, y: 260, value: 0, kind: 'snack', droppedTick: 0 },
  common: { id: 'common', x: 480, y: 260, value: 0, kind: 'item', itemDefinitionId: 'pump_soaker', droppedTick: 0 },
  rare: { id: 'rare', x: 480, y: 260, value: 0, kind: 'item', itemDefinitionId: 'golden_mop', rare: true, droppedTick: 0 },
};
function setup(token: MallTokenPickup | null, tick = 60, nearby = false, hurt = false) {
  const record = makeScene(); const state = createMvpRun(3);
  state.room.combat.enemies = []; state.room.combat.projectiles = [];
  state.room.combat.player.x = nearby ? 430 : 300; state.room.combat.player.y = 260;
  if (hurt) state.room.combat.player.health = 1;
  state.room.tokens = token ? [token] : []; state.tick = tick;
  return { ...record, state };
}
function snapshot(record: ReturnType<typeof setup>) {
  return JSON.parse(JSON.stringify({ tick: record.state.tick, health: record.state.room.combat.player.health,
    liveTokens: record.state.room.tokens.length, trace: record.state.behaviorTrace,
    objects: [...record.graphics, ...record.images].filter(x => !x.destroyed && (!('visible' in x) || x.visible)).sort((a, b) => a.depth - b.depth),
    shadows: record.shadows, lights: record.lights }));
}
function capture(token: MallTokenPickup, tick: number, after: boolean, nearby = false, hurt = false, quiet = false) {
  const record = setup(token, tick, nearby, hurt);
  if (after) new LootView(record.scene).sync(record.state, 'offline', record.layers, quiet);
  else baseline.call({ scene: record.scene, tokenSprites: new Map(), contactShadow: record.layers.shadow,
    openingConcourse: { addLight: record.layers.light } }, record.state);
  return snapshot(record);
}

it('records live renderer transforms, source textures and authoritative collection receipts', () => {
  mkdirSync(root, { recursive: true });
  const scene = makeScene(); ensureFxTextures(scene.scene);
  expect(generated[FX_TEXTURES.token]?.commands.length).toBeGreaterThan(40);
  const edgeTick = Array.from({ length: 61 }, (_, n) => n + 24).sort((a, b) => Math.abs(Math.cos((a + 480) / 9)) - Math.abs(Math.cos((b + 480) / 9)))[0]!;
  const stills: Record<string, unknown> = {};
  for (const [name, token] of Object.entries(tokens)) {
    stills[name] = { before: capture(token, edgeTick, false), after: capture(token, edgeTick, true) };
  }
  const ticks = [24, 32, 39, 47, 55, 63];
  const motion: Record<string, unknown> = {};
  for (const name of ['cash', 'rare']) motion[name] = ticks.map(tick => ({ tick,
    before: capture(tokens[name]!, tick, false), after: capture(tokens[name]!, tick, true) }));
  const labels = {
    fullHealth: capture(tokens.snack!, 60, true, true),
    hurt: capture(tokens.snack!, 60, true, true, true),
    common: capture(tokens.common!, 60, true, true),
    rare: capture(tokens.rare!, 60, true, true),
    stepAway: capture({ ...tokens.common!, awaitingStepOff: true }, 60, true, true),
    cash: capture(tokens.cash!, 60, true, true),
  };
  expect(JSON.stringify(labels.fullHealth)).toContain('PRETZEL - HEALTH FULL');
  expect(JSON.stringify(labels.common)).toContain('PUMP-ACTION SOAKER - WALK OVER');
  const receipts: Record<string, unknown> = {};
  for (const name of ['cash', 'snack', 'common', 'rare']) {
    const record = setup(null, 60, true, name === 'snack');
    const view = new LootView(record.scene); view.sync(record.state, 'offline', record.layers, true);
    record.state.room.combat.player.x = 480;
    record.state.room.tokens = [tokens[name]!]; record.state.tick = 61;
    if (name === 'cash' || name === 'snack') collectTokens(record.state); else collectItemDrops(record.state);
    view.sync(record.state, 'offline', record.layers, true); const visible = snapshot(record);
    record.state.tick = 140; view.sync(record.state, 'offline', record.layers, true); const expired = snapshot(record);
    expect(visible.objects.some((x: any) => x.kind === 'image' && x.texture.key.startsWith('label:'))).toBe(true);
    expect(expired.objects.some((x: any) => x.kind === 'image' && x.texture.key.startsWith('label:'))).toBe(false);
    receipts[name] = { visible, expired };
  }
  const provenance = Object.fromEntries(['src/game/view/LootView.ts', 'src/game/view/lootCues.ts',
    'src/game/presentation/neon/proceduralTextures.ts', 'src/game/presentation/neon/pixelFont.ts',
    'public/assets/neon/items/pump-soaker.png', 'public/assets/neon/items/golden-mop.png'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  writeFileSync(`${root}/recording.json`, JSON.stringify({ type: 'OFFLINE EXACT-TRANSFORM COMPOSITE, NOT GAMEPLAY SCREENSHOT',
    baselineCommit, recordingCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), provenance,
    edgeTick, ticks, generated, stills, motion, labels, receipts }, null, 2) + '\n');
});
