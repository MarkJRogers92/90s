import { describe, expect, it } from 'vitest';
import { resolveEmitterMount } from '../../src/sim/fusion/emitterMount';
import type {
  FusionInventoryState,
  InventoryLeaf,
} from '../../src/sim/fusion/types';

function leaf(
  instanceId: string,
  itemDefinitionId: string,
  acquisitionKind: 'purchased' | 'stolen' = 'purchased',
): InventoryLeaf {
  return {
    kind: 'leaf',
    instanceId,
    itemDefinitionId,
    acquisitionKind,
    sourceLocationId: 'fixture-hall',
    sourceStockId: `${instanceId}-stock`,
    acquisitionTick: 0,
  };
}

function baseState(): FusionInventoryState {
  return {
    inventory: [
      leaf('clean-soaker-primary', 'pump_soaker', 'purchased'),
      leaf('clean-soaker-car', 'rc_car', 'purchased'),
    ],
    cash: 10,
    revision: 0,
    selectedPrimaryInstanceId: 'clean-soaker-primary',
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };
}

function snapshot(state: FusionInventoryState): string {
  return JSON.stringify(state);
}

describe('resolveEmitterMount clean soaker fusion', () => {
  it('accepts a supported clean pair with a $4 fee', () => {
    const state = baseState();
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car');
    expect(snapshot(state)).toBe(before);
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}: ${result.message}`);
    }
    expect(result.proposal.recipeId).toBe('emitter_mount');
    expect(result.proposal.fee).toBe(4);
    expect(result.proposal.baseFee).toBe(6);
    expect(result.proposal.cleanDiscount).toBe(2);
  });

  it('carries exact IDs, source revision, operation, selection, and irreversibility language', () => {
    const result = resolveEmitterMount(baseState(), 'clean-soaker-primary', 'clean-soaker-car');
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}`);
    }
    const proposal = result.proposal;
    expect(proposal.primaryInstanceId).toBe('clean-soaker-primary');
    expect(proposal.carrierInstanceId).toBe('clean-soaker-car');
    expect(proposal.sourceRevision).toBe(0);
    expect(proposal.operation.attackOrigin).toBe('carrier');
    expect(proposal.selectedCompositeInstanceId).toBe(proposal.compositePreview.instanceId);
    expect(proposal.irreversibilityNotice.toLowerCase()).toMatch(/irreversib|permanent/);
    expect(proposal.compositePreview.primary.itemDefinitionId).toBe('pump_soaker');
    expect(proposal.compositePreview.carrier.itemDefinitionId).toBe('rc_car');
    expect(proposal.compositePreview.primary.acquisitionKind).toBe('purchased');
    expect(proposal.compositePreview.carrier.acquisitionKind).toBe('purchased');
    expect(proposal.retainedInstanceIds).toEqual([]);
    expect(proposal.excludedNotes.length).toBeGreaterThan(0);
  });

  it('defaults the creation tick to 0 for three-argument calls', () => {
    const result = resolveEmitterMount(baseState(), 'clean-soaker-primary', 'clean-soaker-car');
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}`);
    }
    expect(result.proposal.compositePreview.createdTick).toBe(0);
  });
});

describe('resolveEmitterMount stolen popper fusion', () => {
  it('charges the full $6 fee when an ingredient is stolen', () => {
    const state: FusionInventoryState = {
      inventory: [
        leaf('stolen-popper-primary', 'party_popper', 'stolen'),
        leaf('stolen-popper-car', 'rc_car', 'stolen'),
      ],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'stolen-popper-primary',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const result = resolveEmitterMount(state, 'stolen-popper-primary', 'stolen-popper-car');
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}`);
    }
    expect(result.proposal.fee).toBe(6);
    expect(result.proposal.baseFee).toBe(6);
    expect(result.proposal.cleanDiscount).toBe(0);
    expect(result.proposal.operation.attackOrigin).toBe('carrier');
    expect(result.proposal.compositePreview.primary.acquisitionKind).toBe('stolen');
    expect(result.proposal.compositePreview.carrier.acquisitionKind).toBe('stolen');
  });

  it('charges $6 for a mixed clean/stolen pair', () => {
    const state: FusionInventoryState = {
      inventory: [
        leaf('mixed-primary', 'pump_soaker', 'purchased'),
        leaf('mixed-car', 'rc_car', 'stolen'),
      ],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'mixed-primary',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const result = resolveEmitterMount(state, 'mixed-primary', 'mixed-car');
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}`);
    }
    expect(result.proposal.fee).toBe(6);
    expect(result.proposal.cleanDiscount).toBe(0);
  });
});

describe('resolveEmitterMount creation tick', () => {
  it('uses an explicit authoritative nonzero tick in the preview', () => {
    const state = baseState();
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car', 42);
    expect(snapshot(state)).toBe(before);
    if (!result.accepted) {
      throw new Error(`Expected acceptance, got ${result.reason}`);
    }
    expect(result.proposal.compositePreview.createdTick).toBe(42);
  });

  it('rejects invalid creation ticks without mutation', () => {
    for (const badTick of [-1, 1.5, Number.NaN]) {
      const state = baseState();
      const before = snapshot(state);
      const result = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car', badTick);
      expect(result.accepted).toBe(false);
      if (result.accepted) {
        throw new Error(`Tick ${String(badTick)} must be rejected`);
      }
      expect(result.reason).toBe('invalid_created_tick');
      expect(snapshot(state)).toBe(before);
    }
  });
});

describe('resolveEmitterMount rejections', () => {
  it('rejects the unsupported mop with the exact visible reason', () => {
    const state: FusionInventoryState = {
      inventory: [leaf('mop-primary', 'janitor_mop'), leaf('mop-car', 'rc_car')],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'mop-primary',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'mop-primary', 'mop-car');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Mop fusion must be rejected');
    }
    expect(result.reason).toBe('unsupported_primary');
    expect(result.message).toBe(
      'Emitter Mount requires a supported projectile primary, but Associate-Issue Mop is not one.',
    );
    expect(snapshot(state)).toBe(before);
  });

  it('rejects two primaries without a carrier', () => {
    const state: FusionInventoryState = {
      inventory: [leaf('soaker-a', 'pump_soaker'), leaf('popper-b', 'party_popper')],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'soaker-a',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'soaker-a', 'popper-b');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Two primaries must be rejected');
    }
    expect(result.reason).toBe('unsupported_carrier');
    expect(snapshot(state)).toBe(before);
  });

  it('rejects two carriers without a primary', () => {
    const state: FusionInventoryState = {
      inventory: [leaf('car-a', 'rc_car'), leaf('car-b', 'rc_car')],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'car-a',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'car-a', 'car-b');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Two carriers must be rejected');
    }
    expect(result.reason).toBe('unsupported_primary');
    expect(snapshot(state)).toBe(before);
  });

  it('rejects a composite input', () => {
    const state = baseState();
    const first = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car');
    if (!first.accepted) {
      throw new Error('Setup fusion must be accepted');
    }
    const fused: FusionInventoryState = {
      ...state,
      inventory: [first.proposal.compositePreview, leaf('spare-car', 'rc_car')],
    };
    const before = snapshot(fused);
    const result = resolveEmitterMount(fused, first.proposal.selectedCompositeInstanceId, 'spare-car');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Composite input must be rejected');
    }
    expect(result.reason).toBe('not_a_leaf');
    expect(snapshot(fused)).toBe(before);
  });

  it('rejects unavailable service with the exact visible reason', () => {
    const state: FusionInventoryState = { ...baseState(), serviceAvailable: false };
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Unavailable service must be rejected');
    }
    expect(result.reason).toBe('service_unavailable');
    expect(result.message).toBe(
      'The Bench Warrant fusion service is unavailable, so no proposal is offered.',
    );
    expect(snapshot(state)).toBe(before);
  });

  it('rejects insufficient cash with the exact visible reason', () => {
    const state: FusionInventoryState = { ...baseState(), cash: 3 };
    const before = snapshot(state);
    const result = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-car');
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error('Insufficient cash must be rejected');
    }
    expect(result.reason).toBe('insufficient_cash');
    expect(result.message).toBe('Emitter Mount costs $4, but only $3 is available.');
    expect(snapshot(state)).toBe(before);
  });

  it('rejects missing components and duplicate selection', () => {
    const state = baseState();
    const before = snapshot(state);
    const missing = resolveEmitterMount(state, 'no-such-primary', 'clean-soaker-car');
    expect(missing.accepted).toBe(false);
    if (missing.accepted) {
      throw new Error('Missing component must be rejected');
    }
    expect(missing.reason).toBe('missing_component');
    const duplicate = resolveEmitterMount(state, 'clean-soaker-primary', 'clean-soaker-primary');
    expect(duplicate.accepted).toBe(false);
    if (duplicate.accepted) {
      throw new Error('Duplicate selection must be rejected');
    }
    expect(duplicate.reason).toBe('duplicate_selection');
    expect(snapshot(state)).toBe(before);
  });
});
