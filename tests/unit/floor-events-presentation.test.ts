import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { wingEventFor, type WingEvent } from '../../src/sim/run/wingEvents';
import { roomTitleSubtitle } from '../../src/game/ui/gameHudModel';
import { SPRINKLER_STREAKS, sprinklerStreaks } from '../../src/game/view/sprinklerRain';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../src/sim/core/geometry';
import type { MvpRunState } from '../../src/sim/run/types';

function runWith(event: WingEvent | null): MvpRunState {
  for (let seed = 1; seed < 500; seed += 1) {
    const state = createMvpRun(seed, { floor: 2 });
    if (wingEventFor(state.wing) === event) return state;
  }
  throw new Error(`no ${String(event)} wing`);
}

describe('floor events on screen (round 47)', () => {
  it('every room title card names the wing event', () => {
    expect(roomTitleSubtitle(runWith('outage')).text).toMatch(/^POWER OUTAGE/);
    expect(roomTitleSubtitle(runWith('sprinklers')).text).toMatch(/^SPRINKLERS ON/);
    expect(roomTitleSubtitle(runWith('clearance')).text).toMatch(/^CLEARANCE SALE - 30% OFF/);
    expect(roomTitleSubtitle(runWith(null)).text).toMatch(/^SHIFT ROOM 1 OF 6|^BLUE LIGHT|^BLACKOUT/);
  });

  it('sprinkler streaks fall down the room, stay on the playfield, and are the same every frame', () => {
    const now = sprinklerStreaks(100);
    expect(now).toHaveLength(SPRINKLER_STREAKS);
    expect(sprinklerStreaks(100)).toEqual(now);
    for (const streak of now) {
      expect(streak.x).toBeGreaterThanOrEqual(0);
      expect(streak.x).toBeLessThanOrEqual(PLAYFIELD_WIDTH);
      expect(streak.y).toBeGreaterThanOrEqual(0);
      expect(streak.y).toBeLessThanOrEqual(PLAYFIELD_HEIGHT);
    }
    // One tick later most streaks are lower (the rest wrapped back to the top).
    const later = sprinklerStreaks(101);
    expect(later.filter((streak, index) => streak.y > now[index]!.y).length).toBeGreaterThan(SPRINKLER_STREAKS * 0.8);
  });
});
