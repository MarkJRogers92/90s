/**
 * One lookup for every item definition a run can own: the authored catalog
 * plus the hybrids derived from it at the Bench Warrant.
 */
import { hybridDefinition, hybridParts, isHybridPair } from '../fusion/hybrid';
import { ITEM_CATALOG } from './catalog';
import type { ItemDefinition, ItemInstance } from './types';

const AUTHORED = new Map(ITEM_CATALOG.map((definition) => [definition.id, definition]));

export function definitionFor(id: string): ItemDefinition | undefined {
  const authored = AUTHORED.get(id);
  if (authored) return authored;
  const parts = hybridParts(id);
  if (!parts || !isHybridPair(parts.baseId, parts.ingredientId)) return undefined;
  return hybridDefinition(parts.baseId, parts.ingredientId);
}

/** The catalog a loadout compiles against: the authored items plus any owned hybrids. */
export function catalogFor(instances: readonly ItemInstance[]): readonly ItemDefinition[] {
  const extra: ItemDefinition[] = [];
  const seen = new Set<string>();
  for (const instance of instances) {
    if (AUTHORED.has(instance.itemId) || seen.has(instance.itemId)) continue;
    const definition = definitionFor(instance.itemId);
    if (definition) {
      seen.add(instance.itemId);
      extra.push(definition);
    }
  }
  return extra.length === 0 ? ITEM_CATALOG : [...ITEM_CATALOG, ...extra];
}
