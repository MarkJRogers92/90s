import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { tickRun } from '../../src/sim/tickRun';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { CART_DAMAGE, RACK_DAMAGE, SODA_DAMAGE, SODA_PUDDLE_RADIUS, createProp, propWalls } from '../../src/sim/combat/props';
import { createEnemyStatusState } from '../../src/sim/effects/statuses';
import type { EnemyState, InputFrame, MallProp, RunState } from '../../src/sim/model';

function room(props: MallProp[]): RunState {
  const state = createRun(1);
  state.enemies = [];
  state.walls = [];
  state.props = props;
  state.walls.push(...propWalls(props));
  state.player.x = 300;
  state.player.y = 300;
  state.roomWasPopulated = false;
  return state;
}

let nextId = 200;
function enemy(x: number, y: number, health = 40): EnemyState {
  nextId += 1;
  return { id: nextId, kind: 'hanger', x, y, health, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, statuses: createEnemyStatusState() };
}

const still: InputFrame = { moveX: 0, moveY: 0, aimX: 600, aimY: 300, fire: false };
const swingAt = (x: number, y: number): InputFrame => ({ moveX: 0, moveY: 0, aimX: x, aimY: y, fire: true });

describe('mall props (round 53)', () => {
  it('a mop hit sends a cart rolling into whoever is down the aisle', () => {
    const cart = createProp(1, 'cart', 350, 300);
    const state = room([cart]);
    const target = enemy(560, 300);
    state.enemies = [target];
    tickRun(state, swingAt(400, 300));
    expect(cart.state).toBe('rolling');
    for (let tick = 0; tick < 60; tick += 1) tickRun(state, still);
    expect(cart.x).toBeGreaterThan(400);
    expect(target.health).toBeLessThanOrEqual(40 - CART_DAMAGE);
  });

  it('walking into a standing cart pushes it off too', () => {
    const cart = createProp(1, 'cart', 330, 300);
    const state = room([cart]);
    for (let tick = 0; tick < 20; tick += 1) tickRun(state, { ...still, moveX: 1 });
    expect(cart.x).toBeGreaterThan(330);
  });

  it('a hit soda machine bursts: a sticky puddle soaks the monsters around it', () => {
    const soda = createProp(1, 'soda', 360, 300);
    const state = room([soda]);
    const near = enemy(380, 360);
    state.enemies = [near];
    tickRun(state, swingAt(360, 300));
    expect(soda.state).toBe('broken');
    expect(state.surfaces.some((patch) => Math.hypot(patch.x - soda.x, patch.y - soda.y) < 1 && patch.radius === SODA_PUDDLE_RADIUS)).toBe(true);
    expect(near.health).toBe(40 - SODA_DAMAGE);
    tickRun(state, still);
    expect(near.statuses?.wetTicks ?? 0).toBeGreaterThan(0);
    // Broken is broken: a second hit does nothing more.
    const puddles = state.surfaces.length;
    state.player.attackCooldownTicks = 0;
    tickRun(state, swingAt(360, 300));
    expect(state.surfaces.length).toBe(puddles);
  });

  it('a toppled rack falls away from the janitor, becomes a wall, and flattens whoever is under it', () => {
    const rack = createProp(1, 'rack', 350, 300);
    const state = room([rack]);
    const under = enemy(400, 300);
    state.enemies = [under];
    tickRun(state, swingAt(400, 300));
    expect(rack.state).toBe('fallen');
    const fallen = propWalls([rack])[0]!;
    expect(fallen.width).toBeGreaterThan(fallen.height);
    expect(fallen.x).toBeGreaterThanOrEqual(rack.x - 10);
    expect(state.walls).toContainEqual(fallen);
    expect(under.health).toBeLessThanOrEqual(40 - RACK_DAMAGE);
    // Never left stuck inside it.
    expect(circleIntersectsRect(under.x, under.y, under.radius, fallen)).toBe(false);
    expect(circleIntersectsRect(state.player.x, state.player.y, state.player.radius, fallen)).toBe(false);
  });

  it('a shot knocks things over too', () => {
    const soda = createProp(1, 'soda', 420, 300);
    const state = room([soda]);
    state.compiledLoadout = createRun(1, { itemIds: ['pump_soaker'], selectedItemId: 'pump_soaker' }).compiledLoadout;
    tickRun(state, swingAt(600, 300));
    for (let tick = 0; tick < 60 && soda.state === 'standing'; tick += 1) tickRun(state, still);
    expect(soda.state).toBe('broken');
  });

  it('regular fights get props in clear floor; the boss arena, safe rooms and store interiors do not', () => {
    let fights = 0;
    let withProps = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const run = createMvpRun(seed);
      run.wing.rooms.forEach((wingRoom, index) => {
        const combat = buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed);
        const props = combat.props ?? [];
        if (wingRoom.enemySpawns.length === 0 || wingRoom.bossAnchor !== null) {
          expect(props, `${seed} ${wingRoom.id}`).toHaveLength(0);
          return;
        }
        fights += 1;
        if (props.length > 0) withProps += 1;
        // The same night always dresses the same way.
        expect(buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed).props).toEqual(props);
        for (const prop of props) {
          expect(wingRoom.walls.some((wall) => circleIntersectsRect(prop.x, prop.y, 24, wall))).toBe(false);
          expect(combat.enemies.some((foe) => Math.hypot(foe.x - prop.x, foe.y - prop.y) < 50)).toBe(false);
          expect(Math.hypot(combat.player.x - prop.x, combat.player.y - prop.y)).toBeGreaterThan(150);
        }
      });
    }
    expect(withProps / fights).toBeGreaterThan(0.6);
  });

  it('storefronts, where the stores are, never hold props', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const run = seed % 2 === 0 ? createMvpRun(seed, { part: 1 }) : createMvpRun(seed);
      run.wing.rooms.forEach((wingRoom, index) => {
        if (wingRoom.store === null) return;
        expect(buildRoomCombatState(run.wing, index, 'west', run.inventory, run.seed).props ?? []).toHaveLength(0);
      });
    }
  });
});

