import { describe, expect, it } from 'vitest';
import {
  GENERAL_SLOW_FLOOR,
  MAX_BEHAVIOR_TRACE_ENTRIES,
  MAX_CHILD_EVENTS_PER_ROOT,
  MAX_GENERATION_DEPTH,
  MAX_LIMIT_DIAGNOSTICS,
  STICKY_DURATION_TICKS,
  STICKY_SLOW_MULTIPLIER,
  WET_DURATION_TICKS,
} from '../../src/sim/effects/constants';
import {
  beginRootAction,
  clearTransientRoomState,
  drainChildEvents,
  queueChildEvent,
  recordBehaviorTrace,
  recordLimitDiagnostic,
} from '../../src/sim/effects/events';
import {
  applySticky,
  applyWet,
  effectiveSpeedMultiplier,
  ensureEnemyStatuses,
} from '../../src/sim/effects/statuses';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { tickRun } from '../../src/sim/tickRun';
import type {
  EnemyState,
  GameplayEvent,
  ProjectileState,
  RunState,
  SurfacePatchState,
} from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function hangerAt(x: number, y: number, overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 20,
    kind: 'hanger',
    x,
    y,
    health: 12,
    radius: 10,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    ...overrides,
  };
}

function spitterAt(x: number, y: number, overrides: Partial<EnemyState> = {}): EnemyState {
  return hangerAt(x, y, { id: 21, kind: 'spitter', radius: 16, phase: 'recover', ...overrides });
}

/** A room holding one motionless enemy so status ticks can be observed in isolation. */
function idleFixture(): RunState {
  const state = emptyFixture();
  state.enemies = [spitterAt(700, 400, { phaseTicks: 100_000 })];
  return state;
}

function childRequest(root: GameplayEvent, generationDepth: number) {
  return {
    rootActionId: root.rootActionId,
    parentEventId: root.eventId,
    generationDepth,
    originKind: 'reaction' as const,
    sourceItemIds: ['plasma_globe'],
    procCoefficient: root.procCoefficient,
  };
}

describe('authored interaction constants', () => {
  it('matches the numbers authored in the item catalog', () => {
    expect(WET_DURATION_TICKS).toBe(180);
    expect(STICKY_DURATION_TICKS).toBe(90);
    expect(STICKY_SLOW_MULTIPLIER).toBe(0.65);
    expect(GENERAL_SLOW_FLOOR).toBe(0.5);

    const payload = ITEM_CATALOG.find((definition) => definition.id === 'pump_soaker')?.effects[0];
    expect(payload).toMatchObject({ kind: 'projectile_payload', onHit: { status: 'wet' } });
    expect((payload as { onHit: { ticks: number } }).onHit.ticks).toBe(WET_DURATION_TICKS);

    const sticky = ITEM_CATALOG.find((definition) => definition.id === 'gel_pens')?.effects[0];
    expect(sticky?.kind).toBe('status_modifier');
    expect(sticky).toMatchObject({
      status: 'sticky',
      ticks: STICKY_DURATION_TICKS,
      slowMultiplier: STICKY_SLOW_MULTIPLIER,
      slowFloor: GENERAL_SLOW_FLOOR,
    });
  });

  it('bounds generation depth at 4 and each root at 64 child events', () => {
    expect(MAX_GENERATION_DEPTH).toBe(4);
    expect(MAX_CHILD_EVENTS_PER_ROOT).toBe(64);
  });
});

describe('Wet status', () => {
  it('refreshes to the longer remaining duration instead of stacking or shortening', () => {
    const enemy = hangerAt(500, 160);
    applyWet(enemy, 120);
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(120);

    applyWet(enemy, 60);
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(120);

    applyWet(enemy, WET_DURATION_TICKS);
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(WET_DURATION_TICKS);
  });
});

describe('Sticky status', () => {
  it('keeps the strongest slow and never drops movement below the 0.5 floor', () => {
    const enemy = hangerAt(500, 160);
    expect(effectiveSpeedMultiplier(enemy)).toBe(1);

    applySticky(enemy, STICKY_DURATION_TICKS, STICKY_SLOW_MULTIPLIER);
    expect(effectiveSpeedMultiplier(enemy)).toBe(STICKY_SLOW_MULTIPLIER);

    applySticky(enemy, 45, 0.8);
    expect(effectiveSpeedMultiplier(enemy)).toBe(STICKY_SLOW_MULTIPLIER);

    const floored = hangerAt(500, 160);
    applySticky(floored, STICKY_DURATION_TICKS, 0.2);
    expect(effectiveSpeedMultiplier(floored)).toBe(GENERAL_SLOW_FLOOR);
  });
});

