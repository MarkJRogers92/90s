import type { Page } from '@playwright/test';

/**
 * Canvas-relative CSS pixels for a world point.
 *
 * ASK THE RUNNING GAME. Do not compute this in the test.
 *
 * These specs used to do the arithmetic themselves — `(worldX / 960) *
 * canvasWidth` — which quietly hardcoded four separate facts: the playfield is
 * 960x480, the camera never scrolls, the scale manager applies no letterboxing,
 * and the canvas is the whole element. All four held only while the viewport and
 * the room were the same size. When the viewport became 640x360 with a following
 * camera, that arithmetic would still have produced a number and still have
 * passed its own expectations, while clicking somewhere the player was not.
 *
 * Routing it through the bridge means the test states WHICH world point it cares
 * about and lets the game say where that is on screen. It survives the viewport
 * changing again.
 */
export async function worldToCanvas(
  page: Page,
  worldX: number,
  worldY: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const debug = (
        window as unknown as {
          __DEAD_MALL_DEBUG__?: {
            worldToCanvas?(x: number, y: number): { x: number; y: number };
          };
        }
      ).__DEAD_MALL_DEBUG__;
      if (!debug?.worldToCanvas) {
        throw new Error(
          'the debug bridge does not expose worldToCanvas; the scene may not have a camera',
        );
      }
      return debug.worldToCanvas(x, y);
    },
    [worldX, worldY] as [number, number],
  );
}
