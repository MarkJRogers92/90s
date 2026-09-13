import type { InputFrame, RunState } from './model';
import { movePlayer } from './combat/movement';
import { performMopAttack, updatePlayerFacing } from './combat/attack';
import { resolveEnemyDamage, updateEnemies, updateProjectiles } from './combat/enemies';

export function tickRun(state: RunState, input: InputFrame): void {
  if (state.paused || state.status !== 'playing') {
    return;
  }

  state.tick += 1;
  state.player.attackCooldownTicks = Math.max(0, state.player.attackCooldownTicks - 1);
  state.player.attackActiveTicks = Math.max(0, state.player.attackActiveTicks - 1);
  state.player.invulnerableTicks = Math.max(0, state.player.invulnerableTicks - 1);
  updatePlayerFacing(state, input);
  performMopAttack(state, input);
  movePlayer(state, input.moveX, input.moveY);
  updateEnemies(state);
  resolveEnemyDamage(state);
  updateProjectiles(state);
  state.enemies = state.enemies.filter((enemy) => enemy.health > 0);

  if (state.player.health <= 0) {
    state.status = 'dead';
  } else if (state.roomWasPopulated && state.enemies.length === 0) {
    state.status = 'won';
    state.rewardGranted = true;
  }
}
