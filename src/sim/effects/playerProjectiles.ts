import { sweptCircleIntersectsCircle, sweptCircleIntersectsRect } from '../combat/collision';
import { normalizedDirection, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../core/geometry';
import { freezeDeep } from '../items/types';
import type {
  ItemEffectSpec,
  ProjectileConversionEffect,
  ProjectileGeometryEffect,
  ProjectilePayloadEffect,
  StatusModifierEffect,
  TrajectoryReplayEffect,
  WetPatchSpec,
} from '../items/types';
import type {
  EnemyState,
  GameplayEvent,
  PlayerProjectileAncestry,
  PlayerProjectilePhase,
  PlayerProjectileSpec,
  PlayerProjectileState,
  ProjectileState,
  RunState,
  Vec2,
} from '../model';
import { reactionEffectsOf, resolveWetHitReaction, withOwningRoot } from './conduction';
import { queueChildEvent, recordBehaviorTrace, setRecentChange } from './events';
import { applySticky, applyWet, ensureEnemyStatuses } from './statuses';
import { createSurfacePatch } from './surfaces';

/**
 * True for a projectile that carries spawn-time compiled player behaviour.
 *
 * The projectile stage owns these shots end to end; hand-authored enemy
 * projectiles and M1 fixtures keep flowing through the generic sweep.
 */
export function isPlayerProjectile(
  projectile: ProjectileState,
): projectile is PlayerProjectileState {
  return (
    projectile.faction === 'player' &&
    projectile.payload !== undefined &&
    projectile.phase !== undefined &&
    projectile.sampledPath !== undefined &&
    projectile.sampledPathIndex !== undefined &&
    projectile.hitLedger !== undefined &&
    projectile.ancestry !== undefined &&
    projectile.hasBurst !== undefined
  );
}

/**
 * Compiles the spawn-time behaviour of one projectile.
 *
 * The stages are consumed in their canonical order: the authored
 * `projectile_payload` is the water shot, `projectile_conversion` may rewrite it
 * into a drifting bubble, and `projectile_geometry` widens and slows whatever
 * came out of the earlier stages. A loadout without a projectile payload has
 * nothing to fire, so this returns `null` rather than inventing a shot.
 */
export function buildPlayerProjectileSpec(
  effects: readonly ItemEffectSpec[],
): PlayerProjectileSpec | null {
  const payload = effects.find(
    (effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload',
  );
  if (!payload) {
    return null;
  }

  const conversion =
    payload.payloadKind === 'water'
      ? effects.find(
          (effect): effect is ProjectileConversionEffect =>
            effect.kind === 'projectile_conversion' && effect.converts === 'water_projectile',
        )
      : undefined;
  const geometryEffects = effects.filter(
    (effect): effect is ProjectileGeometryEffect => effect.kind === 'projectile_geometry',
  );
  const statusEffects = effects.filter(
    (effect): effect is StatusModifierEffect => effect.kind === 'status_modifier',
  );
  const replayEffect = effects.find(
    (effect): effect is TrajectoryReplayEffect => effect.kind === 'trajectory_replay',
  );
  const reactionEffects = reactionEffectsOf(effects);

  let delivery: PlayerProjectileSpec['delivery'] = 'water_projectile';
  let speed = payload.speed;
  let radius = payload.radius;
  let lifetimeTicks = payload.lifetimeTicks;
  let penetrates = false;
  let terminalWetPatch: WetPatchSpec | null = null;

  if (conversion) {
    delivery = 'drifting_bubble';
    speed = conversion.speed;
    radius = Math.max(radius, conversion.minRadius);
    lifetimeTicks = conversion.lifetimeTicks;
    penetrates = conversion.penetrates;
    terminalWetPatch = {
      radius: conversion.terminalWetPatch.radius,
      ticks: conversion.terminalWetPatch.ticks,
    };
  }

  for (const geometry of geometryEffects) {
    radius += geometry.radiusBonus;
    speed *= geometry.speedMultiplier;
  }

  const sourceItemIds = Array.from(
    new Set([
      payload.sourceItemId,
      ...(conversion ? [conversion.sourceItemId] : []),
      ...(replayEffect ? [replayEffect.sourceItemId] : []),
      ...geometryEffects.map((effect) => effect.sourceItemId),
      ...statusEffects.map((effect) => effect.sourceItemId),
      ...reactionEffects.map((effect) => effect.sourceItemId),
    ]),
  ).sort();

  return freezeDeep({
    delivery,
    payloadKind: payload.payloadKind,
    angularOffsetsRadians: [...payload.angularOffsetsRadians],
    damage: payload.damage,
    speed,
    radius,
    lifetimeTicks,
    onHitWetTicks: payload.onHit?.status === 'wet' ? payload.onHit.ticks : 0,
    penetrates,
    terminalWetPatch,
    returnPasses: replayEffect ? replayEffect.returnPasses : 0,
    payloadEffect: {
      sourceItemId: payload.sourceItemId,
      damage: payload.damage,
      speed: payload.speed,
      radius: payload.radius,
      lifetimeTicks: payload.lifetimeTicks,
      onHitWetTicks: payload.onHit?.status === 'wet' ? payload.onHit.ticks : 0,
    },
    conversionEffect: conversion
      ? {
          sourceItemId: conversion.sourceItemId,
          speed: conversion.speed,
          minRadius: conversion.minRadius,
          lifetimeTicks: conversion.lifetimeTicks,
          penetrates: conversion.penetrates,
          terminalWetPatch: {
            radius: conversion.terminalWetPatch.radius,
            ticks: conversion.terminalWetPatch.ticks,
          },
        }
      : null,
    replayEffect: replayEffect
      ? { sourceItemId: replayEffect.sourceItemId, returnPasses: replayEffect.returnPasses }
      : null,
    geometryEffects: geometryEffects.map((effect) => ({
      sourceItemId: effect.sourceItemId,
      radiusBonus: effect.radiusBonus,
      speedMultiplier: effect.speedMultiplier,
    })),
    statusEffects: [...statusEffects],
    reactionEffects: [...reactionEffects],
    sourceItemIds,
  });
}

export type PlayerProjectileSpawnRequest = {
  readonly root: GameplayEvent;
  readonly origin: Vec2;
  readonly aimX: number;
  readonly aimY: number;
};

function aimDirection(
  state: RunState,
  origin: Vec2,
  aimX: number,
  aimY: number,
): { x: number; y: number } {
  const toAim = normalizedDirection(aimX - origin.x, aimY - origin.y);
  if (toAim.x !== 0 || toAim.y !== 0) {
    return toAim;
  }
  const facing = normalizedDirection(state.player.facing.x, state.player.facing.y);
  return facing.x === 0 && facing.y === 0 ? { x: 1, y: 0 } : facing;
}

/** Rotates a unit vector by an authored pattern offset in radians. */
function rotated(direction: Vec2, angleRadians: number): Vec2 {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return {
    x: direction.x * cosine - direction.y * sine,
    y: direction.x * sine + direction.y * cosine,
  };
}

/**
 * Spawns the authoritative player projectiles for an accepted attack.
 *
 * One frozen spec is built for the trigger, then the origin-to-pointer unit
 * vector is rotated by every authored offset and one pellet is appended per
 * offset in stable catalog order. All pellets share the root action but
 * receive distinct entity IDs. Returns an empty array when the compiled
 * loadout authors no compatible projectile payload.
 */
export function spawnPlayerProjectiles(
  state: RunState,
  request: PlayerProjectileSpawnRequest,
): PlayerProjectileState[] {
  const spec = buildPlayerProjectileSpec(state.compiledLoadout.effects);
  if (!spec) {
    recordBehaviorTrace(
      state,
      `root ${request.root.eventId}: no compatible projectile payload to fire`,
    );
    setRecentChange(state, 'no compatible projectile payload');
    return [];
  }

  const baseDirection = aimDirection(state, request.origin, request.aimX, request.aimY);
  const spawned: PlayerProjectileState[] = [];
  for (const offset of spec.angularOffsetsRadians) {
    const direction = rotated(baseDirection, offset);
    const projectile: PlayerProjectileState = {
      id: state.nextEntityId,
      x: request.origin.x,
      y: request.origin.y,
      previousX: request.origin.x,
      previousY: request.origin.y,
      velocityX: direction.x * spec.speed,
      velocityY: direction.y * spec.speed,
      radius: spec.radius,
      remainingTicks: spec.lifetimeTicks,
      faction: 'player',
      damage: spec.damage,
      payload: spec,
      phase: 'outbound',
      sampledPath: [{ x: request.origin.x, y: request.origin.y }],
      sampledPathIndex: 0,
      hitLedger: { outbound: [], return: [] },
      ancestry: {
        rootActionId: request.root.rootActionId,
        parentEventId: request.root.eventId,
        generationDepth: request.root.generationDepth,
        procCoefficient: request.root.procCoefficient,
      },
      hasBurst: false,
    };
    state.nextEntityId += 1;
    state.projectiles.push(projectile);
    spawned.push(projectile);
    recordBehaviorTrace(
      state,
      `root ${request.root.eventId}: projectile ${projectile.id} spawned (${spec.delivery}, speed ${spec.speed}, radius ${spec.radius}, lifetime ${spec.lifetimeTicks})`,
    );

    if (spec.conversionEffect) {
      const conversionEvent = queueChildEvent(state, {
        rootActionId: projectile.ancestry.rootActionId,
        parentEventId: projectile.ancestry.parentEventId,
        generationDepth: projectile.ancestry.generationDepth + 1,
        originKind: 'conversion',
        sourceItemIds: [spec.conversionEffect.sourceItemId],
        procCoefficient: request.root.procCoefficient,
        description: 'water projectile converted to a drifting bubble',
      });
      if (conversionEvent) {
        // The conversion is the event that produced this shot, so everything the
        // projectile does next continues from it.
        projectile.ancestry = {
          rootActionId: conversionEvent.rootActionId,
          parentEventId: conversionEvent.eventId,
          generationDepth: conversionEvent.generationDepth,
          procCoefficient: conversionEvent.procCoefficient,
        };
      }
    }

    if (spec.returnPasses > 0 && spec.replayEffect) {
      queueChildEvent(state, {
        rootActionId: projectile.ancestry.rootActionId,
        parentEventId: projectile.ancestry.parentEventId,
        generationDepth: projectile.ancestry.generationDepth + 1,
        originKind: 'trajectory',
        sourceItemIds: [spec.replayEffect.sourceItemId],
        procCoefficient: request.root.procCoefficient,
        description: 'replay armed: one return pass for this root',
      });
    }
  }

  return spawned;
}

function describe(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function leftRoom(projectile: ProjectileState): boolean {
  return (
    projectile.x < -projectile.radius ||
    projectile.x > PLAYFIELD_WIDTH + projectile.radius ||
    projectile.y < -projectile.radius ||
    projectile.y > PLAYFIELD_HEIGHT + projectile.radius
  );
}

function struckWall(state: RunState, projectile: ProjectileState): boolean {
  return state.walls.some((wall) =>
    sweptCircleIntersectsRect(
      projectile.previousX,
      projectile.previousY,
      projectile.x,
      projectile.y,
      projectile.radius,
      wall,
    ),
  );
}

/**
 * Ends a projectile exactly once.
 *
 * A shot that authored a terminal patch or a return pass bursts; every other
 * shot simply spends itself. `hasBurst` makes the terminal burst idempotent, so
 * an impact, a wall and a return completion can never double-burst a shot.
 */
function terminateProjectile(
  state: RunState,
  projectile: PlayerProjectileState,
  reason: string,
): void {
  const spec = projectile.payload;
  if (!spec.terminalWetPatch && spec.returnPasses <= 0) {
    recordBehaviorTrace(
      state,
      `projectile ${projectile.id} spent: ${reason} at (${describe(projectile.x)}, ${describe(projectile.y)})`,
    );
    return;
  }
  if (projectile.hasBurst) {
    return;
  }
  projectile.hasBurst = true;
  recordBehaviorTrace(
    state,
    `projectile ${projectile.id} burst (${reason}) at (${describe(projectile.x)}, ${describe(projectile.y)})`,
  );

  const patch = spec.terminalWetPatch;
  if (!patch) {
    return;
  }
  const sourceItemIds = spec.conversionEffect
    ? [spec.conversionEffect.sourceItemId]
    : [...spec.sourceItemIds];
  withOwningRoot(state, projectile.ancestry.rootActionId, () => {
    const surface = createSurfacePatch(state, {
      x: projectile.x,
      y: projectile.y,
      radius: patch.radius,
      ticks: patch.ticks,
      rootActionId: projectile.ancestry.rootActionId,
      sourceItemIds,
    });
    queueChildEvent(state, {
      rootActionId: projectile.ancestry.rootActionId,
      parentEventId: projectile.ancestry.parentEventId,
      generationDepth: projectile.ancestry.generationDepth + 1,
      originKind: 'surface',
      sourceItemIds,
      procCoefficient: projectile.ancestry.procCoefficient,
      description: `Wet patch radius ${patch.radius} for ${patch.ticks} ticks`,
    });
    recordBehaviorTrace(
      state,
      `surface ${surface.id}: radius ${patch.radius} Wet for ${patch.ticks} ticks`,
    );
  });
  setRecentChange(state, `burst: Wet patch radius ${patch.radius} for ${patch.ticks} ticks`);
}

/** Applies one impact: damage, then Wet, then Sticky, then the reaction stage. */
function applyProjectileHit(
  state: RunState,
  projectile: PlayerProjectileState,
  target: EnemyState,
  phase: PlayerProjectilePhase,
): void {
  const spec = projectile.payload;
  const ancestry = projectile.ancestry;

  const impactEvent = withOwningRoot(state, ancestry.rootActionId, () =>
    queueChildEvent(state, {
      rootActionId: ancestry.rootActionId,
      parentEventId: ancestry.parentEventId,
      generationDepth: ancestry.generationDepth + 1,
      originKind: 'status_application',
      sourceItemIds: spec.sourceItemIds,
      procCoefficient: ancestry.procCoefficient,
      description: `projectile ${projectile.id} ${phase} pass hit target ${target.id}`,
    }),
  );

  target.health -= spec.damage;
  if (spec.onHitWetTicks > 0) {
    applyWet(target, spec.onHitWetTicks);
  }
  for (const statusEffect of spec.statusEffects) {
    if (statusEffect.status === 'sticky') {
      applySticky(target, statusEffect.ticks, statusEffect.slowMultiplier, statusEffect.slowFloor);
    }
  }
  const statuses = ensureEnemyStatuses(target);
  recordBehaviorTrace(
    state,
    `projectile ${projectile.id} ${phase} hit target ${target.id}: ${spec.damage} damage, Wet ${statuses.wetTicks}, Sticky ${statuses.stickyTicks}`,
  );
  setRecentChange(
    state,
    `water shot hit target ${target.id}: ${spec.damage} damage, Wet ${statuses.wetTicks}`,
  );

  // The reaction stage runs last so a chain or discharge message becomes the
  // visible recent change; it never re-enters this stage.
  resolveWetHitReaction(state, {
    rootActionId: ancestry.rootActionId,
    parentEventId: impactEvent?.eventId ?? ancestry.parentEventId,
    parentGenerationDepth: impactEvent?.generationDepth ?? ancestry.generationDepth,
    parentProcCoefficient: impactEvent?.procCoefficient ?? ancestry.procCoefficient,
    target,
    reactionEffects: spec.reactionEffects,
  });
}

/**
 * Applies one pass of hits, recording at most one hit per target per pass.
 *
 * Targets are considered in stable entity ID order. A penetrating shot keeps
 * travelling after every recorded hit; an ordinary shot stops at the first one.
 */
function applyPassHits(
  state: RunState,
  projectile: PlayerProjectileState,
  phase: PlayerProjectilePhase,
): boolean {
  const spec = projectile.payload;
  const ledger = phase === 'outbound' ? projectile.hitLedger.outbound : projectile.hitLedger.return;
  const targets = state.enemies
    .filter(
      (enemy) =>
        enemy.health > 0 &&
        !ledger.includes(enemy.id) &&
        sweptCircleIntersectsCircle(
          projectile.previousX,
          projectile.previousY,
          projectile.x,
          projectile.y,
          projectile.radius,
          enemy.x,
          enemy.y,
          enemy.radius,
        ),
    )
    .sort((first, second) => first.id - second.id);

  let hitAny = false;
  for (const target of targets) {
    applyProjectileHit(state, projectile, target, phase);
    ledger.push(target.id);
    hitAny = true;
    if (!spec.penetrates) {
      break;
    }
  }
  return hitAny;
}

/** Starts the single sampled-path return pass for an eligible shot. */
function beginReturnPass(state: RunState, projectile: PlayerProjectileState): boolean {
  const spec = projectile.payload;
  if (spec.returnPasses <= 0 || projectile.hasBurst || projectile.phase === 'return') {
    return false;
  }
  projectile.phase = 'return';
  projectile.sampledPathIndex = projectile.sampledPath.length - 1;
  projectile.remainingTicks = projectile.sampledPathIndex;
  recordBehaviorTrace(
    state,
    `projectile ${projectile.id} began return pass over ${projectile.sampledPathIndex} sampled steps (one replay per root)`,
  );
  setRecentChange(state, 'bubble returning along its sampled path');
  return true;
}

function stepAlongReturnPath(state: RunState, projectile: PlayerProjectileState): boolean {
  // The return pass retraces sampled nodes the outbound pass already proved
  // clear, so only entity impacts can end it early.
  const nextIndex = projectile.sampledPathIndex - 1;
  const node = nextIndex > 0 ? projectile.sampledPath[nextIndex] : projectile.sampledPath[0];
  if (!node || nextIndex <= 0) {
    if (node) {
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      projectile.x = node.x;
      projectile.y = node.y;
      projectile.velocityX = node.x - projectile.previousX;
      projectile.velocityY = node.y - projectile.previousY;
    }
    projectile.sampledPathIndex = 0;
    projectile.remainingTicks = 0;
    terminateProjectile(state, projectile, 'completed its return pass');
    return true;
  }

  projectile.previousX = projectile.x;
  projectile.previousY = projectile.y;
  projectile.x = node.x;
  projectile.y = node.y;
  projectile.velocityX = node.x - projectile.previousX;
  projectile.velocityY = node.y - projectile.previousY;
  projectile.sampledPathIndex = nextIndex;
  projectile.remainingTicks = nextIndex;

  const hit = applyPassHits(state, projectile, 'return');
  if (hit && !projectile.payload.penetrates) {
    terminateProjectile(state, projectile, 'hit an enemy on its return pass');
    return true;
  }
  return false;
}

function advanceOutboundPass(state: RunState, projectile: PlayerProjectileState): boolean {
  projectile.remainingTicks -= 1;
  if (projectile.remainingTicks <= 0) {
    if (beginReturnPass(state, projectile)) {
      return stepAlongReturnPath(state, projectile);
    }
    terminateProjectile(state, projectile, 'expired at the end of its outbound lifetime');
    return true;
  }

  projectile.x += projectile.velocityX;
  projectile.y += projectile.velocityY;
  projectile.sampledPath.push({ x: projectile.x, y: projectile.y });
  projectile.sampledPathIndex = projectile.sampledPath.length - 1;

  if (leftRoom(projectile)) {
    terminateProjectile(state, projectile, 'left the room');
    return true;
  }
  if (struckWall(state, projectile)) {
    terminateProjectile(state, projectile, 'destroyed by a wall');
    return true;
  }

  const hit = applyPassHits(state, projectile, 'outbound');
  if (hit && !projectile.payload.penetrates) {
    terminateProjectile(state, projectile, 'spent on its first target');
    return true;
  }
  return false;
}

/**
 * Advances and resolves every tracked player projectile by exactly one tick.
 *
 * The caller stages these projectiles out of the generic projectile sweep so a
 * shot moves once per tick, and appends the returned survivors afterwards.
 * Returns the survivors in stable entity ID order.
 */
export function updatePlayerProjectiles(
  state: RunState,
  playerProjectiles: readonly ProjectileState[],
): PlayerProjectileState[] {
  const ordered = [...playerProjectiles].sort((first, second) => first.id - second.id);
  const survivors: PlayerProjectileState[] = [];
  for (const projectile of ordered) {
    if (!isPlayerProjectile(projectile)) {
      continue;
    }
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    const destroyed =
      projectile.phase === 'return'
        ? stepAlongReturnPath(state, projectile)
        : advanceOutboundPass(state, projectile);
    if (!destroyed) {
      survivors.push(projectile);
    }
  }
  return survivors;
}
