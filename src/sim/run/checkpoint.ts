/**
 * Versioned, strictly validated run checkpoints.
 *
 * A checkpoint is plain JSON: the run seed, the boundary it belongs to, the
 * run-level economy, the provenance-bearing inventory tree, and the committed
 * transaction ledger. It never holds closures, compiled behaviour, live
 * enemies, projectiles, or room-local surfaces; a restored run rebuilds the
 * current room deterministically from the seed and the room index. Invalid or
 * version-mismatched data is rejected with a reason and a restore never
 * partially applies.
 */
import {
  isValidFusionInventoryState,
  projectFusionInventory,
} from '../fusion/inventory';
import type {
  EmitterMountComposite,
  FusionInventoryNode,
  FusionInventoryState,
} from '../fusion/types';
import { ITEM_CATALOG } from '../items/catalog';
import { compileLoadout } from '../items/compileLoadout';
import { MAX_SECURITY_HEAT, MAX_SUSPICION } from '../shop/types';
import type { CarriedTheft, ShopOfferRuntimeStatus } from '../shop/types';
import { generateWing } from '../wing/generateWing';
import type { GeneratedWing, WingRoomId } from '../wing/types';
import { refreshRunLoadout, runCompilerInstances } from './loadout';
import {
  PLAYER_MAX_HEALTH,
  buildRoomCombatState,
  clearRoomEnemies,
  hasLivingEnemies,
} from './rooms';
import type { MvpRoomEntryFrom, MvpRunState } from './types';

export const MVP_CHECKPOINT_VERSION = 1;

/** The one room whose cleared flag would restore an instantly-won empty boss room. */
const BOSS_ROOM_ID = 'security_office';

export type MvpCheckpoint = {
  readonly version: 1;
  readonly seed: number;
  readonly roomIndex: number;
  readonly tick: number;
  readonly cash: number;
  readonly heat: number;
  readonly suspicion: number;
  readonly playerHealth: number;
  /** Which side of the current room the player entered from. */
  readonly enteredFrom: MvpRoomEntryFrom;
  readonly clearedRoomIds: readonly WingRoomId[];
  readonly inventory: FusionInventoryState;
  readonly offerStatus: Record<string, ShopOfferRuntimeStatus>;
  readonly carried: CarriedTheft[];
};

export type CheckpointParseResult =
  | { readonly ok: true; readonly checkpoint: MvpCheckpoint }
  | { readonly ok: false; readonly reason: string };

const CATALOG_DEFINITION_IDS = new Set(ITEM_CATALOG.map((definition) => definition.id));

function fail(reason: string): CheckpointParseResult {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function cloneNode(node: FusionInventoryNode): FusionInventoryNode {
  if (node.kind === 'leaf') {
    return { ...node };
  }
  const composite: EmitterMountComposite = {
    ...node,
    primary: { ...node.primary },
    carrier: { ...node.carrier },
  };
  return composite;
}

/** Deep-clones one inventory tree so a checkpoint never aliases live state. */
export function cloneFusionInventory(state: FusionInventoryState): FusionInventoryState {
  return {
    inventory: state.inventory.map(cloneNode),
    cash: state.cash,
    revision: state.revision,
    selectedPrimaryInstanceId: state.selectedPrimaryInstanceId,
    serviceAvailable: state.serviceAvailable,
    nextCompositeId: state.nextCompositeId,
    committedTransactions: state.committedTransactions.map((record) => ({ ...record })),
  };
}

export function serializeCheckpoint(state: MvpRunState): MvpCheckpoint {
  return {
    version: MVP_CHECKPOINT_VERSION,
    seed: state.seed,
    roomIndex: state.roomIndex,
    tick: state.tick,
    cash: state.cash,
    heat: state.heat,
    suspicion: state.suspicion,
    playerHealth: state.room.combat.player.health,
    enteredFrom: state.room.enteredFrom,
    clearedRoomIds: [...state.clearedRooms],
    inventory: cloneFusionInventory(state.inventory),
    offerStatus: { ...state.offerStatus },
    carried: state.carried.map((theft) => ({ ...theft })),
  };
}

function isRoomEntryFrom(value: unknown): value is MvpRoomEntryFrom {
  return value === 'west' || value === 'east';
}

function validateOfferStatus(
  value: unknown,
  wingOfferIds: Set<string>,
): { readonly ok: true; readonly offerStatus: Record<string, ShopOfferRuntimeStatus> } | { readonly ok: false; readonly reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: 'Checkpoint offer status must be an object.' };
  }
  const offerStatus: Record<string, ShopOfferRuntimeStatus> = {};
  for (const [offerId, status] of Object.entries(value)) {
    if (!wingOfferIds.has(offerId)) {
      return { ok: false, reason: `Checkpoint references unknown offer "${offerId}".` };
    }
    if (status !== 'available' && status !== 'carried' && status !== 'consumed') {
      return { ok: false, reason: `Checkpoint offer "${offerId}" has an invalid status.` };
    }
    offerStatus[offerId] = status;
  }
  for (const offerId of wingOfferIds) {
    if (!(offerId in offerStatus)) {
      return { ok: false, reason: `Checkpoint is missing offer "${offerId}".` };
    }
  }
  return { ok: true, offerStatus };
}

