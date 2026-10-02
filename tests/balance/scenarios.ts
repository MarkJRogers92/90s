/**
 * Fixed fights to put a bot in, so a change to the bot (or to a monster) shows
 * up as a number instead of a hunch.
 */
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import { botInput, newBotMemory, type BotOptions } from './bot';
import { Navigator } from './path';

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
 * damage. `floor` 3 is the Mall Owner. `start` moves the janitor off the entrance
 * (when the spot is clear), so fights can differ in where they begin.
 */
export function bossFight(seed: number, options: BotOptions, floor: FloorNumber = 3, start?: { readonly dx: number; readonly dy: number }): BossFight {
  const state = createMvpRun(seed, { floor });
  let guard = 0;
  while (state.roomIndex < state.wing.rooms.length - 1 && guard < 10) {
    guard += 1;
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    enterDoorway(state, 'east');
  }
  const combat = state.room.combat;
  if (start) {
    const moved = { x: combat.player.x + start.dx, y: combat.player.y + start.dy };
    if (Navigator.clear(combat.walls, combat.player.radius, moved)) {
      combat.player.x = moved.x;
      combat.player.y = moved.y;
    }
  }
  const memory = newBotMemory();
  const begun = state.tick;
  const startHealth = state.room.combat.player.health;
  while (state.status === 'playing' && state.tick - begun < FIGHT_TICK_CAP) {
    tickMvpRun(state, botInput(state, memory, options));
  }
  return {
    outcome: state.status === 'playing' ? 'stalled' : state.status,
    hpLost: startHealth - state.room.combat.player.health,
    seconds: (state.tick - begun) / 60,
  };
}
