/** Fixed presentation bands; the whole room height fits inside one band. */
export type PresentationDepthBand =
  | 'floor'
  | 'decal'
  | 'structure'
  | 'lowProp'
  | 'actor'
  | 'tallForeground'
  | 'effect'
  | 'prompt';

const BAND_ORDER: readonly PresentationDepthBand[] = [
  'floor', 'decal', 'structure', 'lowProp', 'actor', 'tallForeground', 'effect', 'prompt',
];

/** Base Y is room-local; fractional movement remains stable within its band. */
export function presentationDepth(band: PresentationDepthBand, baseY: number): number {
  return BAND_ORDER.indexOf(band) * 1000 + baseY;
}
