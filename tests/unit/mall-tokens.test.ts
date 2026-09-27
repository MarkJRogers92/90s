import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { MALL_TOKEN_VALUE, TOKEN_PICKUP_RADIUS } from '../../src/sim/run/tokens';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const IDLE: MvpInputFrame = {
  moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false,
};

function idleAt(state: MvpRunState): MvpInputFrame {
  return { ...IDLE, aimX: state.room.combat.player.x + 1, aimY: state.room.combat.player.y };
}

/** Walks the shift into the Food Court, the first room that authors a fight. */
function foodCourtRun(seed = 7): MvpRunState {
  const state = createMvpRun(seed);
  for (let guard = 0; guard < 4 && state.room.roomId !== 'food_court'; guard += 1) {
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }
  expect(state.room.roomId).toBe('food_court');
  return state;
}

describe('Mall Tokens', () => {
  it('starts every room with no tokens on the floor', () => {
    const state = createMvpRun(7);
    expect(state.room.tokens).toEqual([]);
    expect(foodCourtRun().room.tokens).toEqual([]);
  });

  it('drops tokens where a mall monster dies, worth its kind', () => {
    const state = foodCourtRun();
    const victim = state.room.combat.enemies[0]!;
    // Keep the janitor out of reach so the drop is not collected on the same tick.
    state.room.combat.player.x = 40;
    state.room.combat.player.y = 40;
    const at = { x: victim.x, y: victim.y };
    victim.health = 0;
    tickMvpRun(state, idleAt(state));
    expect(state.room.combat.enemies.some((enemy) => enemy.id === victim.id)).toBe(false);
    expect(state.room.tokens).toHaveLength(1);
    expect(state.room.tokens[0]).toMatchObject({ x: at.x, y: at.y, value: MALL_TOKEN_VALUE[victim.kind] });
  });

  it('pays the token into cash when the janitor walks over it, keeping inventory cash in step', () => {
    const state = foodCourtRun();
    const victim = state.room.combat.enemies[0]!;
    state.room.combat.player.x = 40;
    state.room.combat.player.y = 40;
    victim.health = 0;
    tickMvpRun(state, idleAt(state));
    const token = state.room.tokens[0]!;
    const cashBefore = state.cash;
    state.room.combat.player.x = token.x + TOKEN_PICKUP_RADIUS - 2;
    state.room.combat.player.y = token.y;
    tickMvpRun(state, idleAt(state));
    expect(state.room.tokens).toHaveLength(0);
    expect(state.cash).toBe(cashBefore + token.value);
    expect(state.inventory.cash).toBe(state.cash);
    expect(state.recentChange.toLowerCase()).toContain('mall token');
  });

  it('leaves uncollected tokens behind when the janitor changes rooms', () => {
    const state = foodCourtRun();
    state.room.combat.player.x = 40;
    state.room.combat.player.y = 40;
    state.room.combat.enemies.forEach((enemy) => { enemy.health = 0; });
    tickMvpRun(state, idleAt(state));
    expect(state.room.tokens.length).toBeGreaterThan(0);
    expect(enterDoorway(state, 'west').accepted).toBe(true);
    expect(state.room.tokens).toEqual([]);
  });

  it('is deterministic for one seed and one input stream', () => {
    const run = () => {
      const state = foodCourtRun(11);
      state.room.combat.player.x = 40;
      state.room.combat.player.y = 40;
      state.room.combat.enemies.forEach((enemy) => { enemy.health = 0; });
      tickMvpRun(state, idleAt(state));
      return state.room.tokens;
    };
    expect(run()).toEqual(run());
  });
});
