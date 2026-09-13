import { describe, expect, it } from 'vitest';
import { resolveEmitterMount } from '../../src/sim/fusion/emitterMount';
import { cancelFusionPreview, commitEmitterMount } from '../../src/sim/fusion/transaction';
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

function fundedState(): FusionInventoryState {
  return {
    inventory: [
      leaf('tx-soaker', 'pump_soaker', 'purchased'),
      leaf('tx-car', 'rc_car', 'purchased'),
      leaf('tx-nozzle', 'wide_nozzle', 'purchased'),
      leaf('tx-rewinder', 'vhs_rewinder', 'purchased'),
    ],
    cash: 10,
    revision: 3,
    selectedPrimaryInstanceId: 'tx-soaker',
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };
}

function validInput(state: FusionInventoryState) {
  const resolution = resolveEmitterMount(state, 'tx-soaker', 'tx-car');
  if (!resolution.accepted) {
    throw new Error(`Setup fusion must be accepted: ${resolution}`);
  }
  return {
    primaryInstanceId: 'tx-soaker',
    carrierInstanceId: 'tx-car',
    expectedRevision: state.revision,
    transactionId: resolution.proposal.transactionId,
  };
}

function snapshot(state: FusionInventoryState): string {
  return JSON.stringify(state);
}

describe('commitEmitterMount valid confirmation', () => {
  it('deducts once, consumes two leaves, preserves provenance, and records one ledger row', () => {
    const state = fundedState();
    const before = snapshot(state);
    const input = validInput(state);
    const outcome = commitEmitterMount(state, input);
    expect(snapshot(state)).toBe(before);
    if (!outcome.committed) {
      throw new Error(`Expected commit, got ${outcome.reason}: ${outcome.message}`);
    }
    const next = outcome.state;
    expect(next.cash).toBe(6);
    expect(next.revision).toBe(4);
    expect(next.nextCompositeId).toBe(2);
    expect(next.inventory).toHaveLength(3);
    const composite = next.inventory.find((node) => node.kind === 'composite');
    if (!composite || composite.kind !== 'composite') {
      throw new Error('Expected one composite in inventory');
    }
    expect(composite.recipeId).toBe('emitter_mount');
    expect(composite.primary).toEqual(leaf('tx-soaker', 'pump_soaker', 'purchased'));
    expect(composite.carrier).toEqual(leaf('tx-car', 'rc_car', 'purchased'));
    expect(next.inventory.some((node) => node.instanceId === 'tx-soaker')).toBe(false);
    expect(next.inventory.some((node) => node.instanceId === 'tx-car')).toBe(false);
    expect(next.inventory.some((node) => node.instanceId === 'tx-nozzle')).toBe(true);
    expect(next.inventory.some((node) => node.instanceId === 'tx-rewinder')).toBe(true);
    expect(next.selectedPrimaryInstanceId).toBe(composite.instanceId);
    expect(next.committedTransactions).toHaveLength(1);
    expect(next.committedTransactions[0]).toEqual({
      transactionId: input.transactionId,
      recipeId: 'emitter_mount',
      primaryInstanceId: 'tx-soaker',
      carrierInstanceId: 'tx-car',
      compositeInstanceId: composite.instanceId,
      fee: 4,
      committedRevision: 4,
    });
    expect(outcome.record).toEqual(next.committedTransactions[0]);
  });

  it('preserves an explicit nonzero creation tick through commit', () => {
    const state = fundedState();
    const before = snapshot(state);
    const resolution = resolveEmitterMount(state, 'tx-soaker', 'tx-car', 77);
    if (!resolution.accepted) {
      throw new Error(`Setup fusion must be accepted: ${resolution.reason}`);
    }
    const outcome = commitEmitterMount(state, {
      primaryInstanceId: 'tx-soaker',
      carrierInstanceId: 'tx-car',
      expectedRevision: state.revision,
      transactionId: resolution.proposal.transactionId,
      createdTick: 77,
    });
    expect(snapshot(state)).toBe(before);
    if (!outcome.committed) {
      throw new Error(`Expected commit, got ${outcome.reason}: ${outcome.message}`);
    }
    const composite = outcome.state.inventory.find((node) => node.kind === 'composite');
    if (!composite || composite.kind !== 'composite') {
      throw new Error('Expected one composite in inventory');
    }
    expect(composite.createdTick).toBe(77);
    expect(outcome.state.revision).toBe(4);
    expect(outcome.state.cash).toBe(6);
  });
});

