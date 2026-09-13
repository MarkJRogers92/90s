import { tickRun } from '../tickRun';
import { updateEmitterCarrier, updateIndependentCarrier } from './car';
import { openFusionPreview, transferBenchRoom } from './commands';
import type { BenchInputFrame, BenchRunState } from './types';

export function tickBenchRun(state: BenchRunState, input: BenchInputFrame): void {
  if (state.paused || state.preview !== null) {
    state.heldActions = { interact: input.interact, recall: input.recall };
    return;
  }

  state.tick += 1;
  state.carrier.bumpCooldownTicks = Math.max(0, state.carrier.bumpCooldownTicks - 1);

  transferBenchRoom(state);

  if (state.carrier.mode === 'independent') {
    updateIndependentCarrier(state);
  } else {
    updateEmitterCarrier(state, input.aimX, input.aimY);
  }

  const interactEdge = input.interact && !state.heldActions.interact;
  const recallEdge = input.recall && !state.heldActions.recall;
  const feedbackBefore = state.recentChange;
  if (interactEdge) {
    openFusionPreview(state);
    if (state.preview !== null) {
      state.heldActions = { interact: input.interact, recall: input.recall };
      return;
    }
  } else if (recallEdge) {
    if (state.carrier.mode === 'emitter') {
      state.carrier.recalling = true;
      state.recentChange = 'Recall signal sent to the emitter car.';
    } else {
      state.recentChange = 'Recall is available after Emitter Mount fusion.';
    }
  }

  const attackContext =
    state.carrier.mode === 'emitter'
      ? { projectileOrigin: { x: state.carrier.x, y: state.carrier.y } }
      : {};
  tickRun(
    state.combat,
    {
      moveX: input.moveX,
      moveY: input.moveY,
      aimX: input.aimX,
      aimY: input.aimY,
      fire: input.fire,
    },
    attackContext,
  );

  if (state.combat.status !== 'playing') {
    state.recentChange = 'The bench run ended.';
  } else if (state.recentChange === feedbackBefore && state.combat.recentChange !== '') {
    state.recentChange = state.combat.recentChange;
  }

  state.heldActions = { interact: input.interact, recall: input.recall };
}
