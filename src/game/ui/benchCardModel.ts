/**
 * The Bench Warrant card: the one irreversible choice in a shift, explained
 * as ingredients, a result, and a before/after list in plain words.
 *
 * Pure, derived from the simulation's own Emitter Mount proposal, so the card
 * can never promise something the fusion will not do.
 */
import { itemDefinitionName } from '../../sim/run/economy';
import type { MvpRunState } from '../../sim/run/types';

export type BenchIngredient = { readonly itemDefinitionId: string; readonly name: string; readonly provenance: string };
export type BenchChange = { readonly label: string; readonly before: string; readonly after: string };

export type BenchCardModel = {
  readonly primary: BenchIngredient;
  readonly carrier: BenchIngredient;
  readonly result: string;
  readonly changes: readonly BenchChange[];
  readonly fee: number;
  readonly feeNote: string;
  readonly cash: number;
  readonly affordable: boolean;
  readonly warning: string;
};

export function buildBenchCardModel(state: MvpRunState): BenchCardModel | null {
  const preview = state.preview;
  if (!preview) return null;
  const composite = preview.compositePreview;
  const primaryName = itemDefinitionName(composite.primary.itemDefinitionId).toUpperCase();
  const carrierName = itemDefinitionName(composite.carrier.itemDefinitionId).toUpperCase();
  return {
    primary: { itemDefinitionId: composite.primary.itemDefinitionId, name: primaryName, provenance: preview.primaryProvenance.toUpperCase() },
    carrier: { itemDefinitionId: composite.carrier.itemDefinitionId, name: carrierName, provenance: preview.carrierProvenance.toUpperCase() },
    result: `${primaryName} MOUNTED ON THE ${carrierName}`,
    changes: [
      { label: 'FIRES FROM', before: 'YOU', after: `THE ${carrierName}` },
      { label: 'AIMING', before: 'YOUR MOUSE', after: 'THE CAR DRIVES TO YOUR MOUSE' },
      { label: 'THE CAR', before: 'FIGHTS ON ITS OWN', after: 'ONLY MOVES WHERE YOU AIM' },
      { label: 'RECALL', before: 'NONE', after: `${preview.operation.recallKey} KEY PULLS THE CAR BACK` },
    ],
    fee: preview.fee,
    feeNote: preview.cleanDiscount > 0 ? `BASE $${preview.baseFee} - $${preview.cleanDiscount} CLEAN DISCOUNT` : `BASE $${preview.baseFee}`,
    cash: state.cash,
    affordable: state.cash >= preview.fee,
    warning: 'PERMANENT - BOTH ITEMS ARE CONSUMED, NO REFUNDS',
  };
}
