/**
 * Fixed fights to put a bot in, so a change to the bot (or to a monster) shows
 * up as a number instead of a hunch.
 */
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import { botInput, newBotMemory, type BotOptions } from './bot';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const FIGHT_TICK_CAP = 60 * 240;

export type BossFight = {
  readonly outcome: 'won' | 'dead' | 'stalled';
  /** Health lost, from a full bar (the run's own cap). */
  readonly hpLost: number;
  readonly seconds: number;
};

/**
 * A floor's boss room, entered at full health with the starting mop and nothing
 * else: the boss alone, as the fight would go with no shopping and no earlier
 * damage. `floor` 3 is the Mall Owner.
 */
export function bossFight(seed: number, options: BotOptions, floor: FloorNumber = 3): BossFight {
  const state = createMvpRun(seed, { floor });
  let guard = 0;
  while (state.roomIndex < state.wing.rooms.length - 1 && guard < 10) {
    guard += 1;
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    enterDoorway(state, 'east');
  }
  const memory = newBotMemory();
  const start = state.tick;
  const startHealth = state.room.combat.player.health;
  while (state.status === 'playing' && state.tick - start < FIGHT_TICK_CAP) {
    tickMvpRun(state, botInput(state, memory, options));
  }
  return {
    outcome: state.status === 'playing' ? 'stalled' : state.status,
    hpLost: startHealth - state.room.combat.player.health,
    seconds: (state.tick - start) / 60,
  };
}
