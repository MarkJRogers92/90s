import type {
  EnemyState,
  GameplayEvent,
  ReactionEffectSpec,
  RootEffectLedger,
  RunState,
} from '../model';
import type { ItemEffectSpec } from '../items/types';
import {
  CONDUCTIVE_CHAIN_DAMAGE,
  CONDUCTIVE_WEAK_DISCHARGE_DAMAGE,
  WET_DURATION_TICKS,
} from './constants';
import { queueChildEvent, recordBehaviorTrace, setRecentChange } from './events';
import { applyWet } from './statuses';

/** The reaction capabilities of one compiled loadout, in compiled order. */
export function reactionEffectsOf(effects: readonly ItemEffectSpec[]): ReactionEffectSpec[] {
  return effects.filter(
    (effect): effect is ReactionEffectSpec =>
      effect.kind === 'conductive_reaction' || effect.kind === 'conductive_range',
  );
}

/** Returns the run's per-root bookkeeping, creating it on first use. */
export function ensureRootEffectLedger(state: RunState): RootEffectLedger {
  const existing = state.rootEffectLedger;
  if (existing) {
    return existing;
  }
  const created: RootEffectLedger = { childEventsByRoot: {}, chainStartsByRoot: {} };
  state.rootEffectLedger = created;
  return created;
}

/**
 * Remembers how many child events the active root action has created.
 *
 * The central tick calls this before accepting a new attack: a root action can
 * keep resolving through an in-flight projectile after a newer root has begun,
 * and re-entering the older root must not hand it a fresh 64-event allowance.
 * The ledger is only created once a root actually creates child events, so
 * mop-only runs keep exactly the Task 2 state shape.
 */
export function rememberActiveRootEventAllowance(state: RunState): void {
  const rootActionId = state.counters.currentRootActionId;
  if (rootActionId === null || state.counters.childEventsThisRoot === 0) {
    return;
  }
  ensureRootEffectLedger(state).childEventsByRoot[String(rootActionId)] =
    state.counters.childEventsThisRoot;
}

/**
 * Runs `body` with `rootActionId` as the active root action.
 *
 * The Task 2 event pipeline stamps children onto the active root and resets its
 * allowance whenever a root begins, so an effect that resolves later (a
 * projectile impact, a return pass, a burst) re-enters its owning root with the
 * allowance it already spent, and the counters are restored afterwards.
 */
export function withOwningRoot<T>(state: RunState, rootActionId: number, body: () => T): T {
  const counters = state.counters;
  const activeRootActionId = counters.currentRootActionId;
  if (activeRootActionId === rootActionId) {
    return body();
  }

  const ledger = ensureRootEffectLedger(state);
  const activeKey = activeRootActionId === null ? null : String(activeRootActionId);
  if (activeKey !== null && ledger.childEventsByRoot[activeKey] === undefined) {
    ledger.childEventsByRoot[activeKey] = counters.childEventsThisRoot;
  }

  const key = String(rootActionId);
  const previousActiveRootActionId = activeRootActionId;
  const previousChildEvents = counters.childEventsThisRoot;
  counters.currentRootActionId = rootActionId;
  counters.childEventsThisRoot = ledger.childEventsByRoot[key] ?? 0;
  try {
    return body();
  } finally {
    ledger.childEventsByRoot[key] = counters.childEventsThisRoot;
    counters.currentRootActionId = previousActiveRootActionId;
    counters.childEventsThisRoot = previousChildEvents;
  }
}

/**
 * The ancestry a Wet hit continues from.
 *
 * `parentEventId` is the event that carried the hit (the root attack for a
 * direct hit, the impact event for a projectile) and `generationDepth` is that
 * event's depth, so children stay inside the authored depth budget.
 */
export type WetHitReactionRequest = {
  readonly rootActionId: number;
  readonly parentEventId: string;
  readonly parentGenerationDepth: number;
  readonly parentProcCoefficient: number;
  readonly target: EnemyState;
  readonly reactionEffects: readonly ReactionEffectSpec[];
  /** Reaction capability events already queued, keyed by source item ID. */
  readonly capabilityEvents?: Readonly<Record<string, GameplayEvent>>;
};

