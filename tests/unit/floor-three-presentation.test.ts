import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend, ascendToFloorTwo } from '../../src/sim/run/floors';
import type { EnemyState } from '../../src/sim/model';
import type { MvpRunState } from '../../src/sim/run/types';
import { buildShiftCardModel } from '../../src/game/ui/shiftCardModel';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import { newCareer, recordShift, stubsForShift, type ShiftResult } from '../../src/game/career/career';
import { PaDirector, PA_LINES } from '../../src/game/ui/paModel';
import { pinkSlipReason } from '../../src/game/ui/pinkSlipModel';
import { killCamStamp } from '../../src/game/ui/killCamModel';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { summarizeRuns } from '../../src/game/playtest/log';
import { enemyWindups, ownerChargePending } from '../../src/game/view/combatBeats';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { scoreFor } from '../../src/game/score/score';

function topFloor(): MvpRunState {
  const one = createMvpRun(7);
  one.status = 'won';
  const two = ascendToFloorTwo(one);
  two.status = 'won';
  return ascend(two);
}

function ended(state: MvpRunState, status: 'won' | 'dead', roomIndex = 5): MvpRunState {
  state.status = status;
  state.summary = { seed: state.seed, status, roomIndex, roomsCleared: roomIndex, purchasedInstanceIds: [], stolenInstanceIds: [], cash: 40, heat: 0, tick: 6000 };
  return state;
}

const enemy = (overrides: Partial<EnemyState>): EnemyState => ({
  id: 70, kind: 'mascot', x: 600, y: 200, health: 34, radius: 18, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: -1, telegraphAimY: 0, ...overrides,
} as EnemyState);

describe('the shift card on Floor 3', () => {
  it('offers the escalator after the Mall Manager, not CLOCKED OUT', () => {
    const one = createMvpRun(7);
    one.status = 'won';
    const two = ended(ascendToFloorTwo(one), 'won');
    const card = buildShiftCardModel(two)!;
    expect(card.headline).toBe('FLOOR CLEARED');
    expect(card.ascend).toBe(true);
    expect(card.rows.find((row) => row.label === 'REACHED')?.value).toBe('FLOOR 2 - 6/6');
  });

  it('clocks out only after the Mall Owner, and reaches FLOOR 3 - n/6', () => {
    const win = buildShiftCardModel(ended(topFloor(), 'won'))!;
    expect(win.headline).toBe('CLOCKED OUT');
    expect(win.ascend).toBe(false);
    expect(win.rows.find((row) => row.label === 'REACHED')?.value).toBe('FLOOR 3 - 6/6');
    const loss = buildShiftCardModel(ended(topFloor(), 'dead', 2))!;
    expect(loss.rows.find((row) => row.label === 'REACHED')?.value).toBe('FLOOR 3 - 3/6');
    expect(loss.subline).toContain('FLOOR 3');
  });

  it('scores rooms across all three floors', () => {
    const state = ended(topFloor(), 'dead', 2);
    const card = buildShiftCardModel(state)!;
    const expected = scoreFor({ won: false, roomsReached: 3 + 12, kills: state.stats.kills, bestCombo: state.stats.bestCombo, cash: 40, heat: 0, seconds: 100 });
    expect(card.score).toBe(expected);
  });
});

describe('Floor 3 pay', () => {
  const base: ShiftResult = { score: 700, won: false, floorCleared: false, kills: 12, bestCombo: 5, seconds: 180, mall: 42 };

  it('pays for clearing Floor 2 and more again for clocking out', () => {
    const one = stubsForShift({ ...base, floorCleared: true });
    const two = stubsForShift({ ...base, floorCleared: true, floorTwoCleared: true });
    const out = stubsForShift({ ...base, floorCleared: true, floorTwoCleared: true, won: true });
    expect(two.lines.map((line) => line.label)).toContain('FLOOR 2 CLEARED');
    expect(one.lines.map((line) => line.label)).not.toContain('FLOOR 2 CLEARED');
    expect(two.total).toBeGreaterThan(one.total);
    expect(out.total).toBeGreaterThan(two.total);
    expect(out.lines.map((line) => line.label)).toContain('CLOCKED OUT');
  });

  it('counts a clock-out but not a floor-2 clear as a win', () => {
    const cleared = recordShift(newCareer(), { ...base, floorCleared: true, floorTwoCleared: true }, '2026-09-28').career;
    expect(cleared.clockOuts).toBe(0);
    expect(cleared.wall.length).toBe(1);
    const out = recordShift(newCareer(), { ...base, floorCleared: true, floorTwoCleared: true, won: true }, '2026-09-28').career;
    expect(out.clockOuts).toBe(1);
  });
});

