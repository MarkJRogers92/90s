import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../sim/core/geometry';

/**
 * Internal render resolution. 640x360 is exactly one ninth of 1920x1080, so it
 * integer-scales x3 to a 1080p display; 960x480 does not (x2 leaves 120px of
 * letterbox and x2.25 makes every pixel an uneven size).
 *
 * This is the camera window, not the world. Rooms are 960x480 — see
 * `PLAYFIELD_WIDTH`/`PLAYFIELD_HEIGHT` — so the view shows a 640x360 slice of a
 * larger room. Nothing in `src/sim` changes: the simulation stays in 960x480
 * world units.
 */
export const VIEWPORT_WIDTH = 640;
export const VIEWPORT_HEIGHT = 360;

/** Whole-pixel camera scroll, in world units. */
export type CameraScroll = {
  readonly scrollX: number;
  readonly scrollY: number;
};

/**
 * Scroll that centres a `viewWidth` x `viewHeight` window on `(x, y)`, clamped
 * so the window never leaves the room.
 *
 * Deliberately free of Phaser and of any DOM: the browser tests need the same
 * mapping to convert a world position into a click point, and importing a
 * module with renderer or DOM side effects into a test is not possible. Keeping
 * one implementation is what stops the test mapping from drifting from the
 * camera again.
 *
 * The scroll is floored to whole pixels because the renderer runs with
 * `roundPixels`; a fractional scroll would let the pixel grid shimmer as the
 * player walks.
 *
 * If the view is ever as large as the room, both maxima collapse to 0 and the
 * scroll stays at the origin, which is right for a room that already fits.
 */
export function cameraScrollFor(
  x: number,
  y: number,
  viewWidth: number = VIEWPORT_WIDTH,
  viewHeight: number = VIEWPORT_HEIGHT,
): CameraScroll {
  const maxScrollX = Math.max(0, PLAYFIELD_WIDTH - viewWidth);
  const maxScrollY = Math.max(0, PLAYFIELD_HEIGHT - viewHeight);
  const scrollX = Math.min(Math.max(Math.floor(x - viewWidth / 2), 0), maxScrollX);
  const scrollY = Math.min(Math.max(Math.floor(y - viewHeight / 2), 0), maxScrollY);
  return { scrollX, scrollY };
}

/**
 * Screen position, relative to the canvas box, of a world point.
 *
 * `boxWidth`/`boxHeight` are the rendered canvas size, which the browser scales
 * with `Phaser.Scale.FIT`, so the scale factor is the box size over the view
 * size — not over the world size.
 */
export function worldToScreenOffset(
  worldX: number,
  worldY: number,
  scroll: CameraScroll,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  return {
    x: ((worldX - scroll.scrollX) / VIEWPORT_WIDTH) * boxWidth,
    y: ((worldY - scroll.scrollY) / VIEWPORT_HEIGHT) * boxHeight,
  };
}

/** Default aim reach, in world units. Well inside the window in every direction. */
export const AIM_REACH = 64;

/**
 * Screen point to click in order to aim from the player toward a world target.
 *
 * The view shows a 640x360 window on a 960x480 room, so a target is frequently
 * off-screen and therefore not clickable at all. Aim is a *direction*, not a
 * position: any point along the player-to-target vector produces the same aim,
 * so this takes a point a short reach along that vector instead of the target
 * itself.
 *
 * The point is clamped into the visible window. The camera keeps the player in
 * view but not necessarily at its centre — near a room edge the window clamps
 * and the player sits off-centre — so a fixed reach can otherwise fall outside
 * the canvas when the target lies beyond the near edge. Clamping bends the
 * aimed point but never the direction enough to matter at this reach.
 *
 * When the player is exactly on the target the vector is undefined; the point
 * collapses to the player, which still produces a well-defined click.
 */
export function aimPointFor(
  player: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number },
  scroll: CameraScroll,
  boxWidth: number,
  boxHeight: number,
  reach: number = AIM_REACH,
): { x: number; y: number } {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy);
  const scale = length === 0 ? 0 : reach / length;
  const minX = scroll.scrollX;
  const maxX = scroll.scrollX + VIEWPORT_WIDTH - 1;
  const minY = scroll.scrollY;
  const maxY = scroll.scrollY + VIEWPORT_HEIGHT - 1;
  const worldX = Math.min(Math.max(player.x + dx * scale, minX), maxX);
  const worldY = Math.min(Math.max(player.y + dy * scale, minY), maxY);
  return worldToScreenOffset(worldX, worldY, scroll, boxWidth, boxHeight);
}
