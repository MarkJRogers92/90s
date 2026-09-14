/**
 * Instantiates the authoritative M5 MVP run from one seed.
 *
 * The factory is the only place cash, Heat, suspicion, carried thefts, offer
 * availability, and the room-zero checkpoint start from their authored values,
 * so restarting a run is a fresh call rather than a cleanup of mutated state.
 */
import type { FusionInventoryState } from '../fusion/types';
import type { InventoryLeaf } from '../fusion/types';
import type { ShopOfferRuntimeStatus } from '../shop/types';
import { generateWing } from '../wing/generateWing';
import { buildRoomCombatState, hasLivingEnemies } from './rooms';
import type { MvpRunState } from './types';

/** The Associate-Issue Mop every shift starts with, owned and selected. */
export const ASSOCIATE_MOP_DEFINITION_ID = 'janitor_mop';
export const ASSOCIATE_MOP_INSTANCE_ID = 'mvp-associate-mop';

export function createMvpRun(seed: number): MvpRunState {
  const runSeed = Number.isFinite(seed) ? seed : 0;
  const wing = generateWing(runSeed);

  const mop: InventoryLeaf = {
    kind: 'leaf',
    instanceId: ASSOCIATE_MOP_INSTANCE_ID,
    itemDefinitionId: ASSOCIATE_MOP_DEFINITION_ID,
    acquisitionKind: 'purchased',
    sourceLocationId: 'service_corridor',
    sourceStockId: 'associate-issue-mop',
    acquisitionTick: 0,
  };
  const inventory: FusionInventoryState = {
    inventory: [mop],
    cash: wing.startingCash,
    revision: 0,
    selectedPrimaryInstanceId: ASSOCIATE_MOP_INSTANCE_ID,
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };

  const combat = buildRoomCombatState(wing, 0, 'west', inventory, runSeed);

  const offerStatus: Record<string, ShopOfferRuntimeStatus> = {};
  for (const room of wing.rooms) {
    for (const offer of room.offers) {
      offerStatus[offer.id] = 'available';
    }
  }

  const startRoom = wing.rooms[0]!;
  const state: MvpRunState = {
    seed: runSeed,
    wing,
    startingCash: wing.startingCash,
    tick: 0,
    paused: false,
    status: 'playing',
    roomIndex: 0,
    room: {
      roomId: startRoom.id,
      variantId: startRoom.variantId,
      combat,
      cleared: !hasLivingEnemies(combat),
      enteredFrom: 'west',
    },
    clearedRooms: [],
    inventory,
    cash: wing.startingCash,
    heat: 0,
    suspicion: 0,
    carried: [],
    offerStatus,
    checkpoint: { roomIndex: 0, tick: 0 },
    summary: null,
    heldActions: { interact: false, steal: false, recall: false },
    recentChange: `Night shift begins in the ${startRoom.name} with $${wing.startingCash}.`,
    behaviorTrace: [],
  };
  state.room.combat.behaviorTrace = state.behaviorTrace;
  return state;
}
