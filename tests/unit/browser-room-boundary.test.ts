import { expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { parseCheckpoint, restoreMvpRun } from '../../src/sim/run/checkpoint';
import { roomStores } from '../../src/sim/run/storeInterior';
import { roomBoundaryCheckpoint } from '../browser/roomBoundaryCheckpoint';

function boundary(target: string) {
  for (const part of [undefined, 1] as const) for (let seed = 1; seed <= 40; seed++) {
    const run = createMvpRun(seed, part ? { part } : {});
    const index = run.wing.rooms.findIndex((room) => room.id === target || roomStores(room).some((store) => store.templateId === target));
    if (index < 0) continue;
    moveToRoom(run, index, 'west');
    return run;
  }
  throw new Error(`No normal boundary for ${target}`);
}

it.each(['slice-station', 'candy-cauldron', 'security_office'])('browser Continue setup for %s passes the real checkpoint validator', (target) => {
  const run = boundary(target);
  const clearedBefore = [...run.clearedRooms];
  const parsed = parseCheckpoint(roomBoundaryCheckpoint(run));
  expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
  if (parsed.ok) {
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.room.roomId).toBe(run.room.roomId);
    expect(restored.room.combat.player.health).toBe(run.room.combat.player.health);
    expect(restored.inventory).toEqual(run.inventory);
  }
  expect(run.clearedRooms).toEqual(clearedBefore);
});
