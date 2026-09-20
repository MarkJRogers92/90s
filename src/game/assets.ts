export const BENCH_WARRANT_KIOSK_TEXTURE = 'bench-warrant-kiosk';
export const BENCH_WARRANT_KIOSK_URL = '/assets/props/bench-warrant-kiosk.png';

/**
 * Facing order for the Alex sheets. This is the row order of `alex-walk.png`
 * and the frame order of `alex-idle.png`, so the two must stay in step with
 * whatever regenerates those PNGs.
 */
export const ALEX_DIRECTIONS = [
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
  'east',
  'south-east',
] as const;

export type AlexDirection = (typeof ALEX_DIRECTIONS)[number];

export const ALEX_IDLE_TEXTURE = 'alex-idle';
export const ALEX_IDLE_URL = '/assets/characters/alex-idle.png';
export const ALEX_WALK_TEXTURE = 'alex-walk';
export const ALEX_WALK_URL = '/assets/characters/alex-walk.png';
export const ALEX_FRAME_WIDTH = 32;
export const ALEX_FRAME_HEIGHT = 48;
/** Frames per direction in the walk sheet. */
export const ALEX_WALK_FRAMES = 6;

/**
 * Frames the walk sheet laid out in increasing screen-angle order. `atan2`
 * gives 0 at east and grows clockwise on screen because y points down, so
 * rounding the angle to 45-degree buckets and indexing this ring is an
 * exact 8-way lookup with no trigonometry per frame.
 */
const ANGLE_RING = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const;

/** Which way an upright sprite should face for a world-space movement vector. */
export function alexDirectionFor(x: number, y: number): AlexDirection {
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  // The ring is a tuple, so the literal index type proves the lookup is defined
  // and no `?? fallback` is needed to satisfy the compiler.
  const bucket = (Math.round((((degrees % 360) + 360) % 360) / 45) % 8) as
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  return ANGLE_RING[bucket];
}

/** Idle frame index (one frame per direction) for a facing. */
export function alexIdleFrame(direction: AlexDirection): number {
  return ALEX_DIRECTIONS.indexOf(direction);
}

/** Walk frame index for a facing and step, wrapping over the sheet's row. */
export function alexWalkFrame(direction: AlexDirection, step: number): number {
  const row = ALEX_DIRECTIONS.indexOf(direction);
  const column = ((step % ALEX_WALK_FRAMES) + ALEX_WALK_FRAMES) % ALEX_WALK_FRAMES;
  return row * ALEX_WALK_FRAMES + column;
}
