import { describe, expect, it } from 'vitest';
import page from '../../index.html?raw';

function hudMarkup(): string {
  return page.slice(page.indexOf('<aside id="mvp-run-hud"'), page.indexOf('<div id="game-host"'));
}

describe('compact Night Shift HUD markup', () => {
  it('keeps the live status bar bound to the authoritative HUD fields', () => {
    const markup = hudMarkup();

    expect(markup).toMatch(/id="mvp-run-health"/);
    expect(markup).toMatch(/id="mvp-run-cash"/);
    expect(markup).toMatch(/id="mvp-run-heat"/);
    expect(markup).toMatch(/id="mvp-run-room"/);
    expect(markup).toMatch(/id="mvp-run-objective"/);
    expect(markup).toMatch(/id="mvp-run-nearby"/);
    expect(markup).toMatch(/class="mvp-run-status-bar"/);
  });

  it('starts provenance and diagnostics inside a collapsed inspection drawer', () => {
    const markup = hudMarkup();
    const drawer = markup.match(/<details id="mvp-run-inspection"[\s\S]*?<\/details>/)?.[0] ?? '';

    expect(drawer).toContain('<summary');
    expect(drawer).not.toMatch(/<details id="mvp-run-inspection"[^>]*\bopen\b/);
    for (const id of [
      'mvp-run-inventory',
      'mvp-run-primary',
      'mvp-run-carrier',
      'mvp-run-trace',
      'mvp-run-checkpoint',
      'mvp-run-recent',
    ]) {
      expect(drawer).toContain(`id="${id}"`);
    }
  });

  it('keeps contextual shop and fusion actions in reachable disclosure regions', () => {
    const markup = hudMarkup();

    expect(markup).toMatch(/id="mvp-run-offers-wrap"[^>]*hidden/);
    expect(markup).toContain('id="mvp-run-bench"');
    expect(markup).toContain('id="mvp-bench-confirm"');
    expect(markup).toContain('id="mvp-bench-cancel"');
  });
});
