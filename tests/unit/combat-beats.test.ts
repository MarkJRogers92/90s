import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../../src/sim/model';
import { BOSS_SLAM_REACH, BOSS_SLAM_TELEGRAPH_TICKS, BOSS_VOLLEY_TELEGRAPH_TICKS } from '../../src/sim/combat/boss';
import { SPITTER_RECOVER_TICKS, SPITTER_TELEGRAPH_TICKS } from '../../src/sim/combat/enemies';
import { GOON_SHOT_CADENCE } from '../../src/sim/combat/districtEnemies';
import {
  HANGER_WARN_DISTANCE,
  HIT_STOP_MS,
  attackFrameFor,
  combinePoses,
  windupPose,
  diffEnemyAttacks,
  enemyWindups,
  hitReaction,
  hitStopFor,
  playerBodyAction,
} from '../../src/game/view/combatBeats';

function enemy(overrides: Partial<EnemyState>): EnemyState {
  return {
    id: 1, kind: 'spitter', x: 100, y: 100, health: 8, radius: 14,
    phase: 'recover', phaseTicks: 10, cooldownTicks: 0, telegraphAimX: 1, telegraphAimY: 0,
    ...overrides,
  } as EnemyState;
}

const farPlayer = { x: 600, y: 400 };

describe('enemy wind-ups', () => {
  it('shows a spitter wind-up only while its authored telegraph runs, filling toward the shot', () => {
    expect(enemyWindups(enemy({ phase: 'recover' }), farPlayer)).toEqual([]);
    const start = enemyWindups(enemy({ phase: 'telegraph', phaseTicks: SPITTER_TELEGRAPH_TICKS }), farPlayer);
    const late = enemyWindups(enemy({ phase: 'telegraph', phaseTicks: 1, telegraphAimX: 0, telegraphAimY: -1 }), farPlayer);
    expect(start).toHaveLength(1);
    expect(start[0]).toMatchObject({ kind: 'spit', progress: 0 });
    expect(late[0]).toMatchObject({ kind: 'spit', aimX: 0, aimY: -1 });
    expect(late[0]!.progress).toBeGreaterThan(0.95);
  });

  it('draws the boss slam at its real reach and the volley at its real five angles', () => {
    const slam = enemyWindups(enemy({ kind: 'lp_manager', phase: 'telegraph', phaseTicks: BOSS_SLAM_TELEGRAPH_TICKS / 2 }), farPlayer);
    expect(slam).toEqual([expect.objectContaining({ kind: 'slam', reach: BOSS_SLAM_REACH, progress: 0.5 })]);
    const volley = enemyWindups(enemy({ kind: 'lp_manager', phase: 'pursue', bossVolleyTelegraphTicks: BOSS_VOLLEY_TELEGRAPH_TICKS }), farPlayer);
    expect(volley[0]).toMatchObject({ kind: 'volley', progress: 0 });
    expect(volley[0]!.angles).toHaveLength(5);
    expect(volley[0]!.angles![2]).toBeCloseTo(0);
  });

  it('warns as a hanger closes to touching range, strongest when touching', () => {
    const hanger = enemy({ kind: 'hanger', phase: 'pursue', x: 100, y: 100 });
    expect(enemyWindups(hanger, { x: 100 + HANGER_WARN_DISTANCE + 1, y: 100 })).toEqual([]);
    const near = enemyWindups(hanger, { x: 100 + HANGER_WARN_DISTANCE / 2, y: 100 })[0]!;
    const touching = enemyWindups(hanger, { x: 110, y: 100 })[0]!;
    expect(near.kind).toBe('reach');
    expect(near.aimX).toBeCloseTo(1);
    expect(touching.progress).toBeGreaterThan(near.progress);
    expect(touching.progress).toBeLessThanOrEqual(1);
  });
});