describe('Floor 3 HUD, PA, pink slip, kill cam', () => {
  it('names the floor-3 rooms and the Owner on the HUD', () => {
    const state = topFloor();
    const hud = buildGameHudModel(state);
    expect(hud.floor).toBe(3);
    expect(hud.rooms.map((cell) => cell.short)).toContain('ARCADE');
    expect(hud.objectives[0]!.text).toContain('OWNER');
    state.room.combat.enemies = [enemy({ kind: 'owner', health: 240, radius: 28 })];
    expect(buildGameHudModel(state).boss).toMatchObject({ name: 'THE MALL OWNER', max: 240 });
  });

  it('welcomes the janitor to the food court and warns of the Owner', () => {
    const one = createMvpRun(7);
    const director = new PaDirector();
    director.observe(one);
    one.status = 'won';
    const two = ascendToFloorTwo(one);
    two.status = 'won';
    director.observe(two);
    const top = ascend(two);
    top.tick += 1;
    expect(director.observe(top)).toBe(PA_LINES.topfloor[0]);
  });

  it('fires the janitor for the Owner and the brute', () => {
    expect(pinkSlipReason('mascot', 3)).toBe('DISRESPECTING THE MASCOT');
    expect(pinkSlipReason('slam', 3)).toBe('HOSTILE TAKEOVER');
    expect(pinkSlipReason('slam', 2)).toBe('DISAGREEING WITH MANAGEMENT');
    expect(killCamStamp('owner')).not.toBe(killCamStamp('manager'));
  });
});

describe('Floor 3 playtest log', () => {
  it('names the brute and the Owner charge as damage sources and tags the floor', () => {
    const state = topFloor();
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    const p = state.room.combat.player;
    state.room.combat.enemies = [enemy({ x: p.x + 20, y: p.y, chargeTicks: 6 })];
    state.tick += 5;
    p.health -= 2;
    recorder.observe(state);
    state.room.combat.enemies = [enemy({ kind: 'owner', x: p.x + 30, y: p.y, radius: 28, chargeTicks: 6 })];
    state.tick += 5;
    p.health -= 2;
    recorder.observe(state);
    state.room.combat.enemies = [];
    state.tick += 5;
    p.health = 0;
    state.status = 'dead';
    const record = recorder.observe(state)!;
    expect(record.floor).toBe(3);
    expect(record.rooms[0]!.damage.mascot).toBe(2);
    expect(record.rooms[0]!.damage.ownerCharge).toBe(2);
    expect(summarizeRuns([record]).damageBySource.mascot).toBe(2);
    expect(Object.keys(summarizeRuns([record]).deathsByRoom)[0]).toMatch(/^3:/);
  });
});

describe('Floor 3 wind-ups and dressing', () => {
  it('draws the brute wind-up as a charge lane', () => {
    const [windup] = enemyWindups(enemy({ phase: 'telegraph', phaseTicks: 20 }), { x: 100, y: 200 });
    expect(windup!.kind).toBe('charge');
    expect(windup!.reach).toBeGreaterThan(200);
  });

  it('shows the Owner\'s charge, not a slam, when a charge is next', () => {
    const owner = enemy({ kind: 'owner', health: 100, radius: 28, phase: 'telegraph', phaseTicks: 20, bossAttacks: 1 });
    expect(ownerChargePending(owner)).toBe(true);
    expect(enemyWindups(owner, { x: 100, y: 200 }).some((windup) => windup.kind === 'charge')).toBe(true);
    const slam = { ...owner, bossAttacks: 0 };
    expect(enemyWindups(slam, { x: 100, y: 200 }).some((windup) => windup.kind === 'slam')).toBe(true);
  });

  it('dresses every Floor 3 room as its own place', () => {
    const state = topFloor();
    const names = state.wing.rooms.map((room) => planRoomDressing(room, 3).areaName);
    expect(names).toContain('ARCADE');
    expect(names).toContain("THE OWNER'S SUITE");
    const downstairs = createMvpRun(7).wing.rooms.map((room) => planRoomDressing(room, 1).ambient);
    const up = state.wing.rooms.map((room) => planRoomDressing(room, 3).ambient);
    expect(up).not.toEqual(downstairs);
  });
});
