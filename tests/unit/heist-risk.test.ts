import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore } from '../../src/sim/run/storeInterior';
import { ALARM_GUARD_BEAT_BY_FLOOR, ALARM_TICKS, ALARM_TICKS_BY_FLOOR, alarmTicksFor } from '../../src/sim/run/heist';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** A shift on `floor` standing at the first shelf of the first store. */
function atShelf(floor: FloorNumber, seed = 9): MvpRunState {
  const state = createMvpRun(seed, { floor });
  state.room.combat.enemies = [];
  tickMvpRun(state, idle);
  const doorway = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  if (!enterDoorway(state, 'east').accepted) throw new Error('no east door');
  if (!enterStore(state).accepted) throw new Error('could not enter the store');
  const offer = state.wing.rooms[state.roomIndex]!.offers[0]!;
  state.room.combat.player.x = offer.position.x;
  state.room.combat.player.y = offer.position.y + 20;
  return state;
}

describe('riskier heists (round 47)', () => {
  it('the alarm is shorter every floor up, starting under the old four seconds', () => {
    const ticks = ([1, 2, 3, 4] as const).map((floor) => alarmTicksFor(atShelf(floor)));
    expect(ticks).toEqual([1, 2, 3, 4].map((floor) => ALARM_TICKS_BY_FLOOR[floor as FloorNumber]));
    expect(ticks[0]).toBeLessThan(240);
    expect(ALARM_TICKS).toBe(ALARM_TICKS_BY_FLOOR[1]);
    for (let index = 1; index < ticks.length; index += 1) expect(ticks[index]).toBeLessThan(ticks[index - 1]!);
    // Even the Roof leaves time to reach the door: two seconds or more.
    expect(ticks[3]).toBeGreaterThanOrEqual(120);
  });

  it('the Bargain Hunters at the door wind up sooner every floor up', () => {
    const beats = ([1, 2, 3, 4] as const).map((floor) => {
      const state = atShelf(floor);
      tickMvpRun(state, { ...idle, steal: true });
      const hunters = state.room.combat.enemies.filter((enemy) => enemy.kind === 'shopper');
      expect(hunters.length).toBeGreaterThanOrEqual(2);
      // They arrive and take their first step in the grab's own tick.
      return hunters[0]!.phaseTicks + 1;
    });
    expect(beats).toEqual([1, 2, 3, 4].map((floor) => ALARM_GUARD_BEAT_BY_FLOOR[floor as FloorNumber]));
    expect(beats[0]).toBeLessThan(36);
    for (let index = 1; index < beats.length; index += 1) expect(beats[index]).toBeLessThan(beats[index - 1]!);
  });
});
