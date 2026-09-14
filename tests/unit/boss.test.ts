import { describe, expect, it } from 'vitest';
import {
  BOSS_PURSUE_TICKS,
  BOSS_SLAM_RECOVER_TICKS,
  BOSS_SLAM_RECOVER_TICKS_PHASE3,
  BOSS_SLAM_TELEGRAPH_TICKS,
  BOSS_SUMMON_OFFSETS,
  BOSS_VOLLEY_CADENCE_PHASE2,
  BOSS_VOLLEY_CADENCE_PHASE3,
  BOSS_VOLLEY_TELEGRAPH_TICKS,
  bossPhaseForHealth,
} from '../../src/sim/combat/boss';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState, RunState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

function boss(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 10,
    kind: 'lp_manager',
    x: 500,
    y: 240,
    health: 60,
    radius: 22,
    phase: 'pursue',
    phaseTicks: BOSS_PURSUE_TICKS,
    cooldownTicks: BOSS_VOLLEY_CADENCE_PHASE2,
    telegraphAimX: 0,
    telegraphAimY: 0,
    ...overrides,
  };
}

function quietBoss(overrides: Partial<EnemyState> = {}): EnemyState {
  return boss({ phase: 'recover', phaseTicks: 100_000, ...overrides });
}

function stateWithBoss(current: EnemyState): RunState {
  const state = emptyFixture();
  state.enemies = [current];
  state.roomWasPopulated = true;
  return state;
}

describe('boss phase thresholds', () => {
  it.each([
    [60, 1],
    [40, 1],
    [39, 2],
    [21, 2],
    [20, 3],
    [1, 3],
  ] as const)('maps health %i to boss phase %i', (health, expected) => {
    expect(bossPhaseForHealth(health)).toBe(expected);
  });

  it('recomputes the phase exactly when health crosses a threshold', () => {
    const state = stateWithBoss(quietBoss({ health: 40, bossSummoned: true }));
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(1);

    state.enemies[0]!.health = 39;
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(2);

    state.enemies[0]!.health = 21;
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(2);

    state.enemies[0]!.health = 20;
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(3);
  });
});

describe('boss slam', () => {
  it('winds up for 36 ticks with a locked aim, then deals 2 damage within reach', () => {
    const state = stateWithBoss(
      boss({ phase: 'pursue', phaseTicks: 1, cooldownTicks: 150 }),
    );
    state.player.x = 520;
    state.player.y = 240;

    tickRun(state, frame());
    const entered = state.enemies[0]!;
    expect(entered.phase).toBe('telegraph');
    expect(entered.phaseTicks).toBe(BOSS_SLAM_TELEGRAPH_TICKS);
    expect(entered.telegraphAimX).toBeCloseTo(1, 10);
    expect(entered.telegraphAimY).toBeCloseTo(0, 10);

    state.player.x = 300;
    state.player.y = 160;
    advance(state, frame(), BOSS_SLAM_TELEGRAPH_TICKS - 1);
    expect(state.enemies[0]?.phase).toBe('telegraph');
    expect(state.enemies[0]?.telegraphAimX).toBeCloseTo(1, 10);
    expect(state.enemies[0]?.telegraphAimY).toBeCloseTo(0, 10);
    expect(state.player.health).toBe(6);

    state.player.x = 520;
    state.player.y = 240;
    tickRun(state, frame());
    expect(state.player.health).toBe(4);
    expect(state.player.invulnerableTicks).toBe(60);
    expect(state.enemies[0]?.phase).toBe('recover');
    expect(state.enemies[0]?.phaseTicks).toBe(BOSS_SLAM_RECOVER_TICKS);
  });

  it('deals no slam damage beyond 44 units but still enters recover', () => {
    const state = stateWithBoss(
      boss({ phase: 'telegraph', phaseTicks: 1, telegraphAimX: -1, telegraphAimY: 0 }),
    );
    state.player.x = 300;
    state.player.y = 160;

    tickRun(state, frame());
    expect(state.player.health).toBe(6);
    expect(state.enemies[0]?.phase).toBe('recover');
    expect(state.enemies[0]?.phaseTicks).toBe(BOSS_SLAM_RECOVER_TICKS);
  });

  it('respects the existing invulnerability window without adding a new rule', () => {
    const state = stateWithBoss(
      boss({ phase: 'telegraph', phaseTicks: 1, telegraphAimX: -1, telegraphAimY: 0 }),
    );
    state.player.x = 500;
    state.player.y = 240;
    state.player.invulnerableTicks = 10;

    tickRun(state, frame());
    expect(state.player.health).toBe(6);
    expect(state.enemies[0]?.phase).toBe('recover');
  });

  it('shortens the slam recover to 60 ticks in phase 3', () => {
    const state = stateWithBoss(
      boss({
        health: 20,
        bossSummoned: true,
        phase: 'telegraph',
        phaseTicks: 1,
        telegraphAimX: -1,
        telegraphAimY: 0,
      }),
    );
    state.player.x = 300;
    state.player.y = 160;

    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(3);
    expect(state.enemies[0]?.phase).toBe('recover');
    expect(state.enemies[0]?.phaseTicks).toBe(BOSS_SLAM_RECOVER_TICKS_PHASE3);
  });

  it('does not move during telegraph or recover', () => {
    const telegraph = stateWithBoss(
      boss({ phase: 'telegraph', phaseTicks: 36, telegraphAimX: -1, telegraphAimY: 0 }),
    );
    advance(telegraph, frame(), 10);
    expect(telegraph.enemies[0]?.x).toBe(500);
    expect(telegraph.enemies[0]?.y).toBe(240);

    const recover = stateWithBoss(boss({ phase: 'recover', phaseTicks: 90 }));
    advance(recover, frame(), 10);
    expect(recover.enemies[0]?.x).toBe(500);
    expect(recover.enemies[0]?.y).toBe(240);
  });
});

