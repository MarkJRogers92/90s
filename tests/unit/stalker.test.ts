import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, nearestMvpInteraction, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import {
  STALKER_ARRIVAL_TICKS,
  STALKER_SHOVE_TICKS,
  STALKER_WRITE_UP_TICKS,
  stalkerEntryPoint,
} from '../../src/sim/run/stalker';
import { HEAT_PER_STAR } from '../../src/sim/run/wanted';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function tick(state: MvpRunState, times = 1): void {
  for (let index = 0; index < times; index += 1) tickMvpRun(state, idle);
}

/** A five-star shift in an emptied first room, so nothing else can hurt the janitor. */
function wanted(seed = 11, heat = 5 * HEAT_PER_STAR): MvpRunState {
  const state = createMvpRun(seed);
  state.room.combat.enemies = [];
  state.heat = heat;
  return state;
}

function arrive(state: MvpRunState): void {
  tick(state); // spawns him at the door, arriving
  tick(state, STALKER_ARRIVAL_TICKS);
}

describe('Loss Prevention stalker', () => {
  it('stays away below four stars', () => {
    const state = wanted(11, 3 * HEAT_PER_STAR + 19);
    tick(state, STALKER_ARRIVAL_TICKS + 5);
    expect(state.stalker).toBeNull();
  });

  it('walks in through the entry door after the arrival delay', () => {
    const state = wanted();
    tick(state);
    expect(state.stalker?.phase).toBe('arriving');
    expect({ x: state.stalker!.x, y: state.stalker!.y }).toEqual(stalkerEntryPoint(state));
    tick(state, STALKER_ARRIVAL_TICKS - 1);
    expect(state.stalker?.phase).toBe('arriving');
    tick(state);
    expect(state.stalker?.phase).toBe('hunting');
  });

  it('closes on the janitor while hunting', () => {
    const state = wanted();
    arrive(state);
    const player = state.room.combat.player;
    player.x = 700;
    player.y = 240;
    const before = Math.hypot(player.x - state.stalker!.x, player.y - state.stalker!.y);
    tick(state, 30);
    const after = Math.hypot(player.x - state.stalker!.x, player.y - state.stalker!.y);
    expect(after).toBeLessThan(before);
  });

  it('writes the janitor up for one heart, then steps back', () => {
    const state = wanted();
    arrive(state);
    const player = state.room.combat.player;
    const health = player.health;
    player.x = state.stalker!.x + 4;
    player.y = state.stalker!.y;
    tick(state);
    expect(player.health).toBe(health - 1);
    expect(state.stalker?.phase).toBe('writing_up');
    expect(state.stalker?.writeUps).toBe(1);
    // No second heart while he does the paperwork, even standing on him.
    tick(state, STALKER_WRITE_UP_TICKS - 1);
    expect(player.health).toBe(health - 1);
  });

  it('is shoved back and staggered by a mop swing, and cannot be damaged', () => {
    const state = wanted();
    arrive(state);
    const player = state.room.combat.player;
    const stalker = state.stalker!;
    player.x = stalker.x + 40;
    player.y = stalker.y;
    player.facing = { x: -1, y: 0 };
    player.attackActiveTicks = 6;
    const before = stalker.x;
    // The combat tick re-aims the janitor from input, so aim at him.
    tickMvpRun(state, { ...idle, aimX: stalker.x, aimY: stalker.y });
    expect(state.stalker?.phase).toBe('shoved');
    expect(state.stalker!.x).toBeLessThanOrEqual(before);
    expect(state.stalker).not.toHaveProperty('health');
    tick(state, STALKER_SHOVE_TICKS);
    expect(state.stalker?.phase).toBe('hunting');
  });

  it('never locks a door or keeps a room from clearing', () => {
    const state = wanted();
    arrive(state);
    expect(state.room.cleared).toBe(true);
    const doorway = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
    state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
    const interaction = nearestMvpInteraction(state);
    expect(interaction.kind === 'door' && interaction.locked).toBe(false);
  });

  it('follows through the doorway after another arrival delay', () => {
    const state = wanted();
    arrive(state);
    const doorway = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
    state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(state.stalker).toBeNull();
    state.room.combat.enemies = [];
    tick(state);
    expect(state.stalker?.phase).toBe('arriving');
    expect(state.stalker!.x).toBeLessThan(200);
  });

  it('loses the trail once the janitor lays low under four stars', () => {
    const state = wanted();
    arrive(state);
    state.heat = 3 * HEAT_PER_STAR;
    tick(state);
    expect(state.stalker).toBeNull();
    expect(state.recentChange).toContain('lost your trail');
  });

  it('does not follow into a boss room', () => {
    const state = wanted();
    const bossIndex = state.wing.rooms.findIndex((room) => room.bossAnchor !== null);
    expect(bossIndex).toBeGreaterThan(0);
    state.roomIndex = bossIndex;
    tick(state, 3);
    expect(state.stalker).toBeNull();
  });

  it('is not checkpointed, and a restored wanted janitor is found again', () => {
    const state = wanted();
    arrive(state);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.stalker).toBeNull();
    restored.room.combat.enemies = [];
    tick(restored);
    expect(restored.stalker?.phase).toBe('arriving');
  });

  it('is deterministic for the same seed and inputs', () => {
    const first = wanted(23);
    const second = wanted(23);
    for (const state of [first, second]) {
      arrive(state);
      state.room.combat.player.x = 600;
      tick(state, 120);
    }
    expect(first.stalker).toEqual(second.stalker);
  });
});
