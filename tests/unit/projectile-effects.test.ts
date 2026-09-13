import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import {
  CONDUCTIVE_CHAIN_DAMAGE,
  CONDUCTIVE_WEAK_DISCHARGE_DAMAGE,
  STICKY_DURATION_TICKS,
  STICKY_SLOW_MULTIPLIER,
  WET_DURATION_TICKS,
} from '../../src/sim/effects/constants';
import {
  reactionEffectsOf,
  rememberActiveRootEventAllowance,
  resolveConductiveReaction,
  withOwningRoot,
} from '../../src/sim/effects/conduction';
import {
  beginRootAction,
  clearTransientRoomState,
  queueChildEvent,
} from '../../src/sim/effects/events';
import {
  isPlayerProjectile,
  updatePlayerProjectiles,
} from '../../src/sim/effects/playerProjectiles';
import { resolvePrimaryAttack } from '../../src/sim/effects/resolveAttack';
import {
  applyWet,
  effectiveSpeedMultiplier,
  ensureEnemyStatuses,
} from '../../src/sim/effects/statuses';
import { createSurfacePatch } from '../../src/sim/effects/surfaces';
import { tickRun } from '../../src/sim/tickRun';
import type {
  EnemyState,
  GameplayEvent,
  InputFrame,
  PlayerProjectileState,
  RunState,
} from '../../src/sim/model';
import { advance, frame } from '../helpers';

/** An empty room whose run owns exactly the supplied items. */
function labRun(itemIds: readonly string[], selectedItemId?: string): RunState {
  const state = createRun(
    7,
    selectedItemId === undefined ? { itemIds } : { itemIds, selectedItemId },
  );
  state.player.x = 300;
  state.player.y = 160;
  state.enemies = [];
  state.walls = [];
  state.roomWasPopulated = false;
  return state;
}

/**
 * A motionless enemy. Spitters never move and their telegraph timing is far
 * beyond these fixtures, so projectile geometry stays deterministic.
 */
function sentry(id: number, x: number, y: number, overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id,
    kind: 'spitter',
    x,
    y,
    health: 40,
    radius: 14,
    phase: 'recover',
    phaseTicks: 100_000,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    ...overrides,
  };
}

function fireAt(aimX = 900, aimY = 160): InputFrame {
  return { moveX: 0, moveY: 0, aimX, aimY, fire: true };
}

function playerShots(state: RunState): PlayerProjectileState[] {
  return state.projectiles.filter(isPlayerProjectile);
}

function shotOf(state: RunState): PlayerProjectileState {
  const shot = playerShots(state)[0];
  if (!shot) {
    throw new Error('expected one player projectile');
  }
  return shot;
}

function rootOf(state: RunState): GameplayEvent {
  return beginRootAction(state, {
    originKind: 'primary_attack',
    sourceItemIds: state.compiledLoadout.sourceItemIds,
  });
}

function reactionRequest(state: RunState, root: GameplayEvent, target: EnemyState) {
  return {
    rootActionId: root.rootActionId,
    parentEventId: root.eventId,
    parentGenerationDepth: root.generationDepth,
    parentProcCoefficient: root.procCoefficient,
    target,
    reactionEffects: reactionEffectsOf(state.compiledLoadout.effects),
  };
}

