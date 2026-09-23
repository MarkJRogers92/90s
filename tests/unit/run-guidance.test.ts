import { describe, expect, it } from 'vitest';
import { runObjectiveText } from '../../src/game/ui/MvpRunHud';
import { openRunFusionPreview } from '../../src/sim/run/bench';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';

describe('Night Shift first-run guidance', () => {
  it('tells a new player how to reach the off-screen first store', () => {
    const state = createMvpRun(0);
    expect(runObjectiveText(state)).toMatch(/hold D.*first store/i);
    expect(runObjectiveText(state)).toMatch(/kiosk.*later/i);
  });

  it('explains the store decision and the following fight as the run advances', () => {
    const state = createMvpRun(0);
    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(runObjectiveText(state)).toMatch(/E to buy.*F to steal/i);

    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(runObjectiveText(state)).toMatch(/click to attack.*clear/i);
  });

  it('explains why the starting kiosk cannot fuse the mop', () => {
    const result = openRunFusionPreview(createMvpRun(0));
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toMatch(/come back.*remote-control car.*ranged weapon/i);
    }
  });
});
