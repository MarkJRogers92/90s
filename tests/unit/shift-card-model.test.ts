import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';
import { buildShiftCardModel, formatShiftTime } from '../../src/game/ui/shiftCardModel';

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

  it('calls a win CLOCKED OUT', () => {
    const card = buildShiftCardModel(ended('won'))!;
    expect(card.won).toBe(true);
    expect(card.headline).toBe('CLOCKED OUT');
  });

  it('lists the run as label/value rows, time first', () => {
    const card = buildShiftCardModel(ended('dead', (state) => { state.cash = 41; state.heat = 2; }))!;
    expect(card.rows[0]).toEqual({ label: 'TIME', value: '1:02' });
    expect(card.rows).toContainEqual({ label: 'CASH', value: '$41' });
    expect(card.rows).toContainEqual({ label: 'HEAT', value: '2' });
    expect(card.rows.find((row) => row.label === 'REACHED')?.value).toMatch(/^1\/\d+$/);
    expect(card.rows).toContainEqual({ label: 'BOUGHT', value: 'NOTHING' });
  });

  it('formats shift time from 60 Hz ticks', () => {
    expect(formatShiftTime(0)).toBe('0:00');
    expect(formatShiftTime(60 * 75)).toBe('1:15');
  });
});