describe('spawn-time player projectile descriptor', () => {
  it('spawns an ordinary water projectile with frozen spawn-time state', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');

    const root = resolvePrimaryAttack(state, fireAt());

    expect(root).not.toBeNull();
    const shot = shotOf(state);
    expect(shot.payload).toMatchObject({
      delivery: 'water_projectile',
      damage: 2,
      speed: 3.2,
      radius: 6,
      lifetimeTicks: 80,
      onHitWetTicks: WET_DURATION_TICKS,
      penetrates: false,
      terminalWetPatch: null,
      returnPasses: 0,
    });
    expect(shot.ancestry).toEqual({
      rootActionId: 1,
      parentEventId: 'r1',
      generationDepth: 0,
      procCoefficient: 1,
    });
    expect(shot.phase).toBe('outbound');
    expect(shot.sampledPath).toEqual([{ x: 300, y: 160 }]);
    expect(shot.hitLedger).toEqual({ outbound: [], return: [] });
    expect(shot.hasBurst).toBe(false);
    expect(Object.isFrozen(shot.payload)).toBe(true);
    expect(shot.remainingTicks).toBe(80);
  });

  it('advances a staged player projectile exactly once per update', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    resolvePrimaryAttack(state, fireAt());
    const shot = shotOf(state);
    state.projectiles = [];

    const survivors = updatePlayerProjectiles(state, [shot]);

    expect(survivors).toHaveLength(1);
    expect(shot.x).toBeCloseTo(300 + 3.2, 10);
    expect(shot.y).toBe(160);
    expect(shot.sampledPath).toEqual([
      { x: 300, y: 160 },
      { x: 303.2, y: 160 },
    ]);
    expect(state.projectiles).toEqual([]);
  });

  it('keeps the spawn-time descriptor while the projectile is in flight', () => {
    const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');
    resolvePrimaryAttack(state, fireAt());
    const shot = shotOf(state);
    const spawnTimeLoadout = state.compiledLoadout;

    state.compiledLoadout = {
      ...spawnTimeLoadout,
      effects: [],
      sourceItemIds: ['janitor_mop'],
    };
    advance(state, frame(), 5);

    expect(shotOf(state).payload).toEqual(shot.payload);
    expect(shotOf(state).payload.delivery).toBe('drifting_bubble');
    expect(shotOf(state).payload.speed).toBe(2.5);
  });

  it('applies the nozzle to compatible projectiles and never to the player hitbox', () => {
    const plain = labRun(['pump_soaker'], 'pump_soaker');
    const widened = labRun(['pump_soaker', 'wide_nozzle'], 'pump_soaker');

    tickRun(plain, fireAt());
    tickRun(widened, fireAt());

    // Fresh shots hold their origin on the spawn tick, then travel normally.
    expect(shotOf(plain).x).toBe(300);
    expect(shotOf(widened).x).toBe(300);
    tickRun(plain, frame());
    tickRun(widened, frame());

    expect(shotOf(plain).payload.radius).toBe(6);
    expect(shotOf(plain).payload.speed).toBe(3.2);
    expect(shotOf(widened).payload.radius).toBe(10);
    expect(shotOf(widened).payload.speed).toBeCloseTo(3.2 * 0.8, 10);
    expect(widened.player.radius).toBe(plain.player.radius);
    expect(widened.player.radius).toBe(10);
    expect(shotOf(plain).x).toBeCloseTo(300 + 3.2, 10);
    expect(shotOf(widened).x).toBeCloseTo(300 + 3.2 * 0.8, 10);
  });

  it('converts a compatible water projectile into a drifting bubble', () => {
    const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');

    resolvePrimaryAttack(state, fireAt());

    const shot = shotOf(state);
    expect(shot.payload.delivery).toBe('drifting_bubble');
    expect(shot.payload.speed).toBe(2.5);
    expect(shot.payload.radius).toBeGreaterThanOrEqual(10);
    expect(shot.payload.lifetimeTicks).toBe(90);
    expect(shot.payload.penetrates).toBe(true);
    expect(shot.payload.terminalWetPatch).toEqual({ radius: 48, ticks: WET_DURATION_TICKS });
    expect(state.eventQueue.map((event) => event.originKind)).toEqual(['conversion']);
  });

  it('composes Bubble Bath and the nozzle in semantic stage order', () => {
    const state = labRun(['pump_soaker', 'bubble_bath', 'wide_nozzle'], 'pump_soaker');

    resolvePrimaryAttack(state, fireAt());

    const shot = shotOf(state);
    expect(shot.payload.radius).toBe(14);
    expect(shot.payload.speed).toBeCloseTo(2.5 * 0.8, 10);
    expect(shot.payload.lifetimeTicks).toBe(90);
    expect(shot.payload.terminalWetPatch).toEqual({ radius: 48, ticks: WET_DURATION_TICKS });
  });
});

