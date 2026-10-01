import { describe, expect, it } from 'vitest';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { fusionPairFor, signatureFusions } from '../../src/sim/fusion/hybrid';
import { definitionFor } from '../../src/sim/items/registry';

describe('more signature pairs (owner queue, round 48)', () => {
  it('every store stocks at least three signature pairs, so its hint changes night to night', () => {
    for (const template of STORE_TEMPLATES) {
      const stock = new Set(template.offers.map((offer) => offer.itemDefinitionId));
      const pairs = signatureFusions().filter(({ itemIds: [a, b] }) => stock.has(a) && stock.has(b));
      expect(pairs.length, template.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every signature is a pair the bench will actually fuse, with a unique name', () => {
    const names = new Set<string>();
    for (const { itemIds: [a, b], name } of signatureFusions()) {
      expect(fusionPairFor(definitionFor(a)!, definitionFor(b)!).recipe, `${a}+${b}`).toBe('hybrid');
      expect(names.has(name), name).toBe(false);
      names.add(name);
    }
  });
});
