import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { WET_DURATION_TICKS } from '../../src/sim/effects/constants';
import { applyWet } from '../../src/sim/effects/statuses';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';

const sentry = (id: number, x: number): EnemyState => ({
  id, kind: 'spitter', x, y: 160, health: 40, radius: 14, phase: 'recover', phaseTicks: 100_000,
  cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0,
});

describe('conductive chains leave a visible record', () => {
  it('records the enemies a chain arced through, and when, so the view can draw the lightning', () => {
    const state = createRun(7, { itemIds: ['janitor_mop', 'plasma_globe'], selectedItemId: 'janitor_mop' });
    state.player.x = 300;
    state.player.y = 160;
    state.walls = [];
    state.roomWasPopulated = false;
    const chained = sentry(21, 430);
    state.enemies = [sentry(20, 350), chained];
    applyWet(chained, WET_DURATION_TICKS);
    tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });
    expect(state.chainArcs?.length).toBe(1);
    const arc = state.chainArcs![0]!;
    expect(arc.points.map((point) => point.id)).toEqual([20, 21]);
    expect(arc.points[1]).toMatchObject({ x: 430, y: 160 });
    expect(arc.tick).toBe(state.tick);
  });

  it('forgets old arcs so the record stays small', () => {
    const state = createRun(7, { itemIds: ['janitor_mop'], selectedItemId: 'janitor_mop' });
    state.chainArcs = [{ tick: 0, points: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }] }];
    // A far, idle enemy keeps the room (and the tick) running.
    state.enemies = [{ ...sentry(9, 900), y: 450 }];
    for (let i = 0; i < 40; i += 1) tickRun(state, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false });
    expect(state.chainArcs).toEqual([]);
  });
});