describe('ordinary projectile impact', () => {
  it('applies damage, Wet and Sticky before the reaction stage and dies on the first hit', () => {
    const state = labRun(['pump_soaker', 'gel_pens', 'plasma_globe'], 'pump_soaker');
    const struck = sentry(20, 400, 160);
    const chained = sentry(21, 470, 160);
    state.enemies = [struck, chained];
    // The chain may only continue through an already-Wet neighbouring target.
    applyWet(chained, WET_DURATION_TICKS);

    let tick = 0;
    do {
      tickRun(state, tick === 0 ? fireAt() : frame());
      tick += 1;
    } while (playerShots(state).length > 0 && tick < 200);

    expect(tick).toBeLessThan(200);
    expect(struck.health).toBe(40 - 2);
    expect(ensureEnemyStatuses(struck).wetTicks).toBe(WET_DURATION_TICKS);
    expect(ensureEnemyStatuses(struck).stickyTicks).toBe(STICKY_DURATION_TICKS);
    expect(effectiveSpeedMultiplier(struck)).toBe(STICKY_SLOW_MULTIPLIER);
    expect(chained.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(playerShots(state)).toEqual([]);

    const trace = state.behaviorTrace.join('\n');
    expect(trace).toMatch(/outbound hit target 20/);
    expect(trace).toMatch(/Wet 180/);
    expect(trace).toMatch(/reaction stage after target 20/);
    expect(trace.indexOf('outbound hit target 20')).toBeLessThan(
      trace.indexOf('reaction stage after target 20'),
    );
  });

  it('hits only the first entity in stable ID order and is destroyed by the first wall', () => {
    const overlapping = labRun(['pump_soaker'], 'pump_soaker');
    overlapping.enemies = [sentry(30, 400, 160), sentry(31, 404, 160)];
    for (let tick = 0; tick < 40; tick += 1) {
      tickRun(overlapping, tick === 0 ? fireAt() : frame());
    }
    expect(overlapping.enemies.find((enemy) => enemy.id === 30)?.health).toBe(38);
    expect(overlapping.enemies.find((enemy) => enemy.id === 31)?.health).toBe(40);
    expect(playerShots(overlapping)).toEqual([]);

    const walled = labRun(['pump_soaker'], 'pump_soaker');
    walled.walls = [{ x: 340, y: 120, width: 20, height: 80 }];
    for (let tick = 0; tick < 30; tick += 1) {
      tickRun(walled, tick === 0 ? fireAt() : frame());
    }
    expect(playerShots(walled)).toEqual([]);
    expect(walled.surfaces).toEqual([]);
    expect(walled.behaviorTrace.join('\n')).toMatch(/wall/);
  });
});

describe('bubble behaviour', () => {
  it('penetrates and records one hit per target per pass', () => {
    const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');
    const first = sentry(40, 400, 160);
    const second = sentry(41, 440, 160);
    state.enemies = [first, second];

    let shot: PlayerProjectileState | null = null;
    for (let tick = 0; tick < 200; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
      const current = playerShots(state)[0];
      if (!current) {
        break;
      }
      shot = current;
      if (current.phase === 'outbound') {
        expect(current.hitLedger.outbound.length).toBeLessThanOrEqual(2);
      }
      expect(new Set(current.hitLedger.outbound).size).toBe(current.hitLedger.outbound.length);
      expect(new Set(current.hitLedger.return).size).toBe(current.hitLedger.return.length);
    }

    expect(first.health).toBe(40 - 2);
    expect(second.health).toBe(40 - 2);
    expect(shot?.hasBurst).toBe(true);
  });

  it('bursts into exactly one radius-48 Wet surface', () => {
    const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');
    state.enemies = [sentry(40, 400, 160)];

    for (let tick = 0; tick < 120; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
    }

    expect(state.surfaces).toHaveLength(1);
    const patch = state.surfaces[0];
    expect(patch?.kind).toBe('wet');
    expect(patch?.radius).toBe(48);
    expect(patch?.remainingTicks).toBeLessThanOrEqual(WET_DURATION_TICKS);
    expect(state.behaviorTrace.join('\n').match(/burst/g)).toHaveLength(1);
    expect(playerShots(state)).toEqual([]);
  });
});

describe('VHS rewind', () => {
  it('starts a return pass on outbound expiry and retraces the sampled path', () => {
    const state = labRun(['pump_soaker', 'bubble_bath', 'vhs_rewinder'], 'pump_soaker');
    const positions: number[] = [];
    let sawReturn = false;

    for (let tick = 0; tick < 400; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
      const shot = playerShots(state)[0];
      if (!shot) {
        break;
      }
      // The spawn tick holds the origin, so travel samples start next tick.
      if (tick > 0) {
        positions.push(shot.x);
      }
      if (shot.phase === 'return') {
        sawReturn = true;
      }
    }

    expect(sawReturn).toBe(true);
    expect(state.surfaces[0]?.x).toBeCloseTo(300, 10);
    // The return pass retraces the sampled nodes in reverse, then bursts on the
    // spawn node, so every returned position is a sampled outbound position.
    const peakIndex = positions.indexOf(Math.max(...positions));
    const returned = positions.slice(peakIndex + 1);
    const outbound = positions.slice(0, peakIndex + 1);
    expect(returned).toEqual([...outbound].reverse().slice(1));
    expect(state.surfaces).toHaveLength(1);
    expect(state.behaviorTrace.join('\n').match(/began return pass/g)).toHaveLength(1);
    expect(state.behaviorTrace.join('\n').match(/burst/g)).toHaveLength(1);
  });

  it('bursts exactly once at return completion and never re-arms the replay', () => {
    const state = labRun(['pump_soaker', 'vhs_rewinder'], 'pump_soaker');

    for (let tick = 0; tick < 400; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
      if (playerShots(state).length === 0 && tick > 1) {
        break;
      }
    }

    const trace = state.behaviorTrace.join('\n');
    expect(trace.match(/began return pass/g)).toHaveLength(1);
    expect(trace.match(/burst/g)).toHaveLength(1);
    expect(trace.match(/trajectory/g)).toHaveLength(1);
    expect(state.surfaces).toEqual([]);
    expect(playerShots(state)).toEqual([]);
  });

  it('hits each target once on the outbound pass and once on the return pass', () => {
    const state = labRun(['pump_soaker', 'bubble_bath', 'vhs_rewinder'], 'pump_soaker');
    const first = sentry(60, 400, 160);
    const second = sentry(61, 450, 160);
    state.enemies = [first, second];

    let outboundHits = 0;
    let returnHits = 0;
    for (let tick = 0; tick < 400; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
      const shot = playerShots(state)[0];
      if (!shot) {
        break;
      }
      outboundHits = Math.max(outboundHits, shot.hitLedger.outbound.length);
      returnHits = Math.max(returnHits, shot.hitLedger.return.length);
    }

    expect(outboundHits).toBe(2);
    expect(returnHits).toBe(2);
    expect(first.health).toBe(40 - 4);
    expect(second.health).toBe(40 - 4);
    expect(state.surfaces).toHaveLength(1);
  });

  it('never resurrects a wall-destroyed projectile', () => {
    const state = labRun(['pump_soaker', 'bubble_bath', 'vhs_rewinder'], 'pump_soaker');
    state.walls = [{ x: 340, y: 120, width: 20, height: 80 }];

    for (let tick = 0; tick < 60; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
    }

    const trace = state.behaviorTrace.join('\n');
    expect(trace).not.toMatch(/began return pass/);
    expect(trace.match(/burst/g)).toHaveLength(1);
    expect(state.surfaces).toHaveLength(1);
    expect(playerShots(state)).toEqual([]);
  });
});

describe('late projectile ancestry', () => {
  it('keeps the owning root action when the projectile resolves after a newer root', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    state.enemies = [sentry(50, 440, 160)];

    for (let tick = 0; tick < 80; tick += 1) {
      tickRun(state, fireAt());
    }

    const trace = state.behaviorTrace.join('\n');
    // The first shot lands after the second root action began; its impact still
    // belongs to root 1 and the per-root child allowance is preserved.
    expect(trace).toMatch(/drained r1\.\d+ \(status_application/);
    expect(state.counters.rootActions).toBeGreaterThan(1);
    expect(state.limitDiagnostics).toEqual([]);
  });

  it('preserves a root child-event allowance when the projectile re-enters it', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    const firstRoot = rootOf(state);
    queueChildEvent(state, {
      rootActionId: firstRoot.rootActionId,
      parentEventId: firstRoot.eventId,
      generationDepth: 1,
      originKind: 'reaction',
      sourceItemIds: ['plasma_globe'],
      procCoefficient: 1,
    });
    rememberActiveRootEventAllowance(state);

    const secondRoot = rootOf(state);
    expect(secondRoot.rootActionId).toBe(firstRoot.rootActionId + 1);
    expect(state.counters.childEventsThisRoot).toBe(0);

    const resumed = withOwningRoot(state, firstRoot.rootActionId, () =>
      queueChildEvent(state, {
        rootActionId: firstRoot.rootActionId,
        parentEventId: `${firstRoot.eventId}.1`,
        generationDepth: 2,
        originKind: 'reaction',
        sourceItemIds: ['plasma_globe'],
        procCoefficient: 1,
      }),
    );

    expect(resumed).toBeTruthy();
    expect(withOwningRoot(state, firstRoot.rootActionId, () => state.counters.childEventsThisRoot)).toBe(2);
    expect(resumed?.eventId).toBe(`${firstRoot.eventId}.1.2`);
    expect(state.counters.childEventsThisRoot).toBe(0);
  });
});

