import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import type { ItemDefinition } from '../../src/sim/items/types';
import { ATTACK_ACTIVE_TICKS, WET_DURATION_TICKS } from '../../src/sim/effects/constants';
import { resolvePrimaryAttack } from '../../src/sim/effects/resolveAttack';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, InputFrame, ProjectileState, RunState } from '../../src/sim/model';
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

function lethalProjectile(): ProjectileState {
  return {
    id: 41,
    x: 360,
    y: 160,
    previousX: 360,
    previousY: 160,
    velocityX: -60,
    velocityY: 0,
    radius: 4,
    remainingTicks: 30,
    faction: 'enemy',
    damage: 1,
  };
}

function fireFrame(aimX = 500, aimY = 160): InputFrame {
  return { moveX: 0, moveY: 0, aimX, aimY, fire: true };
}

/** An empty room whose run owns exactly the supplied item definitions. */
function labFixture(itemIds: readonly string[], selectedItemId?: string): RunState {
  const state = createRun(7, {
    itemIds,
    ...(selectedItemId === undefined ? {} : { selectedItemId }),
  });
  state.player.x = 300;
  state.player.y = 160;
  state.enemies = [];
  state.walls = [];
  state.roomWasPopulated = false;
  return state;
}

describe('run loadout state', () => {
  it('keeps the M1 shift on the mop with immutable compiled state', () => {
    const state = createRun(1997);

    expect(state.inventory).toEqual([{ instanceId: 'janitor_mop', itemId: 'janitor_mop' }]);
    expect(state.selectedPrimaryInstanceId).toBe('janitor_mop');
    expect(state.compiledLoadout.primary).toMatchObject({
      definitionId: 'janitor_mop',
      delivery: 'direct',
      damage: 4,
      cooldownTicks: 27,
      range: 70,
    });
    expect(Object.isFrozen(state.compiledLoadout)).toBe(true);
    expect(state.surfaces).toEqual([]);
    expect(state.eventQueue).toEqual([]);
    expect(state.behaviorTrace).toEqual([]);
    expect(state.limitDiagnostics).toEqual([]);
    expect(state.counters).toMatchObject({
      rootActions: 0,
      gameplayEvents: 0,
      childEventsThisRoot: 0,
      currentRootActionId: null,
      droppedEvents: 0,
      drainedEvents: 0,
    });
  });

  it('compiles an owned interaction-lab loadout in semantic stage order', () => {
    const state = createRun(7, {
      itemIds: ['gel_pens', 'extension_cord', 'plasma_globe', 'janitor_mop'],
      selectedItemId: 'janitor_mop',
    });

    expect(state.compiledLoadout.primary.definitionId).toBe('janitor_mop');
    expect(state.compiledLoadout.effects.map((effect) => effect.sourceItemId)).toEqual([
      'gel_pens',
      'plasma_globe',
      'extension_cord',
    ]);
    expect(state.compiledLoadout.compatibilityNotes).toEqual([]);
  });

  it('rejects a selected primary the run does not own', () => {
    expect(() => createRun(7, { itemIds: ['janitor_mop'], selectedItemId: 'pump_soaker' })).toThrow(
      /owned/,
    );
  });
});

