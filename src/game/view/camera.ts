import Phaser from 'phaser';
import { cameraScrollFor } from './viewport';

/**
 * Centre the camera window on the player, clamped inside the room.
 *
 * The scroll maths lives in `./viewport` so the browser tests can reuse it
 * without pulling in Phaser or the DOM. Phaser's own `startFollow` is
 * deliberately not used: it eases toward its target, which would write a
 * fractional scroll every frame, and the renderer runs with `roundPixels`, so
 * the pixel grid would shimmer while walking.
 */
export function centreCameraOnPlayer(scene: Phaser.Scene, x: number, y: number): void {
  const camera = scene.cameras.main;
  const { scrollX, scrollY } = cameraScrollFor(x, y, camera.width, camera.height);
  camera.setScroll(scrollX, scrollY);
}
