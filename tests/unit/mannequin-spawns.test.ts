import { describe, expect, it } from 'vitest';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';

function roomById(seed: number, id: string) {
  const state = createMvpRun(seed);
  for (let guard = 0; guard < 6 && state.wing.rooms[state.roomIndex]!.id !== id; guard += 1) {
    state.room.combat.enemies = [];
    if (!enterDoorway(state, 'east').accepted) break;
  }
  return state;
}

describe('display mannequins', () => {
  it('always stand in the back hall, two of them, clear of walls and the door', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const state = roomById(seed, 'back_hall');
      const mannequins = state.room.combat.enemies.filter((enemy) => enemy.kind === 'mannequin');
      expect(mannequins).toHaveLength(2);
      const entry = state.room.combat.player;
      for (const m of mannequins) {
        expect(state.room.combat.walls.some((wall) => circleIntersectsRect(m.x, m.y, m.radius, wall))).toBe(false);
        expect(Math.hypot(m.x - entry.x, m.y - entry.y)).toBeGreaterThan(200);
      }
    }
  });

  it('sometimes wait in the food court', () => {
    let rooms = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      if (roomById(seed, 'food_court').room.combat.enemies.some((enemy) => enemy.kind === 'mannequin')) rooms += 1;
    }
    expect(rooms).toBeGreaterThan(5);
    expect(rooms).toBeLessThan(35);
  });

  it('never appear in stores, the concourse or the boss room', () => {
    for (const id of ['service_corridor', 'storefront_a', 'security_office']) {
      expect(roomById(3, id).room.combat.enemies.some((enemy) => enemy.kind === 'mannequin')).toBe(false);
    }
  });
});