describe('round 53 around the edges', () => {
  it('each prop and hero move has its own sound', async () => {
    const { createAudioSnapshot, deriveAudioCues } = await import('../../src/game/audio/cues');
    const run = createMvpRun(9);
    const combat = run.room.combat;
    combat.props = [createProp(1, 'cart', 300, 300), createProp(2, 'soda', 500, 300), createProp(3, 'rack', 700, 300)];
    const before = createAudioSnapshot(run);
    combat.props[0]!.state = 'rolling';
    combat.props[1]!.state = 'broken';
    combat.props[2]!.state = 'fallen';
    expect(deriveAudioCues(before, run)).toEqual(expect.arrayContaining(['cart_roll', 'soda_burst', 'rack_fall']));

    const quiet = createAudioSnapshot(run);
    combat.hero = { records: [{ id: 1, mode: 'orbit', angle: 0, x: 0, y: 0, vx: 0, vy: 0, ticks: 0, hits: {} }], nextRecordId: 2, decoy: { x: 0, y: 0, ticks: 10 }, decoyCooldown: 0, bursts: [], beams: [{ x: 0, y: 0, toX: 1, toY: 0, ticks: 5 }], beamCooldown: 90 };
    expect(deriveAudioCues(quiet, run)).toEqual(expect.arrayContaining(['record_spin', 'squawk', 'projector']));
    const armed = createAudioSnapshot(run);
    combat.hero.records[0]!.mode = 'flying';
    combat.hero.decoy = null;
    combat.hero.bursts = [{ x: 0, y: 0, ticks: 20 }];
    expect(deriveAudioCues(armed, run)).toEqual(expect.arrayContaining(['record_fling', 'decoy_burst']));
  });

  it('the first room with props says what they do, once a night', async () => {
    const { tickMvpRun } = await import('../../src/sim/run/tickMvpRun');
    const run = createMvpRun(9);
    run.room.combat.props = [createProp(1, 'cart', 600, 300)];
    const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
    tickMvpRun(run, idle);
    expect(run.recentChange).toMatch(/cart/i);
    tickMvpRun(run, idle);
    tickMvpRun(run, idle);
    expect(run.propsHinted).toBe(true);
    expect(run.recentChange).not.toMatch(/cart/i);
  });

  it('the bench calls a hero a hero', async () => {
    const { heroForPair } = await import('../../src/sim/fusion/heroes');
    const { buildBenchCardModel } = await import('../../src/game/ui/benchCardModel');
    const { openRunWorkbench, pickWorkbenchItem } = await import('../../src/sim/run/bench');
    const run = createMvpRun(9);
    const leaf = (id: string) => ({ kind: 'leaf' as const, instanceId: `t-${id}`, itemDefinitionId: id, acquisitionKind: 'purchased' as const, sourceLocationId: 'test', sourceStockId: id, acquisitionTick: 0 });
    run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, leaf('vhs_tape'), leaf('popcorn_bucket')], cash: 999, revision: run.inventory.revision + 1 };
    run.cash = 999;
    const kiosk = run.wing.rooms[0]!.benchKiosk!;
    run.room.combat.player.x = kiosk.x;
    run.room.combat.player.y = kiosk.y;
    expect(openRunWorkbench(run).accepted).toBe(true);
    pickWorkbenchItem(run, 't-vhs_tape');
    pickWorkbenchItem(run, 't-popcorn_bucket');
    const card = buildBenchCardModel(run)!;
    expect(card.hero).toBe(heroForPair('vhs_tape', 'popcorn_bucket')!.name);
    expect(card.lines[0]).toMatch(/^HERO: /);
  });
});
