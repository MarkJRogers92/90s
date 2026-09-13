import type { RunState } from '../sim/model';
import type { CompiledPrimary } from '../sim/items/types';

export type DebugMode = 'shift' | 'lab';

export type DebugSnapshot = {
  mode: DebugMode;
  generation: number;
  tick: number;
  paused: boolean;
  status: RunState['status'];
  player: RunState['player'];
  enemies: RunState['enemies'];
  projectiles: RunState['projectiles'];
  surfaces: RunState['surfaces'];
  inventory: RunState['inventory'];
  selectedPrimaryId: string;
  primary: CompiledPrimary;
  compatibilityNotes: readonly string[];
  compiledTrace: readonly string[];
  recentChange: string;
  behaviorTrace: readonly string[];
  limitDiagnostics: readonly string[];
};

declare global {
  interface Window {
    __DEAD_MALL_DEBUG__?: {
      snapshot(): DebugSnapshot;
    };
  }
}

export function installDebugBridge(
  getRun: () => RunState,
  getGeneration: () => number,
  getMode: () => DebugMode,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): DebugSnapshot => {
        const state = getRun();
        return {
          mode: getMode(),
          generation: getGeneration(),
          tick: state.tick,
          paused: state.paused,
          status: state.status,
          player: structuredClone(state.player),
          enemies: structuredClone(state.enemies),
          projectiles: structuredClone(state.projectiles),
          surfaces: structuredClone(state.surfaces),
          inventory: structuredClone(state.inventory),
          selectedPrimaryId: state.compiledLoadout.primary.definitionId,
          primary: structuredClone(state.compiledLoadout.primary),
          compatibilityNotes: [...state.compiledLoadout.compatibilityNotes],
          compiledTrace: [...state.compiledLoadout.trace],
          recentChange: state.recentChange,
          behaviorTrace: [...state.behaviorTrace],
          limitDiagnostics: [...state.limitDiagnostics],
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}
