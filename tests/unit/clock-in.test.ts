import { describe, expect, it } from 'vitest';
import { CLOCK_IN_MS, PUNCH_AT_MS, clockInFrame, clockInTime, shouldClockIn } from '../../src/game/ui/clockInModel';
import { benefitsLine } from '../../src/game/ui/clockInModel';
import { NO_PERKS } from '../../src/sim/run/perks';

describe('clocking in', () => {
  it('slides the card up into the slot, punches it, and lifts it back out stamped', () => {
    const start = clockInFrame(0).cardY;
    const inSlot = clockInFrame(PUNCH_AT_MS).cardY;
    expect(inSlot).toBeLessThan(start);
    expect(clockInFrame(PUNCH_AT_MS - 1).stamped).toBe(false);
    expect(clockInFrame(PUNCH_AT_MS).stamped).toBe(true);
    expect(clockInFrame(PUNCH_AT_MS + 600).cardY).toBeGreaterThan(inSlot);
  });

  it('jolts the clock on the punch only', () => {
    expect(clockInFrame(PUNCH_AT_MS - 50).jolt).toBe(0);
    expect(clockInFrame(PUNCH_AT_MS + 20).jolt).toBeGreaterThan(0);
    expect(clockInFrame(PUNCH_AT_MS + 400).jolt).toBe(0);
  });

  it('shows the title after the punch and gets out of the way at the end', () => {
    expect(clockInFrame(300).titleAlpha).toBe(0);
    expect(clockInFrame(PUNCH_AT_MS + 800).titleAlpha).toBe(1);
    expect(clockInFrame(CLOCK_IN_MS - 1).alpha).toBeLessThan(0.2);
    expect(clockInFrame(CLOCK_IN_MS).done).toBe(true);
  });

  it('stamps a time a minute or two before midnight, read off the seed', () => {
    expect(clockInTime(0)).toMatch(/^11:5\d PM$/);
    expect(clockInTime(4242)).toBe(clockInTime(4242));
  });

  it('plays for a fresh shift, not for a quick retry, a continued run or a dev fixture', () => {
    expect(shouldClockIn({ reason: 'launch', fixture: null, restored: false })).toBe(true);
    expect(shouldClockIn({ reason: 'new-shift', fixture: null, restored: false })).toBe(true);
    expect(shouldClockIn({ reason: 'retry', fixture: null, restored: false })).toBe(false);
    expect(shouldClockIn({ reason: 'launch', fixture: null, restored: true })).toBe(false);
    expect(shouldClockIn({ reason: 'launch', fixture: 'mvp-storefront', restored: false })).toBe(false);
  });
});

describe('clock-in benefits line', () => {
  it('says nothing for a janitor with no benefits', () => {
    expect(benefitsLine(NO_PERKS)).toBeNull();
  });

  it('lists what the Break Room bought, in plain words', () => {
    expect(benefitsLine({ bonusCash: 10, bonusHealth: 4, clearHealBonus: 1, dashCooldownCut: 0, tokenMagnet: 0, lockerItemId: 'pump_soaker' }))
      .toBe('BENEFITS: +$10 FLOAT - +2 HEARTS - COFFEE BREAK - PUMP-ACTION SOAKER');
    expect(benefitsLine({ ...NO_PERKS, bonusHealth: 2 })).toBe('BENEFITS: +1 HEART');
  });
});
