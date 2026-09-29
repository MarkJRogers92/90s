import { describe, expect, it } from 'vitest';
import { alarmCue } from '../../src/game/view/alarmCues';
import { ALARM_TICKS, type StoreAlarm } from '../../src/sim/run/heist';

const alarm = (overrides: Partial<StoreAlarm>): StoreAlarm => ({ storeId: 'mall-mart', roomIndex: 1, ticksLeft: ALARM_TICKS, shutter: 'open', ...overrides });

describe('store alarm cues', () => {
  it('shows nothing without an alarm', () => {
    expect(alarmCue(null, ALARM_TICKS, 0)).toEqual({ phase: 'none', shutterDrop: 0, countdown: null, flash: false });
  });

  it('counts whole seconds down over the door while the shutter creeps lower', () => {
    const fresh = alarmCue(alarm({}), ALARM_TICKS, 0);
    expect(fresh).toMatchObject({ phase: 'ringing', countdown: '4', shutterDrop: 0 });
    const late = alarmCue(alarm({ ticksLeft: 50 }), ALARM_TICKS, 0);
    expect(late.countdown).toBe('1');
    expect(late.shutterDrop).toBeGreaterThan(0.7);
    expect(late.shutterDrop).toBeLessThan(1);
  });

  it('a dropped shutter is fully down and says so; a lifted one is gone', () => {
    expect(alarmCue(alarm({ ticksLeft: 0, shutter: 'closed' }), ALARM_TICKS, 0)).toMatchObject({ phase: 'locked', shutterDrop: 1, countdown: 'LOCKED IN' });
    expect(alarmCue(alarm({ ticksLeft: 0, shutter: 'lifted' }), ALARM_TICKS, 0)).toMatchObject({ phase: 'lifted', shutterDrop: 0, countdown: null });
  });

  it('the beacons flash on and off while ringing or locked', () => {
    const flashes = new Set([0, 5, 10, 15, 20, 25].map((tick) => alarmCue(alarm({}), ALARM_TICKS, tick).flash));
    expect(flashes).toEqual(new Set([true, false]));
  });
});
