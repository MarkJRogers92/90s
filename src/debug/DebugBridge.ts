import type { RunState } from '../sim/model';
import type { CompiledPrimary } from '../sim/items/types';
import type { WingState } from '../sim/shop/types';

export type DebugMode = 'shift' | 'lab' | 'shop';

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

export type WingDebugSnapshot = {
  mode: 'shop';
  generation: number;
  tick: number;
  paused: boolean;
  status: WingState['status'];
  player: { x: number; y: number };
  cash: number;
  startingCash: number;
  heat: number;
  suspicion: number;
  carried: WingState['carried'];
  inventory: WingState['inventory'];
  offers: Array<{
    id: string;
    status: string;
    price: number;
    itemDefinitionId: string;
  }>;
  recentChange: string;
  behaviorTrace: readonly string[];
  summary: WingState['summary'];
};

declare global {
  interface Window {
    __DEAD_MALL_DEBUG__?: {
      snapshot(): DebugSnapshot | WingDebugSnapshot;
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

export function installWingDebugBridge(
  getWing: () => WingState,
  getGeneration: () => number,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): WingDebugSnapshot => {
        const state = getWing();
        return {
          mode: 'shop',
          generation: getGeneration(),
          tick: state.tick,
          paused: state.paused,
          status: state.status,
          player: { x: state.player.x, y: state.player.y },
          cash: state.cash,
          startingCash: state.startingCash,
          heat: state.heat,
          suspicion: state.suspicion,
          carried: state.carried ? structuredClone(state.carried) : null,
          inventory: structuredClone(state.inventory),
          offers: state.offers.map((offer) => ({
            id: offer.id,
            status: offer.status,
            price: offer.price,
            itemDefinitionId: offer.itemDefinitionId,
          })),
          recentChange: state.recentChange,
          behaviorTrace: [...state.behaviorTrace],
          summary: state.summary ? structuredClone(state.summary) : null,
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}
