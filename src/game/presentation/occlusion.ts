import type { PresentationDepthBand } from './depth';

type Point = { readonly x: number; readonly y: number };
type Rect = Point & { readonly width: number; readonly height: number };

/** Presentation-only opacity for a tall object at the actor's foot point. */
export function presentationOcclusionAlpha(
  band: PresentationDepthBand,
  foot: Point,
  rect: Rect,
): number {
  if (band !== 'tallForeground') return 1;
  if (foot.x <= rect.x || foot.x >= rect.x + rect.width ||
      foot.y <= rect.y || foot.y >= rect.y + rect.height) return 1;
  const edgeDistance = Math.min(
    foot.x - rect.x,
    rect.x + rect.width - foot.x,
    foot.y - rect.y,
    rect.y + rect.height - foot.y,
  );
  return 1 - 0.48 * Math.min(1, edgeDistance / 8);
}
