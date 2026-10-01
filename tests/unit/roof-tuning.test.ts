import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { BOSS_CONFIGS } from '../../src/sim/combat/boss';
import { TAR_PUDDLE_RADIUS, TAR_PUDDLE_TICKS } from '../../src/sim/combat/tar';
import { floorSpec } from '../../src/sim/wing/floorSpecs';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import type { MvpRunState } from '../../src/sim/run/types';
import { advance, emptyFixture, frame } from '../helpers';

const enemy = (overrides: Partial<EnemyState>): EnemyState => ({
  id: 60, kind: 'roofer', x: 0, y: 0, health: 20, radius: 15,
  phase: 'recover', phaseTicks: 40, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
} as EnemyState);

/** One hit of `amount` with tar freshly spilled under the janitor. */
function tarHit(state: MvpRunState, recorder: PlaytestRecorder, before: EnemyState[], after: EnemyState[]): void {
  const combat = state.room.combat;
  const p = combat.player;
  combat.enemies = before;
  combat.tar = [];
  recorder.observe(state);
  combat.enemies = after;
  combat.tar = [{ x: p.x, y: p.y, radius: TAR_PUDDLE_RADIUS, ticks: TAR_PUDDLE_TICKS - 1 }];
  state.tick += 5;
  p.health -= 1;
  recorder.observe(state);
}

describe('the playtest log sees the Roof', () => {
  it('names a Roofer bucket and the Developer barrage as their own damage sources', () => {
    const state = createMvpRun(9, { floor: 4 });
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    const p = state.room.combat.player;
    const roofer = enemy({ x: p.x + 250, y: p.y });
    tarHit(state, recorder, [roofer], [roofer]);
    const developer = (strikes: number) => enemy({ id: 61, kind: 'developer', x: p.x + 300, y: p.y, health: 200, radius: 26, tarStrikes: Array.from({ length: strikes }, () => ({ x: p.x, y: p.y, ticks: 1 })) });
    tarHit(state, recorder, [developer(3)], [developer(0)]);
    state.room.combat.enemies = [];
    state.room.combat.tar = [];
    state.tick += 5;
    // The finishing blow comes from nowhere in particular, so it alone is 'other'.
    const finishing = p.health;
    p.health = 0;
    state.status = 'dead';
    const record = recorder.observe(state)!;
    expect(record.rooms[0]!.damage.roofer).toBe(1);
    expect(record.rooms[0]!.damage.barrage).toBe(1);
    expect(record.rooms[0]!.damage.other).toBe(finishing);
  });
});

describe('each floor is tougher than the one below', () => {
  const firstFightHealth = (floor: 1 | 2 | 3 | 4, seed: number) => {
    const state = createMvpRun(seed, { floor });
    const index = state.wing.rooms.findIndex((room) => room.enemySpawns.length > 0);
    const combat = buildRoomCombatState(state.wing, index, 'west', state.inventory, state.seed);
    // Authored monsters only: mannequin displays and security are not floor difficulty.
    return combat.enemies.filter((foe) => !foe.elite && foe.kind !== 'mannequin').map((foe) => [foe.kind, foe.health] as const);
  };

  it('scales regular monsters by the floor, and the Roof the most', () => {
    expect(floorSpec(1).enemyHealthScale).toBe(1);
    const scales = ([1, 2, 3, 4] as const).map((floor) => floorSpec(floor).enemyHealthScale);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(scales[3]).toBeGreaterThan(scales[2]!);
    // A Hanger on the Roof has more health than a Hanger downstairs.
    const base = new Map(firstFightHealth(1, 4).map(([kind, health]) => [kind, health]));
    for (const seed of [2, 3, 4, 5]) {
      for (const [kind, health] of firstFightHealth(4, seed)) {
        const ground = base.get(kind);
        if (ground !== undefined) expect(health).toBe(Math.round(ground * floorSpec(4).enemyHealthScale));
      }
    }
  });
});

describe('the Developer is the hardest boss', () => {
  it('outlasts the Owner', () => {
    expect(BOSS_CONFIGS.developer.maxHealth).toBeGreaterThanOrEqual(BOSS_CONFIGS.owner.maxHealth + 100);
  });

  it('throws a tar barrage from the first phase', () => {
    const state = emptyFixture();
    const config = BOSS_CONFIGS.developer;
    state.enemies = [{
      id: 50, kind: 'developer', x: 560, y: 160, health: config.maxHealth, radius: config.radius,
      phase: 'telegraph', phaseTicks: 1, cooldownTicks: 999, telegraphAimX: -1, telegraphAimY: 0, bossAttacks: 1,
    } as EnemyState];
    tickRun(state, frame());
    expect(state.enemies[0]!.tarStrikes?.length ?? 0).toBe(config.tarBarrage!.counts[0]);
    expect(config.tarBarrage!.counts[0]).toBeGreaterThan(0);
    advance(state, frame(), config.tarBarrage!.lobTicks + 1);
    expect(state.tar?.length ?? 0).toBeGreaterThan(0);
  });
});
