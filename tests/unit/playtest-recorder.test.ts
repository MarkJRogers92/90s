import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { EnemyState } from '../../src/sim/model';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { ascendToFloorTwo } from '../../src/sim/run/floors';
import { PLAYTEST_MAX_RUNS, PlaytestLog, summarizeRuns } from '../../src/game/playtest/log';

function hanger(x: number, y: number): EnemyState {
  return { id: 5, kind: 'hanger', x, y, health: 8, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState;
}

class MemoryStorage {
  private readonly map = new Map<string, string>();
  public getItem(key: string): string | null { return this.map.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.map.set(key, value); }
  public removeItem(key: string): void { this.map.delete(key); }
}

describe('playtest recorder', () => {
  it('logs damage by source per room and finishes the record when the shift ends', () => {
    const state = createMvpRun(7);
    const recorder = new PlaytestRecorder();
    expect(recorder.observe(state)).toBeNull();
    const p = state.room.combat.player;
    state.room.combat.enemies = [hanger(p.x + 10, p.y)];
    state.tick += 30;
    state.room.combat.player.health -= 1;
    expect(recorder.observe(state)).toBeNull();
    state.tick += 30;
    state.room.combat.player.health = 0;
    state.status = 'dead';
    const record = recorder.observe(state)!;
    expect(record.outcome).toBe('dead');
    expect(record.rooms[0]!.damage.hanger).toBe(6);
    expect(record.killedBy).toBe('hanger');
    expect(record.ticks).toBe(60);
    expect(recorder.observe(state)).toBeNull();
  });

  it('names the upstairs attackers and records which floor the shift was on', () => {
    const state = ascendToFloorTwo(Object.assign(createMvpRun(7), { status: 'won' as const }));
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    const p = state.room.combat.player;
    state.room.combat.enemies = [{ ...hanger(p.x + 12, p.y), kind: 'shopper', radius: 16, chargeTicks: 8 } as EnemyState];
    state.tick += 5;
    p.health -= 1;
    recorder.observe(state);
    state.room.combat.enemies = [{ ...hanger(p.x + 20, p.y), kind: 'static', phase: 'recover' } as EnemyState];
    state.tick += 5;
    p.health -= 1;
    recorder.observe(state);
    const record = recorder.finish(state, 'quit')!;
    expect(record.floor).toBe(2);
    expect(record.rooms[0]!.damage.shopper).toBe(1);
    expect(record.rooms[0]!.damage.static).toBe(1);
  });

  it('counts kills and records a quit', () => {
    const state = createMvpRun(7);
    const recorder = new PlaytestRecorder();
    state.room.combat.enemies = [hanger(900, 400)];
    recorder.observe(state);
    state.room.combat.enemies = [];
    state.tick += 10;
    recorder.observe(state);
    const record = recorder.finish(state, 'quit')!;
    expect(record.outcome).toBe('quit');
    expect(record.rooms[0]!.kills).toBe(1);
  });
});

describe('playtest log', () => {
  it('stores nothing until switched on, then keeps the newest runs only', () => {
    const storage = new MemoryStorage();
    const log = new PlaytestLog(storage);
    expect(log.enabled).toBe(false);
    const record = { version: 1, startedAt: 'x', seed: 1, outcome: 'dead', ticks: 60, reachedRoom: 1, rooms: [], bought: [], stolen: [], dashes: 0, killedBy: null } as const;
    log.append(record);
    expect(log.runs()).toHaveLength(0);
    log.setEnabled(true);
    for (let i = 0; i < PLAYTEST_MAX_RUNS + 5; i += 1) log.append({ ...record, seed: i });
    expect(log.runs()).toHaveLength(PLAYTEST_MAX_RUNS);
    expect(log.runs().at(-1)!.seed).toBe(PLAYTEST_MAX_RUNS + 4);
    log.clear();
    expect(log.runs()).toHaveLength(0);
    expect(new PlaytestLog(storage).enabled).toBe(true);
  });

  it('survives storage that throws or holds garbage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    const log = new PlaytestLog(broken);
    expect(log.runs()).toEqual([]);
    expect(() => log.setEnabled(true)).not.toThrow();
    const garbage = new MemoryStorage();
    garbage.setItem('dead-mall:playtest:v1', '{not json');
    expect(new PlaytestLog(garbage).runs()).toEqual([]);
  });
});

describe('run summary', () => {
  it('reports win rate, where runs die, and what hurts', () => {
    const room = (roomId: string, hanger: number, glob: number) => ({ roomId, name: roomId, enteredTick: 0, leftTick: 600, kills: 2, damage: { hanger, mannequin: 0, static: 0, shopper: 0, mascot: 0, ownerCharge: 0, glob, slam: 0, bossShot: 0, stalker: 0, roofer: 0, walker: 0, elf: 0, perfume: 0, poodle: 0, goon: 0, barrage: 0, burst: 0, other: 0 } });
    const base = { version: 1, startedAt: 'x', seed: 1, ticks: 1200, reachedRoom: 3, bought: ['PARTY POPPER'], stolen: [], dashes: 4, killedBy: 'glob' } as const;
    const summary = summarizeRuns([
      { ...base, outcome: 'dead', rooms: [room('opening_concourse', 0, 0), room('food_court', 2, 4)] },
      { ...base, outcome: 'won', killedBy: null, rooms: [room('food_court', 1, 1)] },
    ]);
    expect(summary.runs).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.deathsByRoom).toEqual({ food_court: 1 });
    expect(summary.damageBySource.glob).toBe(5);
    expect(summary.damageBySource.hanger).toBe(3);
    expect(summary.avgSecondsByRoom.food_court).toBe(10);
    expect(summary.topBought[0]).toEqual({ name: 'PARTY POPPER', count: 2 });
  });

  it('keeps upstairs rooms apart from the downstairs rooms that share their ids', () => {
    const room = { roomId: 'food_court', name: 'CINEMA LOBBY', enteredTick: 0, leftTick: 600, kills: 1, damage: { hanger: 0, mannequin: 0, static: 0, shopper: 0, mascot: 0, ownerCharge: 0, glob: 0, slam: 0, bossShot: 0, stalker: 0, roofer: 0, walker: 0, elf: 0, perfume: 0, poodle: 0, goon: 0, barrage: 0, burst: 0, other: 0 } };
    const base = { version: 1, startedAt: 'x', seed: 1, ticks: 600, reachedRoom: 3, bought: [], stolen: [], dashes: 0, killedBy: 'other' } as const;
    const summary = summarizeRuns([
      { ...base, outcome: 'dead', floor: 2, rooms: [room] },
      { ...base, outcome: 'dead', rooms: [{ ...room, name: 'FOOD COURT' }] },
    ]);
    expect(summary.deathsByRoom).toEqual({ '2:food_court': 1, food_court: 1 });
    expect(summary.roomNames['2:food_court']).toBe('CINEMA LOBBY');
    expect(summary.roomNames.food_court).toBe('FOOD COURT');
  });
});
