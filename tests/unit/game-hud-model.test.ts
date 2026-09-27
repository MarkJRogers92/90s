import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildGameHudModel, heartsFor } from '../../src/game/ui/gameHudModel';

describe('HUD hearts', () => {
  it('shows two health per heart, Isaac style', () => {
    expect(heartsFor(6)).toEqual(['full', 'full', 'full']);
    expect(heartsFor(5)).toEqual(['full', 'full', 'half']);
    expect(heartsFor(2)).toEqual(['full', 'empty', 'empty']);
    expect(heartsFor(0)).toEqual(['empty', 'empty', 'empty']);
  });
});

describe('game HUD model', () => {
  it('starts a fresh shift in the concourse with full health and the starting cash', () => {
    const run = createMvpRun(7);
    const model = buildGameHudModel(run);
    expect(model.hearts).toEqual(['full', 'full', 'full']);
    expect(model.cash).toBe(run.cash);
    expect(model.rooms).toHaveLength(run.wing.rooms.length);
    expect(model.rooms[0]?.state).toBe('current');
    expect(model.rooms.at(-1)?.boss).toBe(true);
    expect(model.objectives[0]?.text).toContain('1/6');
  });

  it('marks the selected primary in the hotbar', () => {
    const run = createMvpRun(7);
    const model = buildGameHudModel(run);
    const selected = model.hotbar.filter((slot) => slot.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.instanceId).toBe(run.inventory.selectedPrimaryInstanceId);
  });

  it('never reports a done objective for heat while the shift is hot', () => {
    const run = createMvpRun(7);
    run.heat = 3;
    const heat = buildGameHudModel(run).objectives.at(-1)!;
    expect(heat.done).toBe(false);
    expect(heat.text).toContain('3');
  });
});
