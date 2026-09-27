import Phaser from 'phaser';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../sim/core/geometry';

export interface ProjectionMetrics {
  scrollX: number;
  scrollY: number;
  zoom: number;
  gameWidth: number;
  gameHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface Point2D {
  x: number;
  y: number;
}

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
function assertValidMetrics(metrics: ProjectionMetrics): void {
  const dimensions = [
    metrics.gameWidth,
    metrics.gameHeight,
    metrics.canvasWidth,
    metrics.canvasHeight,
  ];
  if (
    !Number.isFinite(metrics.scrollX) ||
    !Number.isFinite(metrics.scrollY) ||
    !Number.isFinite(metrics.zoom) ||
    metrics.zoom <= 0 ||
    dimensions.some((dimension) => !Number.isFinite(dimension) || dimension <= 0)
  ) {
    throw new Error('Projection metrics require finite positive dimensions and zoom.');
  }
}

/** Convert a world point into canvas-relative CSS pixels. */
export function projectWorldToCanvas(
  metrics: ProjectionMetrics,
  world: Point2D,
): Point2D {
  assertValidMetrics(metrics);
  return {
    x:
      (((world.x - metrics.scrollX) * metrics.zoom) / metrics.gameWidth) *
      metrics.canvasWidth,
    y:
      (((world.y - metrics.scrollY) * metrics.zoom) / metrics.gameHeight) *
      metrics.canvasHeight,
  };
}

/** Convert a canvas-relative CSS pixel point into world coordinates. */
export function projectCanvasToWorld(
  metrics: ProjectionMetrics,
  canvas: Point2D,
): Point2D {
  assertValidMetrics(metrics);
  return {
    x:
      ((canvas.x / metrics.canvasWidth) * metrics.gameWidth) / metrics.zoom +
      metrics.scrollX,
    y:
      ((canvas.y / metrics.canvasHeight) * metrics.gameHeight) / metrics.zoom +
      metrics.scrollY,
  };
}

function projectionMetrics(scene: Phaser.Scene): ProjectionMetrics {
  const camera = scene.cameras.main;
  const rect = scene.game.canvas.getBoundingClientRect();
  return {
    scrollX: camera.scrollX,
    scrollY: camera.scrollY,
    zoom: camera.zoom,
    gameWidth: scene.scale.width,
    gameHeight: scene.scale.height,
    canvasWidth: rect.width,
    canvasHeight: rect.height,
  };
}

export function worldToCanvas(scene: Phaser.Scene, worldX: number, worldY: number): Point2D {
  return projectWorldToCanvas(projectionMetrics(scene), { x: worldX, y: worldY });
}

/** Convert Phaser's game-space pointer back through the same CSS-aware contract. */
export function pointerToWorld(
  scene: Phaser.Scene,
  pointer: Phaser.Input.Pointer,
): Point2D {
  const metrics = projectionMetrics(scene);
  return projectCanvasToWorld(metrics, {
    x: (pointer.x / metrics.gameWidth) * metrics.canvasWidth,
    y: (pointer.y / metrics.gameHeight) * metrics.canvasHeight,
  });
}