function validateCarried(
  value: unknown,
  offerStatus: Record<string, ShopOfferRuntimeStatus>,
  offerIds: Map<
    string,
    { readonly storeId: string; readonly itemDefinitionId: string }
  >,
): { readonly ok: true; readonly carried: CarriedTheft[] } | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: 'Checkpoint carried thefts must be an array.' };
  }
  const carried: CarriedTheft[] = [];
  const seenOffers = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { ok: false, reason: 'Checkpoint carried theft must be an object.' };
    }
    const { itemDefinitionId, sourceStoreId, sourceOfferId, startedTick } = entry;
    if (typeof itemDefinitionId !== 'string' || !CATALOG_DEFINITION_IDS.has(itemDefinitionId)) {
      return { ok: false, reason: 'Checkpoint carried theft references an unknown item.' };
    }
    if (typeof sourceOfferId !== 'string' || typeof sourceStoreId !== 'string') {
      return { ok: false, reason: 'Checkpoint carried theft has invalid provenance.' };
    }
    const offer = offerIds.get(sourceOfferId);
    if (!offer) {
      return { ok: false, reason: `Checkpoint carried theft references unknown offer "${sourceOfferId}".` };
    }
    if (offer.storeId !== sourceStoreId || offer.itemDefinitionId !== itemDefinitionId) {
      return { ok: false, reason: 'Checkpoint carried theft provenance does not match its offer.' };
    }
    if (!isNonNegativeInteger(startedTick)) {
      return { ok: false, reason: 'Checkpoint carried theft has an invalid start tick.' };
    }
    if (seenOffers.has(sourceOfferId)) {
      return { ok: false, reason: `Checkpoint carries offer "${sourceOfferId}" twice.` };
    }
    seenOffers.add(sourceOfferId);
    if (offerStatus[sourceOfferId] !== 'carried') {
      return {
        ok: false,
        reason: `Checkpoint carries offer "${sourceOfferId}" that is not marked carried.`,
      };
    }
    carried.push({ itemDefinitionId, sourceStoreId, sourceOfferId, startedTick });
  }
  for (const [offerId, status] of Object.entries(offerStatus)) {
    if (status === 'carried' && !seenOffers.has(offerId)) {
      return { ok: false, reason: `Checkpoint marks offer "${offerId}" carried without a theft.` };
    }
  }
  return { ok: true, carried };
}

/**
 * Validates an untrusted checkpoint. Returns a reason instead of throwing, so
 * startup can ignore a bad save and keep playing.
 */
