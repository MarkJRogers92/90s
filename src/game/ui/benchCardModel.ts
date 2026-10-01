/**
 * The Bench Warrant card: pick any two of your items, see what they become,
 * and fuse them. Shown as numbered item tiles, the picked pair, the named
 * result with what it does in plain words, and the fee against your cash.
 *
 * Pure, derived from the simulation's own workbench and proposal, so the card
 * can never promise something the fusion will not do.
 */
import { compositeLeaves, fusionPartCount, isCleanPart } from '../../sim/fusion/inventory';
import { shortItemName } from '../../sim/fusion/hybrid';
import { nodeDefinitionId } from '../../sim/fusion/inventory';
import { heroForPair } from '../../sim/fusion/heroes';
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';
import { keepReason, resaleValue } from '../../sim/run/resale';

export type BenchIngredient = { readonly itemDefinitionId: string; readonly name: string; readonly provenance: string };
export type BenchChange = { readonly label: string; readonly before: string; readonly after: string };

export type BenchTile = {
  readonly key: number;
  readonly instanceId: string;
  /** The definition whose icon the tile shows (a fused item shows its base). */
  readonly iconDefinitionId: string;
  readonly name: string;
  readonly fused: boolean;
  /** How many items it holds: 1, or 2-4 for a fusion (round 32). */
  readonly parts: number;
  /** False only for an Emitter Mount, which cannot go back on the bench. */
  readonly fusable: boolean;
  readonly stolen: boolean;
  readonly pick: 'first' | 'second' | null;
};

export type BenchCardModel = {
  /** This page's tiles, keyed 1-9 (round 52: the bench pages, so nothing owned is hidden). */
  readonly tiles: readonly BenchTile[];
  /** The page shown (0-based, clamped) and how many there are. */
  readonly page: number;
  readonly pageCount: number;
  /** The picked pair, wherever their pages are. */
  readonly picked: { readonly first: BenchTile | null; readonly second: BenchTile | null };
  readonly primary: BenchIngredient | null;
  readonly carrier: BenchIngredient | null;
  readonly recipe: 'emitter_mount' | 'hybrid' | null;
  /** The named result, once the picked pair fuses. */
  readonly result: string | null;
  readonly signature: boolean;
  /** Round 53: a hero fusion's name, when the pair makes one (it has a move of its own). */
  readonly hero: string | null;
  /** What the result does, in plain words. */
  readonly lines: readonly string[];
  /** Before/after rows (the Emitter Mount's operation). */
  readonly changes: readonly BenchChange[];
  readonly fee: number | null;
  readonly feeNote: string;
  readonly cash: number;
  readonly affordable: boolean;
  readonly warning: string;
  /** What to do next, or why the picked pair does not fuse. */
  readonly hint: string;
  /** Round 36: with exactly one item picked, what it sells for (X), or why it cannot be sold. */
  readonly sale: { readonly value: number; readonly allowed: boolean; readonly reason: string } | null;
};

/** Tiles on one bench page: one per number key, so every tile has a key. */
export const BENCH_TILE_LIMIT = 9;

function ingredient(itemDefinitionId: string, provenance: string): BenchIngredient {
  return { itemDefinitionId, name: itemDefinitionName(itemDefinitionId).toUpperCase(), provenance: provenance.toUpperCase() };
}

