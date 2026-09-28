/**
 * Mall Tokens: loose change the mall's monsters drop when they go down.
 *
 * Before tokens, the shift's only money was the starting float, so buying was
 * nearly always the wrong choice next to stealing. Tokens tie the fights to
 * the shops: clear a room, sweep up the change, and pay for what you would
 * otherwise have to lift past the cameras. One token is one dollar.
 *
 * Tokens are room-local and deliberately not checkpointed: the save is taken
 * at a room boundary, where every room starts clean, so an uncollected token
 * is simply left behind like it would be on a real concourse floor.
 */
import type { EnemyKind } from '../model';
import { publishRunFeedback } from './economy';
import type { MvpRunState } from './types';

export type MallTokenPickup = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly value: number;
  readonly droppedTick: number;
};

/** What each kind of mall monster is carrying. The boss ends the run instead. */
export const MALL_TOKEN_VALUE: Readonly<Record<EnemyKind, number>> = {
  hanger: 1,
  spitter: 2,
  lp_manager: 0,
};

/** The janitor sweeps up anything within this distance of their feet. */
export const TOKEN_PICKUP_RADIUS = 22;

export type EnemyMarker = { readonly id: number; readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly health: number };

/**
 * Records every enemy still standing in the room before the combat step. The
 * step removes the fallen, so anyone listed here and missing afterwards died
 * this tick, whatever brought their health to zero.
 */
export function markLivingEnemies(state: MvpRunState): EnemyMarker[] {
  return state.room.combat.enemies.map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, health: enemy.health }));
}

/** Drops a token where every enemy that was alive before this tick fell. */
export function dropTokensForDeaths(state: MvpRunState, before: readonly EnemyMarker[]): void {
  const living = new Map(state.room.combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => [enemy.id, enemy]));
  for (const marker of before) {
    if (living.has(marker.id)) continue;
    const value = MALL_TOKEN_VALUE[marker.kind];
    if (value <= 0) continue;
    state.room.tokens.push({
      id: `token-${state.tick}-${marker.id}`,
      x: marker.x,
      y: marker.y,
      value,
      droppedTick: state.tick,
    });
  }
}

/** Pays every token under the janitor into cash, keeping inventory cash in step. */
export function collectTokens(state: MvpRunState): void {
  if (state.room.tokens.length === 0) return;
  const player = state.room.combat.player;
  let collected = 0;
  state.room.tokens = state.room.tokens.filter((token) => {
    if (Math.hypot(token.x - player.x, token.y - player.y) > TOKEN_PICKUP_RADIUS) return true;
    collected += token.value;
    return false;
  });
  if (collected === 0) return;
  state.cash += collected;
  state.inventory = { ...state.inventory, cash: state.cash };
  publishRunFeedback(state, `+${collected} Mall Token${collected === 1 ? '' : 's'} ($${collected}).`);
}
