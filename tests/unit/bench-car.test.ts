import { describe, expect, it } from 'vitest';
import {
  CAR_BUMP_COOLDOWN_TICKS,
  CAR_BUMP_DAMAGE,
  CAR_LEASH,
  CAR_RADIUS,
  CAR_RECALL_DISTANCE,
  CAR_SEEK_RANGE,
  CAR_SPEED,
  selectCarTarget,
} from '../../src/sim/bench/car';
import { createBenchRun } from '../../src/sim/bench/createBenchRun';
import { BENCH_KIOSK, BENCH_SCENARIO_IDS, SERVICE_ANCHORS, SERVICE_DOORWAY, SERVICE_ENTRY_ANCHORS, SERVICE_WALLS, TEST_BAY_ANCHORS, TEST_BAY_DOORWAY, TEST_BAY_WALLS, getBenchScenario } from '../../src/sim/bench/scenarios';
import { confirmFusion, openFusionPreview } from '../../src/sim/bench/commands';
import { tickBenchRun } from '../../src/sim/bench/tickBenchRun';
import type { BenchInputFrame, BenchRunState } from '../../src/sim/bench/types';
import type { EnemyState } from '../../src/sim/model';
import { isPlayerProjectile } from '../../src/sim/effects/playerProjectiles';

function baseFrame(): BenchInputFrame {
  return { moveX: 0, moveY: 0, aimX: 760, aimY: 240, fire: false, interact: false, recall: false };
}

function makeEnemy(id: number, x: number, y: number, health = 8): EnemyState {
  return {
    id, kind: 'hanger', x, y, health, radius: 14,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0,
    telegraphAimX: 0, telegraphAimY: 0,
  };
}

function setEnemies(state: BenchRunState, enemies: EnemyState[]): void {
  state.combat.enemies = enemies;
  state.combat.nextEntityId = Math.max(0, ...enemies.map((enemy) => enemy.id)) + 1;
}

function fuseCleanSoaker(state: BenchRunState): void {
  openFusionPreview(state);
  expect(state.preview).not.toBeNull();
  confirmFusion(state);
  expect(state.carrier.mode).toBe('emitter');
}

