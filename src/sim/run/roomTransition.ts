/**
 * Moving the run into another room of the wing.
 *
 * One place does it, so a doorway and the staff passage (round 57) leave the
 * old room and arrive in the new one the same way: the destination is rebuilt
 * deterministically from the seed, health rides over, a cleared room comes
 * back empty, the checkpoint moves to the new boundary, and nothing room-local
 * (alarm, stalker, held keys, the car's position) crosses with the janitor.
 */
import { clearRoomEnemies, buildRoomCombatState, hasLivingEnemies } from './rooms';
import { parkRunCarrier } from './carrier';
import { wantedStars } from './wanted';
import type { MvpRoomEntryFrom, MvpRunState } from './types';

/** Clears persistent interaction levels after blur, pause, or a transition. */
export function clearMvpHeldActions(state: MvpRunState): void {
  state.heldActions = { interact: false, steal: false, recall: false };
}

/** Rebuilds `destinationIndex` around the janitor, who comes in through the `enteringFrom` side. */
export function moveToRoom(state: MvpRunState, destinationIndex: number, enteringFrom: MvpRoomEntryFrom): void {
  const destination = state.wing.rooms[destinationIndex]!;
  const health = state.room.combat.player.health;
  const combat = buildRoomCombatState(
    state.wing,
    destinationIndex,
    enteringFrom,
    state.inventory,
    state.seed,
    wantedStars(state.heat),
  );
  // The wrapped room tracks the run's tick so a room boundary is exactly
  // reproducible and a restored checkpoint resumes on the same tick.
  combat.tick = state.tick;
  combat.player.health = health;
  combat.behaviorTrace = state.behaviorTrace;
  if (state.clearedRooms.includes(destination.id)) {
    clearRoomEnemies(combat);
  }

  state.roomIndex = destinationIndex;
  state.room = {
    roomId: destination.id,
    variantId: destination.variantId,
    combat,
    cleared: !hasLivingEnemies(combat),
    enteredFrom: enteringFrom,
    tokens: [],
    interior: false,
    storeIndex: 0,
    twist: null,
  };
  state.checkpoint = { roomIndex: destinationIndex, tick: state.tick };
  state.alarm = null;
  // Loss Prevention does not walk through the door with you; he follows.
  state.stalker = null;
  clearMvpHeldActions(state);
  // The car follows the shift through the doorway by being re-parked at the
  // destination's deterministic spot, never by carrying a position across.
  parkRunCarrier(state);
}