export type ConductiveReactionResult = {
  /** Every target the chain reached, starting with the struck target. */
  readonly visitedTargetIds: readonly number[];
  readonly dischargedTargetIds: readonly number[];
  readonly range: number;
};

const EMPTY_RESULT: ConductiveReactionResult = Object.freeze({
  visitedTargetIds: Object.freeze([]) as readonly number[],
  dischargedTargetIds: Object.freeze([]) as readonly number[],
  range: 0,
});

/**
 * Applies the reusable reaction stage to one Wet hit.
 *
 * Task 2's bookkeeping is preserved exactly: one bounded, ancestried child
 * event per compatible reaction capability, drained later in the same tick.
 * The authoritative reaction bodies then run through
 * `resolveConductiveReaction`, which never re-enters this stage, so a reaction
 * can never create another reaction.
 */
export function resolveWetHitReaction(
  state: RunState,
  request: WetHitReactionRequest,
): ConductiveReactionResult {
  return withOwningRoot(state, request.rootActionId, () => {
    const reactionEffects = request.reactionEffects.filter(
      (effect) => effect.stage === 'reaction',
    );
    const wetTicks = request.target.statuses?.wetTicks ?? 0;
    if (reactionEffects.length === 0) {
      recordBehaviorTrace(
        state,
        `reaction stage after target ${request.target.id}: wet ${wetTicks}, no compatible reaction effect`,
      );
      return EMPTY_RESULT;
    }

    recordBehaviorTrace(
      state,
      `reaction stage after target ${request.target.id}: wet ${wetTicks}, ${reactionEffects.length} compatible effect(s)`,
    );

    const capabilityEvents: Record<string, GameplayEvent> = {};
    for (const effect of reactionEffects) {
      const event = queueChildEvent(state, {
        rootActionId: request.rootActionId,
        parentEventId: request.parentEventId,
        generationDepth: request.parentGenerationDepth + 1,
        originKind: 'reaction',
        sourceItemIds: [effect.sourceItemId],
        procCoefficient: request.parentProcCoefficient,
        description: `${effect.kind} after Wet on target ${request.target.id}`,
      });
      if (event) {
        capabilityEvents[effect.sourceItemId] = event;
      }
    }

    return resolveConductiveReaction(state, {
      ...request,
      reactionEffects,
      capabilityEvents,
    });
  });
}

export type ConductiveReactionRequest = {
  readonly rootActionId: number;
  readonly parentEventId: string;
  readonly parentGenerationDepth: number;
  readonly parentProcCoefficient: number;
  readonly target: EnemyState;
  readonly reactionEffects: readonly ReactionEffectSpec[];
  readonly capabilityEvents?: Readonly<Record<string, GameplayEvent>>;
};

/**
 * The next chain hop: the nearest already-Wet enemy that is inside range and
 * has not been visited yet, choosing by distance and then stable entity ID.
 *
 * Eligibility is decided from the target's state *before* this hop resolves,
 * so a hop can only continue through Wet targets that already existed when it
 * was selected. A dry enemy is never eligible, which stops a chain from
 * Wetting a new target and then continuing through it.
 */
function nearestEligibleTarget(
  state: RunState,
  from: EnemyState,
  range: number,
  visited: readonly number[],
): EnemyState | null {
  let best: EnemyState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || enemy.id === from.id || visited.includes(enemy.id)) {
      continue;
    }
    if ((enemy.statuses?.wetTicks ?? 0) <= 0) {
      continue;
    }
    const distance = Math.hypot(enemy.x - from.x, enemy.y - from.y);
    if (distance > range) {
      continue;
    }
    if (distance < bestDistance || (distance === bestDistance && best !== null && enemy.id < best.id)) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Resolves the single bounded reaction for one eligible Wet hit.
 *
 * The Plasma Globe capability starts one chain per root action: it hops to at
 * most `maxAdditionalTargets` other living enemies that are already Wet when
 * the hop selects them, choosing by distance then stable entity ID, visiting
 * each target once, and refreshing the Wet it qualified with. The Extension
 * Cord capability only widens the reach of that one reaction; on its own it
 * applies one weak discharge to the struck Wet target. Chain hops never invoke
 * the primary impact hook or the reaction stage again.
 */
