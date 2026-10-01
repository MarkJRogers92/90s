import { describe, expect, it } from 'vitest';
import { createProp, propWall } from '../../src/sim/combat/props';
import { SIDE_RACK_ART, toppledRackPose } from '../../src/game/view/toppledRack';
import type { MallProp } from '../../src/sim/model';

function fallen(axis: 'x' | 'y', sign: 1 | -1): MallProp {
  const prop = createProp(1, 'rack', 300, 240);
  prop.state = 'fallen';
  prop.fall = { axis, sign };
  return prop;
}

describe('toppled clothes rack (round 54)', () => {
  it('a rack that falls east or west lies on its side in the approved art, filling its wall', () => {
    for (const sign of [1, -1] as const) {
      const wall = propWall(fallen('x', sign))!;
      const pose = toppledRackPose(wall, { axis: 'x', sign });
      expect(pose.art).toBe('side');
      expect(pose.angle).toBe(0);
      // The sprite is as long as the wall, centred on it.
      expect(SIDE_RACK_ART.width * pose.scaleX).toBeCloseTo(wall.width, 0);
      expect(pose.x).toBe(wall.x + wall.width / 2);
      // Clothes hang a few pixels past the wall toward the camera, never far past it.
      expect(pose.originY).toBe(1);
      expect(pose.y).toBeGreaterThanOrEqual(wall.y + wall.height);
      expect(pose.y).toBeLessThanOrEqual(wall.y + wall.height + 10);
      // Uniform scale: pixels stay square.
      expect(pose.scaleY).toBe(pose.scaleX);
    }
  });

  it('mirrors for a fall to the west and not to the east', () => {
    const east = toppledRackPose(propWall(fallen('x', 1))!, { axis: 'x', sign: 1 });
    const west = toppledRackPose(propWall(fallen('x', -1))!, { axis: 'x', sign: -1 });
    expect(east.flipX).toBe(false);
    expect(west.flipX).toBe(true);
  });

  it('a rack that falls toward or away from the camera keeps the rotated standing sprite', () => {
    // The side-on art is the wrong view for these: it would lie across the screen, not along the aisle.
    const south = toppledRackPose(propWall(fallen('y', 1))!, { axis: 'y', sign: 1 });
    const north = toppledRackPose(propWall(fallen('y', -1))!, { axis: 'y', sign: -1 });
    expect(south).toMatchObject({ art: 'standing', angle: 180, scaleX: 1.25, scaleY: 1.25 });
    expect(north.art).toBe('standing');
    expect(north.angle).toBe(0);
    // Falling away from the camera it is seen end-on, so it is squashed.
    expect(north.scaleY).toBeLessThan(north.scaleX);
    const wall = propWall(fallen('y', 1))!;
    expect(south.x).toBe(wall.x + wall.width / 2);
    expect(south.originY).toBe(0.5);
    expect(south.y).toBe(wall.y + wall.height / 2);
  });
});
