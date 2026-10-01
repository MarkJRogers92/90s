import type { MallProp, Rect } from '../../sim/model';

/** The approved side-on art of a fallen rack (`props/rack-toppled.png`), in pixels. */
export const SIDE_RACK_ART = { width: 120, height: 70 } as const;

/** How far the spilled clothes hang past the wall toward the camera. */
const CLOTHES_SPILL = 6;

export type ToppledRackPose = {
  /** `side`: the lying-down art. `standing`: the upright sprite, turned over. */
  readonly art: 'side' | 'standing';
  readonly x: number;
  readonly y: number;
  readonly originY: 0.5 | 1;
  readonly angle: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly flipX: boolean;
};

/**
 * Where and how to draw a fallen rack over its wall. Falling east or west it
 * lies lengthwise across the screen, which is the view the approved art
 * shows, so the art is scaled to the wall's length (mirrored for a fall to the
 * west). Falling toward or away from the camera the side view is the wrong
 * one, so those keep the standing sprite turned over: its top points the way
 * it fell, and it is squashed when it falls away from the camera (seen end-on).
 */
export function toppledRackPose(wall: Rect, fall: NonNullable<MallProp['fall']>): ToppledRackPose {
  const centreX = wall.x + wall.width / 2;
  if (fall.axis === 'x') {
    const scale = wall.width / SIDE_RACK_ART.width;
    return { art: 'side', x: centreX, y: wall.y + wall.height + CLOTHES_SPILL, originY: 1, angle: 0, scaleX: scale, scaleY: scale, flipX: fall.sign < 0 };
  }
  const squash = fall.sign < 0 ? 0.55 : 1;
  return { art: 'standing', x: centreX, y: wall.y + wall.height / 2, originY: 0.5, angle: fall.sign > 0 ? 180 : 0, scaleX: 1.25, scaleY: 1.25 * squash, flipX: false };
}
