/**
 * What the Bench Warrant shows when a fusion goes through (round 34): a
 * rubber stamp over the fused icon, and the first time the janitor ever makes
 * a fusion, a NEW FUSION DISCOVERED banner (SIGNATURE FUSION DISCOVERED for a
 * named pair, with the running count). Pure: `FusionReveal` draws it.
 */
import type { FusionDiscovery } from '../career/career';
import { fusedIconPlan } from '../presentation/fusedIcon';

export type FusionRevealInput =
  | { readonly recipeId: 'hybrid'; readonly resultDefinitionId: string; readonly resultName: string; readonly signature: boolean }
  | { readonly recipeId: 'emitter_mount' };

export type FusionRevealBanner = { readonly headline: string; readonly name: string; readonly detail: string };

export type FusionRevealModel = {
  readonly stamp: string;
  /** The stamp's ink and the banner's accent. */
  readonly color: string;
  /** The fused item whose icon rises out of the bench, or null (a mount). */
  readonly itemDefinitionId: string | null;
  readonly parts: number;
  readonly banner: FusionRevealBanner | null;
};

const GOLD = '#ffd84a';

export function fusionRevealModel(result: FusionRevealInput, discovery: FusionDiscovery | null): FusionRevealModel {
  if (result.recipeId === 'emitter_mount') {
    return { stamp: 'MOUNTED!', color: '#3ff0ff', itemDefinitionId: null, parts: 2, banner: null };
  }
  const plan = fusedIconPlan(result.resultDefinitionId);
  const parts = plan?.parts ?? 2;
  const glow = `#${(plan?.glow.color ?? 0x6aff8a).toString(16).padStart(6, '0')}`;
  const stamp = result.signature ? 'SIGNATURE!' : parts >= 4 ? 'MAXED OUT!' : 'FUSED!';
  const color = result.signature || parts >= 4 ? GOLD : glow;
  const banner = discovery?.firstTime
    ? discovery.signature
      ? { headline: 'SIGNATURE FUSION DISCOVERED', name: discovery.signature.toUpperCase(), detail: `${discovery.signaturesFound}/${discovery.signatureTotal} SIGNATURES FOUND` }
      : { headline: 'NEW FUSION DISCOVERED', name: result.resultName.toUpperCase(), detail: `${parts} ITEMS FUSED` }
    : null;
  return { stamp, color, itemDefinitionId: result.resultDefinitionId, parts, banner };
}
