/**
 * How a fused item's icon is built (round 34): the base item's icon, with the
 * other items it holds stacked on its corner, inside a glow that grows with
 * the part count. Pure: the Phaser texture is drawn from this plan by
 * `fusedIconTexture.ts`.
 */
import { containsSignature, hybridParts } from '../../sim/fusion/hybrid';

export type FusedIconPlan = {
  readonly baseItemId: string;
  /** Every other item in the fusion, in the order they went in (at most four, in a signature). */
  readonly stackedItemIds: readonly string[];
  readonly parts: number;
  readonly glow: { readonly color: number; readonly width: number };
  readonly textureKey: string;
};

/** A fusion holding a signature glows hot pink, whatever its size (round 43). */
const SIGNATURE_GLOW = { color: 0xff3fc8, width: 3 };

/** Green for two items, cyan for three, gold for the full four. */
const GLOWS: Readonly<Record<number, { color: number; width: number }>> = {
  2: { color: 0x6aff8a, width: 1 },
  3: { color: 0x3ff0ff, width: 2 },
  4: { color: 0xffd84a, width: 3 },
};

function leafIds(id: string): string[] {
  const parts = hybridParts(id);
  return parts ? [...leafIds(parts.baseId), ...leafIds(parts.ingredientId)] : [id];
}

/** The fused icon for a hybrid id, or null for a plain item. */
export function fusedIconPlan(itemDefinitionId: string): FusedIconPlan | null {
  if (!hybridParts(itemDefinitionId)) return null;
  const [baseItemId, ...stackedItemIds] = leafIds(itemDefinitionId);
  const parts = stackedItemIds.length + 1;
  return {
    baseItemId: baseItemId!,
    stackedItemIds,
    parts,
    glow: containsSignature(itemDefinitionId) ? { ...SIGNATURE_GLOW, width: parts >= 5 ? 4 : SIGNATURE_GLOW.width } : GLOWS[Math.min(4, parts)]!,
    textureKey: `neon:fused:${itemDefinitionId}`,
  };
}
