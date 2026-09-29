import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { HUD_CHANGE_OPEN_TICKS, HUD_ROOM_OPEN_TICKS, buildGameHudModel, collapsedObjective, heartsFor, hudExpanded, wrapLogText } from '../../src/game/ui/gameHudModel';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
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

  it('stays off the radar at zero stars', () => {
    const run = createMvpRun(7);
    const heat = buildGameHudModel(run).objectives.at(-1)!;
    expect(heat).toEqual({ text: 'STAY OFF THE RADAR', done: true });
    expect(buildGameHudModel(run).wanted).toBe(0);
  });

  it('shows the wanted stars and how to lay low, never done while wanted', () => {
    const run = createMvpRun(7);
    run.heat = 45;
    const model = buildGameHudModel(run);
    expect(model.wanted).toBe(2);
    expect(model.objectives.at(-1)).toEqual({ text: 'WANTED ** - CLEAR FIGHTS TO LAY LOW', done: false });
  });

  it('asks for a launder when hot goods hold the heat at its floor', () => {
    const run = createMvpRun(7);
    run.inventory = {
      ...run.inventory,
      inventory: [...run.inventory.inventory, { kind: 'leaf', instanceId: 'hot-1', itemDefinitionId: 'box_cutter', acquisitionKind: 'stolen', sourceLocationId: 't', sourceStockId: 'hot-1', acquisitionTick: 0 }],
    };
    run.heat = 20;
    const model = buildGameHudModel(run);
    expect(model.objectives.at(-1)).toEqual({ text: 'HOT GOODS - LAUNDER AT THE BENCH', done: false });
    expect(model.hotbar.find((slot) => slot.instanceId === 'hot-1')?.hot).toBe(true);
    expect(model.hotbar.filter((slot) => slot.instanceId !== 'hot-1').every((slot) => !slot.hot)).toBe(true);
    run.heat = 60;
    expect(buildGameHudModel(run).objectives.at(-1)!.text).toMatch(/^WANTED \*\*\* /);
  });

  it('reports no alarm until a grab, then the countdown, shutter and store', () => {
    const run = createMvpRun(7);
    expect(buildGameHudModel(run).alarm).toBeNull();
    run.alarm = { storeId: 'x', roomIndex: run.roomIndex, ticksLeft: 192, shutter: 'open' };
    expect(buildGameHudModel(run).alarm).toEqual({ secondsLeft: 3.2, shutter: 'open', store: '' });
  });

  it('rewrites the store objective for an open alarm and for a lockdown', () => {
    const run = createMvpRun(7);
    run.room.combat.enemies = [];
    for (let guard = 0; guard < 6 && !run.wing.rooms[run.roomIndex]?.store; guard += 1) {
      run.room.combat.enemies = [];
      enterDoorway(run, 'east');
    }
    run.room.combat.enemies = [];
    const store = run.wing.rooms[run.roomIndex]!.store!;
    const storeName = store.name.toUpperCase();
    // The banner names the shop whose alarm is ringing (a room has two).
    run.alarm = { storeId: store.templateId, roomIndex: run.roomIndex, ticksLeft: 192, shutter: 'open' };
    const open = buildGameHudModel(run);
    expect(open.alarm?.store).toBe(storeName);
    expect(open.objectives.some((objective) => objective.text === 'GET OUT! SHUTTER IN 3.2S')).toBe(true);
    run.alarm = { storeId: store.templateId, roomIndex: run.roomIndex, ticksLeft: 0, shutter: 'closed' };
    const guards = buildGameHudModel(run).enemiesLeft;
    expect(buildGameHudModel(run).objectives.some((objective) => objective.text === `LOCKED IN - TAKE DOWN SECURITY  ${guards} LEFT`)).toBe(true);
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
    enterStore(run);
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
    expect(prompt.detail?.note).toMatch(/GRAB & RUN: FREE, \+1 STAR - ALARM: 4S TO THE DOOR/);
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

describe('the top HUD gets out of the way of the shop art', () => {
  const base = { tick: 1000, roomEnteredTick: 0, objectivesChangedTick: 0, peek: false, paused: false, playing: true };

  it('collapses to corner chips once a room has settled', () => {
    expect(hudExpanded(base)).toBe(false);
  });

  it('opens on entering a room, and when an objective changes, for a few seconds', () => {
    expect(hudExpanded({ ...base, roomEnteredTick: 1000 - HUD_ROOM_OPEN_TICKS + 1 })).toBe(true);
    expect(hudExpanded({ ...base, roomEnteredTick: 1000 - HUD_ROOM_OPEN_TICKS })).toBe(false);
    expect(hudExpanded({ ...base, objectivesChangedTick: 1000 - HUD_CHANGE_OPEN_TICKS + 1 })).toBe(true);
  });

  it('opens while Tab is held, while paused, and once the shift is over', () => {
    expect(hudExpanded({ ...base, peek: true })).toBe(true);
    expect(hudExpanded({ ...base, paused: true })).toBe(true);
    expect(hudExpanded({ ...base, playing: false })).toBe(true);
  });

  it('keeps the current objective in the collapsed chip', () => {
    const model = buildGameHudModel(createMvpRun(7));
    expect(collapsedObjective(model)).toBe(model.objectives.find((objective) => !objective.done)?.text);
  });
});

describe('item blurbs', () => {
  it('the fanny pack buys alarm time now, not less heat', async () => {
    const { itemBlurb } = await import('../../src/game/ui/itemBlurbs');
    expect(itemBlurb('fanny_pack')).toBe('CARRY 2 STOLEN ITEMS, +1.5S ALARM');
  });
});
