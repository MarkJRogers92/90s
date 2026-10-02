import { expect, type Page } from '@playwright/test';

type Position = { x: number; y: number };
type NavigationPage = Pick<Page, 'evaluate' | 'keyboard' | 'waitForTimeout'>;

async function playerPosition(page: NavigationPage): Promise<Position> {
  return page.evaluate(() => {
    const { x, y } = window.__DEAD_MALL_DEBUG__!.snapshot().player;
    return { x, y };
  });
}

export async function walkTo(page: NavigationPage, x: number, y: number): Promise<void> {
  // Keyboard movement only: the debug bridge reads positions, never sets them.
  for (const [axis, target, negative, positive] of [['y', y, 'w', 's'], ['x', x, 'a', 'd']] as const) {
    let reached = false;
    for (let attempt = 0; attempt < 70; attempt++) {
      const delta = target - (await playerPosition(page))[axis];
      if (Math.abs(delta) <= 20) { reached = true; break; }
      const key = delta < 0 ? negative : positive;
      // One input call bounds the held interval. Separate down/up calls let
      // tracing/transport work before keyup extend the pulse and overshoot.
      await page.keyboard.press(key, {
        delay: Math.min(100, Math.max(18, (Math.abs(delta) - 8) / 210 * 1000)),
      });
      await page.waitForTimeout(40);
    }
    expect(reached, `walk ${axis} to ${target}: ${JSON.stringify(await playerPosition(page))}`).toBe(true);
  }
}
