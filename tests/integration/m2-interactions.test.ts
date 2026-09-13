import { describe, expect, it } from 'vitest';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import type { ItemDefinition } from '../../src/sim/items/types';
import { validateCatalog } from '../../src/sim/items/validateCatalog';
import { createRun } from '../../src/sim/createRun';
import { WET_DURATION_TICKS } from '../../src/sim/effects/constants';
import { clearTransientRoomState } from '../../src/sim/effects/events';
import {
  applyWet,
  effectiveSpeedMultiplier,
  ensureEnemyStatuses,
} from '../../src/sim/effects/statuses';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame, RunState } from '../../src/sim/model';
import { emptyFixture, frame } from '../helpers';

const SOAKER_MODIFIERS = [
  'bubble_bath',
  'gel_pens',
  'plasma_globe',
  'extension_cord',
  'vhs_rewinder',
  'wide_nozzle',
] as const;

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

/** A motionless enemy: projectile and chain geometry stays deterministic. */
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

/** Runs the fixture while collecting every trace line the bounded buffer holds. */
function traceOf(state: RunState): string {
  return state.behaviorTrace.join('\n');
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function chainVisitedIds(state: RunState): number[] {
  const line = state.behaviorTrace.find((entry) => /visited \[/.test(entry));
  const match = line === undefined ? null : /visited \[([^\]]+)\]/.exec(line);
  if (!match?.[1]) {
    return [];
  }
  return match[1].split(',').map((entry) => Number(entry.trim()));
}

function runMopGlobeFixture(): { chainedTargetDamage: number; struckTargetDamage: number } {
  const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
  const struck = sentry(20, 350, 160);
  const chained = sentry(21, 430, 160);
  state.enemies = [struck, chained];
  // A conductive chain may only continue through targets already Wet when the
  // hop chooses them; the mop's own hit only wets the struck target.
  applyWet(chained, WET_DURATION_TICKS);

  tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });

  return {
    chainedTargetDamage: 40 - chained.health,
    struckTargetDamage: 40 - struck.health,
  };
}

function runSoakerBathFixture(): {
  terminalPatchCount: number;
  patchRadii: number[];
  burstCount: number;
} {
  const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');
  state.enemies = [sentry(10, 420, 160)];

  for (let tick = 0; tick < 120; tick += 1) {
    tickRun(state, tick === 0 ? fireAt() : frame());
  }

  return {
    terminalPatchCount: state.surfaces.length,
    patchRadii: state.surfaces.map((patch) => patch.radius),
    burstCount: countMatches(traceOf(state), /burst/g),
  };
}

