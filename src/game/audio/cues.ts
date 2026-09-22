/**
 * Pure derivation of audio cues from authoritative run state.
 *
 * Audio is presentation, so it lives outside `src/sim` and never mutates it.
 * But the *decision* about what happened must not be invented by guesswork on
 * top of rendered text: this module reads the same structured fields the
 * simulation already maintains — health, attack windows, enemy roster, boss
 * phase, the event counters, cash, carried thefts, Heat, and the checkpoint —
 * and reports the cues a single tick produced.
 *
 * Keeping it a pure function of (previous snapshot, current state) means the
 * whole cue table is unit-testable with no Web Audio and no browser, which is
 * the only reason a sound layer in this project can have honest tests at all.
 */
import type { RunState } from '../../sim/model';
import type { MvpRunState } from '../../sim/run/types';
import type { WingState } from '../../sim/shop/types';

export type AudioCue =
  | 'swing'
  | 'shot'
  | 'splash'
  | 'hit'
  | 'hurt'
  | 'heal'
  | 'purchase'
  | 'theft'
  | 'confiscation'
  | 'conduction'
  | 'enemy_down'
  | 'boss_telegraph'
  | 'boss_volley'
  | 'boss_phase'
  | 'checkpoint'
  | 'room_clear'
  | 'pa_chime'
  | 'won'
  | 'died';

/**
 * The subset of run state a cue decision depends on.
 *
 * Captured as plain numbers and identifiers so a comparison across ticks cannot
 * accidentally alias live simulation objects.
 */
export type AudioSnapshot = {
  readonly status: MvpRunState['status'];
  readonly health: number;
  readonly attackActiveTicks: number;
  readonly livingEnemyIds: readonly number[];
  readonly bossPhase: number | null;
  readonly bossTelegraphing: boolean;
  readonly bossVolleyTelegraphTicks: number;
  readonly playerProjectiles: number;
  readonly surfaces: number;
  readonly gameplayEvents: number;
  readonly childEventsThisRoot: number;
  readonly cash: number;
  readonly carried: number;
  readonly heat: number;
  readonly clearedRooms: number;
  readonly checkpointKey: string;
  readonly hasCheckpoint: boolean;
  readonly roomIndex: number;
};

/**
 * Snapshot for a bare combat run, which is what M1 and M2 advance, and the
 * shared basis for M4, whose `combat` field is one.
 *
 * A combat run carries none of the run-level bookkeeping M5 adds -- cash,
 * carried thefts, Heat, cleared rooms, checkpoints -- so those report their
 * empty values rather than being guessed at. The cues that read them stay
 * silent in these modes, which is right: an M1 room has no economy to report.
 *
 * M3's wing is deliberately not covered here. `WingStatus` is
 * `'shopping' | 'left'`, a different vocabulary from the run's
 * `'playing' | 'won' | 'dead'`, so it needs an explicit mapping rather than a
 * field copy, and guessing that mapping would silently change which stings fire.
 */
export function audioSnapshotFromRun(run: RunState): AudioSnapshot {
  const boss = run.enemies.find((enemy) => enemy.kind === 'lp_manager');
  return {
    status: run.status,
    health: run.player.health,
    attackActiveTicks: run.player.attackActiveTicks,
    livingEnemyIds: run.enemies
      .filter((enemy) => enemy.health > 0)
      .map((enemy) => enemy.id)
      .sort((first, second) => first - second),
    bossPhase: boss?.bossPhase ?? null,
    bossTelegraphing: boss?.phase === 'telegraph',
    bossVolleyTelegraphTicks: boss?.bossVolleyTelegraphTicks ?? 0,
    playerProjectiles: run.projectiles.filter((shot) => shot.faction === 'player').length,
    surfaces: run.surfaces.length,
    gameplayEvents: run.counters.gameplayEvents,
    childEventsThisRoot: run.counters.childEventsThisRoot,
    cash: 0,
    carried: 0,
    heat: 0,
    clearedRooms: 0,
    checkpointKey: 'none',
    hasCheckpoint: false,
    roomIndex: 0,
  };
}

