import { serializeCheckpoint } from '../../src/sim/run/checkpoint';
import type { MvpRunState } from '../../src/sim/run/types';

/** A Continue save for a reached room, without changing the live game. */
export function roomBoundaryCheckpoint(run: MvpRunState) {
  const checkpoint = serializeCheckpoint(run);
  const priorFights = run.wing.rooms.slice(0, run.roomIndex)
    .filter((room) => room.enemySpawns.length > 0).map((room) => room.id);
  return { ...checkpoint, clearedRoomIds: [...new Set([...checkpoint.clearedRoomIds, ...priorFights])] };
}
