/**
 * The Cleanup Combo: every blow that lands keeps a counter going, getting hurt
 * or going quiet for a couple of seconds drops it, and each milestone pays out
 * a bonus Mall Token pile. It rewards playing aggressively and cleanly, which
 * the knockback, dash and wind-ups now make possible.
 *
 * Run-level stats (combo, best combo, kills) live here too, so the end card
 * and the score can report them. They are not checkpointed: a restored shift
 * starts its streak fresh, like a new room would.
 */
import type { MvpRunState } from './types';

/** Ticks without a landed blow before the combo drops (2.5 s). */
export const COMBO_WINDOW_TICKS = 150;
/** A bonus pays at every multiple of this. */
export const COMBO_MILESTONE = 5;

export type RunStats = {
  combo: number;
  bestCombo: number;
  kills: number;
  lastHitTick: number;
};

export function createRunStats(): RunStats {
  return { combo: 0, bestCombo: 0, kills: 0, lastHitTick: -Infinity };
}

/** Dollars in the bonus pile at a milestone: $2 at 5, $4 at 10, $6 at 15... */
export function comboBonusFor(combo: number): number {
  return Math.floor(combo / COMBO_MILESTONE) * 2;
}

export function stepCombo(state: MvpRunState, tick: { readonly hits: number; readonly kills: number; readonly hurt: boolean }): void {
  const stats = state.stats;
  stats.kills += tick.kills;
  if (tick.hurt) {
    stats.combo = 0;
    return;
  }
  if (tick.hits === 0) {
    if (stats.combo > 0 && state.tick - stats.lastHitTick > COMBO_WINDOW_TICKS) stats.combo = 0;
    return;
  }
  const before = stats.combo;
  stats.combo += tick.hits;
  stats.lastHitTick = state.tick;
  stats.bestCombo = Math.max(stats.bestCombo, stats.combo);
  // One pile per milestone crossed this tick, dropped just ahead of the janitor.
  for (let milestone = (Math.floor(before / COMBO_MILESTONE) + 1) * COMBO_MILESTONE; milestone <= stats.combo; milestone += COMBO_MILESTONE) {
    const player = state.room.combat.player;
    state.room.tokens.push({
      id: `combo-${state.tick}-${milestone}`,
      x: player.x + player.facing.x * 36,
      y: player.y + player.facing.y * 36,
      value: comboBonusFor(milestone),
      droppedTick: state.tick,
    });
  }
}
