import { createRun } from '../src/sim/createRun';
import { createWingRun } from '../src/sim/shop/createWingRun';
import { tickWingRun } from '../src/sim/shop/tickWingRun';
import type { WingInputFrame } from '../src/sim/shop/tickWingRun';
import { tickRun } from '../src/sim/tickRun';
import type { WingState } from '../src/sim/shop/types';
import type { InputFrame, RunState } from '../src/sim/model';

export const frame = (moveX = 0, moveY = 0): InputFrame => ({
  moveX,
  moveY,
  aimX: 900,
  aimY: 240,
  fire: false,
});

export function advance(state: RunState, input: InputFrame, count: number): void {
  for (let index = 0; index < count; index += 1) {
    tickRun(state, input);
  }
}

export function emptyFixture(): RunState {
  const state = createRun(7);
  state.player.x = 300;
  state.player.y = 160;
  state.enemies = [];
  state.walls = [];
  state.roomWasPopulated = false;
  return state;
}

export const wingFrame = (
  moveX = 0,
  moveY = 0,
  interact = false,
  steal = false,
): WingInputFrame => ({ moveX, moveY, interact, steal });

export function advanceWing(state: WingState, input: WingInputFrame, count: number): void {
  for (let index = 0; index < count; index += 1) {
    tickWingRun(state, input);
  }
}

export function replayWing(seed: number, inputs: readonly WingInputFrame[]): WingState {
  const state = createWingRun(seed);
  for (const input of inputs) {
    tickWingRun(state, input);
  }
  return state;
}
