import type { GameplayEvent, GameplayOriginKind, RunState } from '../model';
import {
  MAX_BEHAVIOR_TRACE_ENTRIES,
  MAX_CHILD_EVENTS_PER_ROOT,
  MAX_GENERATION_DEPTH,
  MAX_LIMIT_DIAGNOSTICS,
} from './constants';

/** Every origin kind the bounded event pipeline understands. */
export const GAMEPLAY_ORIGIN_KINDS: readonly GameplayOriginKind[] = Object.freeze([
  'primary_attack',
  'status_application',
  'conversion',
  'reaction',
  'trajectory',
  'surface',
]);

export type RootActionRequest = {
  readonly originKind: GameplayOriginKind;
  readonly sourceItemIds?: readonly string[];
  readonly procCoefficient?: number;
  readonly description?: string;
};

export type ChildEventRequest = {
  readonly rootActionId: number;
  readonly parentEventId: string | null;
  readonly generationDepth: number;
  readonly originKind: GameplayOriginKind;
  readonly sourceItemIds: readonly string[];
  readonly procCoefficient: number;
  readonly description?: string;
};

function sortedUniqueItemIds(itemIds: readonly string[] | undefined): readonly string[] {
  return Array.from(new Set(itemIds ?? [])).sort();
}

function normalizeProcCoefficient(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`procCoefficient must be a finite number, received ${String(value)}`);
  }
  return Math.max(0, Math.min(1, value));
}

/** Appends one line to the bounded, player-visible behaviour trace. */
export function recordBehaviorTrace(state: RunState, line: string): void {
  state.behaviorTrace.push(line);
  while (state.behaviorTrace.length > MAX_BEHAVIOR_TRACE_ENTRIES) {
    state.behaviorTrace.shift();
  }
}

/** Appends one visible limit diagnostic, keeping the newest bounded set. */
export function recordLimitDiagnostic(state: RunState, message: string): void {
  state.limitDiagnostics.push(message);
  while (state.limitDiagnostics.length > MAX_LIMIT_DIAGNOSTICS) {
    state.limitDiagnostics.shift();
  }
}

/** Replaces the concise player-visible description of the latest change. */
export function setRecentChange(state: RunState, text: string): void {
  state.recentChange = text;
}

/**
 * Starts a root action: allocates its identity and sequence number, resets the
 * per-root child allowance, and returns the root gameplay event.
 */
export function beginRootAction(state: RunState, request: RootActionRequest): GameplayEvent {
  state.counters.rootActions += 1;
  state.counters.gameplayEvents += 1;
  const rootActionId = state.counters.rootActions;
  state.counters.currentRootActionId = rootActionId;
  state.counters.childEventsThisRoot = 0;

  const event: GameplayEvent = {
    rootActionId,
    eventId: `r${rootActionId}`,
    parentEventId: null,
    generationDepth: 0,
    originKind: request.originKind,
    sourceItemIds: Object.freeze(sortedUniqueItemIds(request.sourceItemIds)),
    procCoefficient: normalizeProcCoefficient(request.procCoefficient, 1),
    sequence: state.nextEventSequence,
    description: request.description ?? `${request.originKind} root action`,
  };
  state.nextEventSequence += 1;
  return Object.freeze(event);
}

/**
 * Queues one child gameplay event under the active root action.
 *
 * Returns `null`, and records a visible limit diagnostic, when the root has
 * already created its maximum number of child events. Throws when the requested
 * generation depth is outside the authored ancestry budget.
 */
export function queueChildEvent(state: RunState, request: ChildEventRequest): GameplayEvent | null {
  if (!Number.isInteger(request.generationDepth) || request.generationDepth < 1) {
    throw new Error(
      `Child gameplay events need a generation depth of at least 1, received ${String(request.generationDepth)}`,
    );
  }
  if (request.generationDepth > MAX_GENERATION_DEPTH) {
    throw new Error(
      `Gameplay event generation depth ${request.generationDepth} exceeds the maximum depth of ${MAX_GENERATION_DEPTH}`,
    );
  }

  const activeRootActionId = state.counters.currentRootActionId;
  if (activeRootActionId === null || request.rootActionId !== activeRootActionId) {
    throw new Error(
      `Gameplay event belongs to root action ${request.rootActionId} but the active root action is ${String(activeRootActionId)}`,
    );
  }

  if (state.counters.childEventsThisRoot >= MAX_CHILD_EVENTS_PER_ROOT) {
    state.counters.droppedEvents += 1;
    recordLimitDiagnostic(
      state,
      `Root action ${request.rootActionId} reached the ${MAX_CHILD_EVENTS_PER_ROOT} child events per root limit; dropped a ${request.originKind} event`,
    );
    return null;
  }

  state.counters.childEventsThisRoot += 1;
  state.counters.gameplayEvents += 1;
  const parentEventId = request.parentEventId ?? `r${request.rootActionId}`;
  const event: GameplayEvent = {
    rootActionId: request.rootActionId,
    eventId: `${parentEventId}.${state.counters.childEventsThisRoot}`,
    parentEventId,
    generationDepth: request.generationDepth,
    originKind: request.originKind,
    sourceItemIds: Object.freeze(sortedUniqueItemIds(request.sourceItemIds)),
    procCoefficient: normalizeProcCoefficient(request.procCoefficient, 1),
    sequence: state.nextEventSequence,
    description: request.description ?? `${request.originKind} child event`,
  };
  state.nextEventSequence += 1;
  state.eventQueue.push(Object.freeze(event));
  return event;
}

/**
 * Drains the bounded child-event queue and returns how many events it resolved.
 *
 * Task 3 owns authoritative reaction resolution for drained events; this stage
 * records the deterministic drain so ancestry and limits stay observable.
 */
export function drainChildEvents(state: RunState): number {
  if (state.eventQueue.length === 0) {
    return 0;
  }
  const queued = state.eventQueue;
  state.eventQueue = [];
  for (const event of queued) {
    state.counters.drainedEvents += 1;
    recordBehaviorTrace(
      state,
      `drained ${event.eventId} (${event.originKind}, depth ${event.generationDepth})`,
    );
  }
  return queued.length;
}

/**
 * Removes transient room state on room clear or run restart.
 *
 * Enemy statuses are enemy state rather than room state, so they survive here.
 */
export function clearTransientRoomState(state: RunState): void {
  state.surfaces = [];
  state.projectiles = [];
  state.eventQueue = [];
  state.counters.currentRootActionId = null;
  state.counters.childEventsThisRoot = 0;
}