describe('enemy attacks that land', () => {
  it('reports a spit the tick a spitter leaves its telegraph', () => {
    const before = new Map([['1', { phase: 'telegraph' as const, kind: 'spitter' as const }]]);
    const fired = diffEnemyAttacks(before, [enemy({ phase: 'recover', telegraphAimX: 0, telegraphAimY: 1 })]);
    expect(fired).toEqual([expect.objectContaining({ id: '1', kind: 'spit', aimY: 1 })]);
    expect(diffEnemyAttacks(new Map([['1', { phase: 'recover' as const, kind: 'spitter' as const }]]), [enemy({ phase: 'recover' })])).toEqual([]);
  });

  it('reports a slam when the boss leaves its telegraph, and a volley when its charge empties', () => {
    const slam = diffEnemyAttacks(
      new Map([['1', { phase: 'telegraph' as const, kind: 'lp_manager' as const, volley: 0 }]]),
      [enemy({ kind: 'lp_manager', phase: 'recover' })],
    );
    expect(slam.map((attack) => attack.kind)).toEqual(['slam']);
    const volley = diffEnemyAttacks(
      new Map([['1', { phase: 'pursue' as const, kind: 'lp_manager' as const, volley: 1 }]]),
      [enemy({ kind: 'lp_manager', phase: 'pursue', bossVolleyTelegraphTicks: 0 })],
    );
    expect(volley.map((attack) => attack.kind)).toEqual(['volley']);
  });
});

describe('hit stop', () => {
  it('holds longest on the beats that matter most and never stacks within one frame', () => {
    expect(hitStopFor([])).toBe(0);
    expect(hitStopFor([{ kind: 'hit', heavy: false }])).toBe(HIT_STOP_MS.hit);
    expect(hitStopFor([{ kind: 'hit', heavy: true }])).toBeGreaterThan(HIT_STOP_MS.hit);
    expect(hitStopFor([{ kind: 'kill', boss: false }])).toBeGreaterThan(hitStopFor([{ kind: 'hit', heavy: true }]));
    expect(hitStopFor([{ kind: 'playerHurt' }])).toBeGreaterThan(hitStopFor([{ kind: 'kill', boss: false }]));
    expect(hitStopFor([{ kind: 'kill', boss: true }])).toBeGreaterThan(hitStopFor([{ kind: 'playerHurt' }]));
    const many = hitStopFor([{ kind: 'hit', heavy: false }, { kind: 'hit', heavy: false }, { kind: 'kill', boss: false }]);
    expect(many).toBe(hitStopFor([{ kind: 'kill', boss: false }]));
  });
});

describe('hit reaction', () => {
  it('knocks the sprite back along the hit, flashes white, then settles to rest', () => {
    const first = hitReaction(0, 1, 0, false);
    expect(first.flash).toBe(true);
    expect(first.offsetX).toBeGreaterThan(0);
    expect(first.scaleX).not.toBe(1);
    const heavy = hitReaction(0, 1, 0, true);
    expect(heavy.offsetX).toBeGreaterThan(first.offsetX);
    const done = hitReaction(60, 1, 0, true);
    expect(done).toEqual({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false });
  });
});

describe('wind-up pose', () => {
  it('swells a charging spitter, then flashes on the tick before it fires', () => {
    const start = windupPose([{ kind: 'spit', progress: 0, aimX: 1, aimY: 0 }], 0);
    const mid = windupPose([{ kind: 'spit', progress: 0.5, aimX: 1, aimY: 0 }], 0);
    const last = windupPose([{ kind: 'spit', progress: 0.97, aimX: 1, aimY: 0 }], 0);
    expect(start.scaleX).toBeCloseTo(1);
    expect(mid.scaleX).toBeGreaterThan(1.1);
    expect(mid.flash).toBe(false);
    expect(last.flash).toBe(true);
  });

  it('lifts the boss before the slam and rears a hanger up toward the player', () => {
    expect(windupPose([{ kind: 'slam', progress: 0.8, aimX: 1, aimY: 0, reach: 44 }], 0).offsetY).toBeLessThan(-8);
    const rear = windupPose([{ kind: 'reach', progress: 1, aimX: 1, aimY: 0 }], 0);
    expect(rear.scaleY).toBeGreaterThan(1.15);
    expect(rear.offsetX).toBeGreaterThan(0);
  });

  it('is at rest with nothing charging, and combines with a hit reaction', () => {
    expect(windupPose([], 5)).toEqual({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false });
    const combined = combinePoses(windupPose([{ kind: 'spit', progress: 0.5, aimX: 1, aimY: 0 }], 0), hitReaction(0, -1, 0, false));
    expect(combined.flash).toBe(true);
    expect(combined.offsetX).toBeLessThan(0);
  });
});

