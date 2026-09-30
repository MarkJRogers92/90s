import { describe, expect, it } from 'vitest';
import { FINAL_FLOOR, FLOOR_NUMBERS, floorNumberOf, floorSpec, isFloorNumber } from '../../src/sim/wing/floorSpecs';
import { FLOOR_THREE_ROOM_NAMES, FLOOR_TWO_ROOM_NAMES, ROOM_NAMES } from '../../src/sim/wing/templates';
import { floorThreeSeed, floorTwoSeed } from '../../src/sim/run/floors';

describe('the floor table', () => {
  it('lists every floor in climbing order and ends on the final floor', () => {
    expect(FLOOR_NUMBERS[0]).toBe(1);
    expect(FLOOR_NUMBERS[FLOOR_NUMBERS.length - 1]).toBe(FINAL_FLOOR);
    FLOOR_NUMBERS.forEach((floor, index) => expect(floor).toBe(index + 1));
  });

  it('names each floor’s rooms and boss', () => {
    expect(floorSpec(1)).toMatchObject({ roomNames: ROOM_NAMES, bossKind: 'lp_manager', fullStrength: false });
    expect(floorSpec(2)).toMatchObject({ roomNames: FLOOR_TWO_ROOM_NAMES, bossKind: 'manager', fullStrength: true });
    expect(floorSpec(3)).toMatchObject({ roomNames: FLOOR_THREE_ROOM_NAMES, bossKind: 'owner', fullStrength: true });
  });

  it('derives each floor’s wing seed from the floor below', () => {
    expect(floorSpec(2).seedFrom(1234)).toBe(floorTwoSeed(1234));
    expect(floorSpec(3).seedFrom(1234)).toBe(floorThreeSeed(1234));
  });

  it('reads a wing’s floor, an absent flag meaning the ground floor', () => {
    expect(floorNumberOf({})).toBe(1);
    expect(floorNumberOf({ floor: 2 })).toBe(2);
    expect(floorNumberOf({ floor: 3 })).toBe(3);
    expect(isFloorNumber(2)).toBe(true);
    expect(isFloorNumber(0)).toBe(false);
    expect(isFloorNumber(FINAL_FLOOR + 1)).toBe(false);
    expect(isFloorNumber('2')).toBe(false);
  });
});
