import { createRun } from '../src/sim/createRun';
import { tickRun } from '../src/sim/tickRun';
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
