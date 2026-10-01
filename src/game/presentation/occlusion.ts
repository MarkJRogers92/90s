import type { PresentationDepthBand } from './depth';

type Point = { readonly x: number; readonly y: number };
type Rect = Point & { readonly width: number; readonly height: number };

/**
 * How see-through a tall prop gets with an actor behind it. Round 54: at 50% a
 * palm's fronds laid a green net over the janitor; 30% leaves the prop visible
 * (it is still something to walk around) while the actor reads cleanly.
 */
export const OCCLUSION_MIN_ALPHA = 0.3;
/** Half the actor's body width: the fade starts when the body, not just the foot point, slips behind. */
export const ACTOR_HALF_WIDTH = 14;
/** The distance over which the fade eases in from the prop's edge. */
const EDGE_RAMP = 14;

/** Presentation-only opacity for a tall object at the actor's foot point. */
export function presentationOcclusionAlpha(
  band: PresentationDepthBand,
  foot: Point,
  rect: Rect,
): number {
  if (band !== 'tallForeground') return 1;
  const left = rect.x - ACTOR_HALF_WIDTH;
  const right = rect.x + rect.width + ACTOR_HALF_WIDTH;
  if (foot.x <= left || foot.x >= right ||
      foot.y <= rect.y || foot.y >= rect.y + rect.height) return 1;
  const edgeDistance = Math.min(
    foot.x - left,
    right - foot.x,
    foot.y - rect.y,
    rect.y + rect.height - foot.y,
  );
  return 1 - (1 - OCCLUSION_MIN_ALPHA) * Math.min(1, edgeDistance / EDGE_RAMP);
}
