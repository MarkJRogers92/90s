import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import { projectFusionInventory } from '../../src/sim/fusion/inventory';
import { resolveEmitterMount } from '../../src/sim/fusion/emitterMount';
import {
  restoreFusionState,
  serializeFusionState,
} from '../../src/sim/fusion/serialization';
import { commitEmitterMount } from '../../src/sim/fusion/transaction';
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

function committedState(): FusionInventoryState {
  const state: FusionInventoryState = {
    inventory: [
      leaf('ser-popper', 'party_popper', 'stolen'),
      leaf('ser-car', 'rc_car', 'stolen'),
      leaf('ser-nozzle', 'wide_nozzle', 'purchased'),
      leaf('ser-rewinder', 'vhs_rewinder', 'purchased'),
    ],
    cash: 10,
    revision: 0,
    selectedPrimaryInstanceId: 'ser-popper',
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };
  const resolution = resolveEmitterMount(state, 'ser-popper', 'ser-car');
  if (!resolution.accepted) {
    throw new Error('Setup fusion must be accepted');
  }
  const outcome = commitEmitterMount(state, {
    primaryInstanceId: 'ser-popper',
    carrierInstanceId: 'ser-car',
    expectedRevision: state.revision,
    transactionId: resolution.proposal.transactionId,
  });
  if (!outcome.committed) {
    throw new Error('Setup commit must succeed');
  }
  return outcome.state;
}

