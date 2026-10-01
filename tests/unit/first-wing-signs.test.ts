import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';

const signs = (floor: FloorNumber, part: 1 | undefined, roleIndex: number) => {
  const state = createMvpRun(5, { floor, ...(part ? { part } : {}) });
  const room = state.wing.rooms[roleIndex]!;
  return planRoomDressing(room, floor, null, part).facades.flatMap((facade) => (facade.sign ? [facade.sign.text] : []));
};

describe('first wings have their own back-wall signs (owner queue, round 48)', () => {
  it('Floor 2\'s Lockdown no longer says MANAGEMENT', () => {
    expect(signs(2, 1, 5)).not.toContain('MANAGEMENT');
    expect(signs(2, undefined, 5)).toContain('MANAGEMENT');
  });

  it('every first-wing fight room on every floor reads differently from its boss wing', () => {
    for (const floor of [1, 2, 3, 4] as const) {
      // The fight rooms and the Lockdown: food_court, back_hall, security_office.
      for (const index of [2, 4, 5]) {
        const first = signs(floor, 1, index);
        const boss = signs(floor, undefined, index);
        if (boss.length === 0) continue;
        expect(first, `floor ${floor} room ${index}`).not.toEqual(boss);
        expect(first.length, `floor ${floor} room ${index}`).toBe(boss.length);
      }
    }
  });
});