describe('boss volley', () => {
  it('never fires a volley in phase 1', () => {
    const state = stateWithBoss(
      quietBoss({ health: 60, cooldownTicks: 1 }),
    );
    advance(state, frame(), 200);
    expect(state.projectiles).toHaveLength(0);
  });

  it('telegraphs for 45 ticks then fires five projectiles in stable angular order', () => {
    const state = stateWithBoss(
      quietBoss({ health: 39, cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS + 1 }),
    );
    const bossX = state.enemies[0]!.x;
    const bossY = state.enemies[0]!.y;
    state.player.x = 700;
    state.player.y = 240;

    tickRun(state, frame());
    const lockedX = state.enemies[0]!.telegraphAimX;
    const lockedY = state.enemies[0]!.telegraphAimY;
    expect(state.projectiles).toHaveLength(0);

    state.player.x = 900;
    state.player.y = 440;
    advance(state, frame(), BOSS_VOLLEY_TELEGRAPH_TICKS - 1);
    expect(state.enemies[0]?.telegraphAimX).toBeCloseTo(lockedX, 10);
    expect(state.enemies[0]?.telegraphAimY).toBeCloseTo(lockedY, 10);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(5);

    const baseAngle = Math.atan2(lockedY, lockedX);
    const spread = [-30, -15, 0, 15, 30].map((degrees) => (degrees * Math.PI) / 180);
    const angles = state.projectiles.map((shot) => Math.atan2(shot.velocityY, shot.velocityX));
    state.projectiles.forEach((shot, index) => {
      const expectedAngle = baseAngle + spread[index]!;
      expect(shot.faction).toBe('enemy');
      expect(shot.radius).toBe(5);
      expect(shot.damage).toBe(1);
      expect(Math.hypot(shot.velocityX, shot.velocityY)).toBeCloseTo(2.5, 10);
      expect(Math.atan2(shot.velocityY, shot.velocityX)).toBeCloseTo(expectedAngle, 10);
      expect(shot.remainingTicks).toBe(240 - 1);
      expect(shot.x).toBeCloseTo(bossX + shot.velocityX, 10);
      expect(shot.y).toBeCloseTo(bossY + shot.velocityY, 10);
      expect(shot.previousX).toBeCloseTo(bossX, 10);
      expect(shot.previousY).toBeCloseTo(bossY, 10);
    });
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index]! - angles[index - 1]!).toBeCloseTo(Math.PI / 12, 10);
    }
    const ids = state.projectiles.map((shot) => shot.id);
    expect(ids).toEqual([3, 4, 5, 6, 7]);
  });

  it('repeats every 150 ticks in phase 2', () => {
    const state = stateWithBoss(
      quietBoss({ health: 39, cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS + 1 }),
    );
    state.player.x = 900;
    state.player.y = 440;
    advance(state, frame(), BOSS_VOLLEY_TELEGRAPH_TICKS + 1);
    expect(state.projectiles).toHaveLength(5);

    state.projectiles = [];
    advance(state, frame(), BOSS_VOLLEY_CADENCE_PHASE2 - 1);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(5);
    expect(state.enemies[0]?.cooldownTicks).toBe(BOSS_VOLLEY_CADENCE_PHASE2);
  });

  it('repeats every 120 ticks in phase 3', () => {
    const state = stateWithBoss(
      quietBoss({ health: 20, bossSummoned: true, cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS + 1 }),
    );
    state.player.x = 900;
    state.player.y = 440;
    advance(state, frame(), BOSS_VOLLEY_TELEGRAPH_TICKS + 1);
    expect(state.projectiles).toHaveLength(5);

    state.projectiles = [];
    advance(state, frame(), BOSS_VOLLEY_CADENCE_PHASE3 - 1);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(5);
    expect(state.enemies[0]?.cooldownTicks).toBe(BOSS_VOLLEY_CADENCE_PHASE3);
  });

  it('exposes a 45-tick volley telegraph that fires when it reaches zero', () => {
    const state = stateWithBoss(
      quietBoss({ health: 39, cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS + 1 }),
    );
    state.player.x = 900;
    state.player.y = 440;

    tickRun(state, frame());
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(BOSS_VOLLEY_TELEGRAPH_TICKS);
    expect(state.projectiles).toHaveLength(0);

    advance(state, frame(), BOSS_VOLLEY_TELEGRAPH_TICKS - 1);
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(1);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(5);
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(0);
  });

  it('leaves the volley telegraph clear in phase 1', () => {
    const state = stateWithBoss(quietBoss({ health: 60, cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS }));

    advance(state, frame(), 5);

    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(0);
    expect(state.projectiles).toHaveLength(0);
  });

  it('defers the slam telegraph until the volley telegraph clears', () => {
    const state = stateWithBoss(
      boss({
        health: 39,
        phase: 'pursue',
        phaseTicks: 1,
        cooldownTicks: BOSS_VOLLEY_TELEGRAPH_TICKS + 1,
      }),
    );
    state.player.x = 900;
    state.player.y = 440;

    tickRun(state, frame());
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(BOSS_VOLLEY_TELEGRAPH_TICKS);
    expect(state.enemies[0]?.phase).toBe('pursue');

    advance(state, frame(), BOSS_VOLLEY_TELEGRAPH_TICKS - 1);
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(1);
    expect(state.enemies[0]?.phase).toBe('pursue');
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(5);
    expect(state.enemies[0]?.bossVolleyTelegraphTicks).toBe(0);
    expect(state.enemies[0]?.phase).toBe('telegraph');
    expect(state.enemies[0]?.phaseTicks).toBe(BOSS_SLAM_TELEGRAPH_TICKS);
  });
});

