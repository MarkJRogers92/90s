import type { EmitterMountProposal, FusionInventoryState } from '../fusion/types';
import type { InputFrame, RunState } from '../model';

export type BenchScenarioId = 'clean-soaker' | 'stolen-popper' | 'unsupported-mop';

export type BenchRoomId = 'service' | 'test_bay';

export type CarrierMode = 'independent' | 'emitter';

export type CarrierState = {
  mode: CarrierMode;
  x: number;
  y: number;
  radius: number;
  bumpCooldownTicks: number;
  recalling: boolean;
};

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
