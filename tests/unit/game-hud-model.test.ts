import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildGameHudModel, heartsFor, wrapLogText } from '../../src/game/ui/gameHudModel';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { ascendToFloorTwo } from '../../src/sim/run/floors';

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

describe('store offer prompt', () => {
  function atFirstOffer() {
    const run = createMvpRun(7);
    run.room.combat.enemies = [];
    for (let guard = 0; guard < 6 && !run.wing.rooms[run.roomIndex]?.store; guard += 1) {
      run.room.combat.enemies = [];
      enterDoorway(run, 'east');
    }
    const offer = run.wing.rooms[run.roomIndex]!.offers[0]!;
    run.room.combat.player.x = offer.position.x;
    run.room.combat.player.y = offer.position.y;
    return { run, offer };
  }

  it('says what the item does, whether it is a weapon, and what stealing costs', () => {
    const { run, offer } = atFirstOffer();
    run.cash = 999;
    const prompt = buildGameHudModel(run).prompt!;
    expect(prompt.detail?.itemDefinitionId).toBe(offer.itemDefinitionId);
    expect(prompt.detail?.blurb.length).toBeGreaterThan(0);
    expect(['WEAPON', 'PASSIVE']).toContain(prompt.detail?.kind);
    expect(prompt.detail?.note).toMatch(/HEAT/);
    expect(prompt.detail?.canBuy).toBe(true);
  });

  it('tells a broke janitor exactly how short they are', () => {
    const { run } = atFirstOffer();
    run.cash = 0;
    const prompt = buildGameHudModel(run).prompt!;
    expect(prompt.detail?.canBuy).toBe(false);
    expect(prompt.detail?.note).toMatch(/^NEED \$\d+ MORE/);
  });
});

describe('the wing map upstairs', () => {
  it('names the upper-floor rooms, not the downstairs ones they share ids with', () => {
    const upstairs = ascendToFloorTwo(Object.assign(createMvpRun(7), { status: 'won' as const }));
    const shorts = buildGameHudModel(upstairs).rooms.map((room) => room.short);
    expect(shorts).toEqual(['LANDING', 'WEST WING', 'CINEMA', 'EAST WING', 'STAIRWELL', 'MANAGEMENT']);
    expect(buildGameHudModel(createMvpRun(7)).rooms[0]!.short).toBe('CONCOURSE');
  });
});

describe('the pickup log', () => {
  it('wraps a long message at a word instead of cutting it mid-word', () => {
    expect(wrapLogText('UP THE ESCALATOR: THE ESCALATOR LANDING, FLOOR 2.')).toEqual(['UP THE ESCALATOR: THE ESCALATOR', 'LANDING, FLOOR 2.']);
    expect(wrapLogText('ENTERED THE FOOD COURT.')).toEqual(['ENTERED THE FOOD COURT.']);
  });

  it('keeps to two lines, ending a longer message on a whole word', () => {
    const lines = wrapLogText('ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length <= 34)).toBe(true);
    expect(lines[1]).toMatch(/[A-Z]\.\.\.$/);
  });
});