describe('fusion projection', () => {
  it('maps the composite to its primary definition and excludes the integrated car', () => {
    const state = committedState();
    const projected = projectFusionInventory(state);
    const composite = state.inventory.find((node) => node.kind === 'composite');
    if (!composite || composite.kind !== 'composite') {
      throw new Error('Expected a composite after commit');
    }
    expect(projected.selectedPrimaryInstanceId).toBe(composite.instanceId);
    const byInstance = new Map(projected.instances.map((entry) => [entry.instanceId, entry.itemId]));
    expect(byInstance.get(composite.instanceId)).toBe('party_popper');
    expect(byInstance.get('ser-nozzle')).toBe('wide_nozzle');
    expect(byInstance.get('ser-rewinder')).toBe('vhs_rewinder');
    expect(byInstance.has('ser-car')).toBe(false);
    expect(byInstance.has('ser-popper')).toBe(false);
    const compiled = compileLoadout(ITEM_CATALOG, projected.instances, projected.selectedPrimaryInstanceId);
    expect(compiled.primary.definitionId).toBe('party_popper');
    expect(compiled.sourceItemIds).toContain('party_popper');
    expect(compiled.sourceItemIds).toContain('wide_nozzle');
    expect(compiled.sourceItemIds).toContain('vhs_rewinder');
    expect(compiled.sourceItemIds).not.toContain('rc_car');
  });

  it('projects standalone leaves one-to-one before fusion', () => {
    const state: FusionInventoryState = {
      inventory: [leaf('plain-soaker', 'pump_soaker'), leaf('plain-car', 'rc_car')],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'plain-soaker',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const projected = projectFusionInventory(state);
    expect(projected.instances).toEqual([
      { instanceId: 'plain-soaker', itemId: 'pump_soaker' },
      { instanceId: 'plain-car', itemId: 'rc_car' },
    ]);
    expect(projected.selectedPrimaryInstanceId).toBe('plain-soaker');
  });
});

describe('fusion serialization round-trip', () => {
  it('restores an equivalent state with equivalent compilation', () => {
    const state = committedState();
    const serialized = serializeFusionState(state);
    const restored = restoreFusionState(JSON.parse(serialized));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
    expect(restored.cash).toBe(state.cash);
    expect(restored.revision).toBe(state.revision);
    expect(restored.selectedPrimaryInstanceId).toBe(state.selectedPrimaryInstanceId);
    expect(restored.committedTransactions).toEqual(state.committedTransactions);
    const beforeProjection = projectFusionInventory(state);
    const afterProjection = projectFusionInventory(restored);
    expect(afterProjection).toEqual(beforeProjection);
    const beforeCompiled = compileLoadout(
      ITEM_CATALOG,
      beforeProjection.instances,
      beforeProjection.selectedPrimaryInstanceId,
    );
    const afterCompiled = compileLoadout(
      ITEM_CATALOG,
      afterProjection.instances,
      afterProjection.selectedPrimaryInstanceId,
    );
    expect(JSON.stringify(afterCompiled)).toBe(JSON.stringify(beforeCompiled));
  });

  it('accepts a serialized string directly', () => {
    const state = committedState();
    const restored = restoreFusionState(serializeFusionState(state));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
  });

  it('round-trips a nonzero creation tick from commit', () => {
    const state: FusionInventoryState = {
      inventory: [
        leaf('tick-soaker', 'pump_soaker', 'purchased'),
        leaf('tick-car', 'rc_car', 'purchased'),
      ],
      cash: 10,
      revision: 0,
      selectedPrimaryInstanceId: 'tick-soaker',
      serviceAvailable: true,
      nextCompositeId: 1,
      committedTransactions: [],
    };
    const resolution = resolveEmitterMount(state, 'tick-soaker', 'tick-car', 91);
    if (!resolution.accepted) {
      throw new Error('Setup fusion must be accepted');
    }
    expect(resolution.proposal.compositePreview.createdTick).toBe(91);
    const outcome = commitEmitterMount(state, {
      primaryInstanceId: 'tick-soaker',
      carrierInstanceId: 'tick-car',
      expectedRevision: state.revision,
      transactionId: resolution.proposal.transactionId,
      createdTick: 91,
    });
    if (!outcome.committed) {
      throw new Error(`Setup commit must succeed: ${outcome.reason}`);
    }
    const composite = outcome.state.inventory.find((node) => node.kind === 'composite');
    if (!composite || composite.kind !== 'composite') {
      throw new Error('Expected one composite in inventory');
    }
    expect(composite.createdTick).toBe(91);
    const restored = restoreFusionState(serializeFusionState(outcome.state));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(outcome.state));
    const restoredComposite = restored.inventory.find((node) => node.kind === 'composite');
    if (!restoredComposite || restoredComposite.kind !== 'composite') {
      throw new Error('Expected one restored composite');
    }
    expect(restoredComposite.createdTick).toBe(91);
    const beforeProjection = projectFusionInventory(outcome.state);
    const afterProjection = projectFusionInventory(restored);
    expect(afterProjection).toEqual(beforeProjection);
  });
});

