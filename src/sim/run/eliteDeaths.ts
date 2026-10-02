/**
 * What an elite leaves behind when it falls (round 57): a Volatile one lights a
 * fuse where it died (see combat/eliteTraits.ts). Detected the way tokens are:
 * anyone marked living before the combat step and gone after it died this tick,
 * whatever brought their health to zero.
 */
import { startBurst } from '../combat/eliteTraits';
import type { EnemyMarker } from './tokens';
import type { MvpRunState } from './types';

export function burstsForDeaths(state: MvpRunState, before: readonly EnemyMarker[]): void {
  const living = new Set(state.room.combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id));
  for (const marker of before) {
    if (marker.trait === 'volatile' && !living.has(marker.id)) startBurst(state.room.combat, marker.x, marker.y);
  }
}
