/**
 * Recipe hints (round 34): now and then a store shelves both halves of a
 * signature fusion side by side, and marks each for the other, so a named
 * pair can be found in the aisles rather than only by trial at the bench.
 *
 * A store whose shift window already holds a whole pair just marks it. Of the
 * rest that stock a pair, one in `RECIPE_HINT_ODDS` swaps an offer for the
 * missing half: it keeps the swapped offer's shelf spot and takes the new
 * item's own authored price. Seeded, so the same mall pairs the same way.
 */
import { signatureFusions } from '../fusion/hybrid';
import { STORE_TEMPLATES } from '../wing/templates';
import type { WingOffer, WingStoreInstance } from '../wing/types';

export const RECIPE_HINT_ODDS = 3;

function hash(seed: number, key: string): number {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value = Math.imul(value ^ key.charCodeAt(index), 0x01000193) >>> 0;
  }
  return value;
}

export function pairUpStock(
  shop: { readonly store: WingStoreInstance; readonly offers: readonly WingOffer[] },
  seed: number,
): { store: WingStoreInstance; offers: WingOffer[] } {
  const { store, offers } = shop;
  const template = STORE_TEMPLATES.find((candidate) => candidate.id === store.templateId);
  const unchanged = { store, offers: [...offers] };
  if (!template) return unchanged;
  const stock = new Set(template.offers.map((offer) => offer.itemDefinitionId));
  const pairs = signatureFusions().filter(({ itemIds: [a, b] }) => stock.has(a) && stock.has(b));
  const shelved = new Set(offers.map((offer) => offer.itemDefinitionId));

  const mark = (a: string, b: string, list: WingOffer[]): WingOffer[] =>
    list.map((offer) => (offer.itemDefinitionId === a ? { ...offer, pairedWith: b } : offer.itemDefinitionId === b ? { ...offer, pairedWith: a } : offer));

  const whole = pairs.find(({ itemIds: [a, b] }) => shelved.has(a) && shelved.has(b));
  if (whole) return { store, offers: mark(whole.itemIds[0], whole.itemIds[1], [...offers]) };

  if (hash(seed, `${store.templateId}:pair`) % RECIPE_HINT_ODDS !== 0) return unchanged;
  const halves = pairs.filter(({ itemIds: [a, b] }) => shelved.has(a) !== shelved.has(b));
  if (halves.length === 0) return unchanged;
  const pick = halves[hash(seed, `${store.templateId}:which`) % halves.length]!;
  const [a, b] = pick.itemIds;
  const kept = shelved.has(a) ? a : b;
  const added = kept === a ? b : a;
  const authored = template.offers.find((offer) => offer.itemDefinitionId === added)!;
  // The last offer that is not the kept half gives up its spot.
  let replaceAt = offers.length - 1;
  while (replaceAt > 0 && offers[replaceAt]!.itemDefinitionId === kept) replaceAt -= 1;
  const replaced = offers[replaceAt]!;
  const swapped: WingOffer = {
    id: `${store.templateId}-${added}`,
    storeId: replaced.storeId,
    itemDefinitionId: added,
    position: { ...replaced.position },
    price: authored.price,
  };
  const next = offers.map((offer, index) => (index === replaceAt ? swapped : offer));
  return {
    store: { ...store, offerIds: store.offerIds.map((id) => (id === replaced.id ? swapped.id : id)) },
    offers: mark(kept, added, next),
  };
}
