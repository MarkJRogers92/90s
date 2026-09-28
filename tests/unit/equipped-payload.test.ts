import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { tickRun } from '../../src/sim/tickRun';

function firstShot(itemIds: string[], selected: string) {
  const state = createRun(7, { itemIds, selectedItemId: selected });
  state.player.x = 300;
  state.player.y = 160;
  state.walls = [];
  state.enemies = [{ id: 9, kind: 'spitter', x: 900, y: 450, health: 40, radius: 14, phase: 'recover', phaseTicks: 100_000, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 }];
  tickRun(state, { moveX: 0, moveY: 0, aimX: 900, aimY: 160, fire: true });
  return state.projectiles.filter((shot) => shot.faction === 'player');
}

describe('each weapon fires its own shot', () => {
  it('fires the equipped weapon, not whichever projectile weapon was owned first', () => {
    const owned = ['pump_soaker', 'party_popper', 'bottle_rocket_pack'];
    const soaker = firstShot(owned, 'pump_soaker');
    const popper = firstShot(owned, 'party_popper');
    const rockets = firstShot(owned, 'bottle_rocket_pack');
    expect(soaker.map((shot) => shot.payload?.payloadEffect.sourceItemId)).toEqual(['pump_soaker']);
    expect(popper).toHaveLength(3);
    expect(popper.every((shot) => shot.payload?.payloadEffect.sourceItemId === 'party_popper')).toBe(true);
    expect(rockets.every((shot) => shot.payload?.payloadEffect.sourceItemId === 'bottle_rocket_pack')).toBe(true);
  });

  it('keeps passive modifiers applying to whichever weapon is equipped', () => {
    const shots = firstShot(['pump_soaker', 'slushie_cup', 'gel_pens'], 'slushie_cup');
    expect(shots[0]?.payload?.payloadEffect.sourceItemId).toBe('slushie_cup');
    expect(shots[0]?.payload?.statusEffects.length).toBeGreaterThan(0);
  });
});
