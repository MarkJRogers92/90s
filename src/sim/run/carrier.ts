/**
 * The M5 run's Remote-Control Car.
 *
 * The physics is the shared carrier rule in `src/sim/carrier/car.ts`; this
 * module decides only whether the run owns a car, which mode it is in, where it
 * parks, and what the run's combat tick should use as a firing origin.
 *
 * Presence and mode are pure functions of the run inventory, never separate
 * saved state:
 *
 *   - an Emitter Mount composite means the car is fused and steers the shots;
 *   - an owned `emitter_carrier` leaf means the car is an independent companion;
 *   - neither means the run owns no car at all.
 *
 * That keeps the checkpoint honest. A checkpoint stores the inventory and the
 * room index only, so a restored run re-derives the car rather than restoring a
 * stale position, exactly as it rebuilds room-local enemies from the seed.
 */
import {
  createCarrierAt,
  enforceCarrierLeash,
  emitterProjectileOrigin,
  findCarrierSpawn,
  updateEmitterCarrier,
  updateIndependentCarrier,
} from '../carrier/car';
import type { CarrierMode } from '../carrier/car';
import { ITEM_CATALOG } from '../items/catalog';
import type { FusionInventoryState } from '../fusion/types';
import type { PrimaryAttackContext } from '../model';
import { publishRunFeedback } from './economy';
import type { MvpInputFrame, MvpRunState } from './types';

function definitionIsEmitterCarrier(itemDefinitionId: string): boolean {
  return (
    ITEM_CATALOG.find((definition) => definition.id === itemDefinitionId)?.capabilities?.includes(
      'emitter_carrier',
    ) === true
  );
}

/**
 * The mode the run's inventory implies, or null while it owns no carrier.
 *
 * `emitter_mount` is the only composite recipe, so any composite implies a
 * fused carrier; a composite wins over a leftover leaf because fusion consumes
 * the leaf that would otherwise make the car independent.
 */
export function carrierModeForInventory(
  inventory: FusionInventoryState,
): CarrierMode | null {
  let ownsCarrierLeaf = false;
  for (const node of inventory.inventory) {
    if (node.kind === 'composite') {
      // Branch on the recipe, not merely on "is a composite": Emitter Mount is
      // the one recipe that turns a car into its own firing origin, and a future
      // composite recipe must not silently promote the car too.
      if (node.recipeId !== 'emitter_mount') {
        continue;
      }
      return 'emitter';
    }
    if (definitionIsEmitterCarrier(node.itemDefinitionId)) {
      ownsCarrierLeaf = true;
    }
  }
  return ownsCarrierLeaf ? 'independent' : null;
}

/**
 * Brings the live carrier in line with the inventory.
 *
 * Called once per tick, before the carrier moves, so a purchase, a secured
 * theft, or a completed fusion is reflected without threading a call through
 * every economy and fusion path. A newly owned car parks beside the player; an
 * existing car keeps its position and only ever changes mode.
 */
export function syncRunCarrier(state: MvpRunState): void {
  const mode = carrierModeForInventory(state.inventory);
  if (mode === null) {
    state.carrier = null;
    return;
  }
  if (state.carrier === null) {
    const player = state.room.combat.player;
    const spawn = findCarrierSpawn(player, player.radius, state.room.combat.walls);
    state.carrier = createCarrierAt(spawn.x, spawn.y, mode);
    return;
  }
  state.carrier.mode = mode;
}

/**
 * Parks the carrier beside the player after a room change.
 *
 * A doorway never carries a car across the way room-local enemies are not
 * carried: the destination room is rebuilt, so the car is re-parked at the
 * destination's deterministic spot for the entry anchor.
 */
export function parkRunCarrier(state: MvpRunState): void {
  const carrier = state.carrier;
  if (carrier === null) {
    return;
  }
  const player = state.room.combat.player;
  const spawn = findCarrierSpawn(player, player.radius, state.room.combat.walls);
  carrier.x = spawn.x;
  carrier.y = spawn.y;
  carrier.recalling = false;
  // A room-local cooldown must not follow the car into a rebuilt room, where
  // every enemy is fresh; a restored shift already starts at zero, and the two
  // paths should agree on what "arriving in a fresh room" means.
  carrier.bumpCooldownTicks = 0;
}

/** Advances the carrier one tick: independent seek and bump, or fused steering. */
export function updateRunCarrier(state: MvpRunState, input: MvpInputFrame): void {
  const carrier = state.carrier;
  if (carrier === null) {
    return;
  }
  carrier.bumpCooldownTicks = Math.max(0, carrier.bumpCooldownTicks - 1);
  const player = state.room.combat.player;
  const walls = state.room.combat.walls;
  if (carrier.mode === 'independent') {
    updateIndependentCarrier(carrier, player, walls, state.room.combat.enemies);
    return;
  }
  updateEmitterCarrier(carrier, player, walls, input.aimX, input.aimY);
}

/** Edge-triggered recall, available only once the car is a firing origin. */
export function recallRunCarrier(state: MvpRunState): void {
  const carrier = state.carrier;
  if (carrier === null) {
    return;
  }
  if (carrier.mode !== 'emitter') {
    publishRunFeedback(state, 'Recall is available after Emitter Mount fusion.');
    return;
  }
  carrier.recalling = true;
  publishRunFeedback(state, 'Recall signal sent to the emitter car.');
}

/** Restores the leash after the shared combat tick has moved the player. */
export function enforceRunCarrierLeash(state: MvpRunState): void {
  if (state.carrier === null) {
    return;
  }
  enforceCarrierLeash(state.carrier, state.room.combat.player, state.room.combat.walls);
}

/**
 * The attack context the combat tick should use.
 *
 * A fused car is the firing origin; every other case omits the origin so shots
 * keep starting at the player.
 */
export function carrierAttackContext(state: MvpRunState): PrimaryAttackContext {
  const origin = emitterProjectileOrigin(state.carrier);
  return origin === null ? {} : { projectileOrigin: origin };
}
