/**
 * Clearance elite marks (roadmap V10): each trait reads by shape as well as
 * colour, so Swift and Volatile are told apart at a glance and without colour
 * vision. Pure presentation data; the sim's elite traits are untouched.
 */
import type { EliteTrait } from '../../sim/model';

export type EliteMarkTrait = EliteTrait | 'plain';
type Pixels = ReadonlyArray<readonly [number, number]>;

const parse = (rows: readonly string[]): Pixels =>
  rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [[x, y] as const] : [])));

/** 7×7 glyphs drawn beside the tag: a price tag, a double chevron, a lit fuse. */
export const ELITE_GLYPHS: Readonly<Record<EliteMarkTrait, Pixels>> = {
  plain: parse([
    '..####.',
    '.#....#',
    '#..#..#',
    '#.....#',
    '#.....#',
    '.#...#.',
    '..###..',
  ]),
  swift: parse([
    '#..#...',
    '.#..#..',
    '..#..#.',
    '...#..#',
    '..#..#.',
    '.#..#..',
    '#..#...',
  ]),
  volatile: parse([
    '....#.#',
    '.....#.',
    '....#.#',
    '..###..',
    '.#####.',
    '.#####.',
    '..###..',
  ]),
};

/** How the floor ring is drawn: one solid, one dashed and turning, or two. */
export function eliteRingSegments(trait: EliteMarkTrait, tick: number, reducedMotion = false): { readonly rings: number; readonly dashes: number; readonly offset: number } {
  if (trait === 'swift') return { rings: 1, dashes: 8, offset: reducedMotion ? 0 : (tick * 0.12) % (Math.PI * 2) };
  if (trait === 'volatile') return { rings: 2, dashes: 0, offset: 0 };
  return { rings: 1, dashes: 0, offset: 0 };
}
