import { describe, expect, it } from 'vitest';
import { createProp, propWall, propWalls } from '../../src/sim/combat/props';
import { createRun } from '../../src/sim/createRun';
import { tickRun } from '../../src/sim/tickRun';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import type { MallPropKind } from '../../src/sim/model';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { createPropTestRun } from '../../src/sim/run/propTestRoom';

const kinds = ['bakery', 'monitors', 'slush'] as MallPropKind[];

describe('three-prop test room', () => {
  it('dresses a clear floor for only the three test props', () => {
    const run = createPropTestRun(1);
    const plan = planRoomDressing(run.wing.rooms[0]!, 1, null, 1);
    expect(plan.props).toHaveLength(0);
    expect(plan.neonRings).toHaveLength(0);
    expect(plan.civilians).toBe(false);
  });
  it.each(kinds)('%s blocks walking before and after its single break', (kind) => {
    const state = createRun(1);
    const prop = createProp(1, kind, 360, 300);
    state.enemies = [];
    state.roomWasPopulated = false;
    state.props = [prop];
    state.walls = propWalls([prop]);
    state.player.x = 300;
    state.player.y = 300;
    const wall = propWall(prop);
    expect(wall).not.toBeNull();
    const input = { moveX: 1, moveY: 0, aimX: 360, aimY: 300, fire: false };
    for (let i = 0; i < 35; i++) tickRun(state, input);
    expect(state.player.x).toBeLessThan(360);
    expect(circleIntersectsRect(state.player.x, state.player.y, state.player.radius, wall!)).toBe(false);
    tickRun(state, { ...input, moveX: 0, fire: true });
    expect(prop.state).toBe('broken');
    const brokenTick = (prop as typeof prop & { brokenTick?: number }).brokenTick;
    expect(brokenTick).toBe(state.tick);
    expect(propWall(prop)).toEqual(wall);
    for (let i = 0; i < 60; i++) tickRun(state, { ...input, fire: true });
    expect((prop as typeof prop & { brokenTick?: number }).brokenTick).toBe(brokenTick);
    expect(state.surfaces).toHaveLength(0);
    expect(state.player.x).toBeLessThan(360);
  });

  it('room entry rebuilds the authored three props at their fixed positions', () => {
    const run = createMvpRun(1);
    const authored = kinds.map((kind, index) => ({ kind, x: 280 + index * 200, y: 270 }));
    const room = { ...run.wing.rooms[0]!, enemySpawns: [], walls: [], props: authored };
    const wing = { ...run.wing, rooms: [room] };
    const first = buildRoomCombatState(wing, 0, 'west', run.inventory, run.seed);
    expect(first.props?.map(({ kind, x, y, state }) => ({ kind, x, y, state })))
      .toEqual(authored.map((prop) => ({ ...prop, state: 'standing' })));
    first.props![0]!.state = 'broken';
    const reentry = buildRoomCombatState(wing, 0, 'east', run.inventory, run.seed);
    expect(reentry.props?.every((prop) => prop.state === 'standing')).toBe(true);
    expect(reentry.walls).toEqual(propWalls(reentry.props!));
  });
});
