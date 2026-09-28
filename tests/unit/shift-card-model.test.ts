import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';
import { buildShiftCardModel, formatShiftTime, shiftCardDelayMs } from '../../src/game/ui/shiftCardModel';
import { ascendToFloorTwo } from '../../src/sim/run/floors';

function ended(status: 'won' | 'dead', mutate: (state: MvpRunState) => void = () => undefined): MvpRunState {
  const state = createMvpRun(7);
  mutate(state);
  state.status = status;
  state.summary = {
    seed: 7, status, roomIndex: state.roomIndex, roomsCleared: state.clearedRooms.length,
    purchasedInstanceIds: [], stolenInstanceIds: [], cash: state.cash, heat: state.heat, tick: 3725,
  };
  return state;
}

describe('shift card model', () => {
  it('is absent while the shift is live', () => {
    expect(buildShiftCardModel(createMvpRun(7))).toBeNull();
  });

  it('calls a death SHIFT OVER and says where it happened', () => {
    const card = buildShiftCardModel(ended('dead'))!;
    expect(card.won).toBe(false);
    expect(card.headline).toBe('SHIFT OVER');
    expect(card.subline).toContain(createMvpRun(7).wing.rooms[0]!.name.toUpperCase());
  });

  it('adds a DAILY row only for a Daily Shift', () => {
    expect(buildShiftCardModel(ended('dead'))!.rows.some((row) => row.label === 'DAILY')).toBe(false);
    const daily = buildShiftCardModel(ended('dead'), 7, '2026-09-28')!;
    expect(daily.rows.find((row) => row.label === 'DAILY')?.value).toBe('SEP 28');
  });

  it('calls a floor-1 win FLOOR CLEARED and offers the escalator', () => {
    const card = buildShiftCardModel(ended('won'))!;
    expect(card.won).toBe(true);
    expect(card.headline).toBe('FLOOR CLEARED');
    expect(card.ascend).toBe(true);
  });

  it('saves CLOCKED OUT for beating the Mall Manager upstairs', () => {
    const below = createMvpRun(7);
    below.status = 'won';
    const above = ascendToFloorTwo(below);
    above.status = 'won';
    above.summary = { seed: above.seed, status: 'won', roomIndex: 5, roomsCleared: 5, purchasedInstanceIds: [], stolenInstanceIds: [], cash: 10, heat: 0, tick: 100 };
    const card = buildShiftCardModel(above)!;
    expect(card.headline).toBe('CLOCKED OUT');
    expect(card.ascend).toBe(false);
    expect(card.rows.find((row) => row.label === 'REACHED')?.value).toBe('FLOOR 2 - 6/6');
  });

  it('lists the run as label/value rows, time first', () => {
    const card = buildShiftCardModel(ended('dead', (state) => { state.cash = 41; state.heat = 2; }))!;
    expect(card.rows[0]).toEqual({ label: 'TIME', value: '1:02' });
    expect(card.rows).toContainEqual({ label: 'CASH', value: '$41' });
    expect(card.rows).toContainEqual({ label: 'HEAT', value: '2' });
    expect(card.rows.find((row) => row.label === 'REACHED')?.value).toMatch(/^1\/\d+$/);
    expect(card.rows).toContainEqual({ label: 'BOUGHT', value: 'NOTHING' });
  });

  it('names the mall so a good one can be shared with ?seed=, upstairs too', () => {
    expect(buildShiftCardModel(ended('dead'))!.rows).toContainEqual({ label: 'MALL', value: '#7' });
    const below = createMvpRun(7);
    below.status = 'won';
    const above = ascendToFloorTwo(below);
    above.status = 'dead';
    above.summary = { seed: above.seed, status: 'dead', roomIndex: 2, roomsCleared: 2, purchasedInstanceIds: [], stolenInstanceIds: [], cash: 10, heat: 0, tick: 100 };
    expect(buildShiftCardModel(above, 7)!.rows).toContainEqual({ label: 'MALL', value: '#7' });
  });

  it('formats shift time from 60 Hz ticks', () => {
    expect(formatShiftTime(0)).toBe('0:00');
    expect(formatShiftTime(60 * 75)).toBe('1:15');
  });
});

describe('shift card score', () => {
  it('scores the shift from its stats and lists kills and best combo', () => {
    const card = buildShiftCardModel(ended('dead', (state) => { state.stats.kills = 7; state.stats.bestCombo = 9; }))!;
    expect(card.rows).toContainEqual({ label: 'KILLS', value: '7' });
    expect(card.rows).toContainEqual({ label: 'BEST COMBO', value: 'X9' });
    expect(card.score).toBeGreaterThan(0);
  });
});

describe('when the end card opens', () => {
  it('waits for the fall on its own, but opens almost at once after a cinematic already covered it', () => {
    expect(shiftCardDelayMs(false)).toBe(1300);
    expect(shiftCardDelayMs(true)).toBe(900);
    expect(shiftCardDelayMs(false, true)).toBeLessThanOrEqual(200);
    expect(shiftCardDelayMs(true, true)).toBeLessThanOrEqual(200);
  });
});
