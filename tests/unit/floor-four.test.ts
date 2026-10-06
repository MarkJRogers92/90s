import { describe, expect, it } from 'vitest';
import { generateWing } from '../../src/sim/wing/generateWing';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend, canAscend, climbToBossWing } from '../../src/sim/run/floors';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { FINAL_FLOOR, floorSpec } from '../../src/sim/wing/floorSpecs';
import { ROOF_ROOM_NAMES } from '../../src/sim/wing/templates';
import { stubsForShift, type ShiftResult } from '../../src/game/career/career';

function wonFloorThree() {
  const state = createMvpRun(floorSpec(3).seedFrom(77), { floor: 3 });
  state.cash = 120;
  state.stats.kills = 40;
  state.status = 'won';
  return state;
}

describe('Floor 4: the Roof', () => {
  it('is the final floor, on the Roof, with the Developer as its boss', () => {
    expect(FINAL_FLOOR).toBe(4);
    expect(floorSpec(4)).toMatchObject({ roomNames: ROOF_ROOM_NAMES, bossKind: 'developer', fullStrength: true });
  });

  it('keeps the wing shape under roof names', () => {
    const three = generateWing(5, 3);
    const roof = generateWing(5, 4);
    expect(roof.floor).toBe(4);
    expect(roof.rooms.map((room) => room.id)).toEqual(three.rooms.map((room) => room.id));
    expect(roof.rooms.map((room) => room.name)).toContain('Helipad');
  });

  it('brings Roofers in on the Roof only, among the monsters from below', () => {
    const kinds = (floor: 1 | 2 | 3 | 4) => new Set(
      Array.from({ length: 30 }, (_, seed) => generateWing(seed + 1, floor)).flatMap((wing) => wing.rooms.flatMap((room) => room.enemySpawns.map((spawn) => spawn.kind))),
    );
    expect(kinds(4).has('roofer')).toBe(true);
    expect(kinds(4).has('mascot')).toBe(true);
    for (const floor of [1, 2, 3] as const) expect(kinds(floor).has('roofer')).toBe(false);
  });

  it('floors below never change: seed 5 builds the same fights it did before the Roof', () => {
    const fights = (floor: 1 | 2 | 3) => generateWing(5, floor).rooms.map((room) => room.enemySpawns.map((spawn) => spawn.kind).join()).join('|');
    // Captured from the three-floor game before Floor 4 existed.
    expect(fights(1)).toBe('||hanger,hanger,spitter,hanger||hanger,spitter,hanger,spitter|');
    expect(fights(2)).toBe('||static,hanger,shopper,static||shopper,shopper,hanger,static|');
    // Round 58 gave floor 3 its own layouts: the same monsters, in the Arcade's own slot order.
    expect(fights(3)).toBe('||shopper,hanger,static,static||shopper,mascot,hanger,mascot|');
  });

  it('the escalator opens after the Owner, and the Roof is the top', () => {
    const below = wonFloorThree();
    expect(canAscend(below)).toBe(true);
    // Up the escalator to the Roof's first wing (round 45), then its stairs to the boss wing.
    const first = ascend(below);
    expect(first.wing.floor).toBe(4);
    expect(first.wing.part).toBe(1);
    expect(first.seed).toBe(floorSpec(4).seedFrom(below.seed));
    const roof = climbToBossWing(below);
    expect(roof.wing.part).toBeUndefined();
    expect(roof.cash).toBe(120);
    expect(roof.stats.kills).toBe(40);
    roof.status = 'won';
    expect(canAscend(roof)).toBe(false);
  });

  it('the Helipad spawns the Developer', () => {
    const roof = createMvpRun(9, { floor: 4 });
    const helipad = roof.wing.rooms.findIndex((room) => room.bossAnchor !== null);
    const combat = buildRoomCombatState(roof.wing, helipad, 'west', roof.inventory, roof.seed);
    expect(combat.enemies.map((enemy) => enemy.kind)).toContain('developer');
  });

  it('checkpoints on the Roof come back on the Roof', () => {
    const roof = createMvpRun(9, { floor: 4 });
    const saved = serializeCheckpoint(roof);
    expect(saved.floor).toBe(4);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(saved)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).wing.floor).toBe(4);
    expect(parseCheckpoint({ ...saved, floor: 5 }).ok).toBe(false);
  });

  it('pays for clearing Floor 3, and clocking out now means the Developer is down', () => {
    const base: ShiftResult = { score: 700, won: false, floorCleared: true, floorTwoCleared: true, kills: 12, bestCombo: 5, seconds: 180, mall: 42 };
    const two = stubsForShift(base);
    const three = stubsForShift({ ...base, floorThreeCleared: true });
    expect(three.lines.map((line) => line.label)).toContain('FLOOR 3 CLEARED');
    expect(two.lines.map((line) => line.label)).not.toContain('FLOOR 3 CLEARED');
    expect(three.total).toBeGreaterThan(two.total);
    expect(stubsForShift({ ...base, won: true }).lines.map((line) => line.label)).toContain('FLOOR 3 CLEARED');
  });
});
