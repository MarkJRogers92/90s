import { describe, expect, it } from 'vitest';
import {
  ALEX_DIRECTIONS,
  ALEX_WALK_FRAMES,
  alexDirectionFor,
  alexIdleFrame,
  alexWalkFrame,
  type AlexDirection,
} from '../../src/game/assets';

describe('alex sprite facing', () => {
  const cases: Array<[number, number, AlexDirection]> = [
    [0, 1, 'south'],
    [0, -1, 'north'],
    [1, 0, 'east'],
    [-1, 0, 'west'],
    [1, 1, 'south-east'],
    [-1, 1, 'south-west'],
    [1, -1, 'north-east'],
    [-1, -1, 'north-west'],
  ];

  it.each(cases)('maps (%d, %d) to %s', (x, y, expected) => {
    expect(alexDirectionFor(x, y)).toBe(expected);
  });

  it('snaps off-axis vectors to the nearest of the eight facings', () => {
    expect(alexDirectionFor(0.3, 1)).toBe('south');
    expect(alexDirectionFor(-0.2, -1)).toBe('north');
    expect(alexDirectionFor(1, 0.25)).toBe('east');
    expect(alexDirectionFor(-1, 0.25)).toBe('west');
  });

  it('covers every facing, so no direction is unreachable', () => {
    const reached = new Set(
      cases.map(([x, y]) => alexDirectionFor(x, y)),
    );
    expect([...reached].sort()).toEqual([...ALEX_DIRECTIONS].sort());
  });
});

describe('alex sprite frames', () => {
  it('has one idle frame per facing and a frame index past the end is not produced', () => {
    const indices = ALEX_DIRECTIONS.map((d) => alexIdleFrame(d));
    expect(indices).toEqual([...ALEX_DIRECTIONS.keys()]);
  });

  it('lays walk frames out one row per facing', () => {
    expect(alexWalkFrame('south', 0)).toBe(0);
    expect(alexWalkFrame('south', ALEX_WALK_FRAMES - 1)).toBe(ALEX_WALK_FRAMES - 1);
    // the next facing starts a new row
    expect(alexWalkFrame(ALEX_DIRECTIONS[1], 0)).toBe(ALEX_WALK_FRAMES);
  });

  it('wraps the walk step and survives a negative one', () => {
    expect(alexWalkFrame('south', ALEX_WALK_FRAMES)).toBe(0);
    expect(alexWalkFrame('south', -1)).toBe(ALEX_WALK_FRAMES - 1);
    expect(alexWalkFrame('south', ALEX_WALK_FRAMES * 3 + 2)).toBe(2);
  });

  it('never returns a frame outside the walk sheet', () => {
    const frames = ALEX_DIRECTIONS.map((d) => alexWalkFrame(d, ALEX_WALK_FRAMES - 1));
    expect(Math.max(...frames)).toBe(ALEX_DIRECTIONS.length * ALEX_WALK_FRAMES - 1);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0);
  });
});