describe('cancelFusionPreview', () => {
  it('is a byte-equivalent no-op that keeps the same state', () => {
    const state = fundedState();
    const before = snapshot(state);
    const outcome = cancelFusionPreview(state);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });
});

describe('commitEmitterMount fail-closed rejections', () => {
  it('rejects a stale revision without changing anything', () => {
    const state = fundedState();
    const before = snapshot(state);
    const input = { ...validInput(state), expectedRevision: state.revision - 1 };
    const outcome = commitEmitterMount(state, input);
    if (outcome.committed) {
      throw new Error('Stale revision must be rejected');
    }
    expect(outcome.reason).toBe('stale_revision');
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });

  it('rejects a repeated confirmation as a duplicate transaction', () => {
    const state = fundedState();
    const input = validInput(state);
    const first = commitEmitterMount(state, input);
    if (!first.committed) {
      throw new Error('First confirmation must commit');
    }
    const afterFirst = snapshot(first.state);
    const second = commitEmitterMount(first.state, input);
    if (second.committed) {
      throw new Error('Repeated confirmation must be rejected');
    }
    expect(second.reason).toBe('duplicate_transaction');
    expect(snapshot(first.state)).toBe(afterFirst);
    expect(first.state.cash).toBe(6);
    expect(first.state.inventory.filter((node) => node.kind === 'composite')).toHaveLength(1);
    expect(first.state.committedTransactions).toHaveLength(1);
  });

  it('rejects missing components without changing anything', () => {
    const state = fundedState();
    const input = validInput(state);
    const missing: FusionInventoryState = {
      ...state,
      inventory: state.inventory.filter((node) => node.instanceId !== 'tx-car'),
    };
    const before = snapshot(missing);
    const outcome = commitEmitterMount(missing, {
      ...input,
      expectedRevision: missing.revision,
    });
    if (outcome.committed) {
      throw new Error('Missing component must be rejected');
    }
    expect(outcome.reason).toBe('missing_component');
    expect(outcome.state).toBe(missing);
    expect(snapshot(missing)).toBe(before);
  });

  it('rejects insufficient cash without changing anything', () => {
    const state: FusionInventoryState = { ...fundedState(), cash: 2 };
    const before = snapshot(state);
    const outcome = commitEmitterMount(state, {
      primaryInstanceId: 'tx-soaker',
      carrierInstanceId: 'tx-car',
      expectedRevision: state.revision,
      transactionId: 'emitter-mount-tx-1',
    });
    if (outcome.committed) {
      throw new Error('Insufficient cash must be rejected');
    }
    expect(outcome.reason).toBe('insufficient_cash');
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });

  it('rejects unavailable service without changing anything', () => {
    const state: FusionInventoryState = { ...fundedState(), serviceAvailable: false };
    const before = snapshot(state);
    const outcome = commitEmitterMount(state, {
      primaryInstanceId: 'tx-soaker',
      carrierInstanceId: 'tx-car',
      expectedRevision: state.revision,
      transactionId: 'emitter-mount-tx-1',
    });
    if (outcome.committed) {
      throw new Error('Unavailable service must be rejected');
    }
    expect(outcome.reason).toBe('service_unavailable');
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });

  it('rejects a mismatched transaction ID as an invalid proposal', () => {
    const state = fundedState();
    const before = snapshot(state);
    const outcome = commitEmitterMount(state, {
      primaryInstanceId: 'tx-soaker',
      carrierInstanceId: 'tx-car',
      expectedRevision: state.revision,
      transactionId: 'forged-tx-999',
    });
    if (outcome.committed) {
      throw new Error('Mismatched transaction ID must be rejected');
    }
    expect(outcome.reason).toBe('invalid_transaction');
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });

  it('rejects an invalid creation tick without mutation', () => {
    const state = fundedState();
    const before = snapshot(state);
    const input = { ...validInput(state), createdTick: -5 };
    const outcome = commitEmitterMount(state, input);
    if (outcome.committed) {
      throw new Error('Invalid creation tick must be rejected');
    }
    expect(outcome.reason).toBe('invalid_created_tick');
    expect(outcome.state).toBe(state);
    expect(snapshot(state)).toBe(before);
  });
});
