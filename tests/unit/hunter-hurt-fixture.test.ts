import { describe, expect, it } from 'vitest';
import { createHunterHurtRun } from '../../src/game/playtest/hunterHurtFixture';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';

describe('dev-only Bargain Hunter hurt capture fixture', () => {
  it.each([0, 19])('takes a real hit fired after %i ticks and stays in pursue through the whole flinch', (delay) => {
    const run = createHunterHurtRun(1);
    expect(run.room.combat.enemies).toHaveLength(1);
    const hunter = run.room.combat.enemies[0]!;
    expect(hunter.kind).toBe('shopper');
    const originalHealth = hunter.health;
    let hitTick: number | null = null;
    let flinchTicks = 0;
    for (let step = 0; step < 100; step++) {
      tickMvpRun(run, { moveX: 0, moveY: 0, aimX: hunter.x, aimY: hunter.y, fire: step === delay, interact: false, steal: false, recall: false });
      if (hunter.health < originalHealth && hitTick === null) hitTick = run.tick;
      if (hitTick !== null && run.tick - hitTick < 14) {
        flinchTicks++;
        expect(hunter.phase).toBe('pursue');
        expect(hunter.chargeTicks ?? 0).toBe(0);
        expect(hunter.stunnedTicks ?? 0).toBe(0);
      }
    }
    expect(hitTick).not.toBeNull();
    expect(flinchTicks).toBe(14);
    expect(hunter.health).toBe(originalHealth - 1);
    expect(run.room.combat.player.health).toBe(6);
  });

  it('naturally starts its normal telegraph after reaching charge range', () => {
    const run = createHunterHurtRun(1), hunter = run.room.combat.enemies[0]!;
    for (let step = 0; step < 79; step++) {
      tickMvpRun(run, { moveX: 0, moveY: 0, aimX: hunter.x, aimY: hunter.y, fire: false, interact: false, steal: false, recall: false });
    }
    expect(hunter.phase).toBe('telegraph');
    expect(hunter.phaseTicks).toBe(34);
    expect(hunter.health).toBe(18);
    expect(hunter.stunnedTicks ?? 0).toBe(0);
  });
});
