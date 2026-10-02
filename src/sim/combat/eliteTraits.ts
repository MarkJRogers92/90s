/**
 * Elite traits (round 57): what a glowing CLEARANCE elite is on top of tough.
 *
 * A Clearance elite already has twice the health and pays triple change. Now
 * each also has one trait, rolled from the seed with the elite roll, so the
 * same night always meets the same ones:
 *
 *  - SWIFT closes in a third faster. Nothing else about it changes, so it is a
 *    test of kiting and dashing rather than a bigger health bar.
 *  - VOLATILE bursts when it dies. A ring of warning shows for a beat where it
 *    fell, then it goes off for one health to a janitor still inside it. It is
 *    a reason to finish the fight from range, or to step back after the kill.
 *
 * Plain data and pure rules over `RunState`; the view reads `enemy.trait` and
 * `combat.bursts` to draw them.
 */
import type { EliteTrait, RunState } from '../model';
import { luck } from '../run/luck';
import { playerDashing } from './dash';

export const ELITE_TRAITS: readonly EliteTrait[] = ['swift', 'volatile'];

/** Swift: speed multiplier on top of whatever status the monster is under. */
export const SWIFT_SPEED_MULTIPLIER = 1.35;
/** Volatile: ticks from the death to the blast (0.6 s), and how far it reaches. */
export const VOLATILE_FUSE_TICKS = 36;
export const VOLATILE_BURST_RADIUS = 76;
/** Health a blast takes, and the grace the janitor gets after it, like any other hit. */
export const VOLATILE_BURST_DAMAGE = 1;
const BURST_GRACE_TICKS = 60;

/** Which trait the elite at `index` in room `roomIndex` carries. */
export function rollEliteTrait(seed: number, roomIndex: number, index: number): EliteTrait {
  return ELITE_TRAITS[Math.floor(luck(seed, 'elite-trait', roomIndex, index) * ELITE_TRAITS.length)]!;
}

/** Leaves a lit fuse where a Volatile elite fell. */
export function startBurst(state: RunState, x: number, y: number): void {
  (state.bursts ??= []).push({ x, y, fuseTicks: VOLATILE_FUSE_TICKS });
}

/** Burns every fuse down a tick, and sets off the ones that are out. */
export function updateBursts(state: RunState): void {
  if (!state.bursts || state.bursts.length === 0) return;
  const remaining = [];
  for (const burst of state.bursts) {
    burst.fuseTicks -= 1;
    if (burst.fuseTicks > 0) {
      remaining.push(burst);
      continue;
    }
    const player = state.player;
    const inside = Math.hypot(player.x - burst.x, player.y - burst.y) <= VOLATILE_BURST_RADIUS + player.radius;
    if (inside && player.invulnerableTicks <= 0 && !playerDashing(state)) {
      player.health -= VOLATILE_BURST_DAMAGE;
      player.invulnerableTicks = BURST_GRACE_TICKS;
    }
  }
  state.bursts = remaining;
}
