import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { enterStore, leaveStore, roomStores, activeStore, interiorWalls, INTERIOR_ARRIVAL, INTERIOR_EXIT } from '../../src/sim/run/storeInterior';
import { alarmSpawnSpots } from '../../src/sim/run/heist';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { propWall, propWalls } from '../../src/sim/combat/props';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { tickRun } from '../../src/sim/tickRun';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MallPropKind, Rect } from '../../src/sim/model';
import type { MvpRunState } from '../../src/sim/run/types';
import { MUSTARD_SPILLS } from '../../src/sim/run/storeTwists';
import { Navigator } from '../balance/path';

const foodProps: Readonly<Record<string, MallPropKind>> = {
  'slice-station': 'bakery', 'pretzel-pit': 'bakery', 'cocoa-hut': 'bakery',
  'cinema-snacks': 'slush', 'candy-cauldron': 'slush', 'frosty-freeze': 'slush',
};
const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function inStore(storeId: string): MvpRunState {
  for (const floor of [1, 2, 3, 4] as const) for (const part of [undefined, 1] as const) for (let seed = 1; seed <= 20; seed++) {
    const run = createMvpRun(seed, { floor, ...(part ? { part } : {}) });
    const roomIndex = run.wing.rooms.findIndex((room) => roomStores(room).some((store) => store.templateId === storeId));
    if (roomIndex < 0) continue;
    moveToRoom(run, roomIndex, 'west');
    const storeIndex = roomStores(run.wing.rooms[roomIndex]!).findIndex((store) => store.templateId === storeId);
    expect(enterStore(run, storeIndex).accepted).toBe(true);
    return run;
  }
  throw new Error(`No seeded store for ${storeId}`);
}

/** Player-sized flood fill: a prop must not cut a shelf or the exit off. */
function reachable(walls: readonly Rect[], start: { x: number; y: number }, target: { x: number; y: number }): boolean {
  const queue = [{ x: Math.round(start.x / 10) * 10, y: Math.round(start.y / 10) * 10 }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i]!;
    if (Math.hypot(point.x - target.x, point.y - target.y) <= 16) return true;
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      const x = point.x + dx!, y = point.y + dy!;
      const key = `${x}:${y}`;
      if (x < 10 || x > 950 || y < 10 || y > 470 || seen.has(key)) continue;
      seen.add(key);
      if (!walls.some((wall) => circleIntersectsRect(x, y, 10, wall))) queue.push({ x, y });
    }
  }
  return false;
}

