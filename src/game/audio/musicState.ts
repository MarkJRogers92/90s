/**
 * Which music the mall should be playing, read from authoritative run state.
 *
 * Pure, like the cue table: the soundtrack can only follow what the
 * simulation says is happening — a quiet room plays warped muzak, living
 * enemies bring in the combat loop, the Loss Prevention Manager has his own
 * theme that tightens with his phase, and the end of a shift goes quiet so the
 * terminal sting and the end card own the moment.
 */
import type { MvpRunState } from '../../sim/run/types';

export type MusicTrackId = 'muzak' | 'combat' | 'boss';

export type MusicCue = {
  readonly track: MusicTrackId | 'silent';
  /** Multiplier on the track's tempo (the boss speeds up by phase). */
  readonly tempoScale: number;
  /** 0..1 music bus level; paused ducks it. */
  readonly volume: number;
};

export function musicCue(state: MvpRunState): MusicCue {
  if (state.status !== 'playing') return { track: 'silent', tempoScale: 1, volume: 0 };
  const volume = state.paused ? 0.35 : 1;
  const living = state.room.combat.enemies.filter((enemy) => enemy.health > 0);
  const boss = living.find((enemy) => enemy.kind === 'lp_manager');
  if (boss) {
    const phase = boss.bossPhase ?? 1;
    return { track: 'boss', tempoScale: phase === 3 ? 1.16 : phase === 2 ? 1.07 : 1, volume };
  }
  if (living.length > 0) return { track: 'combat', tempoScale: 1, volume };
  return { track: 'muzak', tempoScale: 1, volume };
}