describe('mop attack resolution', () => {
  it('damages and Wets its target through the primary attack resolver', () => {
    const state = labFixture(['janitor_mop']);
    state.enemies = [hangerAt(350, 160, { id: 42 })];

    const root = resolvePrimaryAttack(state, fireFrame(400, 160));

    expect(root).toMatchObject({
      rootActionId: 1,
      eventId: 'r1',
      parentEventId: null,
      generationDepth: 0,
      originKind: 'primary_attack',
      procCoefficient: 1,
      sequence: 1,
    });
    expect(state.player.attackCooldownTicks).toBe(27);
    expect(state.player.attackActiveTicks).toBe(ATTACK_ACTIVE_TICKS);
    expect(state.enemies[0]?.health).toBe(8);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);
    expect(state.counters.rootActions).toBe(1);
    expect(state.recentChange).toMatch(/Wet/);
    expect(state.eventQueue).toEqual([]);
    expect(state.limitDiagnostics).toEqual([]);
  });

  it('does not shorten the Wet it applied during the same tick', () => {
    const state = labFixture(['janitor_mop']);
    state.enemies = [hangerAt(350, 160, { id: 42 })];

    tickRun(state, fireFrame(400, 160));
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);

    advance(state, frame(), WET_DURATION_TICKS - 1);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(1);

    advance(state, frame(), 1);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(0);
  });

  it('applies Wet before the reusable reaction stage runs', () => {
    const state = labFixture(['janitor_mop', 'plasma_globe', 'extension_cord'], 'janitor_mop');
    state.enemies = [hangerAt(350, 160, { id: 42 })];

    resolvePrimaryAttack(state, fireFrame(400, 160));

    const trace = state.behaviorTrace;
    const wetIndex = trace.findIndex((line) => /Wet 180/.test(line));
    const reactionIndex = trace.findIndex((line) => /reaction stage/.test(line));
    expect(wetIndex).toBeGreaterThanOrEqual(0);
    expect(reactionIndex).toBeGreaterThan(wetIndex);
    expect(trace[reactionIndex]).toMatch(/wet 180/);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);
  });

  it('accepts the mop hit from the pre-movement player position', () => {
    const moving = labFixture(['janitor_mop']);
    moving.enemies = [hangerAt(383, 160, { id: 42 })];
    tickRun(moving, { ...fireFrame(500, 160), moveX: 1 });
    expect(moving.player.x).toBeGreaterThan(300);
    expect(moving.enemies[0]?.health).toBe(12);
    expect(moving.enemies[0]?.statuses?.wetTicks ?? 0).toBe(0);
    expect(moving.player.attackCooldownTicks).toBe(27);

    const stationary = labFixture(['janitor_mop']);
    stationary.enemies = [hangerAt(379, 160, { id: 42 })];
    tickRun(stationary, fireFrame(500, 160));
    expect(stationary.enemies[0]?.health).toBe(8);
    expect(stationary.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);
  });

  it('resolves any direct primary from its compiled descriptor without item-ID branches', () => {
    const definition: ItemDefinition = {
      id: 'synthetic_sponge',
      name: 'Synthetic Sponge',
      summary: 'Test-only direct primary that reuses the existing capability model.',
      base: {
        delivery: 'direct',
        damage: 3,
        cooldownTicks: 12,
        range: 60,
        halfAngleRadians: Math.PI / 4,
        speed: 0,
      },
      effects: [],
    };
    const state = emptyFixture();
    state.enemies = [hangerAt(340, 160, { id: 55 })];
    state.inventory = [{ instanceId: 'sponge-a', itemId: 'synthetic_sponge' }];
    state.selectedPrimaryInstanceId = 'sponge-a';
    state.compiledLoadout = compileLoadout([definition], state.inventory, 'sponge-a');

    tickRun(state, fireFrame(400, 160));

    expect(state.enemies[0]?.health).toBe(9);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);
    expect(state.player.attackCooldownTicks).toBe(12);
  });
});