export function resolveConductiveReaction(
  state: RunState,
  request: ConductiveReactionRequest,
): ConductiveReactionResult {
  const chain = request.reactionEffects.find((effect) => effect.kind === 'conductive_reaction');
  const cord = request.reactionEffects.find((effect) => effect.kind === 'conductive_range');
  if (!chain && !cord) {
    return EMPTY_RESULT;
  }

  const wetTicks = request.target.statuses?.wetTicks ?? 0;
  if (wetTicks <= 0) {
    recordBehaviorTrace(
      state,
      `conductive reaction skipped: target ${request.target.id} is not Wet`,
    );
    return EMPTY_RESULT;
  }

  const range = cord ? cord.range : chain ? chain.baseRange : 0;

  if (chain) {
    const ledger = ensureRootEffectLedger(state);
    const key = String(request.rootActionId);
    const started = ledger.chainStartsByRoot[key] ?? 0;
    if (started >= chain.chainStartsPerRoot) {
      recordBehaviorTrace(
        state,
        `conductive chain skipped: root r${request.rootActionId} already started its ${chain.chainStartsPerRoot} chain(s)`,
      );
      return EMPTY_RESULT;
    }
    ledger.chainStartsByRoot[key] = started + 1;

    const chainParent = request.capabilityEvents?.[chain.sourceItemId] ?? null;
    const visited: number[] = [request.target.id];
    let current: EnemyState = request.target;
    let hops = 0;
    while (hops < chain.maxAdditionalTargets) {
      const next = nearestEligibleTarget(state, current, range, visited);
      if (!next) {
        break;
      }
      next.health -= CONDUCTIVE_CHAIN_DAMAGE;
      applyWet(next, WET_DURATION_TICKS);
      queueChildEvent(state, {
        rootActionId: request.rootActionId,
        parentEventId: chainParent?.eventId ?? request.parentEventId,
        generationDepth: (chainParent?.generationDepth ?? request.parentGenerationDepth) + 1,
        originKind: 'reaction',
        sourceItemIds: [chain.sourceItemId],
        procCoefficient: request.parentProcCoefficient,
        description: `conductive chain hop ${hops + 1} reached target ${next.id}`,
      });
      visited.push(next.id);
      current = next;
      hops += 1;
    }

    recordBehaviorTrace(
      state,
      `conductive chain (root r${request.rootActionId}): visited [${visited.join(', ')}] (range ${range}, hop damage ${CONDUCTIVE_CHAIN_DAMAGE})`,
    );
    if (visited.length > 1) {
      setRecentChange(state, `conductive chain reached ${visited.length - 1} more Wet target(s)`);
    }
    return {
      visitedTargetIds: visited,
      dischargedTargetIds: [],
      range,
    };
  }

  if (cord && cord.weakDischarge) {
    request.target.health -= CONDUCTIVE_WEAK_DISCHARGE_DAMAGE;
    const cordParent = request.capabilityEvents?.[cord.sourceItemId] ?? null;
    queueChildEvent(state, {
      rootActionId: request.rootActionId,
      parentEventId: cordParent?.eventId ?? request.parentEventId,
      generationDepth: (cordParent?.generationDepth ?? request.parentGenerationDepth) + 1,
      originKind: 'reaction',
      sourceItemIds: [cord.sourceItemId],
      procCoefficient: request.parentProcCoefficient,
      description: `weak discharge on Wet target ${request.target.id}`,
    });
    recordBehaviorTrace(
      state,
      `weak discharge on target ${request.target.id}: ${CONDUCTIVE_WEAK_DISCHARGE_DAMAGE} damage (range ${range})`,
    );
    setRecentChange(state, `weak discharge arced to target ${request.target.id}`);
    return {
      visitedTargetIds: [request.target.id],
      dischargedTargetIds: [request.target.id],
      range,
    };
  }

  return EMPTY_RESULT;
}
