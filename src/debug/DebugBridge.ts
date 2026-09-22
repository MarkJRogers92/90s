import type { RunState } from '../sim/model';
import type { CompiledPrimary } from '../sim/items/types';
import type { WingState } from '../sim/shop/types';

export type DebugMode = 'shift' | 'lab' | 'shop' | 'bench';

export type DebugSnapshot = {
  mode: DebugMode;
  /** Null when the bridge is built without an engine getter. */
  audio: { created: boolean; running: boolean; muted: boolean; played: number } | null;
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
  /** Null when the bridge is built without an engine getter. */
  audio: { created: boolean; running: boolean; muted: boolean; played: number } | null;
};

declare global {
  interface Window {
    __DEAD_MALL_DEBUG__?: {
      snapshot(): DebugSnapshot | WingDebugSnapshot | BenchDebugSnapshot | MvpRunDebugSnapshot;
    };
  }
}

/**
 * The engine surface the debug snapshots report, so acceptance can prove the
 * sound layer actually acted rather than only that nothing threw.
 */
export type DebugAudioSource = {
  readonly created: boolean;
  readonly running: boolean;
  readonly isMuted: boolean;
  readonly played: number;
};

/** Shared shaping of the audio field, so every bridge reports it identically. */
export function debugAudioFrom(getAudio?: () => DebugAudioSource | undefined): {
  created: boolean;
  running: boolean;
  muted: boolean;
  played: number;
} | null {
  const engine = getAudio?.();
  return engine
    ? {
        created: engine.created,
        running: engine.running,
        muted: engine.isMuted,
        played: engine.played,
      }
    : null;
}

export function installDebugBridge(
  getRun: () => RunState,
  getGeneration: () => number,
  getMode: () => DebugMode,
  getAudio?: () => DebugAudioSource | undefined,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): DebugSnapshot => {
        const state = getRun();
        return {
          mode: getMode(),
          audio: debugAudioFrom(getAudio),
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
  getAudio?: () => DebugAudioSource | undefined,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): WingDebugSnapshot => {
        const state = getWing();
        return {
          mode: 'shop',
          audio: debugAudioFrom(getAudio),
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
  /** Null when the bridge is built without an engine getter. */
  audio: { created: boolean; running: boolean; muted: boolean; played: number } | null;
};

export function installBenchDebugBridge(
  getBench: () => import('../sim/bench/types').BenchRunState,
  getGeneration: () => number,
  getAudio?: () => DebugAudioSource | undefined,
): () => void {
  Object.defineProperty(window, '__DEAD_MALL_DEBUG__', {
    configurable: true,
    value: {
      snapshot: (): BenchDebugSnapshot => {
        const state = getBench();
        return {
          mode: 'bench',
          audio: debugAudioFrom(getAudio),
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
  enemies: Array<{
    id: number;
    kind: string;
    x: number;
    y: number;
    health: number;
    /** Enemy phase, so acceptance can wait for a real telegraph window. */
    phase: string;
    /** Present only on the Loss Prevention Manager. */
    bossPhase: 1 | 2 | 3 | undefined;
  }>;
  carried: import('../sim/run/types').MvpRunState['carried'];
  inventory: import('../sim/run/types').MvpRunState['inventory'];
  checkpoint: import('../sim/run/types').MvpRunState['checkpoint'];
  summary: import('../sim/run/types').MvpRunState['summary'];
  recentChange: string;
  behaviorTrace: readonly string[];
  /** The owned Remote-Control Car, so acceptance can prove the firing origin. */
  carrier: import('../sim/run/types').MvpRunState['carrier'];
  /** Room-local shots, so acceptance can prove where an attack started. */
  projectiles: Array<{
    id: number;
    x: number;
    y: number;
    radius: number;
    /** Who fired it, so acceptance can tell a volley from the player's fire. */
    faction: 'enemy' | 'player';
    /**
     * Where the shot began, sampled from its recorded path when the tick kept
     * one. Origin is the honest way to prove a firing source; a shot's current
     * position drifts with travel, so comparing live positions is a proxy that
     * can be satisfied by a fast shot travelling away from the true origin.
     */
    originX: number;
    originY: number;
  }>;
  /** Whether the Bench Warrant preview is open. */
  previewOpen: boolean;
  /**
   * Audio engine state, so acceptance can prove the sound layer actually
   * started rather than only that nothing threw. `created` flips true once a
   * user gesture has unlocked Web Audio.
   */
  audio: {
    created: boolean;
    running: boolean;
    muted: boolean;
    /** Cues actually scheduled as voices, not merely decided. */
    played: number;
  } | null;
  /**
   * Effect counters, so acceptance can prove an effect was spawned rather than
   * only that its art loaded. Null without a view getter.
   */
  effects: { spawned: number; active: number } | null;
  /**
   * Decals on screen for the current room, so acceptance can prove the authored
   * floor damage reached the renderer rather than only the generator.
   */
  decals: { visible: number } | null;
};

export function installMvpRunDebugBridge(
  getRun: () => import('../sim/run/types').MvpRunState,
  getGeneration: () => number,
  getAudio?: () =>
    | { created: boolean; running: boolean; isMuted: boolean; played: number }
    | undefined,
  getEffects?: () => { spawned: number; active: number } | undefined,
  getDecals?: () => { visible: number } | undefined,
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
            phase: enemy.phase,
            bossPhase: enemy.bossPhase,
          })),
          carried: structuredClone(state.carried),
          inventory: structuredClone(state.inventory),
          checkpoint: state.checkpoint ? { ...state.checkpoint } : null,
          summary: state.summary ? structuredClone(state.summary) : null,
          recentChange: state.recentChange,
          behaviorTrace: [...state.behaviorTrace],
          carrier: state.carrier ? { ...state.carrier } : null,
          projectiles: state.room.combat.projectiles.map((shot) => {
            const sampled = shot.sampledPath?.[0];
            return {
              id: shot.id,
              x: shot.x,
              y: shot.y,
              radius: shot.radius,
              faction: shot.faction,
              originX: sampled?.x ?? shot.x,
              originY: sampled?.y ?? shot.y,
            };
          }),
          previewOpen: state.preview !== null,
          effects: getEffects?.() ?? null,
          decals: getDecals?.() ?? null,
          audio: (() => {
            const engine = getAudio?.();
            return engine
              ? {
                  created: engine.created,
                  running: engine.running,
                  muted: engine.isMuted,
                  played: engine.played,
                }
              : null;
          })(),
        };
      },
    },
  });

  return () => {
    delete window.__DEAD_MALL_DEBUG__;
  };
}
