import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { openRunFusionPreview } from '../../src/sim/run/bench';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { syncRunCarrier } from '../../src/sim/run/carrier';
import type { MvpRunState } from '../../src/sim/run/types';
import { buildBenchCardModel } from '../../src/game/ui/benchCardModel';

function withPreview(): MvpRunState {
  const state = createMvpRun(7);
  const leaf = (instanceId: string, itemDefinitionId: string) => ({
    kind: 'leaf' as const, instanceId, itemDefinitionId, acquisitionKind: 'purchased' as const,
    sourceLocationId: 'test', sourceStockId: `test-${itemDefinitionId}`, acquisitionTick: 0,
  });
  state.inventory = {
    ...state.inventory,
    inventory: [...state.inventory.inventory, leaf('t-rc_car', 'rc_car'), leaf('t-party_popper', 'party_popper')],
    selectedPrimaryInstanceId: 't-party_popper',
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
  syncRunCarrier(state);
  const kiosk = state.wing.rooms[state.roomIndex]!.benchKiosk!;
  state.room.combat.player.x = kiosk.x;
  state.room.combat.player.y = kiosk.y;
  expect(openRunFusionPreview(state).accepted).toBe(true);
  return state;
}

describe('bench card model', () => {
  it('is absent without an open preview', () => {
    expect(buildBenchCardModel(createMvpRun(7))).toBeNull();
  });

  it('shows the two ingredients with icons and what they become', () => {
    const card = buildBenchCardModel(withPreview())!;
    expect(card.primary).toMatchObject({ itemDefinitionId: 'party_popper', name: 'PARTY POPPER' });
    expect(card.carrier).toMatchObject({ itemDefinitionId: 'rc_car', name: 'RC CAR' });
    expect(card.result).toContain('PARTY POPPER');
  });

  it('explains the change as before and after, in plain words', () => {
    const card = buildBenchCardModel(withPreview())!;
    const firesFrom = card.changes.find((change) => change.label === 'FIRES FROM')!;
    expect(firesFrom.before).toBe('YOU');
    expect(firesFrom.after).toMatch(/CAR/);
    expect(card.changes.some((change) => change.after.includes('R KEY'))).toBe(true);
  });

  it('prices it against cash and warns it is permanent', () => {
    const state = withPreview();
    const card = buildBenchCardModel(state)!;
    expect(card.fee).toBe(state.preview!.fee);
    expect(card.feeNote).toMatch(/DISCOUNT|BASE/);
    expect(card.affordable).toBe(state.cash >= state.preview!.fee);
    expect(card.warning).toMatch(/PERMANENT/);
  });
});