/**
 * Snapshot for the M3 shoplifting wing.
 *
 * `WingStatus` is `'shopping' | 'left'`, a different vocabulary from the run's
 * `'playing' | 'won' | 'dead'`, so it is MAPPED rather than copied: leaving the
 * mall is this mode's success and should sound like one. Copying the status
 * fields would leave the terminal sting permanently unreachable, which is the
 * kind of silence that looks like a bug.
 *
 * The wing has no combat, so every combat field reports its empty value and the
 * cues that read them stay silent. It has no health at all, so a constant stands
 * in and `hurt`/`heal` cannot fire. What M3 does drive is its own economy: cash
 * falling is a purchase, carried rising is a theft, and carried falling while
 * Heat rises is a confiscation.
 */
export function audioSnapshotFromWing(wing: WingState): AudioSnapshot {
  return {
    status: wing.status === 'left' ? 'won' : 'playing',
    health: 1,
    attackActiveTicks: 0,
    livingEnemyIds: [],
    bossPhase: null,
    bossTelegraphing: false,
    bossVolleyTelegraphTicks: 0,
    playerProjectiles: 0,
    surfaces: 0,
    gameplayEvents: 0,
    childEventsThisRoot: 0,
    cash: wing.cash,
    carried: wing.carried === null ? 0 : 1,
    heat: wing.heat,
    clearedRooms: 0,
    checkpointKey: 'none',
    hasCheckpoint: false,
    roomIndex: 0,
  };
}

export function createAudioSnapshot(state: MvpRunState): AudioSnapshot {
  return {
    ...audioSnapshotFromRun(state.room.combat),
    status: state.status,
    cash: state.cash,
    carried: state.carried.length,
    heat: state.heat,
    clearedRooms: state.clearedRooms.length,
    checkpointKey: state.checkpoint
      ? `${state.checkpoint.roomIndex}:${state.checkpoint.tick}`
      : 'none',
    hasCheckpoint: state.checkpoint !== null,
    roomIndex: state.roomIndex,
  };
}

/**
 * The cues one tick produced, ordered loudest-first.
 *
 * Ordering matters because the engine rate-limits: a terminal sting should win
 * a slot over the swing that happened in the same frame.
 */
export function deriveAudioCues(
  previous: AudioSnapshot,
  current: AudioSnapshot,
): AudioCue[] {
  const cues: AudioCue[] = [];

  // Terminal outcomes first: they are the loudest and the most worth hearing.
  if (current.status !== previous.status) {
    if (current.status === 'won') {
      cues.push('won');
    } else if (current.status === 'dead') {
      cues.push('died');
    }
  }

  if (current.health < previous.health) {
    cues.push('hurt');
  } else if (current.health > previous.health) {
    cues.push('heal');
  }

  // The boss escalating is worth hearing even mid-fight.
  if (
    current.bossPhase !== null &&
    previous.bossPhase !== null &&
    current.bossPhase > previous.bossPhase
  ) {
    cues.push('boss_phase');
  }
  if (current.bossVolleyTelegraphTicks > 0 && previous.bossVolleyTelegraphTicks === 0) {
    cues.push('boss_volley');
  }
  if (current.bossTelegraphing && !previous.bossTelegraphing) {
    cues.push('boss_telegraph');
  }

  // A conduction chain: the reaction stages recorded child events under the same
  // root action, which is exactly what a Wet/electrical cascade looks like.
  if (
    current.childEventsThisRoot > previous.childEventsThisRoot &&
    current.gameplayEvents > previous.gameplayEvents
  ) {
    cues.push('conduction');
  }

  if (current.carried < previous.carried && current.heat > previous.heat) {
    cues.push('confiscation');
  } else if (current.carried > previous.carried) {
    cues.push('theft');
  }
  if (current.cash < previous.cash) {
    cues.push('purchase');
  }

  const deaths = previous.livingEnemyIds.filter(
    (id) => !current.livingEnemyIds.includes(id),
  ).length;
  if (deaths > 0) {
    cues.push('enemy_down');
  }

  // A cleared fight heals, so the two arrive together; report the clear once.
  if (current.clearedRooms > previous.clearedRooms) {
    cues.push('room_clear');
  }
  if (current.checkpointKey !== previous.checkpointKey && current.hasCheckpoint) {
    cues.push('checkpoint');
  }

  if (current.playerProjectiles > previous.playerProjectiles) {
    cues.push('shot');
  }
  if (current.attackActiveTicks > 0 && previous.attackActiveTicks === 0) {
    cues.push('swing');
  }
  if (current.surfaces > previous.surfaces) {
    cues.push('splash');
  }

  // Entering a room announces itself the way a dying mall would.
  if (current.roomIndex !== previous.roomIndex) {
    cues.push('pa_chime');
  }

  return cues;
}
