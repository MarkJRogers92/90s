import type { InputFrame, RunState } from './model';
import { movePlayer } from './combat/movement';

export function tickRun(state: RunState, input: InputFrame): void {
  if (state.paused || state.status !== 'playing') {
    return;
  }

  state.tick += 1;
  movePlayer(state, input.moveX, input.moveY);
}
