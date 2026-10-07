import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 } } }));
import { FLOOR_GRADES, colorGradeFor } from '../../src/game/presentation/lighting/colorGrade';
import { LightingLayer } from '../../src/game/presentation/lighting/LightingLayer';
import { lightingRenderer, MapSurface, GraphicsSurface } from '../support/lighting-renderer';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';

/**
 * Roadmap V8: each floor reads at a glance by its colour, on top of the
 * lightmap: the ground-floor mall, the Upper Level's cool management blue, the
 * Food Court After Dark's amber, and the Roof's cold night with sodium haze.
 */
const FLOORS: readonly FloorNumber[] = [1, 2, 3, 4];
const channels = (color: number): [number, number, number] => [(color >> 16) & 255, (color >> 8) & 255, color & 255];

describe('per-floor colour grading (roadmap V8)', () => {
  it('gives every floor its own grade', () => {
    const tints = new Set(FLOORS.map((floor) => FLOOR_GRADES[floor].tint));
    const hazes = new Set(FLOORS.map((floor) => FLOOR_GRADES[floor].haze));
    expect(tints.size).toBe(4);
    expect(hazes.size).toBe(4);
  });

  it('warms the food court and cools management, as the floors are themed', () => {
    const [r2, , b2] = channels(FLOOR_GRADES[2].tint);
    const [r3, , b3] = channels(FLOOR_GRADES[3].tint);
    expect(b2).toBeGreaterThan(r2);
    expect(r3).toBeGreaterThan(b3);
  });

  it('never crushes a channel or fogs the room: a grade tints, it does not darken or wash out', () => {
    for (const floor of FLOORS) {
      const grade = FLOOR_GRADES[floor];
      for (const channel of channels(grade.tint)) expect(channel, `floor ${floor}`).toBeGreaterThanOrEqual(0xb0);
      expect(Math.max(...channels(grade.tint)), `floor ${floor}`).toBe(0xff);
      expect(grade.hazeAlpha, `floor ${floor}`).toBeGreaterThan(0);
      expect(grade.hazeAlpha, `floor ${floor}`).toBeLessThanOrEqual(0.08);
    }
  });

  it('leaves a shop looking like itself and a district in its own colours', () => {
    for (const floor of FLOORS) {
      expect(colorGradeFor(floor, { insideStore: true })).toBeNull();
      expect(colorGradeFor(floor, { district: true })).toBeNull();
      expect(colorGradeFor(floor, {})).toBe(FLOOR_GRADES[floor]);
    }
  });

  it('tints the lightmap and lays a faint additive haze over the stage, and clears both', () => {
    const { scene, roots } = lightingRenderer();
    const layer = new LightingLayer(scene, { x: 0, y: -120, width: 960, height: 600 });
    const map = roots.find((node): node is MapSurface => node instanceof MapSurface)!;
    layer.setGrade(FLOOR_GRADES[3]);
    expect(map.tint).toBe(FLOOR_GRADES[3].tint);
    const haze = roots.find((node): node is GraphicsSurface => node instanceof GraphicsSurface && node.commands.some((command) => command.type === 'fillRect'))!;
    expect(haze.visible).toBe(true);
    expect(haze.blendMode).not.toBe(0);
    expect(haze.commands[0]).toMatchObject({ type: 'fillRect', args: [0, -120, 960, 600], fill: FLOOR_GRADES[3].haze, alpha: FLOOR_GRADES[3].hazeAlpha });
    expect(haze.depth).toBeGreaterThan(map.depth);
    layer.setGrade(null);
    expect(map.tint).toBe(0xffffff);
    expect(haze.visible).toBe(false);
  });
});
