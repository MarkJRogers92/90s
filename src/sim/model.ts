import type {
  CompiledLoadout,
  ConductiveRangeEffect,
  ConductiveReactionEffect,
  ItemInstance,
  ProjectilePayloadKind,
  StatusModifierEffect,
  WetPatchSpec,
} from './items/types';

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
  /**
   * Player-projectile stage only. Hand-authored enemy projectiles and M1
   * fixtures leave these unset, so the central tick can tell a tracked player
   * shot (compiled behaviour, sampled path, replay) from a plain projectile.
   */
  payload?: PlayerProjectileSpec;
  phase?: PlayerProjectilePhase;
  sampledPath?: Vec2[];
  sampledPathIndex?: number;
  hitLedger?: PlayerProjectileHitLedger;
  ancestry?: PlayerProjectileAncestry;
  hasBurst?: boolean;
};

/**
 * The two trajectory phases of a player projectile. A projectile starts
 * outbound; an eligible surviving shot with a replay effect retraces its
 * sampled path once and then bursts.
 */
export type PlayerProjectilePhase = 'outbound' | 'return';

/** The reaction capabilities that apply to a Wet hit, in compiled order. */
export type ReactionEffectSpec = ConductiveReactionEffect | ConductiveRangeEffect;

/**
 * Spawn-time compiled behaviour of one player projectile.
 *
 * Every field is resolved when the shot is fired and the whole descriptor is
 * frozen, so an in-flight projectile keeps the behaviour it was compiled with
 * even if later loadout state changes.
 */
export type PlayerProjectileSpec = {
  readonly delivery: 'water_projectile' | 'drifting_bubble';
  /** Generic water/physical kind from the authored payload; never an item ID. */
  readonly payloadKind: ProjectilePayloadKind;
  /** Authored fan offsets in radians, relative to aim, in stable catalog order. */
  readonly angularOffsetsRadians: readonly number[];
  readonly damage: number;
  /** World units per tick after conversion and geometry stages. */
  readonly speed: number;
  readonly radius: number;
  readonly lifetimeTicks: number;
  readonly onHitWetTicks: number;
  readonly penetrates: boolean;
  readonly terminalWetPatch: WetPatchSpec | null;
  readonly returnPasses: number;
  readonly payloadEffect: ProjectilePayloadSnapshot;
  readonly conversionEffect: ConversionSnapshot | null;
  readonly replayEffect: ReplaySnapshot | null;
  readonly geometryEffects: readonly ProjectileGeometrySnapshot[];
  readonly statusEffects: readonly StatusModifierEffect[];
  readonly reactionEffects: readonly ReactionEffectSpec[];
  readonly sourceItemIds: readonly string[];
};

type ProjectilePayloadSnapshot = {
  readonly sourceItemId: string;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly lifetimeTicks: number;
  readonly onHitWetTicks: number;
};

type ConversionSnapshot = {
  readonly sourceItemId: string;
  readonly speed: number;
  readonly minRadius: number;
  readonly lifetimeTicks: number;
  readonly penetrates: boolean;
  readonly terminalWetPatch: WetPatchSpec | null;
};

type ReplaySnapshot = {
  readonly sourceItemId: string;
  readonly returnPasses: number;
};

type ProjectileGeometrySnapshot = {
  readonly sourceItemId: string;
  readonly radiusBonus: number;
  readonly speedMultiplier: number;
};

/** One hit per target per pass: targets are recorded in visit order. */
export type PlayerProjectileHitLedger = {
  outbound: number[];
  return: number[];
};

/**
 * The gameplay event a projectile descends from, stamped at spawn time.
 *
 * `parentEventId` is the event that most recently produced the shot (the root
 * attack, or a conversion once Bubble Bath rewrote it) and
 * `generationDepth` is that event's depth, so impacts and bursts continue the
 * Task 2 ancestry instead of restarting it.
 */
export type PlayerProjectileAncestry = {
  readonly rootActionId: number;
  readonly parentEventId: string;
  readonly generationDepth: number;
  readonly procCoefficient: number;
};

/** A projectile with its spawn-time behaviour resolved. */
export type PlayerProjectileState = ProjectileState & {
  payload: PlayerProjectileSpec;
  phase: PlayerProjectilePhase;
  sampledPath: Vec2[];
  sampledPathIndex: number;
  hitLedger: PlayerProjectileHitLedger;
  ancestry: PlayerProjectileAncestry;
  hasBurst: boolean;
};

/**
 * A lingering room surface. Task 2 owns the shape and the cleanup contract;
 * Task 3 owns the authoritative Wet application and expiry in
 * `effects/surfaces.ts`.
 */
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

/**
 * Optional per-root bookkeeping, created on first use by the effect stages.
 *
 * Task 2's `childEventsThisRoot` allowance belongs to whichever root action is
 * active. A projectile can still be resolving after a newer root action has
 * started, so the projectile stage remembers each root's child-event count and
 * conductive chain starts here. Keeping it optional lets hand-authored M1
 * fixtures and mop-only runs stay exactly as they were.
 */
export type RootEffectLedger = {
  /** Child gameplay events created so far, keyed by root action ID. */
  childEventsByRoot: Record<string, number>;
  /** Conductive chains started so far, keyed by root action ID. */
  chainStartsByRoot: Record<string, number>;
};

/**
 * Generic caller-supplied attack context threaded through the shared tick.
 *
 * `projectileOrigin` overrides where projectile shots start; direct attacks
 * always originate from the player. Deep renderers (RC-car control in a later
 * task) supply an explicit origin, while ordinary play omits it.
 */
export type PrimaryAttackContext = {
  readonly projectileOrigin?: Vec2;
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
  /** Created lazily by the interaction stages. */
  rootEffectLedger?: RootEffectLedger;
};
