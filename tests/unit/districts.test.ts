import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { roomStores } from '../../src/sim/run/storeInterior';
import { BOSS_CONFIGS, isBossKind } from '../../src/sim/combat/boss';
import { DISTRICT_FOR_FLOOR, districtSpec } from '../../src/sim/wing/districts';
import { FLOOR_NUMBERS, floorSpec, type FloorNumber } from '../../src/sim/wing/floorSpecs';
import { DISTRICT_STORE_TEMPLATES } from '../../src/sim/wing/templates';
import type { MvpRunState } from '../../src/sim/run/types';

/** The first night (from seed 1) whose `floor` first wing is its district. */
function districtRun(floor: FloorNumber): MvpRunState {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = createMvpRun(seed, { floor, part: 1 });
    if (state.wing.district) return state;
  }
  throw new Error(`no district on floor ${floor}`);
}

describe('mall districts (round 50)', () => {
  it('each floor has its own district, and about half the nights a first wing is it', () => {
    expect(new Set(FLOOR_NUMBERS.map((floor) => DISTRICT_FOR_FLOOR[floor])).size).toBe(4);
    for (const floor of FLOOR_NUMBERS) {
      let districts = 0;
      for (let seed = 1; seed <= 200; seed += 1) {
        const first = createMvpRun(seed, { floor, part: 1 }).wing;
        if (first.district) {
          districts += 1;
          expect(first.district).toBe(DISTRICT_FOR_FLOOR[floor]);
        }
        // The same night always rolls the same way, and a boss wing never is one.
        expect(createMvpRun(seed, { floor, part: 1 }).wing.district).toBe(first.district);
        if (seed <= 20) expect(createMvpRun(seed, { floor }).wing.district).toBeUndefined();
      }
      expect(districts, `floor ${floor}`).toBeGreaterThan(60);
      expect(districts, `floor ${floor}`).toBeLessThan(140);
    }
  });

  it('a district wing has its own rooms, a district store in each storefront, and its own monster', () => {
    for (const floor of FLOOR_NUMBERS) {
      const state = districtRun(floor);
      const spec = districtSpec(state.wing.district!);
      expect(state.wing.rooms.map((room) => room.name)).toEqual(state.wing.rooms.map((room) => spec.roomNames[room.id]));
      const storefronts = state.wing.rooms.filter((room) => room.store !== null);
      expect(storefronts.map((room) => roomStores(room)[0]!.templateId)).toEqual([...spec.stores]);
      // The second shop in each storefront stays a regular store.
      for (const room of storefronts) {
        const second = roomStores(room)[1];
        if (second) expect(DISTRICT_STORE_TEMPLATES.some((template) => template.id === second.templateId)).toBe(false);
      }
    }
    // Over a handful of district nights, the district monster turns up in the fights.
    for (const floor of FLOOR_NUMBERS) {
      let seen = 0;
      for (let seed = 1; seed < 400 && seen === 0; seed += 1) {
        const state = createMvpRun(seed, { floor, part: 1 });
        if (!state.wing.district) continue;
        seen += state.wing.rooms.flatMap((room) => room.enemySpawns).filter((spawn) => spawn.kind === districtSpec(state.wing.district!).enemyKind).length;
      }
      expect(seen, `floor ${floor}`).toBeGreaterThan(0);
    }
  });

  it('the district Lockdown is a mini-boss fight, tougher than a wave and easier than the floor boss', () => {
    for (const floor of FLOOR_NUMBERS) {
      const state = districtRun(floor);
      const spec = districtSpec(state.wing.district!);
      const last = state.wing.rooms.length - 1;
      const combat = buildRoomCombatState(state.wing, last, 'west', state.inventory, state.seed);
      const bosses = combat.enemies.filter((enemy) => isBossKind(enemy.kind));
      expect(bosses.map((enemy) => enemy.kind)).toEqual([spec.miniBoss]);
      const config = BOSS_CONFIGS[spec.miniBoss];
      expect(config.maxHealth).toBeLessThan(BOSS_CONFIGS[floorSpec(floor).bossKind].maxHealth);
      expect(config.summonKind).toBe(spec.enemyKind);
    }
  });

  it('walking into a room already called "The ..." does not say "the The"', async () => {
    const { enterDoorway, tickMvpRun } = await import('../../src/sim/run/tickMvpRun');
    const state = districtRun(4);
    const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
    while (state.wing.rooms[state.roomIndex]!.id !== 'food_court') {
      state.room.combat.enemies = [];
      tickMvpRun(state, idle);
      expect(enterDoorway(state, 'east').accepted).toBe(true);
    }
    expect(state.recentChange).toBe('Entered The Ice Rink.');
  });

  it('a district first wing comes back from a checkpoint as the same district', () => {
    const state = districtRun(2);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).wing.district).toBe(state.wing.district);
  });
});