describe('sparse normal-room destructibles', () => {
  it.each(Object.entries(foodProps))('places one %s prop inside its actual shop', (storeId, kind) => {
    const run = inStore(storeId);
    expect(run.room.combat.props).toHaveLength(1);
    expect(run.room.combat.props![0]).toMatchObject({ kind, state: 'standing' });
  });

  it('leaves unrelated stores and storefront concourses free of the three props', () => {
    for (const storeId of ['mall-mart', 'arcade-annex', 'hardware-hut', 'pet-palace', 'antenna-annex']) {
      const run = inStore(storeId);
      expect(run.room.combat.props ?? []).toHaveLength(0);
    }
    const run = inStore('slice-station');
    leaveStore(run);
    expect(run.room.combat.props ?? []).toHaveLength(0);
    expect(run.room.combat.walls).toEqual(run.wing.rooms[run.roomIndex]!.walls);
  });

  it('keeps Pretzel Pit mustard traversable around the display base', () => {
    const run = inStore('pretzel-pit');
    const wall = propWall(run.room.combat.props![0]!)!;
    for (const spill of MUSTARD_SPILLS) {
      for (let y = spill.y - spill.ry; y <= spill.y + spill.ry; y += 4) {
        for (let x = spill.x - spill.rx; x <= spill.x + spill.rx; x += 4) {
          if (((x - spill.x) / spill.rx) ** 2 + ((y - spill.y) / spill.ry) ** 2 <= 1) {
            expect(circleIntersectsRect(x, y, 10, wall)).toBe(false);
          }
        }
      }
    }
  });

  it.each(Object.keys(foodProps))('%s keeps shelves, door, arrival and every alarm spawn clear', (storeId) => {
    const run = inStore(storeId), combat = run.room.combat, store = activeStore(run)!;
    expect(combat.props).toHaveLength(1);
    const wall = propWall(combat.props![0]!)!;
    expect(combat.walls).toEqual([...interiorWalls(store), ...propWalls(combat.props!)]);
    const destinations = [...run.wing.rooms[run.roomIndex]!.offers.filter((offer) => offer.storeId === storeId).map((offer) => offer.position), INTERIOR_ARRIVAL, { x: 480, y: INTERIOR_EXIT.y + 10 }];
    for (const point of destinations) {
      expect(circleIntersectsRect(point.x, point.y, 30, wall)).toBe(false);
      expect(reachable(combat.walls, INTERIOR_ARRIVAL, point), JSON.stringify(point)).toBe(true);
    }
    for (const wave of ['alarm', 'lockdown'] as const) for (let wanted = 0; wanted <= 5; wanted++) {
      for (const spot of alarmSpawnSpots(store, wanted, wave)) expect(circleIntersectsRect(spot.x, spot.y, 30, wall)).toBe(false);
    }
  });

  it('keeps a single monitor bank only in the ground-floor boss Security Office', () => {
    for (const floor of [1, 2, 3, 4] as const) for (const part of [undefined, 1] as const) {
      const run = createMvpRun(7, { floor, ...(part ? { part } : {}) });
      run.wing.rooms.forEach((room, index) => {
        const combat = buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed);
        const monitors = combat.props?.filter((prop) => prop.kind === 'monitors') ?? [];
        expect(monitors).toHaveLength(floor === 1 && !part && room.id === 'security_office' ? 1 : 0);
        if (room.id !== 'security_office') expect(combat.props?.some((prop) => ['bakery', 'slush'].includes(prop.kind)) ?? false).toBe(false);
      });
    }
  });

  it.each(Object.keys(foodProps))('%s preserves straight shopping paths between shelves, arrival and exit', (storeId) => {
    const run = inStore(storeId), store = activeStore(run)!;
    const points = [INTERIOR_ARRIVAL, { x: 480, y: 390 },
      ...run.wing.rooms[run.roomIndex]!.offers.filter((offer) => offer.storeId === storeId).map((offer) => offer.position),
      ...[115, 276].flatMap((y) => [234, 480, 726].map((x) => ({ x, y })))];
    for (const from of points) for (const to of points) {
      if (Navigator.lineClear(interiorWalls(store), 10, from, to)) {
        expect(Navigator.lineClear(run.room.combat.walls, 10, from, to), `${JSON.stringify(from)} -> ${JSON.stringify(to)}`).toBe(true);
      }
    }
  });

  it('keeps the north-side Security Office dodge lane open', () => {
    const run = createMvpRun(7);
    const combat = buildRoomCombatState(run.wing, 5, 'west', run.inventory, run.seed);
    expect(Navigator.lineClear(combat.walls, 10, { x: 480, y: 100 }, { x: 850, y: 100 })).toBe(true);
  });

  it('keeps the Security Office doorway, main aisle, boss and wanted guards clear', () => {
    for (let seed = 1; seed <= 40; seed++) for (const wanted of [0, 3, 5]) {
      const run = createMvpRun(seed), room = run.wing.rooms[5]!;
      const combat = buildRoomCombatState(run.wing, 5, 'west', run.inventory, run.seed, wanted);
      expect(combat.props).toHaveLength(1);
      const wall = propWall(combat.props![0]!)!;
      for (const entity of [combat.player, ...combat.enemies]) expect(circleIntersectsRect(entity.x, entity.y, entity.radius, wall), `${seed} ${wanted}`).toBe(false);
      expect(room.walls.some((other) => circleIntersectsRect(combat.props![0]!.x, combat.props![0]!.y, 32, other))).toBe(false);
      for (let x = 30; x <= 930; x += 20) expect(circleIntersectsRect(x, 240, 30, wall)).toBe(false);
      expect(reachable(combat.walls, combat.player, { x: 760, y: 240 })).toBe(true);
    }
  });

  it.each(['slice-station', 'cinema-snacks'])('%s breaks once with the established footprint and no loot or puddle', (storeId) => {
    const run = inStore(storeId), combat = run.room.combat;
    expect(combat.props).toHaveLength(1);
    const prop = combat.props![0]!, footprint = propWall(prop);
    combat.player.x = prop.x; combat.player.y = prop.y - 40;
    const cash = run.cash;
    for (let i = 0; i < 60; i++) tickRun(combat, { ...idle, aimX: prop.x, aimY: prop.y - 6, fire: true });
    expect(prop).toMatchObject({ state: 'broken', brokenTick: 1 });
    expect(propWall(prop)).toEqual(footprint);
    expect(combat.surfaces).toHaveLength(0);
    expect(run.cash).toBe(cash);
    const index = run.room.storeIndex;
    leaveStore(run);
    expect(combat.props).toHaveLength(0);
    enterStore(run, index);
    expect(combat.props![0]).toMatchObject({ kind: prop.kind, x: prop.x, y: prop.y, state: 'standing' });
    expect(combat.props![0]!.brokenTick).toBeUndefined();
  });

  it('checkpoint recovery returns to a clean concourse, and the shop rebuilds its prop', () => {
    const run = inStore('cinema-snacks'), index = run.room.storeIndex;
    expect(run.room.combat.props).toHaveLength(1);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(run))));
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.room.interior).toBe(false);
    expect(restored.room.combat.props).toHaveLength(0);
    enterStore(restored, index);
    expect(restored.room.combat.props![0]).toMatchObject({ kind: 'slush', state: 'standing' });
  });

  it('does not consume the cart/soda/rack tutorial on a food display', () => {
    const run = inStore('slice-station');
    expect(run.room.combat.props).toHaveLength(1);
    tickMvpRun(run, idle);
    expect(run.propsHinted).not.toBe(true);
    expect(run.recentChange).not.toMatch(/cart|puddle/i);
  });
});
