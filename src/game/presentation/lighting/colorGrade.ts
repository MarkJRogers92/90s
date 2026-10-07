/**
 * Roadmap V8: per-floor colour grading.
 *
 * Every room is already lit by its own lights; the grade is the floor's mood
 * laid over all of them, so a floor reads at a glance. Two parts, both cheap:
 * - `tint` multiplies the lightmap (so the whole lit room shifts toward it,
 *   lights and shadows alike). Every channel stays high, so it tints without
 *   darkening, and one channel is always full so the room keeps its brightness.
 * - `haze` is a faint additive wash over the stage: it lifts the shadows
 *   toward the floor's colour (split-toning), which is what sells the mood.
 *
 * Shops keep their own look on any floor, and a district wing has its own
 * palette already, so neither is graded. Presentation only.
 */
import type { FloorNumber } from '../../../sim/wing/floorSpecs';

export type ColorGrade = {
  readonly id: string;
  /** Multiplied over the lightmap. */
  readonly tint: number;
  /** Added over the stage at `hazeAlpha`. */
  readonly haze: number;
  readonly hazeAlpha: number;
};

export const FLOOR_GRADES: Readonly<Record<FloorNumber, ColorGrade>> = {
  // The ground-floor mall at night: neutral light, a little neon magenta in the shadows.
  1: { id: 'mall-night', tint: 0xfff4f8, haze: 0x4a1a5a, hazeAlpha: 0.05 },
  // The Upper Level: management's cool blue fluorescents.
  2: { id: 'upper-cool', tint: 0xd4e2ff, haze: 0x183a6a, hazeAlpha: 0.07 },
  // The Food Court After Dark: greasy amber, warm brown shadows.
  3: { id: 'after-dark-amber', tint: 0xffe2b8, haze: 0x5a2a0a, hazeAlpha: 0.07 },
  // The Roof: cold night air with a sodium-orange haze off the lamps below.
  4: { id: 'roof-sodium', tint: 0xcfdcff, haze: 0x6a3410, hazeAlpha: 0.06 },
};

export function colorGradeFor(floor: FloorNumber, where: { readonly insideStore?: boolean; readonly district?: boolean }): ColorGrade | null {
  if (where.insideStore || where.district) return null;
  return FLOOR_GRADES[floor];
}
