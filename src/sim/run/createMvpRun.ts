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
import { generateRunWing } from './storeInterior';
import type { FloorNumber } from '../wing/floorSpecs';
import { syncRunCarrier } from './carrier';
import { buildRoomCombatState, hasLivingEnemies } from './rooms';
import type { MvpRunState } from './types';
import { createRunStats, type RunStats } from './combo';
import { wantedStars } from './wanted';
import { LOCKER_INSTANCE_ID, LOCKER_SOURCE_LOCATION, runMaxHealth, sanitizePerks, type ShiftPerks } from './perks';
import { refreshRunLoadout } from './loadout';

/** The Associate-Issue Mop every shift starts with, owned and selected. */
export const ASSOCIATE_MOP_DEFINITION_ID = 'janitor_mop';
export const ASSOCIATE_MOP_INSTANCE_ID = 'mvp-associate-mop';

/** What a janitor brings up the escalator. */
export type FloorCarry = {
  readonly inventory: FusionInventoryState;
  readonly cash: number;
  readonly stats: RunStats;
  /** The wanted level follows the janitor up the escalator. Absent means none. */
  readonly heat?: number;
};

/** `part: 1` starts a floor's first wing (round 45); without it, the floor's boss wing. */
export function createMvpRun(seed: number, options: { readonly floor?: FloorNumber; readonly part?: 1; readonly carry?: FloorCarry; readonly perks?: ShiftPerks } = {}): MvpRunState {
  // The wing RNG requires an integer, so a non-integer finite seed is
  // truncated and anything else becomes 0, exactly as the title screen already
  // sanitizes the URL seed.
  const runSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const floor = options.floor ?? 1;
  const wing = generateRunWing(runSeed, floor, options.part);
  const perks = sanitizePerks(options.perks);

  const mop: InventoryLeaf = {
    kind: 'leaf',
    instanceId: ASSOCIATE_MOP_INSTANCE_ID,
    itemDefinitionId: ASSOCIATE_MOP_DEFINITION_ID,
    acquisitionKind: 'purchased',
    sourceLocationId: 'service_corridor',
    sourceStockId: 'associate-issue-mop',
    acquisitionTick: 0,
  };
  // The locker item comes out of the janitor's own locker, already in hand.
  const locker: InventoryLeaf | null = perks.lockerItemId === null ? null : {
    kind: 'leaf',
    instanceId: LOCKER_INSTANCE_ID,
    itemDefinitionId: perks.lockerItemId,
    acquisitionKind: 'purchased',
    sourceLocationId: LOCKER_SOURCE_LOCATION,
    sourceStockId: 'employee-locker',
    acquisitionTick: 0,
  };
  const cash = options.carry?.cash ?? wing.startingCash + perks.bonusCash;
  const inventory: FusionInventoryState = options.carry
    ? { ...options.carry.inventory, cash: options.carry.cash, revision: options.carry.inventory.revision + 1 }
    : {
    inventory: locker ? [mop, locker] : [mop],
    cash,
    revision: 0,
    selectedPrimaryInstanceId: locker ? LOCKER_INSTANCE_ID : ASSOCIATE_MOP_INSTANCE_ID,
    serviceAvailable: true,
    nextCompositeId: 1,
    committedTransactions: [],
  };

  const heat = options.carry?.heat ?? 0;
  const combat = buildRoomCombatState(wing, 0, 'west', inventory, runSeed, wantedStars(heat));

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
      tokens: [],
      interior: false,
      storeIndex: 0,
      twist: null,
    },
    clearedRooms: [],
    inventory,
    cash,
    heat,
    suspicion: 0,
    carried: [],
    offerStatus,
    checkpoint: { roomIndex: 0, tick: 0 },
    summary: null,
    heldActions: { interact: false, steal: false, recall: false },
    recentChange: floor >= 2
      ? `Up the escalator: the ${startRoom.name}, with $${cash}.`
      : `Night shift begins in the ${startRoom.name} with $${cash}.`,
    behaviorTrace: [],
    carrier: null,
    preview: null,
    workbench: null,
    alarm: null,
    stalker: null,
    stats: options.carry ? { ...options.carry.stats, combo: 0, lastHitTick: -Infinity } : createRunStats(),
    perks,
    samplesTaken: [],
  };
  state.room.combat.behaviorTrace = state.behaviorTrace;
  // A fresh floor always opens at full health, under this run's own cap.
  state.room.combat.player.health = runMaxHealth(state);
  if (locker) refreshRunLoadout(state);
  // The shift starts with no emitter carrier, so this is a no-op today; going
  // through the same derivation keeps the one rule for carrier presence.
  syncRunCarrier(state);
  return state;
}
