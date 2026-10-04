import { createMvpRun } from '../../sim/run/createMvpRun';
import { buildRoomCombatState, spawnWaveMonster } from '../../sim/run/rooms';
import { refreshRunLoadout } from '../../sim/run/loadout';

/** Dev-only review setup. Uses a real catalog weapon and unchanged combat ticks. */
export function createHunterHurtRun(seed: number) {
  let run = createMvpRun(seed, { floor: 2 });
  const room = run.wing.rooms[0]!;
  const reviewRoom = {
    ...room, name: 'Bargain Hunter Hurt Review', props: [], benchKiosk: null,
    walls: room.walls.filter((wall) => wall.x === 0 || wall.y === 0 || wall.x + wall.width === 960 || wall.y + wall.height === 480),
  };
  run = { ...run, wing: { ...run.wing, rooms: [reviewRoom, ...run.wing.rooms.slice(1)] } };
  run.inventory = {
    ...run.inventory,
    inventory: [...run.inventory.inventory, { kind: 'leaf', instanceId: 'dev-hurt-laser', itemDefinitionId: 'laser_pointer', acquisitionKind: 'purchased', sourceLocationId: 'dev-fixture', sourceStockId: 'dev-hurt-laser', acquisitionTick: 0 }],
    selectedPrimaryInstanceId: 'dev-hurt-laser', revision: run.inventory.revision + 1,
  };
  run.room.combat = buildRoomCombatState(run.wing, 0, 'west', run.inventory, seed);
  refreshRunLoadout(run);
  run.room.combat.player.x = 240;
  run.room.combat.player.y = 235;
  const hunter = spawnWaveMonster({ slotId: 'hurt-review-hunter', kind: 'shopper', x: 650, y: 235 }, 1, 1);
  hunter.phase = 'pursue';
  hunter.phaseTicks = 0;
  run.room.combat.enemies = [hunter];
  run.room.cleared = false;
  return run;
}
