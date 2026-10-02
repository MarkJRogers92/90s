import { describe, expect, it } from 'vitest';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import {
  SHORTCUT_CHANCE,
  SHORTCUT_HATCH,
  SHORTCUT_HEAT,
  nearShortcut,
  shortcutFor,
  shortcutHere,
  takeShortcut,
} from '../../src/sim/run/shortcut';
import { nearestMvpInteraction, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { wantedStars } from '../../src/sim/run/wanted';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import type { MvpRunState } from '../../src/sim/run/types';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** The first seed whose wing hides a staff passage, and the run standing at its hatch. */
function atTheHatch(from?: number): MvpRunState {
  for (let seed = 1; seed < 400; seed += 1) {
    for (const part of [1, undefined] as const) {
      const state = createMvpRun(seed, part === 1 ? { part: 1 } : {});
      const spot = shortcutFor(state.wing);
      if (!spot || (from !== undefined && spot.from !== from)) continue;
      // Walk to the concourse: clear everything in the way, as the janitor would.
      for (let index = 0; index < spot.from; index += 1) {
        state.room.combat.enemies = [];
        tickMvpRun(state, idle);
        const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
        state.room.combat.player.x = door.rect.x + door.rect.width / 2;
        state.room.combat.player.y = door.rect.y + door.rect.height / 2;
        tickMvpRun(state, { ...idle, moveX: 1 });
      }
      expect(state.roomIndex).toBe(spot.from);
      state.room.combat.player.x = SHORTCUT_HATCH.x;
      state.room.combat.player.y = SHORTCUT_HATCH.y + 30;
      return state;
    }
  }
  throw new Error('no seed hides a staff passage');
}

describe('the staff passage (round 57): a risky way past a fight', () => {
  it('is seed-derived and sits only where a safe concourse is followed by a fight', () => {
    let found = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const wing = createMvpRun(seed).wing;
      const spot = shortcutFor(wing);
      expect(shortcutFor(wing)).toEqual(spot);
      if (!spot) continue;
      found += 1;
      expect(spot.to).toBe(spot.from + 2);
      expect(wing.rooms[spot.from]!.enemySpawns).toHaveLength(0);
      expect(wing.rooms[spot.from]!.store).not.toBeNull();
      expect(wing.rooms[spot.from + 1]!.enemySpawns.length).toBeGreaterThan(0);
    }
    // About SHORTCUT_CHANCE of wings have one, so most floors offer a choice.
    expect(found / 200).toBeGreaterThan(SHORTCUT_CHANCE - 0.15);
    expect(found / 200).toBeLessThan(SHORTCUT_CHANCE + 0.15);
  });

  it('is only reachable from its own concourse, standing at the hatch, until it is used', () => {
    const state = atTheHatch();
    expect(nearShortcut(state)).toBe(true);
    expect(shortcutHere(state)).toBe(true);
    state.room.combat.player.x = 480;
    state.room.combat.player.y = 300;
    expect(nearShortcut(state)).toBe(false);
    expect(shortcutHere(state)).toBe(true);
    // Inside a shop, it is not in reach either.
    state.room.combat.player.x = SHORTCUT_HATCH.x;
    state.room.combat.player.y = SHORTCUT_HATCH.y + 30;
    state.room.interior = true;
    expect(nearShortcut(state)).toBe(false);
  });

  it('takes the janitor two rooms on, leaves the fight behind marked cleared, and costs a star of Heat', () => {
    const state = atTheHatch();
    const spot = shortcutFor(state.wing)!;
    const skipped = state.wing.rooms[spot.from + 1]!;
    state.room.combat.player.health = 5;
    state.heat = 0;
    const result = takeShortcut(state);
    expect(result.accepted).toBe(true);
    expect(state.roomIndex).toBe(spot.to);
    expect(state.room.roomId).toBe(state.wing.rooms[spot.to]!.id);
    expect(state.room.combat.player.health).toBe(5);
    expect(state.clearedRooms).toContain(skipped.id);
    expect(state.heat).toBe(SHORTCUT_HEAT);
    expect(wantedStars(state.heat)).toBe(1);
    expect(state.checkpoint).toEqual({ roomIndex: spot.to, tick: state.tick });
    expect(state.recentChange.length + state.behaviorTrace.length).toBeGreaterThan(0);
  });

  it('has no heal and no loot from the room it skips (it never fought)', () => {
    const state = atTheHatch();
    state.room.combat.player.health = 3;
    takeShortcut(state);
    expect(state.room.combat.player.health).toBe(3);
  });

  it('can be used once a wing', () => {
    const state = atTheHatch();
    const spot = shortcutFor(state.wing)!;
    expect(takeShortcut(state).accepted).toBe(true);
    // Walk back west to the concourse: the hatch is spent.
    state.roomIndex = spot.from;
    state.room.combat.player.x = SHORTCUT_HATCH.x;
    state.room.combat.player.y = SHORTCUT_HATCH.y + 30;
    expect(nearShortcut(state)).toBe(false);
    expect(shortcutHere(state)).toBe(false);
    expect(takeShortcut(state).accepted).toBe(false);
  });

  it('is refused away from the hatch', () => {
    const state = atTheHatch();
    state.room.combat.player.x = 480;
    state.room.combat.player.y = 300;
    const result = takeShortcut(state);
    expect(result.accepted).toBe(false);
  });

  it('is offered as the nearest interaction, and E at the hatch takes it through the real tick', () => {
    const state = atTheHatch();
    const spot = shortcutFor(state.wing)!;
    expect(nearestMvpInteraction(state)).toMatchObject({ kind: 'shortcut' });
    tickMvpRun(state, { ...idle, interact: true });
    expect(state.roomIndex).toBe(spot.to);
  });

  it('caps Heat at the top like all Heat', () => {
    const state = atTheHatch();
    state.heat = 95;
    takeShortcut(state);
    expect(state.heat).toBe(100);
  });

  it('survives a save: the checkpoint after the passage is legal and restores to the same room', () => {
    const state = atTheHatch();
    const spot = shortcutFor(state.wing)!;
    takeShortcut(state);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.roomIndex).toBe(spot.to);
    expect(restored.clearedRooms).toEqual(state.clearedRooms);
    // The spent hatch stays spent after a reload.
    restored.roomIndex = spot.from;
    expect(shortcutHere(restored)).toBe(false);
  });

  it('works from either end of a wing: the first concourse skips the first fight, the second skips the Back Hall', () => {
    const early = atTheHatch(1);
    expect(shortcutFor(early.wing)).toMatchObject({ from: 1, to: 3 });
    expect(takeShortcut(early).accepted).toBe(true);
    const late = atTheHatch(3);
    expect(shortcutFor(late.wing)).toMatchObject({ from: 3, to: 5 });
    expect(takeShortcut(late).accepted).toBe(true);
    expect(late.roomIndex).toBe(5);
  });

  it('tells the player what it does and what it costs, with E to crawl through', () => {
    const state = atTheHatch();
    const prompt = buildGameHudModel(state).prompt;
    expect(prompt).not.toBeNull();
    expect(prompt!.subject).toContain('STAFF PASSAGE');
    expect(prompt!.subject).toContain('SKIP');
    expect(prompt!.subject).toContain('+1 STAR');
    expect(prompt!.keys).toEqual([{ key: 'E', action: 'CRAWL THROUGH' }]);
  });
});