describe('attack animation frames', () => {
  it('scrubs a spitter through its wind-up and plays the release after the shot', () => {
    const charging = enemy({ phase: 'telegraph', phaseTicks: SPITTER_TELEGRAPH_TICKS / 2 });
    const frame = attackFrameFor(charging, enemyWindups(charging, farPlayer), 9, 0);
    expect(frame).toBeGreaterThan(0);
    expect(frame).toBeLessThan(6);
    const justFired = enemy({ phase: 'recover', phaseTicks: SPITTER_RECOVER_TICKS - 1 });
    expect(attackFrameFor(justFired, [], 9, 0)).toBeGreaterThanOrEqual(6);
    const resting = enemy({ phase: 'recover', phaseTicks: 10 });
    expect(attackFrameFor(resting, [], 9, 0)).toBeNull();
  });

  it('plays a hockey goon slap shot release after the puck leaves, then its skating art', () => {
    // The goon fires from its telegraph straight into `pursue`, with the shot cadence reloaded.
    const justShot = enemy({ kind: 'goon', phase: 'pursue', cooldownTicks: GOON_SHOT_CADENCE - 1 });
    expect(attackFrameFor(justShot, [], 6, 0)).toBeGreaterThanOrEqual(4);
    const skating = enemy({ kind: 'goon', phase: 'pursue', cooldownTicks: GOON_SHOT_CADENCE - 20 });
    expect(attackFrameFor(skating, [], 6, 0)).toBeNull();
    // Arriving, it skates on half a cadence before its first shot: no release.
    const arriving = enemy({ kind: 'goon', phase: 'pursue', cooldownTicks: GOON_SHOT_CADENCE / 2 });
    expect(attackFrameFor(arriving, [], 6, 0)).toBeNull();
  });

  it('loops a hanger strike only while it is in touching range', () => {
    const hanger = enemy({ kind: 'hanger', phase: 'pursue' });
    expect(attackFrameFor(hanger, enemyWindups(hanger, farPlayer), 9, 0)).toBeNull();
    const close = enemyWindups(hanger, { x: 120, y: 100 });
    expect(attackFrameFor(hanger, close, 9, 7)).not.toBeNull();
  });
});

describe('player body action', () => {
  const frames = { swing: 7, hurt: 6, death: 7 };

  it('is the normal walk/idle art when nothing is happening', () => {
    expect(playerBodyAction({ swing: null, hurtAge: null, deadMs: null }, frames)).toBeNull();
  });

  it('scrubs the swing sheet with the visible swing', () => {
    expect(playerBodyAction({ swing: 0, hurtAge: null, deadMs: null }, frames)).toEqual({ sheet: 'swing', column: 0 });
    expect(playerBodyAction({ swing: 0.99, hurtAge: null, deadMs: null }, frames)).toEqual({ sheet: 'swing', column: 6 });
  });

  it('lets a hit interrupt a swing, and death override everything, holding the last frame', () => {
    expect(playerBodyAction({ swing: 0.5, hurtAge: 0, deadMs: null }, frames)?.sheet).toBe('hurt');
    expect(playerBodyAction({ swing: 0.5, hurtAge: 500, deadMs: null }, frames)?.sheet).toBe('swing');
    expect(playerBodyAction({ swing: 0.5, hurtAge: 0, deadMs: 0 }, frames)).toEqual({ sheet: 'death', column: 0 });
    expect(playerBodyAction({ swing: null, hurtAge: null, deadMs: 60_000 }, frames)).toEqual({ sheet: 'death', column: 6 });
  });

  it('skips any action whose sheet is not loaded', () => {
    expect(playerBodyAction({ swing: 0.5, hurtAge: 0, deadMs: 0 }, { swing: 0, hurt: 0, death: 0 })).toBeNull();
  });
});