describe('deterministic status expiry', () => {
  it('ticks Wet down by one per tick and clears Sticky exactly when it runs out', () => {
    const state = idleFixture();
    const enemy = state.enemies[0];
    if (!enemy) {
      throw new Error('fixture missing enemy');
    }
    applyWet(enemy, WET_DURATION_TICKS);
    applySticky(enemy, STICKY_DURATION_TICKS, STICKY_SLOW_MULTIPLIER);

    advance(state, frame(), STICKY_DURATION_TICKS - 1);
    expect(ensureEnemyStatuses(enemy).stickyTicks).toBe(1);
    expect(effectiveSpeedMultiplier(enemy)).toBe(STICKY_SLOW_MULTIPLIER);

    tickRun(state, frame());
    expect(ensureEnemyStatuses(enemy).stickyTicks).toBe(0);
    expect(effectiveSpeedMultiplier(enemy)).toBe(1);
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(WET_DURATION_TICKS - STICKY_DURATION_TICKS);

    advance(state, frame(), WET_DURATION_TICKS - STICKY_DURATION_TICKS);
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(0);
  });
});

describe('Sticky movement application', () => {
  it('slows a Sticky Hanger to the authored multiplier', () => {
    const plain = emptyFixture();
    plain.enemies = [hangerAt(700, 160)];
    const sticky = emptyFixture();
    sticky.enemies = [hangerAt(700, 160)];
    applySticky(sticky.enemies[0] as EnemyState, STICKY_DURATION_TICKS, STICKY_SLOW_MULTIPLIER);

    advance(plain, frame(), 60);
    advance(sticky, frame(), 60);

    const plainTravel = 700 - (plain.enemies[0]?.x ?? 700);
    const stickyTravel = 700 - (sticky.enemies[0]?.x ?? 700);
    expect(plainTravel).toBeGreaterThan(0);
    expect(stickyTravel / plainTravel).toBeCloseTo(STICKY_SLOW_MULTIPLIER, 6);
  });

  it('leaves Spitter telegraph and firing timing untouched', () => {
    const plain = emptyFixture();
    plain.enemies = [spitterAt(500, 160, { phase: 'telegraph', phaseTicks: 36, telegraphAimX: -1 })];
    const sticky = emptyFixture();
    sticky.enemies = [spitterAt(500, 160, { phase: 'telegraph', phaseTicks: 36, telegraphAimX: -1 })];
    applySticky(sticky.enemies[0] as EnemyState, STICKY_DURATION_TICKS, STICKY_SLOW_MULTIPLIER);

    advance(plain, frame(), 35);
    advance(sticky, frame(), 35);
    expect(plain.projectiles).toHaveLength(0);
    expect(sticky.projectiles).toHaveLength(0);

    tickRun(plain, frame());
    tickRun(sticky, frame());
    expect(plain.projectiles).toHaveLength(1);
    expect(sticky.projectiles).toHaveLength(1);
    expect(sticky.projectiles[0]?.velocityX).toBe(plain.projectiles[0]?.velocityX);
    expect(sticky.enemies[0]?.phaseTicks).toBe(plain.enemies[0]?.phaseTicks);
    expect(sticky.enemies[0]?.x).toBe(plain.enemies[0]?.x);
    expect(sticky.enemies[0]?.y).toBe(plain.enemies[0]?.y);
  });
});

describe('transient room cleanup', () => {
  it('removes surfaces, projectiles, and queued events while preserving enemy statuses', () => {
    const state = idleFixture();
    const enemy = state.enemies[0] as EnemyState;
    applyWet(enemy, WET_DURATION_TICKS);

    const patch: SurfacePatchState = {
      id: 90,
      kind: 'wet',
      x: 400,
      y: 200,
      radius: 48,
      remainingTicks: 180,
      rootActionId: 1,
      sourceItemIds: ['bubble_bath'],
    };
    state.surfaces = [patch];
    const waterShot: ProjectileState = {
      id: 91,
      x: 420,
      y: 200,
      previousX: 412,
      previousY: 200,
      velocityX: 8,
      velocityY: 0,
      radius: 10,
      remainingTicks: 90,
      faction: 'player',
      damage: 3,
    };
    state.projectiles = [waterShot];
    const root = beginRootAction(state, { originKind: 'surface', sourceItemIds: ['bubble_bath'] });
    queueChildEvent(state, childRequest(root, 1));
    expect(state.surfaces).toHaveLength(1);
    expect(state.projectiles).toHaveLength(1);
    expect(state.eventQueue).toHaveLength(1);

    clearTransientRoomState(state);
    expect(state.surfaces).toEqual([]);
    expect(state.projectiles).toEqual([]);
    expect(state.eventQueue).toEqual([]);
    expect(state.counters.currentRootActionId).toBeNull();
    expect(ensureEnemyStatuses(enemy).wetTicks).toBe(WET_DURATION_TICKS);
  });
});

