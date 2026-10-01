import { describe, expect, it } from 'vitest';
import { generateWing } from '../../src/sim/wing/generateWing';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend, ascendToFloorTwo, canAscend, floorThreeSeed, climbToBossWing } from '../../src/sim/run/floors';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { PLAYER_MAX_HEALTH } from '../../src/sim/run/rooms';

function wonFloorTwo() {
  const one = createMvpRun(11);
  one.status = 'won';
  const state = ascendToFloorTwo(one);
  state.cash = 88;
  state.stats.kills = 20;
  Object.assign(state, { perks: { ...state.perks, bonusHealth: 2 } });
  state.room.combat.player.health = 1;
  state.status = 'won';
  return state;
}

describe('Floor 3: Food Court After Dark', () => {
  it('keeps the wing shape under new food-court names', () => {
    const two = generateWing(5, 2);
    const three = generateWing(5, 3);
    expect(three.floor).toBe(3);
    expect(three.rooms.map((room) => room.id)).toEqual(two.rooms.map((room) => room.id));
    expect(three.rooms.map((room) => room.name)).not.toEqual(two.rooms.map((room) => room.name));
    expect(three.rooms.map((room) => room.name)).toContain('Arcade');
    expect(three.rooms.at(-1)!.bossAnchor).not.toBeNull();
  });

  it('brings Mascot Brutes in on the top floor only', () => {
    const kinds = (floor: 1 | 2 | 3) => new Set(
      Array.from({ length: 30 }, (_, seed) => generateWing(seed + 1, floor)).flatMap((wing) => wing.rooms.flatMap((room) => room.enemySpawns.map((spawn) => spawn.kind))),
    );
    expect(kinds(3).has('mascot')).toBe(true);
    expect(kinds(3).has('static')).toBe(true);
    expect(kinds(3).has('shopper')).toBe(true);
    expect(kinds(2).has('mascot')).toBe(false);
    expect(kinds(1).has('mascot')).toBe(false);
  });

  it('derives its seed from the night deterministically', () => {
    expect(floorThreeSeed(11)).toBe(floorThreeSeed(11));
    expect(floorThreeSeed(11)).not.toBe(floorThreeSeed(12));
  });

  it('opens the escalator after floor 2, and (since the Roof) after floor 3 too', () => {
    expect(canAscend(wonFloorTwo())).toBe(true);
    const three = climbToBossWing(wonFloorTwo());
    expect(canAscend(three)).toBe(false);
    three.status = 'won';
    expect(canAscend(three)).toBe(true);
    expect(ascend(three).wing.floor).toBe(4);
  });

  it('carries gear, cash, stats and perks, healed', () => {
    const below = wonFloorTwo();
    const above = ascend(below);
    expect(above.wing.floor).toBe(3);
    expect(above.seed).toBe(floorThreeSeed(below.seed));
    expect(above.cash).toBe(88);
    expect(above.stats.kills).toBe(20);
    expect(above.perks.bonusHealth).toBe(2);
    expect(above.inventory.inventory.map((n) => n.instanceId)).toEqual(below.inventory.inventory.map((n) => n.instanceId));
    expect(above.room.combat.player.health).toBe(PLAYER_MAX_HEALTH + 2);
  });

  it('puts the Mall Owner in the last room (of the boss wing)', () => {
    const state = climbToBossWing(wonFloorTwo());
    for (let guard = 0; guard < 6 && state.roomIndex < state.wing.rooms.length - 1; guard += 1) {
      state.room.combat.enemies = [];
      if (!enterDoorway(state, 'east').accepted) break;
    }
    expect(state.room.combat.enemies.some((enemy) => enemy.kind === 'owner')).toBe(true);
    expect(state.room.combat.enemies.some((enemy) => enemy.kind === 'manager')).toBe(false);
  });

  it('round-trips a floor 3 checkpoint', () => {
    const state = ascend(wonFloorTwo());
    const saved = serializeCheckpoint(state);
    expect(saved.floor).toBe(3);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(saved)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.wing.floor).toBe(3);
    expect(restored.seed).toBe(state.seed);
    expect(parseCheckpoint({ ...saved, floor: 5 }).ok).toBe(false);
  });
});