export function parseCheckpoint(value: unknown): CheckpointParseResult {
  if (!isRecord(value)) {
    return fail('A checkpoint must be a JSON object.');
  }
  if (value.version !== MVP_CHECKPOINT_VERSION) {
    return fail(`Unsupported checkpoint version: ${String(value.version)}.`);
  }

  const seed = value.seed;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    return fail('Checkpoint seed must be a finite number.');
  }
  let wing: GeneratedWing;
  try {
    wing = generateWing(seed);
  } catch {
    return fail(`Seed ${String(seed)} does not generate a valid wing.`);
  }

  const roomIndex = value.roomIndex;
  if (
    typeof roomIndex !== 'number' ||
    !Number.isInteger(roomIndex) ||
    roomIndex < 0 ||
    roomIndex >= wing.rooms.length
  ) {
    return fail('Checkpoint room index is out of range.');
  }
  const tick = value.tick;
  if (!isNonNegativeInteger(tick)) {
    return fail('Checkpoint tick must be a non-negative integer.');
  }
  const cash = value.cash;
  if (!isNonNegativeInteger(cash)) {
    return fail('Checkpoint cash must be a non-negative integer.');
  }
  const heat = value.heat;
  if (!isNonNegativeInteger(heat) || heat > MAX_SECURITY_HEAT) {
    return fail('Checkpoint Heat is out of range.');
  }
  const suspicion = value.suspicion;
  if (
    typeof suspicion !== 'number' ||
    !Number.isFinite(suspicion) ||
    suspicion < 0 ||
    suspicion > MAX_SUSPICION
  ) {
    return fail('Checkpoint suspicion is out of range.');
  }
  const playerHealth = value.playerHealth;
  if (
    typeof playerHealth !== 'number' ||
    !Number.isInteger(playerHealth) ||
    playerHealth < 1 ||
    playerHealth > PLAYER_MAX_HEALTH
  ) {
    return fail('Checkpoint player health is out of range.');
  }

  const enteredFrom = value.enteredFrom;
  if (!isRoomEntryFrom(enteredFrom)) {
    return fail('Checkpoint entry side must be "west" or "east".');
  }

  if (!Array.isArray(value.clearedRoomIds)) {
    return fail('Checkpoint cleared rooms must be an array.');
  }
  const clearedRoomIds: WingRoomId[] = [];
  for (const roomId of value.clearedRoomIds) {
    if (roomId === BOSS_ROOM_ID) {
      return fail('Checkpoint cannot mark the boss room cleared.');
    }
    const known = wing.rooms.some((room) => room.id === roomId);
    if (!known) {
      return fail(`Checkpoint references unknown room "${String(roomId)}".`);
    }
    if (clearedRoomIds.includes(roomId as WingRoomId)) {
      return fail(`Checkpoint lists room "${String(roomId)}" twice.`);
    }
    clearedRoomIds.push(roomId as WingRoomId);
  }

  const offerIds = new Map<
    string,
    { readonly storeId: string; readonly itemDefinitionId: string }
  >();
  for (const room of wing.rooms) {
    for (const offer of room.offers) {
      offerIds.set(offer.id, {
        storeId: offer.storeId,
        itemDefinitionId: offer.itemDefinitionId,
      });
    }
  }
  const offerStatusResult = validateOfferStatus(value.offerStatus, new Set(offerIds.keys()));
  if (!offerStatusResult.ok) {
    return fail(offerStatusResult.reason);
  }

  if (!isRecord(value.inventory)) {
    return fail('Checkpoint is missing its inventory.');
  }
  let inventory: FusionInventoryState;
  try {
    inventory = cloneFusionInventory(value.inventory as unknown as FusionInventoryState);
  } catch {
    return fail('Checkpoint inventory failed validation.');
  }
  if (!isValidFusionInventoryState(inventory)) {
    return fail('Checkpoint inventory failed validation.');
  }
  if (inventory.cash !== cash) {
    return fail('Checkpoint inventory cash does not match its cash.');
  }
  try {
    const projected = projectFusionInventory(inventory);
    compileLoadout(
      ITEM_CATALOG,
      runCompilerInstances(projected.instances, projected.selectedPrimaryInstanceId),
      projected.selectedPrimaryInstanceId,
    );
  } catch {
    return fail('Checkpoint inventory cannot compile a loadout.');
  }

  const carriedResult = validateCarried(value.carried, offerStatusResult.offerStatus, offerIds);
  if (!carriedResult.ok) {
    return fail(carriedResult.reason);
  }

  return {
    ok: true,
    checkpoint: {
      version: MVP_CHECKPOINT_VERSION,
      seed,
      roomIndex,
      tick,
      cash,
      heat,
      suspicion,
      playerHealth,
      enteredFrom,
      clearedRoomIds,
      inventory,
      offerStatus: offerStatusResult.offerStatus,
      carried: carriedResult.carried,
    },
  };
}

/**
 * Rebuilds a run from a validated checkpoint. The destination room is built
 * from the seed and room index, so live enemies, projectiles, and surfaces are
 * never restored; only run-level state comes out of the checkpoint.
 */
export function restoreMvpRun(checkpoint: MvpCheckpoint): MvpRunState {
  const wing = generateWing(checkpoint.seed);
  const room = wing.rooms[checkpoint.roomIndex];
  if (!room) {
    throw new Error(`Checkpoint room index ${String(checkpoint.roomIndex)} is out of range.`);
  }

  const inventory = cloneFusionInventory(checkpoint.inventory);
  const combat = buildRoomCombatState(
    wing,
    checkpoint.roomIndex,
    checkpoint.enteredFrom,
    inventory,
    checkpoint.seed,
  );
  combat.tick = checkpoint.tick;
  combat.player.health = checkpoint.playerHealth;
  if (checkpoint.clearedRoomIds.includes(room.id)) {
    clearRoomEnemies(combat);
  }

  const state: MvpRunState = {
    seed: checkpoint.seed,
    wing,
    startingCash: wing.startingCash,
    tick: checkpoint.tick,
    paused: false,
    status: 'playing',
    roomIndex: checkpoint.roomIndex,
    room: {
      roomId: room.id,
      variantId: room.variantId,
      combat,
      cleared: !hasLivingEnemies(combat),
      enteredFrom: checkpoint.enteredFrom,
    },
    clearedRooms: [...checkpoint.clearedRoomIds],
    inventory,
    cash: checkpoint.cash,
    heat: checkpoint.heat,
    suspicion: checkpoint.suspicion,
    carried: checkpoint.carried.map((theft) => ({ ...theft })),
    offerStatus: { ...checkpoint.offerStatus },
    checkpoint: { roomIndex: checkpoint.roomIndex, tick: checkpoint.tick },
    summary: null,
    heldActions: { interact: false, steal: false, recall: false },
    recentChange: `Resumed the night shift in the ${room.name}.`,
    behaviorTrace: [],
  };
  state.room.combat.behaviorTrace = state.behaviorTrace;
  refreshRunLoadout(state);
  return state;
}
