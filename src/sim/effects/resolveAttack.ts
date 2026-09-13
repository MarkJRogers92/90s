import type { AttackDelivery, CompiledPrimary } from '../items/types';
import { inAttackCone } from '../combat/attack';
import { hasLineOfSight } from '../combat/collision';
import type { EnemyState, GameplayEvent, InputFrame, RunState } from '../model';
import { ATTACK_ACTIVE_TICKS, DIRECT_HIT_WET_TICKS } from './constants';
import { beginRootAction, queueChildEvent, recordBehaviorTrace, setRecentChange } from './events';
import { applyWet } from './statuses';

/**
 * The capability view of a primary attack.
 *
 * The resolver reads only these fields, so authored catalog content never needs
 * a resolver change and an item definition ID is never branched on here.
 */
export type AttackDescriptor = {
  readonly definitionId: string;
  readonly name: string;
  readonly delivery: AttackDelivery;
  readonly damage: number;
  readonly cooldownTicks: number;
  readonly range: number;
  readonly halfAngleRadians: number;
  readonly speed: number;
};

/** Builds the descriptor an attack resolves against from the compiled loadout. */
export function attackDescriptorFromPrimary(primary: CompiledPrimary): AttackDescriptor {
  return {
    definitionId: primary.definitionId,
    name: primary.name,
    delivery: primary.delivery,
    damage: primary.damage,
    cooldownTicks: primary.cooldownTicks,
    range: primary.range,
    halfAngleRadians: primary.halfAngleRadians,
    speed: primary.speed,
  };
}

/** Eligible direct targets in stable entity-ID order. */
function directHitTargets(
  state: RunState,
  input: InputFrame,
  descriptor: AttackDescriptor,
): EnemyState[] {
  return state.enemies
    .filter(
      (enemy) =>
        enemy.health > 0 &&
        inAttackCone(
          state.player.x,
          state.player.y,
          input.aimX,
          input.aimY,
          enemy.x,
          enemy.y,
          enemy.radius,
          descriptor.range,
          descriptor.halfAngleRadians,
        ) &&
        hasLineOfSight(state.player.x, state.player.y, enemy.x, enemy.y, state.walls),
    )
    .sort((first, second) => first.id - second.id);
}

/**
 * Applies direct damage, then Wet, then the reusable reaction stage.
 *
 * Wet is applied before the reaction stage runs so every reaction can branch on
 * an already-Wet target.
 */
function resolveDirectHit(
  state: RunState,
  root: GameplayEvent,
  target: EnemyState,
  descriptor: AttackDescriptor,
): void {
  target.health -= descriptor.damage;
  applyWet(target, DIRECT_HIT_WET_TICKS);
  recordBehaviorTrace(
    state,
    `root ${root.eventId}: target ${target.id} took ${descriptor.damage} damage, Wet ${
      target.statuses?.wetTicks ?? 0
    }`,
  );
  runReactionStage(state, root, target);
}

/**
 * The reusable reaction stage.
 *
 * Task 2 only turns each compatible reaction capability into one bounded,
 * ancestried child event. Task 3 owns the authoritative reaction bodies
 * (conduction, range, discharge) that consume those events. Because a reaction
 * is only ever started from a root direct hit, a reaction-origin event can never
 * queue another reaction, so replay and chains cannot recurse.
 */
function runReactionStage(state: RunState, root: GameplayEvent, target: EnemyState): void {
  const reactionEffects = state.compiledLoadout.effects.filter(
    (effect) => effect.stage === 'reaction',
  );
  const wetTicks = target.statuses?.wetTicks ?? 0;
  if (reactionEffects.length === 0) {
    recordBehaviorTrace(
      state,
      `reaction stage after target ${target.id}: wet ${wetTicks}, no compatible reaction effect`,
    );
    return;
  }

  recordBehaviorTrace(
    state,
    `reaction stage after target ${target.id}: wet ${wetTicks}, ${reactionEffects.length} compatible effect(s)`,
  );
  for (const effect of reactionEffects) {
    queueChildEvent(state, {
      rootActionId: root.rootActionId,
      parentEventId: root.eventId,
      generationDepth: root.generationDepth + 1,
      originKind: 'reaction',
      sourceItemIds: [effect.sourceItemId],
      procCoefficient: root.procCoefficient,
      description: `${effect.kind} after Wet on target ${target.id}`,
    });
  }
}

/**
 * Resolves the player's primary attack for this tick from the compiled loadout.
 *
 * Returns the root gameplay event, or `null` when the attack was not accepted.
 */
export function resolvePrimaryAttack(state: RunState, input: InputFrame): GameplayEvent | null {
  if (!input.fire || state.player.attackCooldownTicks > 0) {
    return null;
  }

  const descriptor = attackDescriptorFromPrimary(state.compiledLoadout.primary);
  const root = beginRootAction(state, {
    originKind: 'primary_attack',
    sourceItemIds: state.compiledLoadout.sourceItemIds,
    procCoefficient: 1,
    description: `${descriptor.name} (${descriptor.delivery})`,
  });
  state.player.attackCooldownTicks = descriptor.cooldownTicks;
  state.player.attackActiveTicks = ATTACK_ACTIVE_TICKS;
  recordBehaviorTrace(
    state,
    `root ${root.eventId}: ${descriptor.name} ${descriptor.delivery} attack`,
  );

  if (descriptor.delivery !== 'direct') {
    // Task 3 owns the authoritative projectile spawn for projectile deliveries.
    setRecentChange(state, `${descriptor.name} fired`);
    recordBehaviorTrace(
      state,
      `root ${root.eventId}: projectile spawn and impact are owned by the projectile stage`,
    );
    return root;
  }

  const targets = directHitTargets(state, input, descriptor);
  if (targets.length === 0) {
    setRecentChange(state, `${descriptor.name} swing hit nothing`);
    recordBehaviorTrace(state, `root ${root.eventId}: no target inside ${descriptor.range} units`);
    return root;
  }

  for (const target of targets) {
    resolveDirectHit(state, root, target, descriptor);
  }
  setRecentChange(
    state,
    `${descriptor.name} soaked ${targets.length} target(s): Wet ${DIRECT_HIT_WET_TICKS}`,
  );
  return root;
}