describe('conduction', () => {
  it('starts one chain per root action from an eligible Wet hit', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const first = sentry(11, 420, 160);
    const second = sentry(12, 500, 160);
    state.enemies = [struck, first, second];
    const root = rootOf(state);
    applyWet(struck, WET_DURATION_TICKS);
    applyWet(first, WET_DURATION_TICKS);
    applyWet(second, WET_DURATION_TICKS);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(first.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(second.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(ensureEnemyStatuses(first).wetTicks).toBe(WET_DURATION_TICKS);
    expect(ensureEnemyStatuses(second).wetTicks).toBe(WET_DURATION_TICKS);
    expect(state.behaviorTrace.join('\n')).toMatch(/visited \[10, 11, 12\]/);

    const before = first.health;
    resolveConductiveReaction(state, reactionRequest(state, root, first));
    expect(first.health).toBe(before);
    expect(second.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
  });

  it('orders eligible targets by distance and then by stable entity ID', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const nearerHighId = sentry(99, 420, 160);
    const fartherLowId = sentry(11, 480, 160);
    state.enemies = [struck, nearerHighId, fartherLowId];
    const root = rootOf(state);
    applyWet(struck, WET_DURATION_TICKS);
    applyWet(nearerHighId, WET_DURATION_TICKS);
    applyWet(fartherLowId, WET_DURATION_TICKS);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(state.behaviorTrace.join('\n')).toMatch(/visited \[10, 99, 11\]/);
  });

  it('reaches 150 units without the cord and 220 units with it', () => {
    const withoutCord = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const farTarget = sentry(11, 500, 160);
    withoutCord.enemies = [sentry(10, 340, 160), farTarget];
    const firstRoot = rootOf(withoutCord);
    applyWet(withoutCord.enemies[0] as EnemyState, WET_DURATION_TICKS);
    resolveConductiveReaction(withoutCord, reactionRequest(withoutCord, firstRoot, withoutCord.enemies[0] as EnemyState));
    expect(farTarget.health).toBe(40);
    expect(farTarget.statuses?.wetTicks ?? 0).toBe(0);

    const withCord = labRun(['janitor_mop', 'plasma_globe', 'extension_cord'], 'janitor_mop');
    const farTargetWithCord = sentry(11, 500, 160);
    withCord.enemies = [sentry(10, 340, 160), farTargetWithCord];
    const secondRoot = rootOf(withCord);
    applyWet(withCord.enemies[0] as EnemyState, WET_DURATION_TICKS);
    applyWet(farTargetWithCord, WET_DURATION_TICKS);
    resolveConductiveReaction(withCord, reactionRequest(withCord, secondRoot, withCord.enemies[0] as EnemyState));
    expect(farTargetWithCord.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(withCord.behaviorTrace.join('\n')).toMatch(/range 220/);
  });

  it('discharges weakly on the struck Wet target without a globe', () => {
    const state = labRun(['janitor_mop', 'extension_cord'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const neighbour = sentry(11, 420, 160);
    state.enemies = [struck, neighbour];
    const root = rootOf(state);
    applyWet(struck, WET_DURATION_TICKS);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(struck.health).toBe(40 - CONDUCTIVE_WEAK_DISCHARGE_DAMAGE);
    expect(neighbour.health).toBe(40);
    expect(state.eventQueue.map((event) => event.originKind)).toEqual(['reaction']);
  });

  it('upgrades the single globe reaction instead of duplicating it', () => {
    const state = labRun(['janitor_mop', 'plasma_globe', 'extension_cord'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const farTarget = sentry(11, 500, 160);
    state.enemies = [struck, farTarget];
    const root = rootOf(state);
    applyWet(struck, WET_DURATION_TICKS);
    applyWet(farTarget, WET_DURATION_TICKS);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(struck.health).toBe(40);
    expect(farTarget.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(state.eventQueue.map((event) => event.originKind)).toEqual(['reaction']);
    expect(state.behaviorTrace.join('\n')).not.toMatch(/weak discharge/);
  });

  it('never chains from a target that is not Wet', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const neighbour = sentry(11, 420, 160);
    state.enemies = [struck, neighbour];
    const root = rootOf(state);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(neighbour.health).toBe(40);
    expect(state.eventQueue).toEqual([]);
  });

  it('never wets or damages a dry nearby enemy that a chain hop could reach', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(10, 340, 160);
    const dry = sentry(11, 420, 160);
    state.enemies = [struck, dry];
    const root = rootOf(state);
    applyWet(struck, WET_DURATION_TICKS);

    resolveConductiveReaction(state, reactionRequest(state, root, struck));

    expect(dry.health).toBe(40);
    expect(dry.statuses?.wetTicks ?? 0).toBe(0);
    expect(state.behaviorTrace.join('\n')).toMatch(/visited \[10\]/);
  });

  it('does not invoke the primary impact hook from chain hits', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(10, 350, 160);
    const chained = sentry(11, 430, 160);
    state.enemies = [struck, chained];
    applyWet(chained, WET_DURATION_TICKS);

    tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });

    expect(struck.health).toBe(40 - 4);
    expect(chained.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);
    expect(state.eventQueue).toEqual([]);
    // One reaction capability event plus one chain hit: the chain never
    // re-enters the reaction stage or the primary impact hook.
    expect(state.counters.gameplayEvents).toBe(3);
    expect(state.counters.childEventsThisRoot).toBe(2);
    expect(state.counters.drainedEvents).toBe(2);
    expect(state.limitDiagnostics).toEqual([]);
  });
});

describe('Wet surfaces', () => {
  it('wets overlapping enemies and expires deterministically', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    const inside = sentry(20, 420, 160);
    const outside = sentry(21, 700, 160);
    state.enemies = [inside, outside];
    createSurfacePatch(state, {
      x: 400,
      y: 160,
      radius: 48,
      ticks: WET_DURATION_TICKS,
      rootActionId: 1,
      sourceItemIds: ['bubble_bath'],
    });

    tickRun(state, frame());
    expect(ensureEnemyStatuses(inside).wetTicks).toBe(WET_DURATION_TICKS);
    expect(ensureEnemyStatuses(outside).wetTicks).toBe(0);

    advance(state, frame(), WET_DURATION_TICKS - 2);
    expect(state.surfaces).toHaveLength(1);
    expect(ensureEnemyStatuses(inside).wetTicks).toBe(WET_DURATION_TICKS);
    expect(ensureEnemyStatuses(outside).wetTicks).toBe(0);

    tickRun(state, frame());
    expect(state.surfaces).toEqual([]);
    expect(inside.statuses?.wetTicks).toBe(WET_DURATION_TICKS - 1);
  });

  it('is removed with the rest of the transient room state', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    const patch = createSurfacePatch(state, {
      x: 400,
      y: 160,
      radius: 48,
      ticks: WET_DURATION_TICKS,
      rootActionId: 1,
      sourceItemIds: ['bubble_bath'],
    });
    expect(state.surfaces).toEqual([patch]);

    clearTransientRoomState(state);

    expect(state.surfaces).toEqual([]);
  });
});

