import { describe, expect, it } from 'vitest';
import { fusionRevealModel } from '../../src/game/ui/fusionRevealModel';
import type { FusionDiscovery } from '../../src/game/career/career';

const found = (over: Partial<FusionDiscovery> = {}): FusionDiscovery => ({
  firstTime: true, signature: null, signaturesFound: 3, signatureTotal: 40, ...over,
});
const hybrid = (resultDefinitionId: string, resultName: string, signature = false) =>
  ({ recipeId: 'hybrid', resultDefinitionId, resultName, signature }) as const;

describe('the fusion reveal (round 34)', () => {
  it('a first-ever fusion gets the NEW FUSION DISCOVERED banner', () => {
    const model = fusionRevealModel(hybrid('hybrid__box_cutter__gel_pens', 'Sticky Cutter'), found());
    expect(model.stamp).toBe('FUSED!');
    expect(model.itemDefinitionId).toBe('hybrid__box_cutter__gel_pens');
    expect(model.banner).toEqual({ headline: 'NEW FUSION DISCOVERED', name: 'STICKY CUTTER', detail: '2 ITEMS FUSED' });
  });

  it('a first signature gets its own banner with the running count', () => {
    const model = fusionRevealModel(hybrid('hybrid__pump_soaker__plasma_globe', 'Storm Soaker', true), found({ signature: 'Storm Soaker', signaturesFound: 4 }));
    expect(model.stamp).toBe('SIGNATURE!');
    expect(model.banner).toEqual({ headline: 'SIGNATURE FUSION DISCOVERED', name: 'STORM SOAKER', detail: '4/40 SIGNATURES FOUND' });
  });

  it('a repeat fusion still stamps, but without a banner', () => {
    const model = fusionRevealModel(hybrid('hybrid__box_cutter__gel_pens', 'Sticky Cutter'), found({ firstTime: false }));
    expect(model.stamp).toBe('FUSED!');
    expect(model.banner).toBeNull();
  });

  it('a full four-item fusion stamps MAXED OUT in gold', () => {
    const id = 'hybrid__(hybrid__(hybrid__pump_soaker__plasma_globe)__gel_pens)__wide_nozzle';
    const model = fusionRevealModel(hybrid(id, 'Big Soaker'), found({ firstTime: false }));
    expect(model.stamp).toBe('MAXED OUT!');
    expect(model.parts).toBe(4);
    expect(model.color).toBe('#ffd84a');
  });

  it('an Emitter Mount stamps MOUNTED with no fused icon or banner', () => {
    const model = fusionRevealModel({ recipeId: 'emitter_mount' }, null);
    expect(model).toMatchObject({ stamp: 'MOUNTED!', itemDefinitionId: null, banner: null });
  });
});
