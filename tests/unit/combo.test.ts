import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { tickMvpRun, enterDoorway } from '../../src/sim/run/tickMvpRun';
import { COMBO_MILESTONE, COMBO_WINDOW_TICKS, comboBonusFor, stepCombo } from '../../src/sim/run/combo';
import type { MvpInputFrame } from '../../src/sim/run/types';

const idle = (state: ReturnType<typeof createMvpRun>): MvpInputFrame => ({
  moveX: 0, moveY: 0, aimX: state.room.combat.player.x + 40, aimY: state.room.combat.player.y,
  fire: false, interact: false, steal: false, recall: false,
});

describe('cleanup combo', () => {
  it('counts every blow that lands and remembers the best', () => {
    const state = createMvpRun(7);
    stepCombo(state, { hits: 2, kills: 0, hurt: false });
    stepCombo(state, { hits: 1, kills: 1, hurt: false });
    expect(state.stats.combo).toBe(3);
    expect(state.stats.bestCombo).toBe(3);
    expect(state.stats.kills).toBe(1);
  });

  it('drops when the janitor is hurt or stops hitting for the window', () => {
    const state = createMvpRun(7);
    stepCombo(state, { hits: 4, kills: 0, hurt: false });
    stepCombo(state, { hits: 0, kills: 0, hurt: true });
    expect(state.stats.combo).toBe(0);
    expect(state.stats.bestCombo).toBe(4);
    stepCombo(state, { hits: 2, kills: 0, hurt: false });
    state.tick += COMBO_WINDOW_TICKS + 1;
    stepCombo(state, { hits: 0, kills: 0, hurt: false });
    expect(state.stats.combo).toBe(0);
  });

  it('pays a bonus token at each milestone, bigger each time', () => {
    const state = createMvpRun(7);
    const before = state.room.tokens.length;
    stepCombo(state, { hits: COMBO_MILESTONE, kills: 0, hurt: false });
    expect(state.room.tokens.length).toBe(before + 1);
    expect(state.room.tokens.at(-1)!.value).toBe(comboBonusFor(COMBO_MILESTONE));
    expect(comboBonusFor(COMBO_MILESTONE * 2)).toBeGreaterThan(comboBonusFor(COMBO_MILESTONE));
    stepCombo(state, { hits: 1, kills: 0, hurt: false });
    expect(state.room.tokens.length).toBe(before + 1);
  });

  it('is fed by real combat: a mop hit on an enemy raises the combo', () => {
    const state = createMvpRun(7);
    for (let guard = 0; guard < 6 && state.room.combat.enemies.length === 0; guard += 1) {
      enterDoorway(state, 'east');
    }
    const enemy = state.room.combat.enemies[0]!;
    state.room.combat.player.x = enemy.x - 40;
    state.room.combat.player.y = enemy.y;
    tickMvpRun(state, { ...idle(state), aimX: enemy.x, aimY: enemy.y, fire: true });
    expect(state.stats.combo).toBeGreaterThanOrEqual(1);
  });
});
