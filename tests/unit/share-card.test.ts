import { describe, expect, it } from 'vitest';
import { buildShiftCardModel, shareCardText } from '../../src/game/ui/shiftCardModel';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';

function ended(status: 'won' | 'dead', options: Parameters<typeof createMvpRun>[1] = {}): MvpRunState {
  const state = createMvpRun(153774, options);
  state.status = status;
  state.summary = {
    seed: 153774, status, roomIndex: state.roomIndex, roomsCleared: 0,
    purchasedInstanceIds: [], stolenInstanceIds: [], cash: 40, heat: 0, tick: 3725,
  };
  state.stats.kills = 12;
  state.stats.bestCombo = 5;
  return state;
}

describe('shareable seed card (round 57)', () => {
  it('is absent while the shift is live', () => {
    expect(shareCardText(null, 7, null, null)).toBeNull();
  });

  it('names the mall, the result, the score and how to replay it', () => {
    const state = ended('dead');
    const model = buildShiftCardModel(state, 153774)!;
    const text = shareCardText(model, 153774, null, null)!;
    const lines = text.split('\n');
    expect(lines[0]).toBe('DEAD MALL - MALL #153774');
    expect(text).toContain(model.headline);
    expect(text).toContain(`SCORE ${model.score.toLocaleString('en-US')}`);
    expect(text).toContain('TIME 1:02');
    expect(text).toContain('KILLS 12');
    expect(text).toContain('?seed=153774');
  });

  it('is plain text a message can carry: no markup, no link out, short lines', () => {
    const state = ended('won');
    const text = shareCardText(buildShiftCardModel(state, 153774)!, 153774, null, null)!;
    expect(text).not.toMatch(/https?:|<|>/);
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(60);
  });

  it('adds the day and the rule for a Daily Shift, so a score can be compared fairly', () => {
    const state = ended('dead', { rule: 'inflation' });
    const model = buildShiftCardModel(state, 153774, '2026-10-01')!;
    const text = shareCardText(model, 153774, '2026-10-01', 'inflation')!;
    expect(text).toContain('DAILY SHIFT OCT 1');
    expect(text).toContain('INFLATION');
  });

  it('leaves the daily line out of an ordinary night', () => {
    const state = ended('dead');
    const text = shareCardText(buildShiftCardModel(state, 153774)!, 153774, null, null)!;
    expect(text).not.toContain('DAILY');
  });
});
