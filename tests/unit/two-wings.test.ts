import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend, canAscend } from '../../src/sim/run/floors';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { generateRunWing } from '../../src/sim/run/storeInterior';
import { isBossKind } from '../../src/sim/combat/boss';
import { FINAL_FLOOR, LOCKDOWN_SIZE, floorSpec } from '../../src/sim/wing/floorSpecs';
import type { MvpRunState } from '../../src/sim/run/types';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** Walks east room by room, clearing each fight, until the last room. */
function walkToTheEnd(state: MvpRunState): void {
  while (state.roomIndex < state.wing.rooms.length - 1) {
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }
}

describe('two wings per floor (round 45)', () => {
  it('a floor opens on its first wing, under its own names, at drawn (not full) strength', () => {
    const first = createMvpRun(5, { part: 1 });
    const boss = createMvpRun(5);
    expect(first.wing.part).toBe(1);
    expect(boss.wing.part).toBeUndefined();
    expect(first.wing.rooms.map((room) => room.id)).toEqual(boss.wing.rooms.map((room) => room.id));
    expect(first.wing.rooms.map((room) => room.name)).not.toEqual(boss.wing.rooms.map((room) => room.name));
    expect(first.wing.rooms.map((room) => room.name)).toEqual(Object.values(floorSpec(1).firstWingNames));
    // Upstairs, the boss wing is at full strength and the first wing is not.
    const count = (state: MvpRunState) => state.wing.rooms.reduce((sum, room) => sum + room.enemySpawns.length, 0);
    const upstairs = [3, 7, 11, 19].map((seed) => [count(createMvpRun(seed, { floor: 3, part: 1 })), count(createMvpRun(seed, { floor: 3 }))]);
    expect(upstairs.every(([a, b]) => a! <= b!)).toBe(true);
    expect(upstairs.some(([a, b]) => a! < b!)).toBe(true);
  });

  it('the first wing ends in the Lockdown: a wave of elites, no boss', () => {
    // A usual first wing (a district's Lockdown holds a mini-boss instead, round 50).
    const seed = Array.from({ length: 50 }, (_, i) => i + 1).find((candidate) => !createMvpRun(candidate, { part: 1, floor: 2 }).wing.district)!;
    const first = createMvpRun(seed, { part: 1, floor: 2 });
    const last = first.wing.rooms.length - 1;
    const combat = buildRoomCombatState(first.wing, last, 'west', first.inventory, first.seed);
    expect(combat.enemies.some((enemy) => isBossKind(enemy.kind))).toBe(false);
    const wave = combat.enemies.filter((enemy) => enemy.elite);
    expect(wave).toHaveLength(LOCKDOWN_SIZE);
  });

  it('clearing the Lockdown wins the wing; the stairs lead to the same floor\'s boss wing', () => {
    const state = createMvpRun(5, { part: 1 });
    walkToTheEnd(state);
    expect(state.status).toBe('playing');
    // Entering does not win it: the wave has to go down first.
    tickMvpRun(state, idle);
    expect(state.status).toBe('playing');
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    expect(state.status).toBe('won');
    expect(canAscend(state)).toBe(true);
    const second = ascend(state);
    expect(second.wing.floor).toBe(state.wing.floor);
    expect(second.wing.part).toBeUndefined();
    expect(second.seed).not.toBe(state.seed);
  });

  it('the boss wing leads up to the next floor\'s first wing, and the final boss wing is the end', () => {
    const boss = createMvpRun(5);
    boss.status = 'won';
    const up = ascend(boss);
    expect(up.wing.floor).toBe(2);
    expect(up.wing.part).toBe(1);
    const top = createMvpRun(5, { floor: FINAL_FLOOR });
    top.status = 'won';
    expect(canAscend(top)).toBe(false);
  });

  it('a first-wing checkpoint comes back on the first wing', () => {
    const state = createMvpRun(5, { part: 1, floor: 3 });
    const saved = serializeCheckpoint(state);
    expect(saved.part).toBe(1);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(saved)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).wing.part).toBe(1);
    expect(parseCheckpoint({ ...saved, part: 2 }).ok).toBe(false);
  });

  it('the same night builds the same first wing', () => {
    expect(JSON.stringify(generateRunWing(9, 2, 1))).toBe(JSON.stringify(generateRunWing(9, 2, 1)));
  });
});

describe('the Lockdown card (round 45)', () => {
  it('a won first wing is LOCKDOWN LIFTED with the stairs, never the night\'s win', async () => {
    const { buildShiftCardModel } = await import('../../src/game/ui/shiftCardModel');
    const state = createMvpRun(5, { part: 1, floor: FINAL_FLOOR });
    walkToTheEnd(state);
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    expect(state.status).toBe('won');
    const card = buildShiftCardModel(state)!;
    expect(card.headline).toBe('LOCKDOWN LIFTED');
    expect(card.ascend).toBe(true);
    expect(card.stairs).toBe(true);
    expect(card.rows.find((row) => row.label === 'REACHED')?.value).toMatch(/WING 1 - 6\/6/);
  });
});

describe('the first wing on the HUD, the PA and the log (round 45)', () => {
  it('the HUD sends you to the Lockdown and names the first wing\'s rooms', async () => {
    const { buildGameHudModel } = await import('../../src/game/ui/gameHudModel');
    const hud = buildGameHudModel(createMvpRun(5, { part: 1 }));
    expect(hud.objectives[0]!.text).toMatch(/^REACH THE LOCKDOWN/);
    expect(hud.rooms.at(-1)!.short).toBe('LOCKDOWN');
    expect(hud.rooms[0]!.short).toBe('OPENING');
    expect(buildGameHudModel(createMvpRun(5)).objectives[0]!.text).toMatch(/^REACH SECURITY/);
  });

  it('the log keeps a first wing\'s rooms apart from the boss wing\'s', async () => {
    const { summarizeRuns } = await import('../../src/game/playtest/log');
    const room = { roomId: 'food_court', name: 'x', enteredTick: 0, leftTick: 60, kills: 0, damage: {} as never };
    const base = { version: 1, startedAt: 'x', seed: 1, ticks: 60, reachedRoom: 3, bought: [], stolen: [], dashes: 0, killedBy: null, outcome: 'won', rooms: [room] } as const;
    const summary = summarizeRuns([{ ...base, floor: 2 }, { ...base, floor: 2, part: 1 }] as never);
    expect(Object.keys(summary.avgSecondsByRoom).sort()).toEqual(['2:food_court', '2a:food_court']);
  });
});
