import { describe, expect, it } from 'vitest';
import { generateRunWing, roomStores } from '../../src/sim/run/storeInterior';
import { isSignatureFusion } from '../../src/sim/fusion/hybrid';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';

type Shop = { templateId: string; offerIds: readonly string[] };
function shopsOf(seed: number) {
  const out: Array<{ seed: number; shop: Shop; offers: ReturnType<typeof generateRunWing>['rooms'][number]['offers'] }> = [];
  for (const room of generateRunWing(seed).rooms) {
    for (const shop of roomStores(room)) out.push({ seed, shop, offers: room.offers.filter((offer) => offer.storeId === shop.templateId) });
  }
  return out;
}
const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);
const all = SEEDS.flatMap(shopsOf);

describe('recipe hints: a named pair on the same shelf (round 34)', () => {
  it('sometimes a store stocks both halves of a signature fusion, marked for each other', () => {
    const paired = all.filter(({ offers }) => offers.some((offer) => offer.pairedWith));
    expect(paired.length).toBeGreaterThan(all.length / 10);
    expect(paired.length).toBeLessThan(all.length / 2);
    for (const { offers } of paired) {
      const marked = offers.filter((offer) => offer.pairedWith);
      expect(marked).toHaveLength(2);
      const [a, b] = marked as [typeof marked[number], typeof marked[number]];
      expect(a.pairedWith).toBe(b.itemDefinitionId);
      expect(b.pairedWith).toBe(a.itemDefinitionId);
      expect(isSignatureFusion(a.itemDefinitionId, b.itemDefinitionId)).toBe(true);
    }
  });

  it("a paired item is really that store's stock, at its shelf price", () => {
    for (const { shop, offers } of all) {
      const template = STORE_TEMPLATES.find((candidate) => candidate.id === shop.templateId)!;
      for (const offer of offers) {
        const authored = template.offers.find((candidate) => candidate.itemDefinitionId === offer.itemDefinitionId);
        expect(authored, `${shop.templateId} sells ${offer.itemDefinitionId}`).toBeDefined();
        expect(offer.price).toBe(authored!.price);
      }
    }
  });

  it('shelves stay tidy: no doubled items, no shared spots, ids match the store', () => {
    for (const { shop, offers } of all) {
      expect(new Set(offers.map((offer) => offer.itemDefinitionId)).size).toBe(offers.length);
      expect(new Set(offers.map((offer) => `${offer.position.x},${offer.position.y}`)).size).toBe(offers.length);
      expect([...shop.offerIds].sort()).toEqual(offers.map((offer) => offer.id).sort());
      for (const offer of offers) expect(offer.id).toBe(`${shop.templateId}-${offer.itemDefinitionId}`);
    }
  });

  it('the same mall pairs the same way every time', () => {
    expect(JSON.stringify(shopsOf(77))).toBe(JSON.stringify(shopsOf(77)));
  });
});

describe('every signature fusion can actually be made (round 34)', () => {
  it('each listed pair is recognised as a signature, whichever way round', async () => {
    const { signatureFusions } = await import('../../src/sim/fusion/hybrid');
    const missed = signatureFusions().filter(({ itemIds: [a, b] }) => !isSignatureFusion(a, b) || !isSignatureFusion(b, a));
    expect(missed.map((entry) => entry.name)).toEqual([]);
  });
});
