import { describe, expect, it } from 'vitest';
import { generateWing } from '../../src/sim/wing/generateWing';
import { bossWingSeed, FLOOR_NUMBERS, type FloorNumber } from '../../src/sim/wing/floorSpecs';
import { FLOOR_STORE_IDS, STORE_TEMPLATES, storeTemplate } from '../../src/sim/wing/templates';

const UPPER: readonly FloorNumber[] = [2, 3, 4];
const exclusiveIds = UPPER.flatMap((floor) => [...FLOOR_STORE_IDS[floor]!]);

function storeIds(seed: number, floor: FloorNumber, part?: 1): string[] {
  return generateWing(seed, floor, part).rooms.flatMap((room) => (room.store ? [room.store.templateId] : []));
}

describe('floor-exclusive stores (round 55)', () => {
  it('floors 2-4 each have two stores of their own, none shared and none in the regular pool', () => {
    for (const floor of UPPER) expect(FLOOR_STORE_IDS[floor], `floor ${floor}`).toHaveLength(2);
    expect(new Set(exclusiveIds).size).toBe(6);
    const regular = new Set(STORE_TEMPLATES.map((template) => template.id));
    for (const id of exclusiveIds) {
      expect(regular.has(id), id).toBe(false);
      expect(storeTemplate(id), id).toBeDefined();
    }
  });

  it('every upper-floor wing (first and boss) opens one of its floor\'s stores', () => {
    for (const floor of UPPER) {
      for (let seed = 1; seed <= 60; seed += 1) {
        for (const wingSeed of [seed, bossWingSeed(seed)]) {
          const ids = storeIds(wingSeed, floor);
          expect(ids.some((id) => FLOOR_STORE_IDS[floor]!.includes(id)), `floor ${floor} seed ${wingSeed}`).toBe(true);
        }
      }
    }
  });

  it('floor-exclusive stores never open on any other floor, and floor 1 draws as before', () => {
    for (const floor of FLOOR_NUMBERS) {
      const foreign = exclusiveIds.filter((id) => !((FLOOR_STORE_IDS[floor] ?? []) as readonly string[]).includes(id));
      for (let seed = 1; seed <= 60; seed += 1) {
        const ids = storeIds(seed, floor);
        for (const id of foreign) expect(ids, `floor ${floor} seed ${seed}`).not.toContain(id);
      }
    }
  });

  it('both of a floor\'s stores turn up across nights', () => {
    for (const floor of UPPER) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 60; seed += 1) for (const id of storeIds(seed, floor)) seen.add(id);
      for (const id of FLOOR_STORE_IDS[floor]!) expect(seen.has(id), id).toBe(true);
    }
  });
});
