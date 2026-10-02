/** Dev fixture data only. No normal room uses this layout. */
import { createMvpRun } from './createMvpRun';
import { buildRoomCombatState } from './rooms';
import type { MvpRunState } from './types';
import type { WingRoomDefinition } from '../wing/types';

export function createPropTestRun(seed: number): MvpRunState {
  const run = createMvpRun(seed, { part: 1 });
  const empty = (room: WingRoomDefinition): WingRoomDefinition => ({
    ...room,
    walls: room.walls.filter((wall) => wall.x === 0 || wall.y === 0 || wall.x + wall.width === 960 || wall.y + wall.height === 480),
    enemySpawns: [], bossAnchor: null, store: null, stores: [], offers: [], benchKiosk: null,
  });
  const testRoom: WingRoomDefinition = {
    ...empty(run.wing.rooms[0]!), name: 'Prop Test', variantId: 'prop-test',
    props: [
      { kind: 'bakery', x: 280, y: 270 },
      { kind: 'monitors', x: 480, y: 270 },
      { kind: 'slush', x: 680, y: 270 },
    ],
  };
  const returnRoom: WingRoomDefinition = {
    ...empty(run.wing.rooms[1]!), name: 'Return to Prop Test', variantId: 'prop-test-return',
    doorways: run.wing.rooms[1]!.doorways.filter((door) => door.side === 'west'),
    walls: [...empty(run.wing.rooms[1]!).walls.filter((wall) => wall.x !== 950), { x: 950, y: 10, width: 10, height: 460 }],
    props: [],
  };
  const wing = { ...run.wing, rooms: [testRoom, returnRoom] };
  return {
    ...run, wing, offerStatus: {},
    room: { ...run.room, variantId: testRoom.variantId, combat: buildRoomCombatState(wing, 0, 'west', run.inventory, run.seed) },
    recentChange: 'PROP TEST: WASD move · mouse / click swing · R reset · east door out and back resets props.',
  };
}
