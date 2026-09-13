import type { CompiledLoadout, ItemInstance } from './items/types';

export type RunStatus = 'playing' | 'won' | 'dead';
export type EnemyKind = 'hanger' | 'spitter';
export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type InputFrame = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
};

export type PlayerState = Vec2 & {
  health: number;
  radius: number;
  facing: Vec2;
  attackCooldownTicks: number;
  attackActiveTicks: number;
  invulnerableTicks: number;
};

/**
 * Deterministic Wet and Sticky durations for one enemy.
 *
 * `stickyMultiplier` is the strongest (lowest) already-floored slow currently
 * applied, so a weaker re-application can never cancel a stronger one.
 */
export type EnemyStatusState = {
  wetTicks: number;
  stickyTicks: number;
  stickyMultiplier: number;
};

export type EnemyState = Vec2 & {
  id: number;
  kind: EnemyKind;
  health: number;
  radius: number;
  phase: 'pursue' | 'telegraph' | 'recover';
  phaseTicks: number;
  cooldownTicks: number;
  telegraphAimX: number;
  telegraphAimY: number;
  /**
   * Optional so hand-authored M1 enemy fixtures stay valid: the status helpers
   * create it on first write and the central tick keeps it current afterwards.
   */
  statuses?: EnemyStatusState;
};

export type ProjectileState = Vec2 & {
  id: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  remainingTicks: number;
  faction: 'enemy' | 'player';
  damage: number;
};

/** A lingering room surface. Task 2 owns the shape and the cleanup contract only. */
export type SurfaceKind = 'wet';

export type SurfacePatchState = {
  id: number;
  kind: SurfaceKind;
  x: number;
  y: number;
  radius: number;
  remainingTicks: number;
  rootActionId: number;
  sourceItemIds: readonly string[];
};

/**
 * Discriminated origin of a gameplay event.
 *
 * The central tick and the attack resolver branch on these kinds, never on an
 * item definition ID.
 */
export type GameplayOriginKind =
  | 'primary_attack'
  | 'status_application'
  | 'conversion'
  | 'reaction'
  | 'trajectory'
  | 'surface';

/** Every gameplay event carries this deterministic ancestry. */
export type GameplayEventMeta = {
  readonly rootActionId: number;
  readonly eventId: string;
  readonly parentEventId: string | null;
  readonly generationDepth: number;
  readonly originKind: GameplayOriginKind;
  readonly sourceItemIds: readonly string[];
  readonly procCoefficient: number;
  readonly sequence: number;
};

export type GameplayEvent = GameplayEventMeta & {
  readonly description: string;
};

/** Bounded, player-visible bookkeeping for the root/child event pipeline. */
export type RunEventCounters = {
  rootActions: number;
  gameplayEvents: number;
  childEventsThisRoot: number;
  currentRootActionId: number | null;
  droppedEvents: number;
  drainedEvents: number;
};

export type RunState = {
  seed: number;
  tick: number;
  paused: boolean;
  status: RunStatus;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  walls: Rect[];
  nextEntityId: number;
  roomWasPopulated: boolean;
  rewardGranted: boolean;
  /** Owned item instances; exactly one of them is selected as the primary. */
  inventory: ItemInstance[];
  selectedPrimaryInstanceId: string;
  /** Immutable compiled behaviour the central tick consumes. */
  compiledLoadout: CompiledLoadout;
  surfaces: SurfacePatchState[];
  eventQueue: GameplayEvent[];
  counters: RunEventCounters;
  nextEventSequence: number;
  limitDiagnostics: string[];
  recentChange: string;
  behaviorTrace: string[];
};