describe('boss summon', () => {
  it('summons exactly two hangers once on phase-3 entry with stable ids', () => {
    const state = stateWithBoss(quietBoss({ health: 21, cooldownTicks: 150 }));
    state.nextEntityId = 100;
    state.player.x = 900;
    state.player.y = 440;

    tickRun(state, frame());
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]?.bossSummoned).toBeFalsy();

    state.enemies[0]!.health = 20;
    tickRun(state, frame());
    expect(state.enemies).toHaveLength(3);
    expect(state.enemies[0]?.bossPhase).toBe(3);
    expect(state.enemies[0]?.bossSummoned).toBe(true);

    const bossX = state.enemies[0]!.x;
    const bossY = state.enemies[0]!.y;
    // Summoned Hangers join the same enemy sweep, so each takes one
    // 95/60-unit pursuit step toward the player on the summon tick.
    const hangerStep = (spotX: number, spotY: number) => {
      const dx = state.player.x - spotX;
      const dy = state.player.y - spotY;
      const divisor = Math.max(1, Math.hypot(dx, dy));
      return { x: spotX + (dx / divisor) * (95 / 60), y: spotY + (dy / divisor) * (95 / 60) };
    };
    const firstSpot = hangerStep(bossX + BOSS_SUMMON_OFFSETS[0]!.x, bossY + BOSS_SUMMON_OFFSETS[0]!.y);
    const secondSpot = hangerStep(bossX + BOSS_SUMMON_OFFSETS[1]!.x, bossY + BOSS_SUMMON_OFFSETS[1]!.y);
    const first = state.enemies[1]!;
    const second = state.enemies[2]!;
    expect(first.id).toBe(100);
    expect(second.id).toBe(101);
    expect(state.nextEntityId).toBe(102);
    for (const summoned of [first, second]) {
      expect(summoned.kind).toBe('hanger');
      expect(summoned.health).toBe(8);
      expect(summoned.radius).toBe(14);
      expect(summoned.phase).toBe('pursue');
    }
    expect(first.x).toBeCloseTo(firstSpot.x, 8);
    expect(first.y).toBeCloseTo(firstSpot.y, 8);
    expect(second.x).toBeCloseTo(secondSpot.x, 8);
    expect(second.y).toBeCloseTo(secondSpot.y, 8);
    for (const summoned of [first, second]) {
      expect(summoned.x).toBeGreaterThanOrEqual(summoned.radius);
      expect(summoned.x).toBeLessThanOrEqual(960 - summoned.radius);
      expect(summoned.y).toBeGreaterThanOrEqual(summoned.radius);
      expect(summoned.y).toBeLessThanOrEqual(480 - summoned.radius);
      expect(circleIntersectsRect(summoned.x, summoned.y, summoned.radius, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
    }
    for (const wall of state.walls) {
      expect(circleIntersectsRect(first.x, first.y, first.radius, wall)).toBe(false);
      expect(circleIntersectsRect(second.x, second.y, second.radius, wall)).toBe(false);
    }
  });

  it('never summons again after healing and re-entering phase 3', () => {
    const state = stateWithBoss(quietBoss({ health: 20, cooldownTicks: 150 }));
    state.nextEntityId = 100;
    state.player.x = 900;
    state.player.y = 440;

    tickRun(state, frame());
    expect(state.enemies).toHaveLength(3);

    state.enemies[0]!.health = 60;
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(1);

    state.enemies[0]!.health = 10;
    tickRun(state, frame());
    expect(state.enemies[0]?.bossPhase).toBe(3);
    expect(state.enemies).toHaveLength(3);
    expect(state.nextEntityId).toBe(102);
  });
});