describe('gameplay event ancestry', () => {
  it('stamps every event with the complete deterministic ancestry fields', () => {
    const state = emptyFixture();
    const root = beginRootAction(state, {
      originKind: 'primary_attack',
      sourceItemIds: ['pump_soaker', 'janitor_mop', 'janitor_mop'],
      procCoefficient: 1,
      description: 'mop swing',
    });

    expect(root).toMatchObject({
      rootActionId: 1,
      eventId: 'r1',
      parentEventId: null,
      generationDepth: 0,
      originKind: 'primary_attack',
      procCoefficient: 1,
      sequence: 1,
      description: 'mop swing',
    });
    expect(root.sourceItemIds).toEqual(['janitor_mop', 'pump_soaker']);

    const child = queueChildEvent(state, childRequest(root, 1));
    expect(child).toMatchObject({
      rootActionId: 1,
      eventId: 'r1.1',
      parentEventId: 'r1',
      generationDepth: 1,
      originKind: 'reaction',
      sourceItemIds: ['plasma_globe'],
      procCoefficient: 1,
      sequence: 2,
    });

    const grandchild = queueChildEvent(state, {
      rootActionId: 1,
      parentEventId: child?.eventId ?? null,
      generationDepth: 2,
      originKind: 'status_application',
      sourceItemIds: ['gel_pens'],
      procCoefficient: 0.5,
    });
    expect(grandchild).toMatchObject({
      eventId: 'r1.1.2',
      parentEventId: 'r1.1',
      generationDepth: 2,
      procCoefficient: 0.5,
      sequence: 3,
    });

    for (const event of [root, child, grandchild]) {
      expect(event).not.toBeNull();
      expect(event?.sequence).toBeGreaterThanOrEqual(1);
      expect(event?.rootActionId).toBe(1);
      expect(Number.isInteger(event?.sequence)).toBe(true);
    }
  });

  it('rejects a generation depth beyond the authored cap', () => {
    const state = emptyFixture();
    const root = beginRootAction(state, { originKind: 'primary_attack' });
    expect(queueChildEvent(state, childRequest(root, MAX_GENERATION_DEPTH))).not.toBeNull();
    expect(() => queueChildEvent(state, childRequest(root, MAX_GENERATION_DEPTH + 1))).toThrow(/depth/i);
  });

  it('rejects events that do not belong to the active root action', () => {
    const state = emptyFixture();
    const root = beginRootAction(state, { originKind: 'primary_attack' });
    expect(() =>
      queueChildEvent(state, { ...childRequest(root, 1), rootActionId: root.rootActionId + 5 }),
    ).toThrow(/root action/i);
  });
});

describe('bounded child event queue', () => {
  it('caps each root at 64 child events and records a visible limit diagnostic', () => {
    const state = emptyFixture();
    const root = beginRootAction(state, { originKind: 'primary_attack' });

    for (let index = 0; index < MAX_CHILD_EVENTS_PER_ROOT; index += 1) {
      expect(queueChildEvent(state, childRequest(root, 1))).not.toBeNull();
    }
    expect(state.eventQueue).toHaveLength(MAX_CHILD_EVENTS_PER_ROOT);
    expect(state.counters.childEventsThisRoot).toBe(MAX_CHILD_EVENTS_PER_ROOT);

    expect(queueChildEvent(state, childRequest(root, 1))).toBeNull();
    expect(state.counters.droppedEvents).toBe(1);
    expect(state.limitDiagnostics.at(-1)).toMatch(/64 child events/i);

    const nextRoot = beginRootAction(state, { originKind: 'primary_attack' });
    expect(queueChildEvent(state, childRequest(nextRoot, 1))).not.toBeNull();
    expect(state.counters.childEventsThisRoot).toBe(1);
  });

  it('drains the queue once, in order, and counts the drained events', () => {
    const state = emptyFixture();
    const root = beginRootAction(state, { originKind: 'primary_attack' });
    queueChildEvent(state, childRequest(root, 1));
    queueChildEvent(state, childRequest(root, 1));

    expect(drainChildEvents(state)).toBe(2);
    expect(state.eventQueue).toEqual([]);
    expect(state.counters.drainedEvents).toBe(2);
    expect(state.behaviorTrace.join('\n')).toMatch(/r1\.1/);
    expect(drainChildEvents(state)).toBe(0);
  });

  it('bounds the visible limit diagnostics and the behaviour trace', () => {
    const state = emptyFixture();
    for (let index = 0; index < MAX_LIMIT_DIAGNOSTICS * 2; index += 1) {
      recordLimitDiagnostic(state, `diagnostic ${index}`);
    }
    for (let index = 0; index < MAX_BEHAVIOR_TRACE_ENTRIES * 2; index += 1) {
      recordBehaviorTrace(state, `line ${index}`);
    }

    expect(state.limitDiagnostics).toHaveLength(MAX_LIMIT_DIAGNOSTICS);
    expect(state.limitDiagnostics.at(-1)).toBe(`diagnostic ${MAX_LIMIT_DIAGNOSTICS * 2 - 1}`);
    expect(state.behaviorTrace).toHaveLength(MAX_BEHAVIOR_TRACE_ENTRIES);
    expect(state.behaviorTrace.at(-1)).toBe(`line ${MAX_BEHAVIOR_TRACE_ENTRIES * 2 - 1}`);
  });
});
