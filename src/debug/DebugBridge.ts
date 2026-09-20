import type { RunState } from '../sim/model';
import type { CompiledPrimary } from '../sim/items/types';
import type { WingState } from '../sim/shop/types';

export type DebugMode = 'shift' | 'lab' | 'shop' | 'bench';

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
      snapshot(): DebugSnapshot | WingDebugSnapshot | BenchDebugSnapshot | MvpRunDebugSnapshot;
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

export type BenchDebugSnapshot = {
  mode: 'bench';
  generation: number;
  tick: number;
  paused: boolean;
  status: RunState['status'];
  activeRoom: import('../sim/bench/types').BenchRoomId;
  scenarioId: import('../sim/bench/types').BenchScenarioId;
  player: { x: number; y: number };
  carrier: {
    mode: import('../sim/bench/types').CarrierMode;
    x: number;
    y: number;
    recalling: boolean;
  };
  cash: number;
  revision: number;
  preview: null | {
    fee: number;
    primaryName: string;
    carrierName: string;
    primaryProvenance: string;
    carrierProvenance: string;
  };
  projectiles: ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    faction: 'enemy' | 'player';
  }>;
  recentChange: string;
  behaviorTrace: readonly string[];
};

export function installBenchDebugBridge(
  getBench: () => import('../sim/bench/types').BenchRunState,
  getGeneration: () => number,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): BenchDebugSnapshot => {
        const state = getBench();
        return {
          mode: 'bench',
          generation: getGeneration(),
          tick: state.tick,
          paused: state.paused,
          status: state.combat.status,
          activeRoom: state.activeRoom,
          scenarioId: state.scenarioId,
          player: { x: state.combat.player.x, y: state.combat.player.y },
          carrier: {
            mode: state.carrier.mode,
            x: state.carrier.x,
            y: state.carrier.y,
            recalling: state.carrier.recalling,
          },
          cash: state.fusion.cash,
          revision: state.fusion.revision,
          preview: state.preview
            ? {
                fee: state.preview.fee,
                primaryName: state.preview.primaryName,
                carrierName: state.preview.carrierName,
                primaryProvenance: state.preview.primaryProvenance,
                carrierProvenance: state.preview.carrierProvenance,
              }
            : null,
          projectiles: state.combat.projectiles.map((projectile) => {
            const sampled = (
              projectile as unknown as {
                sampledPath?: ReadonlyArray<{ x: number; y: number }>;
              }
            ).sampledPath?.[0];
            return {
              id: projectile.id,
              x: projectile.x,
              y: projectile.y,
              originX: sampled?.x ?? projectile.x,
              originY: sampled?.y ?? projectile.y,
              faction: projectile.faction,
            };
          }),
          recentChange: state.recentChange,
          behaviorTrace: [...state.behaviorTrace],
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}

export type MvpRunDebugSnapshot = {
  mode: 'run';
  generation: number;
  tick: number;
  paused: boolean;
  status: import('../sim/run/types').MvpRunStatus;
  seed: number;
  roomIndex: number;
  roomId: string;
  cash: number;
  heat: number;
  suspicion: number;
  player: { x: number; y: number; health: number };
  enemies: Array<{ id: number; kind: string; x: number; y: number; health: number }>;
  carried: import('../sim/run/types').MvpRunState['carried'];
  inventory: import('../sim/run/types').MvpRunState['inventory'];
  checkpoint: import('../sim/run/types').MvpRunState['checkpoint'];
  summary: import('../sim/run/types').MvpRunState['summary'];
  recentChange: string;
  behaviorTrace: readonly string[];
  /** The owned Remote-Control Car, so acceptance can prove the firing origin. */
  carrier: import('../sim/run/types').MvpRunState['carrier'];
  /** Room-local shots, so acceptance can prove where an attack started. */
  projectiles: Array<{ id: number; x: number; y: number; radius: number }>;
  /** Whether the Bench Warrant preview is open. */
  previewOpen: boolean;
};

export function installMvpRunDebugBridge(
  getRun: () => import('../sim/run/types').MvpRunState,
  getGeneration: () => number,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): MvpRunDebugSnapshot => {
        const state = getRun();
        return {
          mode: 'run',
          generation: getGeneration(),
          tick: state.tick,
          paused: state.paused,
          status: state.status,
          seed: state.seed,
          roomIndex: state.roomIndex,
          roomId: state.room.roomId,
          cash: state.cash,
          heat: state.heat,
          suspicion: state.suspicion,
          player: {
            x: state.room.combat.player.x,
            y: state.room.combat.player.y,
            health: state.room.combat.player.health,
          },
          enemies: state.room.combat.enemies.map((enemy) => ({
            id: enemy.id,
            kind: enemy.kind,
            x: enemy.x,
            y: enemy.y,
            health: enemy.health,
          })),
          carried: structuredClone(state.carried),
          inventory: structuredClone(state.inventory),
          checkpoint: state.checkpoint ? { ...state.checkpoint } : null,
          summary: state.summary ? structuredClone(state.summary) : null,
          recentChange: state.recentChange,
          behaviorTrace: [...state.behaviorTrace],
          carrier: state.carrier ? { ...state.carrier } : null,
          projectiles: state.room.combat.projectiles.map((shot) => ({
            id: shot.id,
            x: shot.x,
            y: shot.y,
            radius: shot.radius,
          })),
          previewOpen: state.preview !== null,
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}