describe('direct status modifiers', () => {
  it('applies damage, then Wet, then compiled Sticky before the reaction stage', () => {
    const state = labRun(['janitor_mop', 'gel_pens', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(20, 350, 160);
    const chained = sentry(21, 430, 160);
    state.enemies = [struck, chained];
    // The chain may only continue through an already-Wet target.
    applyWet(chained, WET_DURATION_TICKS);

    tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });

    expect(struck.health).toBe(40 - 4);
    const statuses = ensureEnemyStatuses(struck);
    expect(statuses.wetTicks).toBe(WET_DURATION_TICKS);
    expect(statuses.stickyTicks).toBe(STICKY_DURATION_TICKS);
    expect(statuses.stickyMultiplier).toBe(STICKY_SLOW_MULTIPLIER);
    expect(effectiveSpeedMultiplier(struck)).toBe(0.65);
    expect(chained.health).toBe(40 - CONDUCTIVE_CHAIN_DAMAGE);

    const trace = state.behaviorTrace.join('\n');
    const appliedIndex = trace.search(/target 20 took/);
    const reactionIndex = trace.search(/reaction stage after target 20/);
    expect(appliedIndex).toBeGreaterThanOrEqual(0);
    expect(reactionIndex).toBeGreaterThan(appliedIndex);
    expect(trace).toMatch(/took 4 damage, Wet 180, Sticky 90/);
  });
});

