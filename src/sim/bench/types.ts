import type { CarrierMode, CarrierState } from '../carrier/car';
import type { EmitterMountProposal, FusionInventoryState } from '../fusion/types';
import type { InputFrame, RunState } from '../model';

export type BenchScenarioId = 'clean-soaker' | 'stolen-popper' | 'unsupported-mop';

export type BenchRoomId = 'service' | 'test_bay';

// The carrier contract is shared with the M5 MVP run; this module only
// re-exports it so both runs cannot drift apart.
export type { CarrierMode, CarrierState };

export type BenchInputFrame = InputFrame & {
  readonly interact: boolean;
  readonly recall: boolean;
};

export type BenchRunState = {
  readonly seed: number;
  tick: number;
  paused: boolean;
  activeRoom: BenchRoomId;
  scenarioId: BenchScenarioId;
  fusion: FusionInventoryState;
  combat: RunState;
  carrier: CarrierState;
  preview: EmitterMountProposal | null;
  heldActions: { interact: boolean; recall: boolean };
  recentChange: string;
  behaviorTrace: string[];
};
