import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore, leaveStore, roomStores } from '../../src/sim/run/storeInterior';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { summarizeRuns } from '../../src/game/playtest/log';
import { BOSS_INTRO_MS } from '../../src/game/ui/bossIntroModel';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function step(state: MvpRunState, recorder: PlaytestRecorder): void {
  tickMvpRun(state, idle);
  recorder.observe(state);
}

describe('the playtest log sees fusions (round 35)', () => {
  it('each fusion the bench makes is in the record, and the summary counts them', () => {
    const state = createMvpRun(9);
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    recorder.noteFusion({ name: 'Storm Soaker', parts: 2, signature: true, firstTime: true });
    recorder.noteFusion({ name: 'Sticky Storm Soaker', parts: 3, signature: false, firstTime: false });
    const record = recorder.finish(state, 'quit')!;
    expect(record.fusions).toEqual([
      { name: 'Storm Soaker', parts: 2, signature: true, firstTime: true },
      { name: 'Sticky Storm Soaker', parts: 3, signature: false, firstTime: false },
    ]);
    expect(summarizeRuns([record]).fusions).toEqual({ made: 2, signatures: 1, discoveries: 1, avgParts: 2.5, recipeHintsSeen: 0, recipeHintsTaken: 0 });
  });

  it('a store with a recipe hint on the shelf is logged, with whether both halves were taken', () => {
    let found: { state: MvpRunState; index: number } | null = null;
    for (let seed = 1; seed < 200 && !found; seed += 1) {
      const state = createMvpRun(seed);
      state.room.combat.enemies = [];
      enterDoorway(state, 'east');
      const room = state.wing.rooms[state.roomIndex]!;
      const index = roomStores(room).findIndex((shop) => room.offers.some((offer) => offer.storeId === shop.templateId && offer.pairedWith));
      if (index >= 0) found = { state: createMvpRun(seed), index };
    }
    const { state, index } = found!;
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    state.room.combat.enemies = [];
    step(state, recorder);
    enterDoorway(state, 'east');
    step(state, recorder);
    enterStore(state, index);
    step(state, recorder);
    const room = state.wing.rooms[state.roomIndex]!;
    const shop = roomStores(room)[index]!;
    const paired = room.offers.filter((offer) => offer.storeId === shop.templateId && offer.pairedWith);
    // Both halves bought from this store.
    state.inventory = {
      ...state.inventory,
      inventory: [
        ...state.inventory.inventory,
        ...paired.map((offer) => ({ kind: 'leaf' as const, instanceId: `t-${offer.id}`, itemDefinitionId: offer.itemDefinitionId, acquisitionKind: 'purchased' as const, sourceLocationId: shop.templateId, sourceStockId: offer.id, acquisitionTick: state.tick })),
      ],
    };
    leaveStore(state);
    step(state, recorder);
    const record = recorder.finish(state, 'quit')!;
    expect(record.recipeHints).toHaveLength(1);
    expect(record.recipeHints![0]).toMatchObject({ store: shop.name.toUpperCase(), tookBoth: true });
    expect(record.recipeHints![0]!.pair).toHaveLength(2);
    expect(summarizeRuns([record]).fusions).toMatchObject({ recipeHintsSeen: 1, recipeHintsTaken: 1 });
  });
});

describe('round 35 tuning', () => {
  it('the boss card is as long as players actually watch it (they skipped at 1.2-1.3 s)', () => {
    expect(BOSS_INTRO_MS).toBe(1400);
  });
});
