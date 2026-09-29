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
import { ELITE_SNACK_CHANCE, ELITE_TOKEN_MULTIPLIER, SNACK_CHANCE, luck } from './luck';
import { runMaxHealth, tokenMagnetReach } from './perks';
import type { MvpRunState } from './types';

export type MallTokenPickup = {
  readonly id: string;
  /** A pretzel heals instead of paying. Absent means a token. */
  readonly kind?: 'token' | 'snack';
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
  mannequin: 3,
  manager: 0,
  static: 2,
  shopper: 3,
  mascot: 5,
  owner: 0,
};

/** The janitor sweeps up anything within this distance of their feet. */
export const TOKEN_PICKUP_RADIUS = 22;

/** How far the Shop-Vac Attachment draws a pickup in each tick. */
export const TOKEN_MAGNET_SPEED = 5;

export type EnemyMarker = { readonly id: number; readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly health: number; readonly elite?: boolean };

/**
 * Records every enemy still standing in the room before the combat step. The
 * step removes the fallen, so anyone listed here and missing afterwards died
 * this tick, whatever brought their health to zero.
 */
export function markLivingEnemies(state: MvpRunState): EnemyMarker[] {
  return state.room.combat.enemies.map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, health: enemy.health, elite: enemy.elite === true }));
}

/** Drops a token where every enemy that was alive before this tick fell. */
export function dropTokensForDeaths(state: MvpRunState, before: readonly EnemyMarker[]): void {
  const living = new Map(state.room.combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => [enemy.id, enemy]));
  for (const marker of before) {
    if (living.has(marker.id)) continue;
    const value = MALL_TOKEN_VALUE[marker.kind] * (marker.elite ? ELITE_TOKEN_MULTIPLIER : 1);
    if (value <= 0) continue;
    if (luck(state.seed, 'snack', state.tick, marker.id) < (marker.elite ? ELITE_SNACK_CHANCE : SNACK_CHANCE)) {
      state.room.tokens.push({ id: `snack-${state.tick}-${marker.id}`, kind: 'snack', x: marker.x + 16, y: marker.y + 6, value: 0, droppedTick: state.tick });
    }
    state.room.tokens.push({
      id: `token-${state.tick}-${marker.id}`,
      x: marker.x,
      y: marker.y,
      value,
      droppedTick: state.tick,
    });
  }
}

/**
 * Draws loose pickups inside the Shop-Vac's reach toward the janitor. A
 * pretzel is only drawn in when the janitor is hurt, as it would only be eaten
 * then; without the attachment the reach is the pickup radius and nothing moves.
 */
function vacuumTokens(state: MvpRunState): void {
  const reach = tokenMagnetReach(state);
  if (reach <= TOKEN_PICKUP_RADIUS) return;
  const player = state.room.combat.player;
  const hungry = player.health < runMaxHealth(state);
  state.room.tokens = state.room.tokens.map((token) => {
    if (token.kind === 'snack' && !hungry) return token;
    const dx = player.x - token.x;
    const dy = player.y - token.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= TOKEN_PICKUP_RADIUS || distance > reach) return token;
    const step = Math.min(TOKEN_MAGNET_SPEED, distance);
    return { ...token, x: token.x + (dx / distance) * step, y: token.y + (dy / distance) * step };
  });
}

/** Pays every token under the janitor into cash, keeping inventory cash in step. */
export function collectTokens(state: MvpRunState): void {
  if (state.room.tokens.length === 0) return;
  vacuumTokens(state);
  const player = state.room.combat.player;
  let collected = 0;
  let healed = 0;
  state.room.tokens = state.room.tokens.filter((token) => {
    if (Math.hypot(token.x - player.x, token.y - player.y) > TOKEN_PICKUP_RADIUS) return true;
    if (token.kind === 'snack') {
      // A pretzel waits on the floor until the janitor actually needs it.
      if (player.health >= runMaxHealth(state)) return true;
      player.health += 1;
      healed += 1;
      return false;
    }
    collected += token.value;
    return false;
  });
  if (healed > 0) publishRunFeedback(state, `Food court pretzel! +${healed === 1 ? 'half a heart' : `${healed / 2} hearts`}.`);
  if (collected === 0) return;
  state.cash += collected;
  state.inventory = { ...state.inventory, cash: state.cash };
  publishRunFeedback(state, `+${collected} Mall Token${collected === 1 ? '' : 's'} ($${collected}).`);
}
