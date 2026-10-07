// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATTACK_RELEASE_TICKS, attackFrameFor, enemyWindups } from '../../src/game/view/combatBeats';
import { STATIC_RECOVER_TICKS, STATIC_TELEGRAPH_TICKS } from '../../src/sim/combat/staticEnemy';
import { NEON_ASSETS } from '../../src/game/presentation/assets';
import type { EnemyState } from '../../src/sim/model';

/**
 * Roadmap V2, the last wind-up enemy: the Static's blink. It glitches and
 * dissolves over its 34-tick lock-on, then re-forms on the mark in a flash.
 */
const FRAMES = 6;
const WINDUP = FRAMES - Math.floor(FRAMES / 3);

const staticEnemy = (phase: EnemyState['phase'], phaseTicks: number): EnemyState => ({
  id: 1, kind: 'static', x: 400, y: 240, health: 14, radius: 14, phase, phaseTicks,
  cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, blinkX: 300, blinkY: 240,
});
const frameAt = (enemy: EnemyState) => attackFrameFor(enemy, enemyWindups(enemy, { x: 300, y: 240 }), FRAMES, 0);

describe('the Static blinks with its own animation (roadmap V2)', () => {
  it('walks through the wind-up frames as the lock-on runs, in order, never reaching the release early', () => {
    const frames = Array.from({ length: STATIC_TELEGRAPH_TICKS }, (_, i) => frameAt(staticEnemy('telegraph', STATIC_TELEGRAPH_TICKS - i)));
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(WINDUP - 1);
    for (let i = 1; i < frames.length; i += 1) expect(frames[i]!).toBeGreaterThanOrEqual(frames[i - 1]!);
    expect(Math.max(...(frames as number[]))).toBeLessThan(WINDUP);
  });

  it('re-forms on the mark in the release frames, then returns to its walk', () => {
    expect(frameAt(staticEnemy('recover', STATIC_RECOVER_TICKS))).toBe(WINDUP);
    expect(frameAt(staticEnemy('recover', STATIC_RECOVER_TICKS - ATTACK_RELEASE_TICKS + 1))).toBe(FRAMES - 1);
    expect(frameAt(staticEnemy('recover', STATIC_RECOVER_TICKS - ATTACK_RELEASE_TICKS))).toBeNull();
    expect(frameAt(staticEnemy('pursue', 30))).toBeNull();
  });

  it('ships a sheet the shape of its walk: six frames for each of eight facings, at 96 px', () => {
    const png = readFileSync('public/assets/neon/enemies/static-attack.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([FRAMES * 96, 8 * 96]);
    expect(NEON_ASSETS.some((asset) => asset.key === 'neon:enemy:static-attack' && asset.url.endsWith('enemies/static-attack.png'))).toBe(true);
  });
});
