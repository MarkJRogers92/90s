import type {
  AttackDelivery,
  CompiledPrimary,
  ItemEffectSpec,
  StatusModifierEffect,
} from '../items/types';
import { inAttackCone } from '../combat/attack';
import { hasLineOfSight } from '../combat/collision';
import type { EnemyState, GameplayEvent, InputFrame, RunState } from '../model';
import { ATTACK_ACTIVE_TICKS, DIRECT_HIT_WET_TICKS } from './constants';
import { reactionEffectsOf, resolveWetHitReaction } from './conduction';
import { beginRootAction, recordBehaviorTrace, setRecentChange } from './events';
import { spawnPlayerProjectile } from './playerProjectiles';
import { applySticky, applyWet, ensureEnemyStatuses } from './statuses';

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
 * The compiled status modifiers a direct hit applies, filtered by the
 * discriminated effect kind.
 *
 * Filtering by kind (rather than matching an item definition ID or name) is
 * what makes the stage generic: any authored item that declares a
 * `status_modifier` gets the same treatment without a resolver change.
 */
function statusModifierEffectsOf(
  effects: readonly ItemEffectSpec[],
): StatusModifierEffect[] {
  return effects.filter(
    (effect): effect is StatusModifierEffect => effect.kind === 'status_modifier',
  );
}

/** Applies compiled status modifiers by their discriminated status kind. */
function applyStatusModifierEffects(
  target: EnemyState,
  effects: readonly StatusModifierEffect[],
): void {
  for (const effect of effects) {
    if (effect.status === 'sticky') {
      applySticky(target, effect.ticks, effect.slowMultiplier, effect.slowFloor);
    }
  }
}

/**
 * Applies direct damage, then Wet, then every compatible compiled
 * status_modifier, then the reusable reaction stage.
 *
 * Wet and the status modifiers are applied before the reaction stage runs so
 * every reaction can branch on an already-Wet target with its statuses already
 * in place.
 */
function resolveDirectHit(
  state: RunState,
  root: GameplayEvent,
  target: EnemyState,
  descriptor: AttackDescriptor,
  statusEffects: readonly StatusModifierEffect[],
): void {
  target.health -= descriptor.damage;
  applyWet(target, DIRECT_HIT_WET_TICKS);
  applyStatusModifierEffects(target, statusEffects);
  const statuses = ensureEnemyStatuses(target);
  recordBehaviorTrace(
    state,
    `root ${root.eventId}: target ${target.id} took ${descriptor.damage} damage, ` +
      `Wet ${statuses.wetTicks}, Sticky ${statuses.stickyTicks}`,
  );
  runReactionStage(state, root, target);
}

/**
 * The reusable reaction stage.
 *
 * Direct hits and projectile impacts share this stage, so a mop swing and a
 * water shot reach the same conduction rules. It never runs from a
 * reaction-origin event, so a chain can never queue another reaction.
 */
function runReactionStage(state: RunState, root: GameplayEvent, target: EnemyState): void {
  resolveWetHitReaction(state, {
    rootActionId: root.rootActionId,
    parentEventId: root.eventId,
    parentGenerationDepth: root.generationDepth,
    parentProcCoefficient: root.procCoefficient,
    target,
    reactionEffects: reactionEffectsOf(state.compiledLoadout.effects),
  });
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
    const projectile = spawnPlayerProjectile(state, {
      root,
      aimX: input.aimX,
      aimY: input.aimY,
    });
    if (projectile) {
      setRecentChange(state, `${descriptor.name} fired`);
    }
    return root;
  }

  const targets = directHitTargets(state, input, descriptor);
  if (targets.length === 0) {
    setRecentChange(state, `${descriptor.name} swing hit nothing`);
    recordBehaviorTrace(state, `root ${root.eventId}: no target inside ${descriptor.range} units`);
    return root;
  }

  const statusEffects = statusModifierEffectsOf(state.compiledLoadout.effects);
  for (const target of targets) {
    resolveDirectHit(state, root, target, descriptor, statusEffects);
  }
  setRecentChange(
    state,
    `${descriptor.name} soaked ${targets.length} target(s): Wet ${DIRECT_HIT_WET_TICKS}`,
  );
  return root;
}
