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
import { HEAVY_HIT_DAMAGE } from '../view/combatBeats';
import { COMBO_MILESTONE } from '../../sim/run/combo';
import { isBossKind } from '../../sim/combat/boss';

export type AudioCue =
  | 'swing'
  | 'dash'
  | 'heartbeat'
  | 'combo'
  | 'boss_intro'
  | 'mannequin'
  | 'static_lock'
  | 'static_blink'
  | 'shopper_charge'
  | 'escalator'
  | 'stamp'
  | 'shot'
  | 'splash'
  | 'hit'
  | 'hit_heavy'
  | 'boss_down'
  | 'spit_charge'
  | 'spit'
  | 'slam'
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
  readonly dashTicks: number;
  /** Combo milestones reached in the current streak. */
  readonly comboTier: number;
  /** Mannequins currently moving (unwatched). */
  readonly mannequinsMoving: number;
  readonly livingEnemyIds: readonly number[];
  /** Health per living enemy id, so a blow that does not kill is audible. */
  readonly enemyHealth: Readonly<Record<number, number>>;
  readonly bossId: number | null;
  readonly telegraphingSpitterIds: readonly number[];
  /** Statics winding up a blink, and Bargain Hunters mid-charge. */
  readonly telegraphingStaticIds: readonly number[];
  readonly chargingShopperIds: readonly number[];
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
  readonly roomIndex: number;
};

export function createAudioSnapshot(state: MvpRunState): AudioSnapshot {
  const combat = state.room.combat;
  const boss = combat.enemies.find((enemy) => isBossKind(enemy.kind));
  return {
    status: state.status,
    health: combat.player.health,
    attackActiveTicks: combat.player.attackActiveTicks,
    dashTicks: combat.player.dashTicks ?? 0,
    comboTier: Math.floor((state.stats?.combo ?? 0) / COMBO_MILESTONE),
    mannequinsMoving: combat.enemies.filter((enemy) => enemy.kind === 'mannequin' && enemy.health > 0 && enemy.phase === 'pursue').length,
    livingEnemyIds: combat.enemies
      .filter((enemy) => enemy.health > 0)
      .map((enemy) => enemy.id)
      .sort((first, second) => first - second),
    enemyHealth: Object.fromEntries(
      combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => [enemy.id, enemy.health]),
    ),
    bossId: boss?.id ?? null,
    telegraphingSpitterIds: combat.enemies
      .filter((enemy) => enemy.kind === 'spitter' && enemy.health > 0 && enemy.phase === 'telegraph')
      .map((enemy) => enemy.id),
    telegraphingStaticIds: combat.enemies
      .filter((enemy) => enemy.kind === 'static' && enemy.health > 0 && enemy.phase === 'telegraph')
      .map((enemy) => enemy.id),
    chargingShopperIds: combat.enemies
      .filter((enemy) => enemy.kind === 'shopper' && enemy.health > 0 && (enemy.chargeTicks ?? 0) > 0)
      .map((enemy) => enemy.id),
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
  // The slam lands on the tick the boss leaves its telegraph, hit or miss.
  if (previous.bossTelegraphing && !current.bossTelegraphing && current.bossId !== null) {
    cues.push('slam');
  }
  const spitterFired = previous.telegraphingSpitterIds.some(
    (id) => !current.telegraphingSpitterIds.includes(id) && current.livingEnemyIds.includes(id),
  );
  if (spitterFired) {
    cues.push('spit');
  }
  if (current.telegraphingSpitterIds.some((id) => !previous.telegraphingSpitterIds.includes(id))) {
    cues.push('spit_charge');
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

  const died = previous.livingEnemyIds.filter((id) => !current.livingEnemyIds.includes(id));
  if (previous.bossId !== null && died.includes(previous.bossId)) {
    cues.push('boss_down');
  } else if (died.length > 0) {
    cues.push('enemy_down');
  }
  // Blows that land without killing. A kill already has its own, louder cue.
  let biggestBlow = 0;
  for (const id of current.livingEnemyIds) {
    const before = previous.enemyHealth[id];
    const now = current.enemyHealth[id];
    if (before !== undefined && now !== undefined && now < before) {
      biggestBlow = Math.max(biggestBlow, before - now);
    }
  }
  if (biggestBlow >= HEAVY_HIT_DAMAGE) {
    cues.push('hit_heavy');
  } else if (biggestBlow > 0) {
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
  // A creak and a clatter the moment a mannequin you stopped watching moves.
  if (current.mannequinsMoving > previous.mannequinsMoving) {
    cues.push('mannequin');
  }
  // The Static's lock-on whine, and the zap when it lands wherever it locked.
  if (current.telegraphingStaticIds.some((id) => !previous.telegraphingStaticIds.includes(id))) {
    cues.push('static_lock');
  }
  if (previous.telegraphingStaticIds.some((id) => current.livingEnemyIds.includes(id) && !current.telegraphingStaticIds.includes(id))) {
    cues.push('static_blink');
  }
  if (current.chargingShopperIds.some((id) => !previous.chargingShopperIds.includes(id))) {
    cues.push('shopper_charge');
  }
  if (current.comboTier > previous.comboTier) {
    cues.push('combo');
  }
  if (current.dashTicks > previous.dashTicks && previous.dashTicks === 0) {
    cues.push('dash');
  }
  if (current.surfaces > previous.surfaces) {
    cues.push('splash');
  }

  // Entering a room announces itself the way a dying mall would.
  if (current.roomIndex !== previous.roomIndex) {
    // Walking in on Loss Prevention is a door slam, not a PA chime.
    cues.push(current.bossId !== null ? 'boss_intro' : 'pa_chime');
  }

  return cues;
}
