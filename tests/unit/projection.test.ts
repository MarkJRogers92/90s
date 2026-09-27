import { describe, expect, it } from 'vitest';
import {
  projectCanvasToWorld,
  projectWorldToCanvas,
  type Point2D,
  type ProjectionMetrics,
} from '../../src/game/view/projection';

type ProjectionCase = {
  readonly name: string;
  readonly metrics: ProjectionMetrics;
  readonly world: Point2D;
  readonly canvas: Point2D;
};

const cases: readonly ProjectionCase[] = [
  {
    name: 'origin',
    metrics: {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      gameWidth: 640,
      gameHeight: 360,
      canvasWidth: 640,
      canvasHeight: 360,
    },
    world: { x: 0, y: 0 },
    canvas: { x: 0, y: 0 },
  },
  {
    name: 'nonzero scroll',
    metrics: {
      scrollX: 100,
      scrollY: 40,
      zoom: 1,
      gameWidth: 640,
      gameHeight: 360,
      canvasWidth: 640,
      canvasHeight: 360,
    },
    world: { x: 420, y: 220 },
    canvas: { x: 320, y: 180 },
  },
  {
    name: 'zoom 2',
    metrics: {
      scrollX: 20,
      scrollY: 10,
      zoom: 2,
      gameWidth: 640,
      gameHeight: 360,
      canvasWidth: 640,
      canvasHeight: 360,
    },
    world: { x: 170, y: 100 },
    canvas: { x: 300, y: 180 },
  },
  {
    name: '640 by 360 game scaled into 1280 by 720 CSS pixels',
    metrics: {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      gameWidth: 640,
      gameHeight: 360,
      canvasWidth: 1280,
      canvasHeight: 720,
    },
    world: { x: 320, y: 180 },
    canvas: { x: 640, y: 360 },
  },
  {
    name: 'combined scroll zoom and CSS scale',
    metrics: {
      scrollX: 150,
      scrollY: 75,
      zoom: 1.5,
      gameWidth: 640,
      gameHeight: 360,
      canvasWidth: 1280,
      canvasHeight: 540,
    },
    world: { x: 350, y: 195 },
    canvas: { x: 600, y: 270 },
  },
];

function expectPointClose(actual: Point2D, expected: Point2D): void {
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
}

describe('projection contract', () => {
  it.each(cases)('$name projects the expected canvas point and round-trips both directions', ({
    metrics,
    world,
    canvas,
  }) => {
    expectPointClose(projectWorldToCanvas(metrics, world), canvas);
    expectPointClose(projectWorldToCanvas(metrics, projectCanvasToWorld(metrics, canvas)), canvas);
    expectPointClose(projectCanvasToWorld(metrics, projectWorldToCanvas(metrics, world)), world);
  });

  it.each<readonly [string, ProjectionMetrics]>([
    ['zero game width', { scrollX: 0, scrollY: 0, zoom: 1, gameWidth: 0, gameHeight: 360, canvasWidth: 640, canvasHeight: 360 }],
    ['infinite canvas height', { scrollX: 0, scrollY: 0, zoom: 1, gameWidth: 640, gameHeight: 360, canvasWidth: 640, canvasHeight: Infinity }],
    ['zero zoom', { scrollX: 0, scrollY: 0, zoom: 0, gameWidth: 640, gameHeight: 360, canvasWidth: 640, canvasHeight: 360 }],
    ['non-finite zoom', { scrollX: 0, scrollY: 0, zoom: Number.NaN, gameWidth: 640, gameHeight: 360, canvasWidth: 640, canvasHeight: 360 }],
  ])('rejects %s with a clear error', (_name, metrics) => {
    expect(() => projectWorldToCanvas(metrics, { x: 1, y: 1 })).toThrow(/projection metrics/i);
    expect(() => projectCanvasToWorld(metrics, { x: 1, y: 1 })).toThrow(/projection metrics/i);
  });
});
