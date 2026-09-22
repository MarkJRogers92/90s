import Phaser from 'phaser';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../sim/core/geometry';

/**
 * World -> screen conversion, in one place.
 *
 * This exists because the mapping used to be implicit: world space mapped 1:1
 * onto the canvas, so `tests/browser/*.spec.ts` computed click targets as
 * `(worldX / 960) * canvasWidth`. That is the same arithmetic, with the world
 * size, the camera scroll and the scale-manager letterboxing all hardcoded to
 * the values they happened to have. The moment the viewport stopped matching the
 * playfield, every one of those tests would have been clicking in the wrong
 * place while still passing its own arithmetic.
 *
 * Callers that need to aim at a world point — the camera, and the browser tests
 * through the debug bridge — now go through here instead.
 */

/** Clamp the camera to the playfield so it never shows the void beyond a room. */
export function boundCameraToPlayfield(scene: Phaser.Scene): void {
  scene.cameras.main.setBounds(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
}

/**
 * Centre the camera on a world point.
 *
 * The playfield is deliberately larger than the viewport, so the camera has to
 * follow: at 960x480 of room in a 640x360 window, a fixed camera would show only
 * the top-left third.
 */
export function centreCameraOn(scene: Phaser.Scene, worldX: number, worldY: number): void {
  scene.cameras.main.centerOn(worldX, worldY);
}

/**
 * Canvas-relative CSS pixels for a world point.
 *
 * Three transforms stack, and skipping any one of them yields a plausible wrong
 * answer rather than an error:
 *   1. camera scroll and zoom take world units to game units;
 *   2. the scale manager may letterbox the canvas, so game units are not CSS px;
 *   3. the canvas element itself sits somewhere on the page, which the caller
 *      adds by offsetting from `boundingBox()`.
 */
export function worldToCanvas(
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  const camera = scene.cameras.main;
  const rect = scene.game.canvas.getBoundingClientRect();
  const gameX = (worldX - camera.scrollX) * camera.zoom;
  const gameY = (worldY - camera.scrollY) * camera.zoom;
  return {
    x: (gameX / scene.scale.width) * rect.width,
    y: (gameY / scene.scale.height) * rect.height,
  };
}
