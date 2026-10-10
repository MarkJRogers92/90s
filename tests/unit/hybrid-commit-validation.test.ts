import { describe, expect, it } from 'vitest';
import { commitFusion, resolveFusion } from '../../src/sim/fusion/fuse';
import type { FusionInventoryState, FusionProposal, InventoryLeaf } from '../../src/sim/fusion/types';

function leaf(instanceId: string, itemDefinitionId: string): InventoryLeaf {
  return {
    kind: 'leaf', instanceId, itemDefinitionId, acquisitionKind: 'purchased',
    sourceLocationId: 'test-store', sourceStockId: `${instanceId}-stock`, acquisitionTick: 0,
  };
}

function preview(): { state: FusionInventoryState; proposal: FusionProposal } {
  const state: FusionInventoryState = {
    inventory: [leaf('soaker', 'pump_soaker'), leaf('ingredient', 'plasma_globe')],
    cash: 20, revision: 1, selectedPrimaryInstanceId: 'soaker',
    serviceAvailable: true, nextCompositeId: 1, committedTransactions: [],
  };
  const resolution = resolveFusion(state, 'soaker', 'ingredient', 4);
  if (!resolution.accepted) throw new Error(resolution.message);
  expect(resolution.proposal.recipeId).toBe('hybrid');
  return { state, proposal: resolution.proposal };
}

describe('hybrid confirmation revalidates the current pair', () => {
  it('refuses an unavailable service without consuming the previewed items or cash', () => {
    const { state, proposal } = preview();
    const unavailable = { ...state, serviceAvailable: false };
    const before = JSON.stringify(unavailable);

    const result = commitFusion(unavailable, proposal, 5);

    expect(result).toMatchObject({ committed: false, reason: 'service_unavailable' });
    expect(result.state).toBe(unavailable);
    expect(JSON.stringify(unavailable)).toBe(before);
  });

  it.each([
    { definition: 'pump_soaker', reason: 'same_item' },
    { definition: 'missing-definition', reason: 'unknown_definition' },
    { definition: 'rc_car', reason: 'invalid_transaction' },
  ])('refuses a changed ingredient ($definition) without throwing or partially committing', ({ definition, reason }) => {
    const { state, proposal } = preview();
    // The transaction promises to recompute, even if a caller accidentally
    // replaces a component without advancing the inventory revision.
    const changed = { ...state, inventory: [state.inventory[0]!, leaf('ingredient', definition)] };
    const before = JSON.stringify(changed);

    const result = commitFusion(changed, proposal, 5);

    expect(result).toMatchObject({ committed: false, reason });
    expect(result.state).toBe(changed);
    expect(JSON.stringify(changed)).toBe(before);
  });

  it('still commits a valid unchanged hybrid exactly once', () => {
    const { state, proposal } = preview();
    const result = commitFusion(state, proposal, 5);
    expect(result.committed).toBe(true);
    if (!result.committed) throw new Error(result.message);
    expect(result.state.cash).toBe(state.cash - proposal.fee);
    expect(result.state.inventory).toHaveLength(1);
    expect(result.state.committedTransactions).toHaveLength(1);
    const again = commitFusion(result.state, proposal, 6);
    expect(again).toMatchObject({ committed: false, reason: 'duplicate_transaction' });
    expect(again.state).toBe(result.state);
  });
});