describe('deterministic bench car simulation', () => {
  it('replays identically from equal starting states', () => {
    const first = createBenchRun('clean-soaker');
    const second = structuredClone(first);
    const inputs: BenchInputFrame[] = Array.from({ length: 60 }, () => baseFrame());
    for (const input of inputs) {
      tickBenchRun(first, input);
      tickBenchRun(second, input);
    }
    expect(second).toEqual(first);
  });

  it('uses the approved deterministic car constants', () => {
    expect(CAR_RADIUS).toBe(9);
    expect(CAR_SPEED).toBe(4);
    expect(CAR_SEEK_RANGE).toBe(220);
    expect(CAR_LEASH).toBe(180);
    expect(CAR_BUMP_DAMAGE).toBe(1);
    expect(CAR_BUMP_COOLDOWN_TICKS).toBe(45);
    expect(CAR_RECALL_DISTANCE).toBe(24);
    const state = createBenchRun('clean-soaker');
    expect(state.carrier.radius).toBe(9);
  });

  it('targets the nearest living enemy, breaking distance ties by entity ID', () => {
    const car = { x: 200, y: 240 };
    const near = makeEnemy(5, 400, 240);
    const far = makeEnemy(3, 500, 240);
    expect(selectCarTarget(car, [near, far])?.id).toBe(5);
    const tiedHigh = makeEnemy(7, 300, 240);
    const tiedLow = makeEnemy(4, 100, 240);
    expect(selectCarTarget(car, [tiedHigh, tiedLow])?.id).toBe(4);
    const dead = makeEnemy(1, 210, 240, 0);
    const outOfRange = makeEnemy(2, 200 + CAR_SEEK_RANGE + 10, 240);
    expect(selectCarTarget(car, [dead, outOfRange])).toBeNull();
  });

  it('seeks the nearest eligible enemy at speed 4', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, [makeEnemy(5, 400, 240), makeEnemy(3, 520, 240)]);
    state.combat.player.x = 300;
    state.combat.player.y = 240;
    state.carrier.x = 200;
    state.carrier.y = 240;
    tickBenchRun(state, baseFrame());
    expect(state.carrier.x).toBeCloseTo(204, 6);
    expect(state.carrier.y).toBeCloseTo(240, 6);
  });

  it('deals one bump damage and then honors the 45-tick cooldown', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    state.combat.player.x = 500;
    state.combat.player.y = 240;
    state.carrier.x = 600;
    state.carrier.y = 240;
    setEnemies(state, [makeEnemy(9, 600, 240)]);
    const bumpTarget = (): EnemyState => {
      const target = state.combat.enemies[0];
      if (!target) {
        throw new Error('Expected the bump target to exist.');
      }
      return target;
    };
    tickBenchRun(state, baseFrame());
    expect(bumpTarget().health).toBe(7);
    expect(state.carrier.bumpCooldownTicks).toBe(45);
    for (let index = 0; index < 44; index += 1) {
      bumpTarget().x = state.carrier.x;
      bumpTarget().y = state.carrier.y;
      tickBenchRun(state, baseFrame());
    }
    expect(bumpTarget().health).toBe(7);
    bumpTarget().x = state.carrier.x;
    bumpTarget().y = state.carrier.y;
    tickBenchRun(state, baseFrame());
    expect(bumpTarget().health).toBe(6);
  });

  it('returns toward the owner when no target is eligible', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, []);
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 300;
    state.carrier.y = 240;
    const before = Math.hypot(state.carrier.x - 160, state.carrier.y - 240);
    tickBenchRun(state, baseFrame());
    const after = Math.hypot(state.carrier.x - 160, state.carrier.y - 240);
    expect(after).toBeLessThan(before);
    expect(state.carrier.x).toBeCloseTo(296, 6);
  });

  it('never lets the independent car exceed the owner leash', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    state.combat.player.x = 400;
    state.combat.player.y = 240;
    state.carrier.x = 400;
    state.carrier.y = 240;
    setEnemies(state, [makeEnemy(9, 620, 240)]);
    for (let index = 0; index < 80; index += 1) {
      tickBenchRun(state, baseFrame());
      const distance = Math.hypot(state.carrier.x - 400, state.carrier.y - 240);
      expect(distance).toBeLessThanOrEqual(CAR_LEASH + 1e-6);
    }
    expect(state.carrier.x).toBeLessThanOrEqual(400 + CAR_LEASH + 1e-6);
  });

  it('slides around rectangular walls without entering them', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [{ x: 300, y: 200, width: 40, height: 80 }];
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 200;
    state.carrier.y = 240;
    setEnemies(state, [makeEnemy(9, 500, 300)]);
    const startX = state.carrier.x;
    const startY = state.carrier.y;
    for (let index = 0; index < 30; index += 1) {
      tickBenchRun(state, baseFrame());
      const wall = state.combat.walls[0];
      if (!wall) {
        throw new Error('Expected the blocking wall to exist.');
      }
      const nearestX = Math.max(wall.x, Math.min(state.carrier.x, wall.x + wall.width));
      const nearestY = Math.max(wall.y, Math.min(state.carrier.y, wall.y + wall.height));
      expect(Math.hypot(state.carrier.x - nearestX, state.carrier.y - nearestY)).toBeGreaterThanOrEqual(
        state.carrier.radius - 1e-6,
      );
    }
    expect({ x: state.carrier.x, y: state.carrier.y }).not.toEqual({ x: startX, y: startY });
  });

  it('keeps independent and emitter behavior mutually exclusive', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, []);
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 300;
    state.carrier.y = 240;
    tickBenchRun(state, { ...baseFrame(), recall: true });
    expect(state.carrier.recalling).toBe(false);
    fuseCleanSoaker(state);
    setEnemies(state, [makeEnemy(9, state.carrier.x, state.carrier.y)]);
    const emitterTarget = state.combat.enemies[0];
    if (!emitterTarget) {
      throw new Error('Expected the emitter target to exist.');
    }
    const healthBefore = emitterTarget.health;
    tickBenchRun(state, baseFrame());
    expect(emitterTarget.health).toBe(healthBefore);
  });

  it('steers the fused emitter toward the pointer inside the leash', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, []);
    fuseCleanSoaker(state);
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 200;
    state.carrier.y = 240;
    tickBenchRun(state, { ...baseFrame(), aimX: 700, aimY: 240 });
    expect(state.carrier.x).toBeGreaterThan(200);
    expect(state.carrier.y).toBeCloseTo(240, 6);
    for (let index = 0; index < 120; index += 1) {
      tickBenchRun(state, { ...baseFrame(), aimX: 900, aimY: 240 });
    }
    expect(state.carrier.x).toBeLessThanOrEqual(160 + CAR_LEASH + 1e-6);
  });

  it('recalls on the R edge until within 24 units of the player', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, []);
    fuseCleanSoaker(state);
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 330;
    state.carrier.y = 240;
    tickBenchRun(state, { ...baseFrame(), aimX: 700, aimY: 240, recall: true });
    expect(state.carrier.recalling).toBe(true);
    let ticks = 0;
    while (state.carrier.recalling && ticks < 120) {
      tickBenchRun(state, { ...baseFrame(), aimX: 700, aimY: 240 });
      ticks += 1;
    }
    expect(state.carrier.recalling).toBe(false);
    expect(Math.hypot(state.carrier.x - 160, state.carrier.y - 240)).toBeLessThanOrEqual(
      CAR_RECALL_DISTANCE + 1e-6,
    );
  });

  it('fires fused shots from the car while WASD moves only the player', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    setEnemies(state, []);
    fuseCleanSoaker(state);
    state.combat.player.x = 160;
    state.combat.player.y = 240;
    state.carrier.x = 240;
    state.carrier.y = 240;
    const playerBeforeX = state.combat.player.x;
    tickBenchRun(state, {
      ...baseFrame(), moveX: 1, moveY: 0, aimX: 340, aimY: 240, fire: true,
    });
    expect(state.combat.player.x).toBeGreaterThan(playerBeforeX);
    const shots = state.combat.projectiles.filter(isPlayerProjectile);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      const origin = shot.sampledPath[0];
      if (!origin) {
        throw new Error('Expected the shot to record its firing origin.');
      }
      expect(Math.hypot(origin.x - state.carrier.x, origin.y - state.carrier.y))
        .toBeLessThanOrEqual(4 + 1e-6);
      expect(Math.hypot(origin.x - state.combat.player.x, origin.y - state.combat.player.y))
        .toBeGreaterThan(10);
    }
  });

  it('deep-freezes authored scenarios, kiosk, walls, doorways, and anchors', () => {
    expect(Object.isFrozen(BENCH_SCENARIO_IDS)).toBe(true);
    expect(Object.isFrozen(BENCH_KIOSK)).toBe(true);
    expect(Object.isFrozen(SERVICE_WALLS)).toBe(true);
    expect(Object.isFrozen(TEST_BAY_WALLS)).toBe(true);
    expect(Object.isFrozen(SERVICE_DOORWAY)).toBe(true);
    expect(Object.isFrozen(TEST_BAY_DOORWAY)).toBe(true);
    expect(Object.isFrozen(SERVICE_ANCHORS)).toBe(true);
    expect(Object.isFrozen(SERVICE_ENTRY_ANCHORS)).toBe(true);
    expect(Object.isFrozen(TEST_BAY_ANCHORS)).toBe(true);
    for (const scenarioId of BENCH_SCENARIO_IDS) {
      const definition = getBenchScenario(scenarioId);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.leaves)).toBe(true);
      for (const leaf of definition.leaves) {
        expect(Object.isFrozen(leaf)).toBe(true);
      }
    }
    expect(Object.isFrozen(SERVICE_ANCHORS.player)).toBe(true);
    expect(Object.isFrozen(SERVICE_ANCHORS.carrier)).toBe(true);
    expect(Object.isFrozen(TEST_BAY_ANCHORS.player)).toBe(true);
    expect(Object.isFrozen(TEST_BAY_ANCHORS.carrier)).toBe(true);
  });

  it('prevents authored mutation from leaking into a fresh run', () => {
    const before = JSON.stringify(getBenchScenario('clean-soaker'));
    const beforeCash = createBenchRun('clean-soaker').fusion.cash;
    try {
      (getBenchScenario('clean-soaker') as unknown as { cash: number }).cash = 999;
    } catch {
      // frozen writes throw in strict mode; the value must stay put either way
    }
    expect(JSON.stringify(getBenchScenario('clean-soaker'))).toBe(before);
    expect(createBenchRun('clean-soaker').fusion.cash).toBe(beforeCash);
    expect(createBenchRun('clean-soaker').fusion.cash).toBe(10);
  });
});
