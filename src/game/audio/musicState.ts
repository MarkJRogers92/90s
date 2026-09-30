/**
 * Which music the mall should be playing, read from authoritative run state.
 *
 * Pure, like the cue table: the soundtrack can only follow what the
 * simulation says is happening — a quiet room plays warped muzak, living
 * enemies bring in the combat track (with more layers the busier the room
 * and when you are down to your last heart), a blacked-out fight plays
 * Lights Out, the Loss Prevention Manager has his own theme that speeds up
 * and thickens with his phase, an unwatched mannequin raises a tension
 * layer, and the end of a shift goes quiet so the sting and end card own it.
 * Upstairs, fights play Escalator Rush and the Mall Manager has his own theme;
 * on the top floor, Arcade After Dark, and the Mall Owner's Hostile Takeover.
 */
import { roomEventFor } from '../../sim/run/roomEvents';
import type { MvpRunState } from '../../sim/run/types';
import { isBossKind } from '../../sim/combat/boss';
import { floorNumberOf, type FloorNumber } from '../../sim/wing/floorSpecs';

export type MusicTrackId = 'muzak' | 'combat' | 'boss' | 'blackout' | 'upstairs' | 'manager' | 'topfloor' | 'owner' | 'roof' | 'developer';

export type MusicCue = {
  readonly track: MusicTrackId | 'silent';
  /** Multiplier on the track's tempo (the boss speeds up by phase). */
  readonly tempoScale: number;
  /** 0..1 music bus level; paused ducks it. */
  readonly volume: number;
  /** 0..1: how many layers of the arrangement play. */
  readonly intensity: number;
  /** True while a mannequin you are not watching is moving. */
  readonly tension: boolean;
};

const LAST_HEART = 2;

/** Each floor's fight music (bosses have their own tracks, by boss). */
const FIGHT_TRACKS: Readonly<Record<FloorNumber, MusicTrackId>> = {
  1: 'combat',
  2: 'upstairs',
  3: 'topfloor',
  4: 'roof',
};

export function musicCue(state: MvpRunState): MusicCue {
  if (state.status !== 'playing') return { track: 'silent', tempoScale: 1, volume: 0, intensity: 0, tension: false };
  const volume = state.paused ? 0.35 : 1;
  const living = state.room.combat.enemies.filter((enemy) => enemy.health > 0);
  const tension = living.some((enemy) => enemy.kind === 'mannequin' && enemy.phase === 'pursue');
  const danger = state.room.combat.player.health <= LAST_HEART ? 0.3 : 0;
  const boss = living.find((enemy) => isBossKind(enemy.kind));
  if (boss) {
    const phase = boss.bossPhase ?? 1;
    return {
      track: boss.kind === 'developer' ? 'developer' : boss.kind === 'owner' ? 'owner' : boss.kind === 'manager' ? 'manager' : 'boss',
      tempoScale: phase === 3 ? 1.12 : phase === 2 ? 1.05 : 1,
      volume,
      intensity: Math.min(1, (phase === 3 ? 1 : phase === 2 ? 0.7 : 0.4) + danger),
      tension,
    };
  }
  if (living.length > 0) {
    const intensity = Math.min(1, 0.25 + living.length * 0.18 + danger);
    const track = roomEventFor(state, state.roomIndex) === 'blackout' ? 'blackout' : FIGHT_TRACKS[floorNumberOf(state.wing)];
    return { track, tempoScale: 1, volume, intensity, tension };
  }
  return { track: 'muzak', tempoScale: 1, volume, intensity: 0.5, tension: false };
}
