import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN_TICKS, DASH_TICKS } from '../../src/sim/combat/dash';
import {
  DASH_HINT_LIMIT,
  LOW_HEALTH,
  SPAWN_IN_TICKS,
  dashReadiness,
  heartbeatIntervalMs,
  shouldHintDash,
  spawnInPose,
} from '../../src/game/view/playerCues';
import type { Windup } from '../../src/game/view/combatBeats';

const spit = (progress: number, aimX = 1, aimY = 0): Windup => ({ kind: 'spit', progress, aimX, aimY });

describe('dash readiness', () => {
  it('is full when no cooldown is running and fills back up over the cooldown', () => {
    expect(dashReadiness({})).toBe(1);
    expect(dashReadiness({ dashCooldownTicks: DASH_TICKS + DASH_COOLDOWN_TICKS })).toBe(0);
    expect(dashReadiness({ dashCooldownTicks: Math.round(DASH_COOLDOWN_TICKS / 2) })).toBeCloseTo(0.5, 1);
  });
});

describe('dash hint', () => {
  const player = { x: 200, y: 200 };
  const spitter = { x: 100, y: 200 };

  it('appears when a charging spit is aimed at the janitor and a dash is ready', () => {
    expect(shouldHintDash([{ enemy: spitter, windups: [spit(0.5)] }], player, 1, 0)).toBe(true);
  });

  it('stays quiet for a spit aimed elsewhere, early in a wind-up, or while cooling down', () => {
    expect(shouldHintDash([{ enemy: spitter, windups: [spit(0.5, 0, 1)] }], player, 1, 0)).toBe(false);
    expect(shouldHintDash([{ enemy: spitter, windups: [spit(0.1)] }], player, 1, 0)).toBe(false);
    expect(shouldHintDash([{ enemy: spitter, windups: [spit(0.5)] }], player, 0.4, 0)).toBe(false);
  });

  it('warns about a slam only inside its reach', () => {
    const boss = { x: 200, y: 240 };
    const slam: Windup = { kind: 'slam', progress: 0.5, aimX: 0, aimY: -1, reach: 44 };
    expect(shouldHintDash([{ enemy: boss, windups: [slam] }], player, 1, 0)).toBe(true);
    expect(shouldHintDash([{ enemy: { x: 400, y: 240 }, windups: [slam] }], player, 1, 0)).toBe(false);
  });

  it('retires once the player has dashed enough to know', () => {
    expect(shouldHintDash([{ enemy: spitter, windups: [spit(0.5)] }], player, 1, DASH_HINT_LIMIT)).toBe(false);
  });
});

describe('low health', () => {
  it('beats only at the last heart, faster at half a heart', () => {
    expect(heartbeatIntervalMs(LOW_HEALTH + 1)).toBeNull();
    expect(heartbeatIntervalMs(0)).toBeNull();
    expect(heartbeatIntervalMs(2)).not.toBeNull();
    expect(heartbeatIntervalMs(1)!).toBeLessThan(heartbeatIntervalMs(2)!);
  });
});

describe('spawn-in', () => {
  it('rises from the floor with a flash, then rests', () => {
    const first = spawnInPose(0);
    expect(first.scaleY).toBeLessThan(0.5);
    expect(first.flash).toBe(true);
    expect(spawnInPose(SPAWN_IN_TICKS)).toEqual({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false });
  });
});
