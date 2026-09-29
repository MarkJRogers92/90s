import { describe, expect, it } from 'vitest';
import {
  CareerStore,
  LOCKER_ITEMS,
  PERKS,
  WALL_SIZE,
  buyLocker,
  buyPerk,
  equipLocker,
  fusionLog,
  newCareer,
  parseCareer,
  perksFor,
  recordShift,
  stubsForShift,
  type Career,
  type ShiftResult,
} from '../../src/game/career/career';
import { NO_PERKS } from '../../src/sim/run/perks';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  public getItem(key: string): string | null { return this.map.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.map.set(key, value); }
}

const death: ShiftResult = { score: 700, won: false, floorCleared: false, kills: 12, bestCombo: 5, seconds: 180, mall: 42 };
const floorClear: ShiftResult = { ...death, score: 1_500, floorCleared: true };
const clockOut: ShiftResult = { ...death, score: 4_200, won: true, floorCleared: true, kills: 40, bestCombo: 14, seconds: 520 };

const rich = (stubs: number): Career => ({ ...newCareer(), stubs });

describe('pay stubs', () => {
  it('every shift pays something, and going further always pays more', () => {
    const d = stubsForShift(death).total;
    const f = stubsForShift(floorClear).total;
    const w = stubsForShift(clockOut).total;
    expect(d).toBeGreaterThan(0);
    expect(f).toBeGreaterThan(d);
    expect(w).toBeGreaterThan(f);
  });

  it('itemises the pay so the end card can show it', () => {
    const pay = stubsForShift(clockOut);
    expect(pay.lines.map((line) => line.label)).toEqual(expect.arrayContaining(['SHIFT PAY', 'FLOOR 1 CLEARED', 'CLOCKED OUT']));
    expect(pay.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(pay.total);
    expect(stubsForShift(death).lines.some((line) => line.label === 'CLOCKED OUT')).toBe(false);
  });
});

describe('recording a shift', () => {
  it('banks the pay and keeps the career totals', () => {
    const { career, earned } = recordShift(newCareer(), death, '2026-09-28');
    expect(earned).toBe(stubsForShift(death).total);
    expect(career.stubs).toBe(earned);
    expect(career.lifetimeStubs).toBe(earned);
    expect(career.shifts).toBe(1);
    expect(career.kills).toBe(12);
    expect(career.bestCombo).toBe(5);
    expect(career.clockOuts).toBe(0);
  });

  it('a death earns no photo; clearing a floor or clocking out does', () => {
    expect(recordShift(newCareer(), death, '2026-09-28').polaroid).toBeNull();
    const cleared = recordShift(newCareer(), floorClear, '2026-09-28');
    expect(cleared.polaroid).toMatchObject({ score: 1_500, won: false, date: '2026-09-28', mall: 42 });
    expect(cleared.career.floorClears).toBe(1);
    const won = recordShift(cleared.career, clockOut, '2026-09-29');
    expect(won.polaroid?.won).toBe(true);
    expect(won.career.clockOuts).toBe(1);
    expect(won.career.wall).toHaveLength(2);
  });

  it('the best photo is Employee of the Month', () => {
    const first = recordShift(newCareer(), floorClear, '2026-09-28');
    expect(first.employeeOfTheMonth).toBe(true);
    const better = recordShift(first.career, clockOut, '2026-09-29');
    expect(better.employeeOfTheMonth).toBe(true);
    const worse = recordShift(better.career, { ...floorClear, score: 1_600 }, '2026-09-30');
    expect(worse.employeeOfTheMonth).toBe(false);
    expect(worse.career.wall[0]?.score).toBe(4_200);
  });

  it('the wall keeps only the best photos', () => {
    let career = newCareer();
    for (let i = 0; i < WALL_SIZE + 4; i += 1) {
      career = recordShift(career, { ...floorClear, score: 1_000 + i }, '2026-09-28').career;
    }
    expect(career.wall).toHaveLength(WALL_SIZE);
    expect(career.wall[0]?.score).toBe(1_000 + WALL_SIZE + 3);
    expect(career.wall.at(-1)?.score).toBe(1_004);
  });

  it('photos are picked from the mall seed, so the same night always gets the same photo', () => {
    const a = recordShift(newCareer(), clockOut, '2026-09-28').polaroid;
    const b = recordShift(newCareer(), clockOut, '2026-10-01').polaroid;
    expect(a?.photo).toBe(b?.photo);
    expect(['dawn', 'foodcourt']).toContain(a?.photo);
    expect(['boss', 'escalator']).toContain(recordShift(newCareer(), floorClear, 'x').polaroid?.photo);
  });
});

describe('the Break Room counter', () => {
  it('buys a perk level for its price and refuses when short', () => {
    const seniority = PERKS.find((perk) => perk.id === 'seniority')!;
    const cost = seniority.costs[0]!;
    expect(buyPerk(rich(cost - 1), 'seniority').ok).toBe(false);
    const bought = buyPerk(rich(cost), 'seniority');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.career.stubs).toBe(0);
    expect(bought.career.perks.seniority).toBe(1);
  });

  it('a maxed perk cannot be bought again', () => {
    const coffee = PERKS.find((perk) => perk.id === 'coffee')!;
    let career = rich(10_000);
    for (let i = 0; i < coffee.costs.length; i += 1) {
      const result = buyPerk(career, 'coffee');
      if (result.ok) career = result.career;
    }
    expect(buyPerk(career, 'coffee').ok).toBe(false);
  });

  it('locker items are bought once, equipped one at a time, and can be left home', () => {
    const [first, second] = LOCKER_ITEMS;
    let career = rich(10_000);
    const a = buyLocker(career, first!.itemId);
    expect(a.ok).toBe(true);
    if (a.ok) career = a.career;
    expect(career.lockerEquipped).toBe(first!.itemId);
    expect(buyLocker(career, first!.itemId).ok).toBe(false);
    const b = buyLocker(career, second!.itemId);
    if (b.ok) career = b.career;
    expect(career.lockerEquipped).toBe(second!.itemId);
    expect(equipLocker(career, first!.itemId).lockerEquipped).toBe(first!.itemId);
    expect(equipLocker(career, null).lockerEquipped).toBeNull();
    expect(equipLocker(newCareer(), first!.itemId).lockerEquipped).toBeNull();
  });

  it('turns the career into the perks a shift starts with', () => {
    expect(perksFor(newCareer())).toEqual(NO_PERKS);
    const career: Career = { ...newCareer(), perks: { seniority: 2, dental: 1, coffee: 1, sneakers: 0, shopvac: 0 }, lockerOwned: ['pump_soaker'], lockerEquipped: 'pump_soaker' };
    expect(perksFor(career)).toEqual({ bonusCash: 10, bonusHealth: 2, clearHealBonus: 1, dashCooldownCut: 0, tokenMagnet: 0, lockerItemId: 'pump_soaker' });
  });
});

