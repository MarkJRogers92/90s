import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 }, Scenes: { Events: { POST_UPDATE: 'postupdate' } } } }));
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/game/settings/settings';
import { CRT_SCANLINE_TEXTURE, crtLook, installCrt, rollingBarY } from '../../src/game/presentation/crtFilter';
import type Phaser from 'phaser';

/**
 * Roadmap V6: an opt-in CRT/VHS look. Off by default; scanlines, a slight
 * barrel curve, a vignette and a horizontal VHS bleed; the rolling bar only
 * when flashes are allowed. Presentation only.
 */
describe('the CRT filter setting', () => {
  it('is off by default, saved as a boolean, and repaired if garbled', () => {
    expect(DEFAULT_SETTINGS.crt).toBe(false);
    expect(sanitizeSettings({ crt: true }).crt).toBe(true);
    expect(sanitizeSettings({ crt: 'yes' }).crt).toBe(false);
    expect(sanitizeSettings({}).crt).toBe(false);
  });

  it('has no look when off, and a gentle one when on', () => {
    expect(crtLook(DEFAULT_SETTINGS)).toBeNull();
    const look = crtLook({ ...DEFAULT_SETTINGS, crt: true })!;
    expect(look.barrel).toBeGreaterThan(1);
    expect(look.barrel).toBeLessThanOrEqual(1.05);
    expect(look.scanlineAlpha).toBeGreaterThan(0);
    expect(look.scanlineAlpha).toBeLessThanOrEqual(0.3);
    expect(look.bleed).toBeGreaterThan(0);
    expect(look.rollingBar).toBe(true);
  });

  it('never rolls the bar with flashes reduced', () => {
    expect(crtLook({ ...DEFAULT_SETTINGS, crt: true, flashes: 'reduced' })!.rollingBar).toBe(false);
  });

  it('drifts the rolling bar slowly down the screen and wraps', () => {
    const ys = Array.from({ length: 600 }, (_, tick) => rollingBarY(tick, 600));
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(-60);
      expect(y).toBeLessThan(660);
    }
    expect(Math.abs(rollingBarY(1, 600) - rollingBarY(0, 600))).toBeLessThan(3);
    expect(rollingBarY(0, 600)).not.toBe(rollingBarY(300, 600));
  });
});

describe('installing the CRT look', () => {
  function fakeScene() {
    const added: string[] = [];
    const removed: unknown[] = [];
    const controller = (name: string) => { added.push(name); return { name }; };
    const objects: Array<Record<string, unknown>> = [];
    const object = (kind: string) => {
      const o: Record<string, unknown> = { kind, destroyed: false };
      for (const m of ['setOrigin', 'setScrollFactor', 'setDepth', 'setAlpha', 'setBlendMode', 'setVisible', 'clear', 'fillStyle', 'fillRect']) o[m] = () => o;
      o.destroy = () => { o.destroyed = true; };
      objects.push(o);
      return o;
    };
    const listeners = new Map<string, () => void>();
    const textures = new Set<string>();
    const scene = {
      cameras: { main: { filters: { internal: {
        addBarrel: () => controller('barrel'), addVignette: () => controller('vignette'), addBlur: () => controller('blur'),
        remove: (c: unknown) => removed.push(c),
      } } } },
      textures: { exists: (k: string) => textures.has(k), createCanvas: (k: string) => { textures.add(k); return { getContext: () => ({ clearRect() {}, fillRect() {}, set fillStyle(_v: string) {} }), refresh() {} }; } },
      scale: { width: 960, height: 600 },
      add: { tileSprite: () => object('tile'), graphics: () => object('graphics') },
      events: { on: (e: string, f: () => void) => listeners.set(e, f), off: (e: string) => listeners.delete(e) },
      game: { loop: { frame: 0 } },
    } as unknown as Phaser.Scene;
    return { scene, added, removed, objects, listeners, textures };
  }

  it('adds the curve, vignette and bleed to the camera and lays scanlines over everything; the disposer removes it all', () => {
    const f = fakeScene();
    const dispose = installCrt(f.scene, crtLook({ ...DEFAULT_SETTINGS, crt: true })!);
    expect(f.added.sort()).toEqual(['barrel', 'blur', 'vignette']);
    expect(f.textures.has(CRT_SCANLINE_TEXTURE)).toBe(true);
    expect(f.objects.some((o) => o.kind === 'tile')).toBe(true);
    expect(f.listeners.size).toBe(1);
    dispose();
    expect(f.removed).toHaveLength(3);
    expect(f.objects.every((o) => o.destroyed)).toBe(true);
    expect(f.listeners.size).toBe(0);
  });

  it('draws no rolling bar with flashes reduced', () => {
    const f = fakeScene();
    installCrt(f.scene, crtLook({ ...DEFAULT_SETTINGS, crt: true, flashes: 'reduced' })!);
    expect(f.objects.filter((o) => o.kind === 'graphics')).toHaveLength(0);
    expect(f.listeners.size).toBe(0);
  });
});