export function buildBenchCardModel(state: MvpRunState, requestedPage = 0): BenchCardModel | null {
  const bench = state.workbench;
  const preview = state.preview;
  if (!bench && !preview) return null;
  const firstId = bench?.firstId ?? preview?.primaryInstanceId ?? null;
  const secondId = bench?.secondId ?? preview?.carrierInstanceId ?? null;

  const owned = state.inventory.inventory;
  const pageCount = Math.max(1, Math.ceil(owned.length / BENCH_TILE_LIMIT));
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage)));
  const allTiles = owned.map((node, index): BenchTile => {
    const leaf = compositeLeaves(node)[0]!;
    return {
      key: (index % BENCH_TILE_LIMIT) + 1,
      instanceId: node.instanceId,
      // A hybrid's icon is built from the fusion itself (every part stacked).
      iconDefinitionId: node.kind === 'composite' && node.recipeId === 'hybrid' ? nodeDefinitionId(node) : leaf.itemDefinitionId,
      name: shortItemName(nodeDefinitionId(node)).toUpperCase(),
      fused: node.kind === 'composite',
      parts: fusionPartCount(node),
      fusable: node.kind === 'leaf' || node.recipeId === 'hybrid',
      stolen: !isCleanPart(node),
      pick: node.instanceId === firstId ? 'first' : node.instanceId === secondId ? 'second' : null,
    };
  });

  const tiles = allTiles.slice(page * BENCH_TILE_LIMIT, (page + 1) * BENCH_TILE_LIMIT);
  const picked = {
    first: allTiles.find((tile) => tile.pick === 'first') ?? null,
    second: allTiles.find((tile) => tile.pick === 'second') ?? null,
  };

  const soloNode = firstId !== null && secondId === null ? state.inventory.inventory.find((node) => node.instanceId === firstId) : undefined;
  const reason = soloNode ? keepReason(state, soloNode.instanceId) : '';
  const base = {
    tiles,
    page,
    pageCount,
    picked,
    cash: state.cash,
    warning: 'PERMANENT - BOTH ITEMS ARE CONSUMED, NO REFUNDS',
    sale: soloNode ? { value: resaleValue(soloNode), allowed: reason === '', reason } : null,
  };
  if (!preview) {
    const pickedCount = allTiles.filter((tile) => tile.pick !== null).length;
    return {
      ...base,
      primary: null,
      carrier: null,
      recipe: null,
      result: null,
      signature: false,
      hero: null,
      lines: [],
      changes: [],
      fee: null,
      feeNote: '',
      affordable: false,
      hint: bench?.message
        ? bench.message.toUpperCase()
        : pickedCount === 0 ? 'PICK TWO ITEMS TO FUSE (CLICK OR 1-9)' : 'PICK A SECOND ITEM, OR X TO SELL THIS ONE',
    };
  }

  const composite = preview.compositePreview;
  const primary = ingredient(nodeDefinitionId(composite.primary), preview.primaryProvenance);
  const carrier = ingredient(nodeDefinitionId(composite.carrier), preview.carrierProvenance);
  const feeNote = preview.cleanDiscount > 0 ? `BASE $${preview.baseFee} - $${preview.cleanDiscount} CLEAN DISCOUNT` : `BASE $${preview.baseFee}`;
  const affordable = state.cash >= preview.fee;
  if (preview.recipeId === 'emitter_mount') {
    return {
      ...base,
      primary,
      carrier,
      recipe: 'emitter_mount',
      result: `${primary.name} MOUNTED ON THE ${carrier.name}`,
      signature: false,
      hero: null,
      lines: ['YOUR SHOTS LEAVE FROM THE CAR,', 'AND YOU STEER IT WITH THE MOUSE.'],
      changes: [
        { label: 'FIRES FROM', before: 'YOU', after: `THE ${carrier.name}` },
        { label: 'AIMING', before: 'YOUR MOUSE', after: 'THE CAR DRIVES TO YOUR MOUSE' },
        { label: 'THE CAR', before: 'FIGHTS ON ITS OWN', after: 'ONLY MOVES WHERE YOU AIM' },
        { label: 'RECALL', before: 'NONE', after: `${preview.operation.recallKey} KEY PULLS THE CAR BACK` },
      ],
      fee: preview.fee,
      feeNote,
      affordable,
      hint: affordable ? 'ENTER TO FUSE' : 'NOT ENOUGH CASH',
    };
  }
  return {
    ...base,
    primary,
    carrier,
    recipe: 'hybrid',
    result: preview.resultName.toUpperCase(),
    signature: preview.signature,
    hero: heroForPair(nodeDefinitionId(composite.primary), nodeDefinitionId(composite.carrier))?.name ?? null,
    lines: preview.highlights,
    changes: [],
    fee: preview.fee,
    feeNote,
    affordable,
    hint: affordable ? 'ENTER TO FUSE' : 'NOT ENOUGH CASH',
  };
}
