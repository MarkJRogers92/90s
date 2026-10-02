/**
 * Runs the balance bot through a wing, or a whole night, headlessly.
 *
 * The harness owns no gameplay: it feeds `botInput` to `tickMvpRun`, watches
 * the run with the same `PlaytestRecorder` the browser uses (so the numbers
 * match what a human's Playtest log would say), and calls `ascend` exactly as
 * the escalator does. Everything is a pure function of the seed and options,
 * so a result can be replayed tick for tick.
 */
import { PlaytestRecorder, type RunRecord } from '../../src/game/playtest/recorder';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend, canAscend, floorOf } from '../../src/sim/run/floors';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';
import { botInput, newBotMemory, type BotMemory, type BotOptions } from './bot';

export type { BotOptions, BotRoute, BotShop, BotSkill } from './bot';

/** Ticks a wing may run before the bot is called stuck: 12 minutes of play. */
export const WING_TICK_CAP = 60 * 60 * 12;
/** Ticks one room may hold the bot: the longest fight is well inside this. */
export const ROOM_TICK_CAP = 60 * 60 * 4;

export type WingOutcome = 'won' | 'dead' | 'stalled';

export type WingResult = {
  readonly seed: number;
  readonly floor: number;
  readonly part: 1 | 2;
  readonly outcome: WingOutcome;
  readonly ticks: number;
  /** One-based, as the recorder reports it. */
  readonly reachedRoom: number;
  readonly cashLeft: number;
  readonly record: RunRecord;
  /** The run as it ended, for carrying up the stairs. */
  readonly state: MvpRunState;
};

/** Plays one wing from its current state to a win, a death, or a stall. */
export function playWing(
  state: MvpRunState,
  options: BotOptions,
  memory: BotMemory = newBotMemory(),
  wingTickCap = WING_TICK_CAP,
): WingResult {
  const recorder = new PlaytestRecorder();
  recorder.observe(state);
  const startTick = state.tick;
  let roomSince = state.tick;
  let roomIndex = state.roomIndex;
  let record: RunRecord | null = null;
  let stalled = false;

  while (state.status === 'playing') {
    if (state.roomIndex !== roomIndex) {
      roomIndex = state.roomIndex;
      roomSince = state.tick;
    }
    if (state.tick - startTick >= wingTickCap || state.tick - roomSince >= ROOM_TICK_CAP) {
      stalled = true;
      break;
    }
    tickMvpRun(state, botInput(state, memory, options));
    record = recorder.observe(state) ?? record;
  }

  const outcome: WingOutcome = stalled ? 'stalled' : state.status === 'won' ? 'won' : 'dead';
  record ??= recorder.finish(state, stalled ? 'quit' : outcome === 'won' ? 'won' : 'dead')!;
  return {
    seed: state.seed,
    floor: floorOf(state),
    part: state.wing.part === 1 ? 1 : 2,
    outcome,
    ticks: state.tick - startTick,
    reachedRoom: state.roomIndex + 1,
    cashLeft: state.cash,
    record,
    state,
  };
}

export type NightResult = {
  readonly seed: number;
  /** `won`: the Developer fell; otherwise how and where the night ended. */
  readonly outcome: WingOutcome;
  readonly wings: readonly WingResult[];
};

/** Plays a whole night: every wing in order, gear and cash riding the stairs. */
export function playNight(seed: number, options: BotOptions): NightResult {
  const wings: WingResult[] = [];
  const memory = newBotMemory();
  let state = createMvpRun(seed, { part: 1 });
  for (;;) {
    const wing = playWing(state, options, memory);
    wings.push(wing);
    if (wing.outcome !== 'won') return { seed, outcome: wing.outcome, wings };
    if (!canAscend(wing.state)) return { seed, outcome: 'won', wings };
    state = ascend(wing.state);
  }
}
