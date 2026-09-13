import type { RunState } from '../sim/model';

export type DebugSnapshot = {
  tick: number;
  paused: boolean;
  status: RunState['status'];
  player: RunState['player'];
  enemies: RunState['enemies'];
  projectiles: RunState['projectiles'];
};

declare global {
  interface Window {
    __DEAD_MALL_DEBUG__?: {
      snapshot(): DebugSnapshot;
    };
  }
}

export function installDebugBridge(getRun: () => RunState): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): DebugSnapshot => {
        const state = getRun();
        return {
          tick: state.tick,
          paused: state.paused,
          status: state.status,
          player: structuredClone(state.player),
          enemies: structuredClone(state.enemies),
          projectiles: structuredClone(state.projectiles),
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}
