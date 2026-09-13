import type { InputFrame, PrimaryAttackContext, RunState } from './model';
import { updatePlayerFacing } from './combat/attack';
import { resolveEnemyDamage, updateEnemies, updateProjectiles } from './combat/enemies';
import { movePlayer } from './combat/movement';
import { rememberActiveRootEventAllowance } from './effects/conduction';
import { drainChildEvents } from './effects/events';
import { isPlayerProjectile, updatePlayerProjectiles } from './effects/playerProjectiles';
import { resolvePrimaryAttack } from './effects/resolveAttack';
import { tickStatuses } from './effects/statuses';
import { updateSurfaces } from './effects/surfaces';

/**
 * The single authoritative tick.
 *
 * Order is gameplay-significant: statuses tick down before this tick's effects
 * (so a status applied now is not shortened by the tick that applied it), room
 * surfaces then refresh Wet, the player attack is accepted from the
 * pre-movement position, and the bounded child-event queue drains before the
 * terminal check so death keeps priority over room clear.
 *
 * Player projectiles are staged out of the generic projectile sweep and
 * resolved by their own stage, so a shot moves exactly once per tick and an
 * outbound expiry can start a return pass instead of destroying the shot.
 */
export function tickRun(
  state: RunState,
  input: InputFrame,
  attackContext: PrimaryAttackContext = {},
): void {
  if (state.paused || state.status !== 'playing') {
    return;
  }

  state.tick += 1;
  state.player.attackCooldownTicks = Math.max(0, state.player.attackCooldownTicks - 1);
  state.player.attackActiveTicks = Math.max(0, state.player.attackActiveTicks - 1);
  state.player.invulnerableTicks = Math.max(0, state.player.invulnerableTicks - 1);
  tickStatuses(state);
  updateSurfaces(state);
  updatePlayerFacing(state, input);
  rememberActiveRootEventAllowance(state);
  const stagedPlayerProjectiles = state.projectiles.filter(isPlayerProjectile);
  if (stagedPlayerProjectiles.length > 0) {
    state.projectiles = state.projectiles.filter(
      (projectile) => !isPlayerProjectile(projectile),
    );
  }
  resolvePrimaryAttack(state, input, attackContext);
  movePlayer(state, input.moveX, input.moveY);
  updateEnemies(state);
  resolveEnemyDamage(state);

  // Shots spawned this tick hold their origin until the next tick, so an
  // explicit firing origin stays observable and every pellet starts staged.
  const freshShots = state.projectiles.filter(isPlayerProjectile);
  if (freshShots.length > 0) {
    state.projectiles = state.projectiles.filter(
      (projectile) => !isPlayerProjectile(projectile),
    );
  }
  updateProjectiles(state);
  state.projectiles.push(...updatePlayerProjectiles(state, stagedPlayerProjectiles));
  state.projectiles.push(...freshShots);

  drainChildEvents(state);
  state.enemies = state.enemies.filter((enemy) => enemy.health > 0);

  if (state.player.health <= 0) {
    state.status = 'dead';
  } else if (state.roomWasPopulated && state.enemies.length === 0) {
    state.status = 'won';
    state.rewardGranted = true;
  }
}
