import { hybridParts } from './hybrid';
import { heroForPair, type HeroId } from './heroPairs';

export { HERO_FUSIONS, heroForPair, type HeroFusion, type HeroId } from './heroPairs';

/** The hero inside a fused id (at any depth), or null: fusing more onto a hero keeps its move. */
export function heroOf(id: string): HeroId | null {
  const parts = hybridParts(id);
  if (!parts) return null;
  return heroForPair(parts.baseId, parts.ingredientId)?.id ?? heroOf(parts.baseId) ?? heroOf(parts.ingredientId);
}
