import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { wantedBrief } from '../../src/sim/run/wanted';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import type { MvpRunState } from '../../src/sim/run/types';

function withHotGoods(run: MvpRunState, count: number): void {
  const hot = Array.from({ length: count }, (_, index) => ({
    kind: 'leaf' as const,
    instanceId: `hot-${index}`,
    itemDefinitionId: 'box_cutter',
    acquisitionKind: 'stolen' as const,
    sourceLocationId: 't',
    sourceStockId: `hot-${index}`,
    acquisitionTick: 0,
  }));
  run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, ...hot] };
}

describe('wanted brief (round 57): what the stars cost, and when the next one comes', () => {
  it('a clean janitor is off the radar, a star away at 20 Heat', () => {
    const brief = wantedBrief({ heat: 0, inventory: createMvpRun(7).inventory });
    expect(brief).toMatchObject({ stars: 0, toNextStar: 20, surcharge: 0, guards: 0, hotItems: 0, heldByHotGoods: false });
  });

  it('each star adds a guard to fights and $2 to every shelf, and the next one is counted in Heat', () => {
    const run = createMvpRun(7);
    expect(wantedBrief({ heat: 45, inventory: run.inventory })).toMatchObject({ stars: 2, toNextStar: 15, surcharge: 4, guards: 2 });
    expect(wantedBrief({ heat: 79, inventory: run.inventory })).toMatchObject({ stars: 3, toNextStar: 1, surcharge: 6, guards: 3 });
  });

  it('five stars is the top: there is no next star', () => {
    expect(wantedBrief({ heat: 100, inventory: createMvpRun(7).inventory })).toMatchObject({ stars: 5, toNextStar: null });
  });

  it('hot goods hold the Heat at their floor: laying low cannot go below, only the bench launders', () => {
    const run = createMvpRun(7);
    withHotGoods(run, 2);
    expect(wantedBrief({ heat: 40, inventory: run.inventory })).toMatchObject({ stars: 2, hotItems: 2, heldByHotGoods: true });
    // Above the floor, laying low still helps.
    expect(wantedBrief({ heat: 70, inventory: run.inventory })).toMatchObject({ stars: 3, hotItems: 2, heldByHotGoods: false });
  });
});

describe('the HUD says it in a line', () => {
  it('has nothing to say while the janitor is clean', () => {
    expect(buildGameHudModel(createMvpRun(7)).wantedLine).toBeNull();
  });

  it('names the price, the guards and the next star', () => {
    const run = createMvpRun(7);
    run.heat = 45;
    const line = buildGameHudModel(run).wantedLine!;
    expect(line).toContain('SHELVES +$4');
    expect(line).toContain('2 EXTRA GUARDS');
    expect(line).toContain('NEXT * IN 15');
  });

  it('warns that Loss Prevention follows from four stars', () => {
    const run = createMvpRun(7);
    run.heat = 85;
    expect(buildGameHudModel(run).wantedLine).toContain('LOSS PREVENTION FOLLOWS');
  });

  it('says hot goods hold the stars, and that fusing at the bench launders them', () => {
    const run = createMvpRun(7);
    withHotGoods(run, 1);
    run.heat = 20;
    expect(buildGameHudModel(run).wantedLine).toContain('1 HOT ITEM HOLDS YOUR STAR');
  });
});