describe('projectile origins and authored patterns', () => {
  const degreesToRadians = Math.PI / 180;

  it('fires an authored spread from an explicit origin on one shared root action', () => {
    const state = labRun(['party_popper'], 'party_popper');
    tickRun(
      state,
      { moveX: 0, moveY: 0, aimX: 620, aimY: 160, fire: true },
      { projectileOrigin: { x: 420, y: 210 } },
    );
    const shots = playerShots(state);
    expect(shots).toHaveLength(3);
    expect(shots.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 420, y: 210 },
      { x: 420, y: 210 },
      { x: 420, y: 210 },
    ]);
    expect(state.counters.rootActions).toBe(1);
    expect(shots.map((shot) => shot.ancestry.rootActionId)).toEqual([1, 1, 1]);
    expect(new Set(shots.map((shot) => shot.id)).size).toBe(3);
  });

  it('keeps an ordinary Soaker shot to one projectile at the player position', () => {
    const state = labRun(['pump_soaker'], 'pump_soaker');
    tickRun(state, fireAt());
    const shots = playerShots(state);
    expect(shots).toHaveLength(1);
    expect({ x: shots[0]?.x, y: shots[0]?.y }).toEqual({ x: 300, y: 160 });
    expect(state.counters.rootActions).toBe(1);
  });

  it('aims Party Popper pellets along stable minus-eight, zero, plus-eight degree headings', () => {
    const state = labRun(['party_popper'], 'party_popper');
    tickRun(state, { moveX: 0, moveY: 0, aimX: 900, aimY: 160, fire: true });
    const shots = playerShots(state);
    expect(shots).toHaveLength(3);
    const headings = shots.map((shot) => Math.atan2(shot.velocityY, shot.velocityX));
    expect(headings[0]).toBeCloseTo(-8 * degreesToRadians, 10);
    expect(headings[1]).toBeCloseTo(0, 10);
    expect(headings[2]).toBeCloseTo(8 * degreesToRadians, 10);
    expect(shots[0]?.payload.payloadKind).toBe('physical');
    expect(shots[0]?.payload.angularOffsetsRadians).toEqual([
      -8 * degreesToRadians,
      0,
      8 * degreesToRadians,
    ]);
  });

  it('never applies Wet from a physical pellet impact', () => {
    const state = labRun(['party_popper'], 'party_popper');
    state.enemies = [sentry(20, 420, 160)];
    tickRun(state, { moveX: 0, moveY: 0, aimX: 900, aimY: 160, fire: true });
    expect(playerShots(state)).toHaveLength(3);
    for (const shot of playerShots(state)) {
      expect(shot.payload.onHitWetTicks).toBe(0);
    }
    advance(state, frame(), 40);
    const target = state.enemies[0];
    expect(target?.health).toBeLessThan(40);
    expect(target?.statuses?.wetTicks ?? 0).toBe(0);
  });

  it('never converts a physical pattern into a drifting bubble', () => {
    const state = labRun(['party_popper', 'bubble_bath'], 'party_popper');
    tickRun(state, fireAt());
    const shots = playerShots(state);
    expect(shots).toHaveLength(3);
    for (const shot of shots) {
      expect(shot.payload.delivery).toBe('water_projectile');
      expect(shot.payload.penetrates).toBe(false);
      expect(shot.payload.terminalWetPatch).toBeNull();
    }
    expect(state.eventQueue.some((event) => event.originKind === 'conversion')).toBe(false);
  });

  it('still applies Wide-Bore geometry and the Rewinder return pass to a physical pattern', () => {
    const patterned = labRun(['party_popper', 'wide_nozzle', 'vhs_rewinder'], 'party_popper');
    tickRun(patterned, fireAt());
    const shots = playerShots(patterned);
    expect(shots).toHaveLength(3);
    for (const shot of shots) {
      expect(shot.payload.radius).toBe(8);
      expect(shot.payload.speed).toBeCloseTo(4.2 * 0.8, 10);
      expect(shot.payload.returnPasses).toBe(1);
    }
  });
});