function runSoakerGlobeCordFixture(): { visitedIds: number[]; chainRange: number } {
  const state = labRun(['pump_soaker', 'plasma_globe', 'extension_cord'], 'pump_soaker');
  state.enemies = [
    sentry(10, 380, 160),
    sentry(11, 500, 160),
    sentry(12, 610, 160),
    sentry(13, 700, 160),
  ];
  for (const enemy of state.enemies.slice(1)) {
    applyWet(enemy, WET_DURATION_TICKS);
  }

  for (let tick = 0; tick < 80; tick += 1) {
    tickRun(state, tick === 0 ? fireAt() : frame());
  }

  const chainLine = state.behaviorTrace.find((entry) => /visited \[/.test(entry)) ?? '';
  const rangeMatch = /range (\d+)/.exec(chainLine);
  return {
    visitedIds: chainVisitedIds(state),
    chainRange: rangeMatch?.[1] === undefined ? 0 : Number(rangeMatch[1]),
  };
}

function runSoakerBathRewinderFixture(): {
  returnPasses: number;
  burstCount: number;
  patchCount: number;
} {
  const state = labRun(['pump_soaker', 'bubble_bath', 'vhs_rewinder'], 'pump_soaker');

  for (let tick = 0; tick < 200; tick += 1) {
    tickRun(state, tick === 0 ? fireAt() : frame());
  }

  const trace = traceOf(state);
  return {
    returnPasses: countMatches(trace, /began return pass/g),
    burstCount: countMatches(trace, /burst/g),
    patchCount: state.surfaces.length,
  };
}

type AllModifierResult = {
  limitDiagnostics: string[];
  droppedEvents: number;
  compatibilityNotes: string[];
  gameplayEvents: number;
  burstCount: number;
  chainCount: number;
  maxEventDepth: number;
};

function runAllModifierFixture(): AllModifierResult {
  const state = labRun(['pump_soaker', ...SOAKER_MODIFIERS], 'pump_soaker');
  state.enemies = [sentry(10, 400, 160), sentry(11, 520, 160), sentry(12, 640, 160)];
  for (const enemy of state.enemies.slice(1)) {
    applyWet(enemy, WET_DURATION_TICKS);
  }

  for (let tick = 0; tick < 200; tick += 1) {
    tickRun(state, tick % 30 === 0 ? fireAt() : frame());
  }

  const trace = traceOf(state);
  const depths = Array.from(trace.matchAll(/depth (\d+)/g), (match) => Number(match[1]));
  return {
    limitDiagnostics: [...state.limitDiagnostics],
    droppedEvents: state.counters.droppedEvents,
    compatibilityNotes: [...state.compiledLoadout.compatibilityNotes],
    gameplayEvents: state.counters.gameplayEvents,
    burstCount: countMatches(trace, /burst/g),
    chainCount: countMatches(trace, /visited \[/g),
    maxEventDepth: depths.length === 0 ? 0 : Math.max(...depths),
  };
}

const PERMUTATION_ITEMS = ['pump_soaker', ...SOAKER_MODIFIERS];

const PICKUP_ORDERS: readonly (readonly string[])[] = [
  PERMUTATION_ITEMS,
  [...PERMUTATION_ITEMS].reverse(),
  [
    'wide_nozzle',
    'pump_soaker',
    'extension_cord',
    'bubble_bath',
    'vhs_rewinder',
    'gel_pens',
    'plasma_globe',
  ],
  [
    'plasma_globe',
    'gel_pens',
    'vhs_rewinder',
    'pump_soaker',
    'wide_nozzle',
    'extension_cord',
    'bubble_bath',
  ],
];

/**
 * Everything authoritative about a finished run except the pickup order of the
 * inventory itself: compiled behaviour, entities, surfaces, events and traces.
 */
function simulationDigest(state: RunState): string {
  const inventory = [...state.inventory].sort((first, second) =>
    first.itemId < second.itemId ? -1 : 1,
  );
  return JSON.stringify({ ...state, inventory });
}

function runPickupPermutations(): string[] {
  const digests = new Set<string>();
  for (const order of PICKUP_ORDERS) {
    const state = labRun(order, 'pump_soaker');
    state.enemies = [sentry(10, 400, 160), sentry(11, 520, 160), sentry(12, 640, 160)];
    for (const enemy of state.enemies.slice(1)) {
      applyWet(enemy, WET_DURATION_TICKS);
    }
    for (let tick = 0; tick < 150; tick += 1) {
      tickRun(state, tick % 40 === 0 ? fireAt() : frame());
    }
    digests.add(simulationDigest(state));
  }
  return [...digests];
}

describe('mop and conductive globe', () => {
  it('produces chain damage on an additional Wet target', () => {
    const result = runMopGlobeFixture();

    expect(result.chainedTargetDamage).toBeGreaterThan(0);
    expect(result.struckTargetDamage).toBe(4);
  });

  it('leaves a dry nearby enemy undamaged and unwetted', () => {
    const state = labRun(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    const struck = sentry(20, 350, 160);
    const dry = sentry(21, 430, 160);
    state.enemies = [struck, dry];

    tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });

    expect(struck.health).toBe(40 - 4);
    expect(dry.health).toBe(40);
    expect(dry.statuses?.wetTicks ?? 0).toBe(0);
    // The chain ran from the Wet struck target but reached no one: a hop can
    // never wet a dry enemy and then continue through it.
    expect(chainVisitedIds(state)).toEqual([20]);
  });
});

describe('soaker and bubble bath', () => {
  it('produces exactly one terminal patch', () => {
    const result = runSoakerBathFixture();

    expect(result.terminalPatchCount).toBe(1);
    expect(result.patchRadii).toEqual([48]);
    expect(result.burstCount).toBe(1);
  });
});

describe('soaker, globe and extension cord', () => {
  it('visits stable entity IDs by distance then ID at cord range', () => {
    const result = runSoakerGlobeCordFixture();

    expect(result.visitedIds).toEqual([10, 11, 12, 13]);
    expect(result.chainRange).toBe(220);
  });
});

describe('soaker, bubble bath and VHS rewinder', () => {
  it('performs one return pass and one burst', () => {
    const result = runSoakerBathRewinderFixture();

    expect(result).toMatchObject({ returnPasses: 1, burstCount: 1, patchCount: 1 });
  });
});

describe('all six soaker modifiers', () => {
  it('compose without replacement or runaway generation', () => {
    const result = runAllModifierFixture();

    expect(result.limitDiagnostics).toEqual([]);
    expect(result.droppedEvents).toBe(0);
    expect(result.compatibilityNotes).toEqual([]);
    expect(result.gameplayEvents).toBeGreaterThan(10);
    expect(result.burstCount).toBeGreaterThan(0);
    expect(result.chainCount).toBeGreaterThan(0);
    expect(result.maxEventDepth).toBeGreaterThan(0);
    expect(result.maxEventDepth).toBeLessThanOrEqual(4);
  });
});

describe('pickup order determinism', () => {
  it('collapses every pickup permutation to one compiled and simulated result', () => {
    expect(runPickupPermutations()).toHaveLength(1);
  });
});

describe('authored synthetic definition', () => {
  const synthetic: ItemDefinition = {
    id: 'synthetic_foam_gun',
    name: 'Synthetic Foam Gun',
    summary: 'Test-only projectile that reuses the existing effect kinds.',
    base: {
      delivery: 'projectile',
      damage: 3,
      cooldownTicks: 12,
      range: 0,
      halfAngleRadians: 0,
      speed: 2,
    },
    effects: [
      {
        kind: 'projectile_payload',
        stage: 'projectile',
        priority: 0,
        sourceItemId: 'synthetic_foam_gun',
        label: 'foam projectile (Wet 180 ticks on hit)',
        damage: 3,
        speed: 2,
        radius: 5,
        lifetimeTicks: 60,
        onHit: { status: 'wet', ticks: 180 },
      },
      {
        kind: 'conductive_reaction',
        stage: 'reaction',
        priority: 0,
        sourceItemId: 'synthetic_foam_gun',
        label: 'foam arc (one chain, two additional Wet targets)',
        chainStartsPerRoot: 1,
        maxAdditionalTargets: 2,
        baseRange: 120,
        visitsEachTargetOnce: true,
      },
    ],
  };

  it('validates and compiles through the existing effect kinds', () => {
    expect(() => validateCatalog([...ITEM_CATALOG, synthetic])).not.toThrow();

    const compiled = compileLoadout(
      [...ITEM_CATALOG, synthetic],
      [{ instanceId: 'foam-a', itemId: 'synthetic_foam_gun' }],
      'foam-a',
    );
    expect(compiled.primary).toMatchObject({ definitionId: 'synthetic_foam_gun', delivery: 'projectile' });
    expect(compiled.effects.map((effect) => effect.kind)).toEqual([
      'projectile_payload',
      'conductive_reaction',
    ]);
  });

  it('executes through the unchanged central tick', () => {
    const state = emptyFixture();
    state.enemies = [sentry(10, 400, 160), sentry(11, 500, 160)];
    applyWet(state.enemies[1] as EnemyState, WET_DURATION_TICKS);
    state.inventory = [{ instanceId: 'foam-a', itemId: 'synthetic_foam_gun' }];
    state.selectedPrimaryInstanceId = 'foam-a';
    state.compiledLoadout = compileLoadout(
      [...ITEM_CATALOG, synthetic],
      state.inventory,
      'foam-a',
    );

    for (let tick = 0; tick < 80; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
    }

    const struck = state.enemies.find((enemy) => enemy.id === 10);
    const chained = state.enemies.find((enemy) => enemy.id === 11);
    expect(struck?.health).toBe(40 - 3);
    expect(struck?.statuses?.wetTicks).toBeGreaterThan(0);
    expect(chained?.health).toBe(40 - 2);
    expect(state.limitDiagnostics).toEqual([]);
  });
});

describe('authored synthetic direct status modifier', () => {
  const syntheticTarBat: ItemDefinition = {
    id: 'synthetic_tar_bat',
    name: 'Synthetic Tar Bat',
    summary: 'Test-only direct attack that reuses the existing status_modifier kind.',
    base: {
      delivery: 'direct',
      damage: 3,
      cooldownTicks: 10,
      range: 100,
      halfAngleRadians: 0.6,
      speed: 0,
    },
    effects: [
      {
        kind: 'status_modifier',
        stage: 'status',
        priority: 0,
        sourceItemId: 'synthetic_tar_bat',
        label: 'tar (Sticky 45 ticks at 0.75 movement)',
        status: 'sticky',
        ticks: 45,
        slowMultiplier: 0.75,
        slowFloor: 0.5,
      },
    ],
  };

  it('applies any compiled status_modifier to a direct primary without an item-ID branch', () => {
    expect(() => validateCatalog([...ITEM_CATALOG, syntheticTarBat])).not.toThrow();

    const state = emptyFixture();
    state.enemies = [sentry(10, 350, 160)];
    state.inventory = [{ instanceId: 'bat-a', itemId: 'synthetic_tar_bat' }];
    state.selectedPrimaryInstanceId = 'bat-a';
    state.compiledLoadout = compileLoadout(
      [...ITEM_CATALOG, syntheticTarBat],
      state.inventory,
      'bat-a',
    );

    tickRun(state, { moveX: 0, moveY: 0, aimX: 500, aimY: 160, fire: true });

    const struck = state.enemies.find((enemy) => enemy.id === 10) as EnemyState;
    expect(struck.health).toBe(40 - 3);
    const statuses = ensureEnemyStatuses(struck);
    expect(statuses.wetTicks).toBe(WET_DURATION_TICKS);
    expect(statuses.stickyTicks).toBe(45);
    expect(statuses.stickyMultiplier).toBe(0.75);
    expect(effectiveSpeedMultiplier(struck)).toBe(0.75);
    expect(state.compiledLoadout.effects.map((effect) => effect.kind)).toEqual([
      'status_modifier',
    ]);
  });
});

describe('transient interaction state', () => {
  it('keeps surfaces, projectiles and queued events in the room cleanup contract', () => {
    const state = labRun(['pump_soaker', 'bubble_bath'], 'pump_soaker');
    const target = sentry(10, 420, 160);
    state.enemies = [target];

    for (let tick = 0; tick < 120; tick += 1) {
      tickRun(state, tick === 0 ? fireAt() : frame());
    }
    expect(state.surfaces.length).toBeGreaterThan(0);
    const wetTicks = ensureEnemyStatuses(target).wetTicks;
    expect(wetTicks).toBeGreaterThan(0);

    clearTransientRoomState(state);

    expect(state.surfaces).toEqual([]);
    expect(state.projectiles).toEqual([]);
    expect(state.eventQueue).toEqual([]);
    // Enemy statuses are enemy state rather than room state.
    expect(ensureEnemyStatuses(target).wetTicks).toBe(wetTicks);
  });
});