describe('saving the career', () => {
  it('round-trips through storage', () => {
    const store = new CareerStore(new MemoryStorage());
    expect(store.load()).toEqual(newCareer());
    const { career } = recordShift(newCareer(), clockOut, '2026-09-28');
    store.save(career);
    expect(store.load()).toEqual(career);
  });

  it('repairs a tampered or broken save instead of trusting it', () => {
    expect(parseCareer('not json')).toEqual(newCareer());
    const bad = parseCareer(JSON.stringify({ version: 1, stubs: -50, perks: { seniority: 99, dental: 'x' }, lockerOwned: ['plasma_globe', 'pump_soaker'], lockerEquipped: 'plasma_globe', wall: [{ nope: true }] }));
    expect(bad.stubs).toBe(0);
    expect(bad.perks.seniority).toBe(PERKS.find((perk) => perk.id === 'seniority')!.costs.length);
    expect(bad.perks.dental).toBe(0);
    expect(bad.lockerOwned).toEqual(['pump_soaker']);
    expect(bad.lockerEquipped).toBeNull();
    expect(bad.wall).toEqual([]);
  });

  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const store = new CareerStore(blocked);
    expect(store.load()).toEqual(newCareer());
    expect(() => store.save(newCareer())).not.toThrow();
  });
});

describe('the fusion log', () => {
  it('remembers every hybrid a shift made, once each', () => {
    const first = recordShift(newCareer(), { ...death, fusions: ['hybrid__pump_soaker__plasma_globe', 'hybrid__box_cutter__gel_pens'] }, 'd').career;
    const second = recordShift(first, { ...death, fusions: ['hybrid__pump_soaker__plasma_globe'] }, 'd').career;
    expect(second.fusionsFound).toEqual(['hybrid__box_cutter__gel_pens', 'hybrid__pump_soaker__plasma_globe']);
  });

  it('counts the signature fusions discovered', () => {
    const career = recordShift(newCareer(), { ...death, fusions: ['hybrid__pump_soaker__plasma_globe', 'hybrid__box_cutter__gel_pens'] }, 'd').career;
    const log = fusionLog(career);
    expect(log.signaturesFound).toBe(1);
    expect(log.signatureTotal).toBeGreaterThanOrEqual(12);
    expect(log.entries.find((entry) => entry.name === 'Storm Soaker')?.found).toBe(true);
    expect(log.entries.filter((entry) => !entry.found).every((entry) => entry.name === '???')).toBe(true);
    expect(log.totalFound).toBe(2);
  });

  it('drops anything in a save that is not a real fusion', () => {
    const repaired = parseCareer(JSON.stringify({ version: 1, fusionsFound: ['hybrid__pump_soaker__plasma_globe', 'hybrid__rc_car__janitor_mop', 'nonsense'] }));
    expect(repaired.fusionsFound).toEqual(['hybrid__pump_soaker__plasma_globe']);
  });
});