describe('restoreFusionState validation', () => {
  it('rejects unknown definition IDs against the catalog', () => {
    const state = committedState();
    const tampered = JSON.parse(serializeFusionState(state)) as Record<string, unknown>;
    const inventory = tampered['inventory'] as Record<string, unknown>[];
    const standalone = inventory.find((node) => node['kind'] === 'leaf') as Record<string, unknown>;
    standalone['itemDefinitionId'] = 'not_a_real_item';
    expect(() => restoreFusionState(tampered)).toThrow(/unknown item definition/);
  });

  it('rejects malformed payloads', () => {
    expect(() => restoreFusionState(null)).toThrow();
    expect(() => restoreFusionState('not-json{{{')).toThrow();
    expect(() => restoreFusionState({ cash: 10 })).toThrow();
    expect(() => restoreFusionState({ ...committedState(), cash: -1 })).toThrow();
  });

  it('rejects dangling selection and duplicate instance IDs', () => {
    const dangling: FusionInventoryState = {
      ...committedState(),
      selectedPrimaryInstanceId: 'ghost-instance',
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(dangling)))).toThrow(/selection/);
    const duplicated = committedState();
    const inventory = [...duplicated.inventory, duplicated.inventory[0]];
    expect(() =>
      restoreFusionState(JSON.parse(JSON.stringify({ ...duplicated, inventory }))),
    ).toThrow(/duplicate/);
  });

  it('rejects a leaf instance ID reused between a component and a top-level leaf', () => {
    const state = committedState();
    const tampered: FusionInventoryState = {
      ...state,
      inventory: [...state.inventory, leaf('ser-popper', 'pump_soaker', 'purchased')],
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects a leaf instance ID reused across two composites', () => {
    const state = committedState();
    const existing = state.inventory.find((node) => node.kind === 'composite');
    if (!existing || existing.kind !== 'composite') {
      throw new Error('Setup state must contain a composite');
    }
    const secondComposite = {
      ...existing,
      instanceId: 'emitter-mount-2',
      transactionId: 'emitter-mount-tx-2',
    };
    const tampered: FusionInventoryState = {
      ...state,
      inventory: [...state.inventory, secondComposite],
      committedTransactions: [
        ...state.committedTransactions,
        {
          transactionId: 'emitter-mount-tx-2',
          recipeId: 'emitter_mount' as const,
          primaryInstanceId: existing.primary.instanceId,
          carrierInstanceId: existing.carrier.instanceId,
          compositeInstanceId: 'emitter-mount-2',
          fee: 6,
          committedRevision: state.revision,
        },
      ],
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects duplicate transaction IDs', () => {
    const state = committedState();
    const record = state.committedTransactions[0];
    if (!record) {
      throw new Error('Setup state must contain a ledger record');
    }
    const tampered: FusionInventoryState = {
      ...state,
      committedTransactions: [...state.committedTransactions, { ...record }],
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects a component instance committed more than once', () => {
    const state = committedState();
    const record = state.committedTransactions[0];
    if (!record) {
      throw new Error('Setup state must contain a ledger record');
    }
    const tampered: FusionInventoryState = {
      ...state,
      committedTransactions: [
        ...state.committedTransactions,
        {
          ...record,
          transactionId: 'emitter-mount-tx-2',
          compositeInstanceId: 'emitter-mount-2',
          committedRevision: state.revision,
        },
      ],
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects a composite whose primary is not a catalog projectile primary', () => {
    const state = committedState();
    const inventory = state.inventory.map((node) => {
      if (node.kind !== 'composite') {
        return node;
      }
      return {
        ...node,
        primary: { ...node.primary, itemDefinitionId: 'janitor_mop' },
      };
    });
    const tampered: FusionInventoryState = { ...state, inventory };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects a composite whose carrier lacks emitter_carrier capability', () => {
    const state = committedState();
    const inventory = state.inventory.map((node) => {
      if (node.kind !== 'composite') {
        return node;
      }
      return {
        ...node,
        carrier: { ...node.carrier, itemDefinitionId: 'wide_nozzle' },
      };
    });
    const tampered: FusionInventoryState = { ...state, inventory };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(tampered)))).toThrow();
  });

  it('rejects composite/ledger mismatches in both directions', () => {
    const state = committedState();
    const withoutLedger: FusionInventoryState = { ...state, committedTransactions: [] };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(withoutLedger)))).toThrow();
    const composite = state.inventory.find((node) => node.kind === 'composite');
    if (!composite) {
      throw new Error('Setup state must contain a composite');
    }
    const withoutComposite: FusionInventoryState = {
      ...state,
      inventory: state.inventory.filter((node) => node.kind !== 'composite'),
      selectedPrimaryInstanceId: 'ser-nozzle',
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(withoutComposite)))).toThrow();
    const record = state.committedTransactions[0];
    if (!record) {
      throw new Error('Setup state must contain a ledger record');
    }
    const feeMismatch: FusionInventoryState = {
      ...state,
      committedTransactions: [{ ...record, fee: record.fee === 4 ? 6 : 4 }],
    };
    expect(() => restoreFusionState(JSON.parse(JSON.stringify(feeMismatch)))).toThrow();
  });
});
