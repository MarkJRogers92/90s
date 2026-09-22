import { expect, test } from '@playwright/test';
import {
  PORTRAIT_ART,
  PORTRAIT_DETAIL_SIZE,
  PORTRAIT_EXPRESSION_SIZE,
  PORTRAIT_KINDS,
  PORTRAIT_SHEET_WIDTH,
} from '../../src/game/portraits';

/**
 * The portrait assets, fetched and decoded by a real browser.
 *
 * This is the strongest available check that the art is actually usable: it goes
 * through the same origin, the same server and the same decoder the game will,
 * so a file that is missing, mis-pathed, corrupt, or not a PNG at all fails
 * here. A unit test reading bytes off disk cannot tell you the browser renders
 * it, and a Python decode cannot tell you it is served at the right path.
 *
 * Dimensions are read from `naturalWidth`/`naturalHeight` — the size the browser
 * actually decoded — rather than from the file header, so this also catches a
 * file whose header and payload disagree.
 */

type Decoded = { url: string; width: number; height: number } | { url: string; error: string };

const URLS = PORTRAIT_KINDS.flatMap((kind) => [PORTRAIT_ART[kind].url, PORTRAIT_ART[kind].expressionUrl]);

test.describe('portrait assets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('every portrait and expression sheet is served and decodes', async ({ page }) => {
    const decoded = await page.evaluate(async (urls): Promise<Decoded[]> => {
      const one = (url: string) =>
        new Promise<Decoded>((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ url, error: 'failed to load' });
          img.src = url;
        });
      return Promise.all(urls.map(one));
    }, URLS);

    const failures = decoded.filter((d) => 'error' in d);
    expect(failures, `assets that did not load: ${JSON.stringify(failures)}`).toEqual([]);

    const byUrl = new Map(decoded.map((d) => [d.url, d]));
    for (const kind of PORTRAIT_KINDS) {
      const detail = byUrl.get(PORTRAIT_ART[kind].url);
      const sheet = byUrl.get(PORTRAIT_ART[kind].expressionUrl);
      expect(detail, `${kind} detailed`).toMatchObject({
        width: PORTRAIT_DETAIL_SIZE,
        height: PORTRAIT_DETAIL_SIZE,
      });
      expect(sheet, `${kind} expressions`).toMatchObject({
        width: PORTRAIT_SHEET_WIDTH,
        height: PORTRAIT_EXPRESSION_SIZE,
      });
    }
  });

  test('the runtime art is genuinely cut out, not an opaque plate', async ({ page }) => {
    // The art tree copy of each portrait is an opaque #48454c plate, which
    // cannot composite over a UI frame. This proves the shipped copy is the
    // cut-out and not the plate: the alpha channel must contain both fully
    // transparent and fully opaque pixels. A solid image would fail one half
    // or the other, so the assertion cannot be satisfied by accident.
    const alpha = await page.evaluate(async (url) => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`could not load ${url}`));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i];
        if (a === 0) transparent += 1;
        else if (a === 255) opaque += 1;
      }
      return { transparent, opaque, total: data.length / 4 };
    }, PORTRAIT_ART.vendor.url);

    expect(alpha.transparent).toBeGreaterThan(0);
    expect(alpha.opaque).toBeGreaterThan(0);
    // The backdrop was ~41% of the canvas for this portrait; assert a floor
    // rather than the exact figure so a future re-crop does not fail the build.
    expect(alpha.transparent / alpha.total).toBeGreaterThan(0.2);
  });
});

/**
 * The first real gameplay consumer: the Loss Prevention Manager's face in the
 * HUD, driven by the same authoritative state as the text beside it.
 *
 * The assertion is deliberately a *consistency* check rather than a fixed
 * expectation. The boss's phase depends on live combat, so hard-coding "angry"
 * would be a test that passes only when the encounter behaves identically every
 * time. Instead this derives the expression the text line implies and requires
 * the face to agree — which is exactly the invariant the HUD claims, and it
 * holds at every phase rather than only at the one a hard-coded value caught.
 */
test.describe('the boss portrait', () => {
  test('is visible during the boss fight and agrees with the boss text', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?fixture=mvp-boss-entry&seed=5150');
    await page.getByRole('button', { name: 'Night Shift', exact: true }).click();

    const portrait = page.locator('#mvp-run-boss-portrait');
    await expect(portrait).toBeVisible({ timeout: 30_000 });

    const face = page.locator('#mvp-run-boss-face');
    await expect(face).toHaveCSS('background-image', /security-guard-expressions\.png/);

    const bossText = (await page.locator('#mvp-run-boss').innerText()).trim();
    expect(bossText).toMatch(/BOSS: phase [123]/);

    // The same precedence bossPortraitExpression applies, read back off the
    // text the HUD rendered from the same state.
    const expected = bossText.includes('SLAM WIND-UP')
      ? 'angry'
      : bossText.includes('BACKUP CALLED')
        ? 'determined'
        : /phase 3/.test(bossText)
          ? 'hurt'
          : 'neutral';
    const frame = ['neutral', 'determined', 'hurt', 'afraid', 'angry', 'surprised'].indexOf(expected);

    await expect(page.locator('#mvp-run-boss-expression')).toHaveText(
      `LOSS PREVENTION // ${expected}`,
    );
    // 96px frame at the 2x the stylesheet declares.
    await expect(face).toHaveCSS('background-position', `${-frame * 96 * 2}px 0px`);
  });

  test('is hidden when there is no boss in the room', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Night Shift', exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#mvp-run-boss-portrait')).toBeHidden();
  });
});
