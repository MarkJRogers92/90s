/**
 * Public plain-data contract for the M5 MVP run.
 *
 * The run wraps the preserved combat `RunState` exactly as M4's
 * `BenchRunState` does: the run owns cash, Heat, suspicion, the fusion
 * inventory, room transitions, and the checkpoint, while room-local enemies,
 * projectiles, and surfaces live in the wrapped combat state and are rebuilt
 * from the seed on every transition.
 */
import type { CarrierState } from '../carrier/car';
import type { EmitterMountProposal, FusionInventoryState } from '../fusion/types';
import type { RunState } from '../model';
import type { CarriedTheft, ShopOfferRuntimeStatus } from '../shop/types';
import type { GeneratedWing, WingRoomId } from '../wing/types';

export type MvpRunStatus = 'playing' | 'won' | 'dead';

/** Which side of the destination room the player came in through. */
export type MvpRoomEntryFrom = 'west' | 'east';

/**
 * The current room: immutable authored identity plus the room-local combat
 * state the run rebuilds deterministically whenever the room changes.
 */
export type MvpRoomState = {
  readonly roomId: WingRoomId;
  readonly variantId: string;
  combat: RunState;
  cleared: boolean;
  enteredFrom: MvpRoomEntryFrom;
};

/** Renderer-neutral held input for exactly one fixed simulation tick. */
export type MvpInputFrame = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  interact: boolean;
  steal: boolean;
  recall: boolean;
};

/**
 * The one contextual interaction the run would act on. Doors report their own
 * lock state so the HUD never has to infer whether a doorway is usable.
 */
export type MvpInteraction =
  | { readonly kind: 'offer'; readonly offerId: string; readonly label: string }
  | {
      readonly kind: 'door';
      readonly side: 'west' | 'east';
      readonly label: string;
      readonly locked: boolean;
      readonly lockedReason: string | null;
    }
  | { readonly kind: 'bench'; readonly label: string }
  | { readonly kind: 'none'; readonly label: string };

/** Every run command reports its own outcome; the HUD never infers success. */
export type MvpCommandResult =
  | { readonly accepted: true; readonly message: string }
  | { readonly accepted: false; readonly reason: string };

/** Immutable terminal snapshot, published exactly once when the run ends. */
export type MvpRunSummary = {
  readonly seed: number;
  readonly status: 'won' | 'dead';
  readonly roomIndex: number;
  readonly roomsCleared: number;
  readonly purchasedInstanceIds: readonly string[];
  readonly stolenInstanceIds: readonly string[];
  readonly cash: number;
  readonly heat: number;
  readonly tick: number;
};

/** The last room boundary the run can be resumed from. */
export type MvpCheckpointPoint = {
  readonly roomIndex: number;
  readonly tick: number;
};

export type MvpRunState = {
  readonly seed: number;
  readonly wing: GeneratedWing;
  readonly startingCash: number;
  tick: number;
  paused: boolean;
  status: MvpRunStatus;
  roomIndex: number;
  room: MvpRoomState;
  clearedRooms: WingRoomId[];
  inventory: FusionInventoryState;
  cash: number;
  heat: number;
  suspicion: number;
  carried: CarriedTheft[];
  offerStatus: Record<string, ShopOfferRuntimeStatus>;
  checkpoint: MvpCheckpointPoint | null;
  summary: MvpRunSummary | null;
  heldActions: { interact: boolean; steal: boolean; recall: boolean };
  recentChange: string;
  behaviorTrace: string[];
  /**
   * The Remote-Control Car, while the run owns one.
   *
   * Null until the inventory contains an emitter carrier. The carrier is
   * deliberately absent from the checkpoint: a restored run re-derives its
   * presence and mode from the checkpointed inventory and parks it
   * deterministically, exactly as the room itself is rebuilt from the seed.
   */
  carrier: CarrierState | null;
  /** The open Bench Warrant preview, which pauses the run while it is set. */
  preview: EmitterMountProposal | null;
};
