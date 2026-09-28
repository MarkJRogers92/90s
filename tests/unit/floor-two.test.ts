import { describe, expect, it } from 'vitest';
import { generateWing } from '../../src/sim/wing/generateWing';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascendToFloorTwo, canAscend } from '../../src/sim/run/floors';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { PLAYER_MAX_HEALTH, buildRoomCombatState } from '../../src/sim/run/rooms';

function wonFloorOne() {
  const state = createMvpRun(11);
  state.cash = 57;
  state.stats.kills = 9;
  state.stats.bestCombo = 12;
  state.room.combat.player.health = 2;
  state.status = 'won';
  return state;
}

describe('Floor 2: the Upper Level', () => {
  it('keeps the wing shape but renames every room', () => {
    const one = generateWing(5);
    const two = generateWing(5, 2);
    expect(two.floor).toBe(2);
    expect(two.rooms.map((room) => room.id)).toEqual(one.rooms.map((room) => room.id));
    expect(two.rooms.map((room) => room.name)).not.toEqual(one.rooms.map((room) => room.name));
    expect(two.rooms.at(-1)!.bossAnchor).not.toBeNull();
  });

  it('brings in Statics and Bargain Hunters upstairs, never downstairs', () => {
    const kinds = (floor: 1 | 2) => new Set(
      Array.from({ length: 30 }, (_, seed) => generateWing(seed + 1, floor)).flatMap((wing) => wing.rooms.flatMap((room) => room.enemySpawns.map((spawn) => spawn.kind))),
    );
    expect(kinds(2).has('static')).toBe(true);
    expect(kinds(2).has('shopper')).toBe(true);
    expect(kinds(1).has('static')).toBe(false);
    expect(kinds(1).has('shopper')).toBe(false);
  });

  it('only opens the escalator after beating Loss Prevention', () => {
    expect(canAscend(createMvpRun(11))).toBe(false);
    expect(canAscend(wonFloorOne())).toBe(true);
  });

  it('carries the janitor up with their gear, cash and stats, healed', () => {
    const below = wonFloorOne();
    const above = ascendToFloorTwo(below);
    expect(above.wing.floor).toBe(2);
    expect(above.status).toBe('playing');
    expect(above.roomIndex).toBe(0);
    expect(above.cash).toBe(57);
    expect(above.inventory.inventory.map((n) => n.instanceId)).toEqual(below.inventory.inventory.map((n) => n.instanceId));
    expect(above.stats.kills).toBe(9);
    expect(above.stats.bestCombo).toBe(12);
    expect(above.room.combat.player.health).toBe(PLAYER_MAX_HEALTH);
    expect(canAscend(above)).toBe(false);
  });

  it('puts the Mall Manager in the last room', () => {
    const state = ascendToFloorTwo(wonFloorOne());
    for (let guard = 0; guard < 6 && state.roomIndex < state.wing.rooms.length - 1; guard += 1) {
      state.room.combat.enemies = [];
      if (!enterDoorway(state, 'east').accepted) break;
    }
    expect(state.room.combat.enemies.some((enemy) => enemy.kind === 'manager')).toBe(true);
    expect(state.room.combat.enemies.some((enemy) => enemy.kind === 'lp_manager')).toBe(false);
  });

  it('saves and restores on the upper floor', () => {
    const state = ascendToFloorTwo(wonFloorOne());
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(restoreMvpRun(parsed.checkpoint).wing.floor).toBe(2);
  });
});

describe('walking into an upstairs fight', () => {
  it('gives a fresh Bargain Hunter a beat before it can wind up a charge', () => {
    // Find an upstairs room with a Bargain Hunter parked beside the west door.
    const wing = Array.from({ length: 40 }, (_, seed) => generateWing(seed + 1, 2))
      .find((candidate) => candidate.rooms.some((room) => room.enemySpawns.some((spawn) => spawn.kind === 'shopper')))!;
    const roomIndex = wing.rooms.findIndex((candidate) => candidate.enemySpawns.some((spawn) => spawn.kind === 'shopper'));
    const run = createMvpRun(wing.seed, { floor: 2 });
    const combat = buildRoomCombatState(wing, roomIndex, 'west', run.inventory, wing.seed);
    const shopper = combat.enemies.find((enemy) => enemy.kind === 'shopper')!;
    expect(shopper.phase).toBe('recover');
    expect(shopper.phaseTicks).toBeGreaterThanOrEqual(45);
  });
});
