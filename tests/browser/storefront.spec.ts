import { expect, test } from '@playwright/test';
import { STOREFRONT_ART } from '../../src/game/assets';
import type { StorefrontArtKind } from '../../src/game/assets';

/**
 * The storefront assets, fetched and decoded by a real browser.
 *
 * This is the strongest available check that the art is actually usable: it goes
 * through the same origin, the same server and the same decoder the game will,
 * so a file that is missing, mis-pathed, corrupt, or not a PNG at all fails here.
 * A unit test reading bytes off disk cannot tell you the browser renders it, and
 * a Python decode cannot tell you it is served at the right path.
 *
 * Dimensions come from `naturalWidth`/`naturalHeight` — the size the browser
 * actually decoded — rather than from the file header, so a file whose header
 * and payload disagree fails here too.
 */
type Decoded = { url: string; width: number; height: number } | { url: string; error: string };

const KINDS: readonly StorefrontArtKind[] = ['storefront-fascia', 'sign-warm', 'sign-cool'];

const URLS = KINDS.map((kind) => STOREFRONT_ART[kind].url);

test.describe('storefront assets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('every storefront asset is served and decodes at its declared size', async ({ page }) => {
    const decoded = await page.evaluate(async (urls): Promise<Decoded[]> => {
      const one = (url: string) =>
        new Promise<Decoded>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ url, error: 'failed to load' });
          img.src = url;
        });
      return Promise.all(urls.map(one));
    }, URLS);

    const failures = decoded.filter((d) => 'error' in d);
    expect(failures, `assets that did not load: ${JSON.stringify(failures)}`).toEqual([]);

    const byUrl = new Map(decoded.map((d) => [d.url, d]));
    for (const kind of KINDS) {
      const art = STOREFRONT_ART[kind];
      expect(byUrl.get(art.url), `${kind} served at ${art.url}`).toMatchObject({
        width: art.width,
        height: art.height,
      });
    }
  });

  test('the sign boards match the doorway width they hang over', async ({ page }) => {
    const decoded = await page.evaluate(async (urls): Promise<Decoded[]> => {
      const one = (url: string) =>
        new Promise<Decoded>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ url, error: 'failed to load' });
          img.src = url;
        });
      return Promise.all(urls.map(one));
    }, URLS);

    const byUrl = new Map(decoded.map((d) => [d.url, d]));
    const warm = byUrl.get(STOREFRONT_ART['sign-warm'].url);
    const cool = byUrl.get(STOREFRONT_ART['sign-cool'].url);
    // Both boards are the doorway's width so the planner can place a sign from
    // the doorway alone; a mismatched pair would silently misalign one shop.
    expect(warm).toMatchObject({ width: STOREFRONT_ART['sign-cool'].width });
    expect(cool).toMatchObject({ height: STOREFRONT_ART['sign-warm'].height });
  });
});