describe('bounded attack event pipeline', () => {
  it('stamps reaction children with complete ancestry and drains them in the same tick', () => {
    const state = labFixture(['janitor_mop', 'plasma_globe', 'extension_cord'], 'janitor_mop');
    state.enemies = [hangerAt(350, 160, { id: 42 })];

    resolvePrimaryAttack(state, fireFrame(400, 160));

    expect(state.eventQueue).toHaveLength(2);
    const [first, second] = state.eventQueue;
    expect(first).toMatchObject({
      rootActionId: 1,
      eventId: 'r1.1',
      parentEventId: 'r1',
      generationDepth: 1,
      originKind: 'reaction',
      sourceItemIds: ['plasma_globe'],
      procCoefficient: 1,
    });
    expect(second).toMatchObject({
      rootActionId: 1,
      eventId: 'r1.2',
      parentEventId: 'r1',
      generationDepth: 1,
      originKind: 'reaction',
      sourceItemIds: ['extension_cord'],
      procCoefficient: 1,
    });
    expect(first?.sequence).toBeLessThan(second?.sequence ?? 0);

    tickRun(state, frame());
    expect(state.eventQueue).toEqual([]);
    expect(state.counters.drainedEvents).toBe(2);
    expect(state.counters.gameplayEvents).toBe(3);
    expect(state.counters.childEventsThisRoot).toBe(2);
    expect(state.behaviorTrace.join('\n')).toMatch(/r1\.1/);
    expect(state.limitDiagnostics).toEqual([]);
  });

  it('queues no child events when the loadout has no reaction stage effect', () => {
    const state = labFixture(['janitor_mop', 'vhs_rewinder', 'wide_nozzle'], 'janitor_mop');
    state.enemies = [hangerAt(350, 160, { id: 42 })];

    tickRun(state, fireFrame(400, 160));

    expect(state.enemies[0]?.health).toBe(8);
    expect(state.eventQueue).toEqual([]);
    expect(state.counters.gameplayEvents).toBe(1);
    expect(state.counters.drainedEvents).toBe(0);
    expect(state.compiledLoadout.compatibilityNotes.join(' ')).toMatch(/projectile/i);
  });

  it('resolves a swing with no target without queueing anything', () => {
    const state = labFixture(['janitor_mop', 'plasma_globe'], 'janitor_mop');
    state.enemies = [hangerAt(700, 400, { id: 42 })];

    tickRun(state, fireFrame(400, 160));

    expect(state.counters.rootActions).toBe(1);
    expect(state.counters.gameplayEvents).toBe(1);
    expect(state.eventQueue).toEqual([]);
    expect(state.recentChange).toMatch(/nothing/i);
  });
});

describe('terminal ordering', () => {
  it('keeps death ahead of room clear when the mop kills the last enemy on a lethal tick', () => {
    const state = emptyFixture();
    state.player.health = 1;
    state.enemies = [hangerAt(379, 160, { id: 42, health: 4 })];
    state.projectiles = [lethalProjectile()];
    state.roomWasPopulated = true;

    tickRun(state, fireFrame(500, 160));

    expect(state.enemies).toHaveLength(0);
    expect(state.player.health).toBe(0);
    expect(state.status).toBe('dead');
    expect(state.rewardGranted).toBe(false);

    const terminal = JSON.stringify(state);
    tickRun(state, frame(1, 0));
    expect(JSON.stringify(state)).toBe(terminal);
  });
});

describe('explicit projectile origins', () => {
  it('fires an authored spread from the supplied origin on one root action', () => {
    const run = createRun(1997, {
      itemIds: ['party_popper'],
      selectedItemId: 'party_popper',
    });
    const context = { projectileOrigin: { x: 420, y: 210 } };
    tickRun(run, { moveX: 0, moveY: 0, aimX: 620, aimY: 210, fire: true }, context);
    expect(run.projectiles).toHaveLength(3);
    expect(run.projectiles.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 420, y: 210 },
      { x: 420, y: 210 },
      { x: 420, y: 210 },
    ]);
    expect(run.counters.rootActions).toBe(1);
    expect(run.projectiles.map((shot) => shot.ancestry?.rootActionId)).toEqual([1, 1, 1]);
  });

  it('keeps direct mop attacks on the player position with existing cone behavior', () => {
    const state = labFixture(['janitor_mop']);
    state.enemies = [hangerAt(350, 160, { id: 42 })];
    tickRun(state, fireFrame(400, 160), { projectileOrigin: { x: 700, y: 400 } });
    expect(state.enemies[0]?.health).toBe(8);
    expect(state.enemies[0]?.statuses?.wetTicks).toBe(WET_DURATION_TICKS);
    expect(state.counters.rootActions).toBe(1);
  });
});
