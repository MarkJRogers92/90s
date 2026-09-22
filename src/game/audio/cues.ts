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
import type { MvpRunState } from '../../sim/run/types';

export type AudioCue =
  | 'swing'
  | 'shot'
  | 'splash'
  | 'hit'
  | 'hurt'
  | 'heal'
  | 'purchase'
  | 'theft'
  | 'secured'
  | 'fusion'
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
  readonly stolenCount: number;
  readonly compositeCount: number;
  readonly enemyHealth: number;
  readonly clearedRooms: number;
  readonly checkpointKey: string;
  readonly roomIndex: number;
};

export function createAudioSnapshot(state: MvpRunState): AudioSnapshot {
  const combat = state.room.combat;
  const boss = combat.enemies.find((enemy) => enemy.kind === 'lp_manager');
  return {
    status: state.status,
    health: combat.player.health,
    attackActiveTicks: combat.player.attackActiveTicks,
    livingEnemyIds: combat.enemies
      .filter((enemy) => enemy.health > 0)
      .map((enemy) => enemy.id)
      .sort((first, second) => first - second),
    bossPhase: boss?.bossPhase ?? null,
    bossTelegraphing: boss?.phase === 'telegraph',
    bossVolleyTelegraphTicks: boss?.bossVolleyTelegraphTicks ?? 0,
    playerProjectiles: combat.projectiles.filter((shot) => shot.faction === 'player').length,
    surfaces: combat.surfaces.length,
    gameplayEvents: combat.counters.gameplayEvents,
    childEventsThisRoot: combat.counters.childEventsThisRoot,
    cash: state.cash,
    carried: state.carried.length,
    heat: state.heat,
    stolenCount: state.inventory.inventory.filter(
      (node) => node.kind === 'leaf' && node.acquisitionKind === 'stolen',
    ).length,
    compositeCount: state.inventory.inventory.filter((node) => node.kind === 'composite')
      .length,
    enemyHealth: combat.enemies.reduce((total, enemy) => total + enemy.health, 0),
    clearedRooms: state.clearedRooms.length,
    checkpointKey: state.checkpoint
      ? `${state.checkpoint.roomIndex}:${state.checkpoint.tick}`
      : 'none',
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
  state: MvpRunState,
): AudioCue[] {
  const current = createAudioSnapshot(state);
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

  // Securing and confiscating are identical in carried goods, Heat, and
  // suspicion: both drop the goods, raise Heat, and reset suspicion. Only the
  // inventory tells them apart — a securing banks stolen leaves, so it gets a
  // triumphant cue instead of the confiscation sting.
  if (current.carried < previous.carried) {
    if (current.stolenCount > previous.stolenCount) {
      cues.push('secured');
    } else if (current.heat > previous.heat) {
      cues.push('confiscation');
    }
  } else if (current.carried > previous.carried) {
    cues.push('theft');
  }
  // The bench fee reduces cash exactly like a shop purchase; a composite
  // appearing in the same tick is what makes it a fusion.
  if (current.cash < previous.cash) {
    cues.push(current.compositeCount > previous.compositeCount ? 'fusion' : 'purchase');
  }

  const deaths = previous.livingEnemyIds.filter(
    (id) => !current.livingEnemyIds.includes(id),
  ).length;
  if (deaths > 0) {
    cues.push('enemy_down');
  } else if (current.enemyHealth < previous.enemyHealth) {
    cues.push('hit');
  }

  // A cleared fight heals, so the two arrive together; report the clear once.
  if (current.clearedRooms > previous.clearedRooms) {
    cues.push('room_clear');
  }
  if (current.checkpointKey !== previous.checkpointKey && state.checkpoint !== null) {
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