describe('boss movement and contact', () => {
  it('pursues at 0.5 units per tick without passing through walls', () => {
    const state = stateWithBoss(boss({ phase: 'pursue', phaseTicks: 1000, cooldownTicks: 150 }));
    state.player.x = 300;
    state.player.y = 160;
    state.walls = [{ x: 380, y: 100, width: 20, height: 280 }];

    const startX = state.enemies[0]!.x;
    const startY = state.enemies[0]!.y;
    const startDistance = Math.hypot(state.player.x - startX, state.player.y - startY);
    advance(state, frame(), 10);
    const endX = state.enemies[0]!.x;
    const endY = state.enemies[0]!.y;
    const endDistance = Math.hypot(state.player.x - endX, state.player.y - endY);
    expect(endDistance).toBeLessThan(startDistance);
    expect(Math.hypot(endX - startX, endY - startY)).toBeCloseTo(0.5 * 10, 8);
    for (const wall of state.walls) {
      expect(circleIntersectsRect(endX, endY, 22, wall)).toBe(false);
    }

    advance(state, frame(), 400);
    const pinned = state.enemies[0]!;
    expect(pinned.x).toBeGreaterThan(380 + 20 + 22 - 1);
    for (const wall of state.walls) {
      expect(circleIntersectsRect(pinned.x, pinned.y, pinned.radius, wall)).toBe(false);
    }
    expect(pinned.x).toBeGreaterThanOrEqual(pinned.radius);
    expect(pinned.x).toBeLessThanOrEqual(960 - pinned.radius);
    expect(pinned.y).toBeGreaterThanOrEqual(pinned.radius);
    expect(pinned.y).toBeLessThanOrEqual(480 - pinned.radius);
  });

  it('never damages the player by body contact', () => {
    const state = stateWithBoss(
      quietBoss({ health: 60, x: 300, y: 160, cooldownTicks: 150 }),
    );
    advance(state, frame(), 30);
    expect(state.player.health).toBe(6);
  });
});

describe('unchanged M1 enemies', () => {
  function m1Enemy(overrides: Partial<EnemyState> = {}): EnemyState {
    return {
      id: 20,
      kind: 'hanger',
      x: 350,
      y: 160,
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

  it('limits sustained hanger overlap to one hit per invulnerability window', () => {
    const state = emptyFixture();
    state.enemies = [m1Enemy({ x: 300 })];
    state.roomWasPopulated = true;

    advance(state, frame(), 30);
    expect(state.player.health).toBe(5);

    advance(state, frame(), 30);
    expect(state.player.health).toBe(5);

    tickRun(state, frame());
    expect(state.player.health).toBe(4);
  });

  it('fires the spitter projectile on tick 36 of its telegraph', () => {
    const state = emptyFixture();
    state.enemies = [
      m1Enemy({
        kind: 'spitter',
        x: 500,
        y: 160,
        phase: 'telegraph',
        phaseTicks: 36,
        telegraphAimX: -1,
        telegraphAimY: 0,
      }),
    ];
    state.roomWasPopulated = true;

    advance(state, frame(), 35);
    expect(state.projectiles).toHaveLength(0);

    tickRun(state, frame());
    expect(state.projectiles).toHaveLength(1);
    expect(state.enemies[0]?.phase).toBe('recover');
    expect(state.enemies[0]?.phaseTicks).toBe(90);
  });
});
