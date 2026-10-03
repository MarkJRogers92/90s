// @ts-expect-error Vitest provides this Node built-in at test runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { projectCanvasToWorld, projectWorldToCanvas } from '../../src/game/view/projection';

const css = postcss.parse(readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
// Read the last exact-selector base declaration: catches the old late CSS
// overrides returning. Actual cascade/geometry is also asserted in browser QA.
function declaration(selector: string, property: string): string | undefined {
  let value: string | undefined;
  css.walkRules(selector, rule => {
    if (rule.parent?.type !== 'root') return;
    rule.walkDecls(property, decl => { value = decl.value; });
  });
  return value;
}

function mediaDeclaration(query: string, selector: string, property: string): string | undefined {
  let value: string | undefined;
  css.walkAtRules('media', at => {
    if (!at.params.includes(query)) return;
    at.walkRules(selector, rule => rule.walkDecls(property, decl => { value = decl.value; }));
  });
  return value;
}

describe('Night Shift viewport shell', () => {
  it('leaves canvas centering solely to Phaser instead of centering its margins twice', () => {
    expect(declaration(".run-shell[data-mode='run'] #game-host", 'display')).toBe('block');
    // Chromium applies justify-items to block layout: an inherited `place-items: center`
    // centred the canvas's margin box on top of Phaser's own margin (32 px off at 1280x720).
    expect(declaration(".run-shell[data-mode='run'] #game-host", 'place-items')).toBe('normal');
    expect(declaration(".run-shell[data-mode='run'] #game-host canvas", 'box-shadow')).toBe('none');
  });
  it('lets the store dropdown escape its chip while only the list scrolls', () => {
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-offers-wrap", 'overflow')).toBe('visible');
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-offers-wrap", 'max-height')).toBe('none');
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-offer-list", 'overflow')).toBe('auto');
  });
  it('sizes contextual rails from their content and clears legacy inset chrome', () => {
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-offers-title", 'margin')).toBe('0');
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-bench-actions", 'padding')).toBe('0');
    expect(declaration(".run-shell[data-mode='run'] .mvp-run-bench-actions", 'border')).toBe('0');
    expect(css.toString()).toContain(".mvp-run-hud:has(.mvp-run-bench:not([hidden]))");
  });
  it('uses dynamic viewport height while keeping a legacy fallback', () => {
    const heights: string[] = [];
    css.walkRules(".run-shell[data-mode='run']", rule => rule.walkDecls('height', decl => { heights.push(decl.value); }));
    expect(heights).toContain('100vh');
    expect(heights.at(-1)).toBe('100dvh');
  });
  it('moves utility actions into a labelled dialog while retaining contextual controls', () => {
    expect(html).toContain('id="run-menu-toggle"');
    expect(html).toContain('aria-controls="run-menu-panel"');
    expect(html).toMatch(/id="run-menu-panel"[^>]*role="dialog"[^>]*hidden/);
    expect(html).toContain('id="run-fullscreen"');
    expect(html).toContain('id="run-fullscreen-status"');
    expect(html.indexOf('id="mvp-run-bench"')).toBeLessThan(html.indexOf('id="run-menu-panel"'));
  });
  it('keeps narrow and coarse-pointer controls reachable and dialogs scrollable', () => {
    expect(css.toString()).toContain('(pointer: coarse)');
    // Touch and small screens keep 44px targets inside the safe rail.
    expect(mediaDeclaration('(pointer: coarse)', '.run-toolbar button', 'min-height')).toBe('44px');
    expect(declaration('#run-menu-panel', 'overflow-y')).toBe('auto');
    expect(declaration('#run-menu-panel', 'padding')).toContain('env(safe-area-inset');
  });
});

describe('desktop toolbar stays out of the in-canvas PA lane', () => {
  // Live QA (2026-10-03): centred 44px buttons covered the PA ticker (canvas y 6..30,
  // horizontally centred) whenever the stage reached the top of the window.
  it('anchors to the free top-right corner instead of the centred PA lane', () => {
    expect(declaration(".run-shell[data-mode='run'] .run-toolbar", 'transform')).toBeUndefined();
    expect(declaration(".run-shell[data-mode='run'] .run-toolbar", 'left')).toBeUndefined();
    expect(declaration(".run-shell[data-mode='run'] .run-toolbar", 'right')).toContain('env(safe-area-inset-right)');
  });
  it('is short enough on fine pointers to clear the corner chips (canvas y 34) at 1280x720', () => {
    const height = Number.parseFloat(declaration('.run-toolbar button', 'min-height') ?? '0');
    expect(height).toBeGreaterThanOrEqual(24);
    // top 4px + button height, in canvas pixels at the 1.2 scale of a 1280x720 window.
    expect((4 + height) / 1.2).toBeLessThan(34);
  });
});

describe('unchanged 960 by 600 stage projection across viewport and DPR', () => {
  for (const [w, h] of [[1280, 720], [1920, 1080], [1920, 1200], [3440, 1440], [390, 844], [844, 390]]) {
    for (const dpr of [1, 2]) it(`${w}×${h}, DPR ${dpr}: corners and player round-trip in CSS coordinates`, () => {
      const scale = Math.min(w! / 960, h! / 600);
      const metrics = { scrollX: 0, scrollY: -120, zoom: 1, gameWidth: 960, gameHeight: 600, canvasWidth: 960 * scale, canvasHeight: 600 * scale };
      // DPR affects backing pixels, never the pointer's CSS/world contract.
      for (const point of [{ x: 0, y: -120 }, { x: 960, y: 480 }, { x: 480, y: 240 }]) {
        const cssPoint = projectWorldToCanvas(metrics, point);
        const backing = { x: cssPoint.x * dpr, y: cssPoint.y * dpr };
        const restored = projectCanvasToWorld(metrics, { x: backing.x / dpr, y: backing.y / dpr });
        expect(restored.x).toBeCloseTo(point.x, 8);
        expect(restored.y).toBeCloseTo(point.y, 8);
      }
    });
  }
});
