import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../../src/sim/model';
import { BOSS_CONFIGS } from '../../src/sim/combat/boss';
import { ROOFER_LOB_TICKS, TAR_SPLASH_RADIUS } from '../../src/sim/combat/roofer';
import { enemyWindups } from '../../src/game/view/combatBeats';

function enemy(overrides: Partial<EnemyState>): EnemyState {
  return {
    id: 1, kind: 'roofer', x: 500, y: 200, health: 20, radius: 15,
    phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: -1, telegraphAimY: 0, ...overrides,
  } as EnemyState;
}

const player = { x: 300, y: 200 };

describe('Roof wind-ups', () => {
  it('a Roofer’s bucket in the air shows a landing ring the size of the splash, where it will land', () => {
    const [lob] = enemyWindups(enemy({ phase: 'telegraph', phaseTicks: ROOFER_LOB_TICKS / 2, lobX: 320, lobY: 210 }), player);
    expect(lob).toMatchObject({ kind: 'lob', targetX: 320, targetY: 210, reach: TAR_SPLASH_RADIUS });
    expect(lob!.progress).toBeCloseTo(0.5, 2);
    expect(enemyWindups(enemy({ phase: 'recover', phaseTicks: 30 }), player)).toEqual([]);
  });

  it('every bucket of the Developer’s barrage shows its own ring', () => {
    const lobTicks = BOSS_CONFIGS.developer.tarBarrage!.lobTicks;
    const developer = enemy({
      kind: 'developer', health: 100, radius: 26, phase: 'recover', phaseTicks: 40,
      tarStrikes: [{ x: 300, y: 200, ticks: lobTicks }, { x: 372, y: 200, ticks: lobTicks / 4 }],
    });
    const lobs = enemyWindups(developer, player).filter((windup) => windup.kind === 'lob');
    expect(lobs.map((lob) => [lob.targetX, lob.targetY])).toEqual([[300, 200], [372, 200]]);
    expect(lobs[0]!.progress).toBeCloseTo(0, 2);
    expect(lobs[1]!.progress).toBeCloseTo(0.75, 2);
  });
});
