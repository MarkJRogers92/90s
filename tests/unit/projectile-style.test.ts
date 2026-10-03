import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { describe, expect, it } from 'vitest';
import { projectileStyle, projectileSourceItemId } from '../../src/game/view/projectileStyle';

const shot = (source: string, extras: Partial<{ delivery: string; sticky: boolean; returning: boolean; conductive: boolean }> = {}) => ({
  sourceItemId: source,
  delivery: extras.delivery ?? 'water_projectile',
  sticky: extras.sticky ?? false,
  returning: extras.returning ?? false,
  conductive: extras.conductive ?? false,
});

describe('what a player shot looks like', () => {
  it('gives every weapon its own shape and colour', () => {
    const weapons = ['pump_soaker', 'party_popper', 'bottle_rocket_pack', 'fire_extinguisher', 'paint_marker', 'foam_ball_blaster', 'slushie_cup'];
    const looks = weapons.map((id) => { const s = projectileStyle(shot(id)); return `${s.shape}:${s.color}`; });
    expect(new Set(looks).size).toBe(weapons.length);
  });

  it('draws rockets with a flame trail and water with droplets', () => {
    expect(projectileStyle(shot('bottle_rocket_pack')).trail).toBe('flame');
    expect(projectileStyle(shot('pump_soaker')).trail).toBe('droplets');
    expect(projectileStyle(shot('fire_extinguisher')).trail).toBe('mist');
  });

  it('turns converted shots into big iridescent bubbles', () => {
    const bubble = projectileStyle(shot('pump_soaker', { delivery: 'drifting_bubble' }));
    expect(bubble.shape).toBe('bubble');
    expect(bubble.scale).toBeGreaterThan(1);
  });

  it('shows modifiers on top of the base look', () => {
    expect(projectileStyle(shot('pump_soaker', { sticky: true })).drip).toBe(true);
    expect(projectileStyle(shot('pump_soaker', { returning: true })).rewind).toBe(true);
    expect(projectileStyle(shot('pump_soaker', { conductive: true })).sparks).toBe(true);
    expect(projectileStyle(shot('pump_soaker')).sparks).toBe(false);
  });

  it('falls back to a plain bolt for anything unknown', () => {
    expect(projectileStyle(shot('mystery')).shape).toBe('bolt');
  });
});

describe('fused shots', () => {
  const traits = { delivery: 'water_projectile', sticky: false, returning: false, conductive: false };
  it('a fused shooter keeps its own look, trimmed with the ingredient colour', () => {
    const storm = projectileStyle({ ...traits, sourceItemId: 'hybrid__pump_soaker__party_popper' });
    const soaker = projectileStyle({ ...traits, sourceItemId: 'pump_soaker' });
    const popper = projectileStyle({ ...traits, sourceItemId: 'party_popper' });
    expect(storm.shape).toBe(soaker.shape);
    expect(storm.accent).toBe(popper.color);
  });

  it('a melee hybrid throws the shot of the weapon fused into it', () => {
    expect(projectileStyle({ ...traits, sourceItemId: 'hybrid__janitor_mop__pump_soaker' }).shape).toBe('droplet');
  });
});

describe('nested shooter identity', () => {
  const traits = { delivery: 'water_projectile', sticky: false, returning: false, conductive: false };
  it('keeps the shooter inside a melee base when another modifier is fused onto it', () => {
    const nested = projectileStyle({ ...traits, sourceItemId: 'hybrid__(hybrid__janitor_mop__pump_soaker)__gel_pens' });
    expect(nested.shape).toBe('droplet');
    expect(nested.color).toBe(projectileStyle({ ...traits, sourceItemId: 'pump_soaker' }).color);
  });
  it('finds a shooter inside a nested melee ingredient', () => {
    expect(projectileStyle({ ...traits, sourceItemId: 'hybrid__box_cutter__(hybrid__janitor_mop__nail_gun)' }).shape).toBe('dart');
  });
});


describe('all catalog shooter roots retain identity', () => {
  it.each(ITEM_CATALOG.filter((item) => item.base?.delivery === 'projectile').map((item) => item.id))('%s cannot adopt its fused soaker ingredient identity', (source) => {
    expect(projectileSourceItemId(`hybrid__${source}__pump_soaker`)).toBe(source);
  });
  it('retains procedural fallback for a root shooter without first-slice art', () => {
    const traits = { delivery: 'water_projectile', sticky: false, returning: false, conductive: false };
    expect(projectileStyle({ ...traits, sourceItemId: 'hybrid__gumball_launcher__pump_soaker' }).shape)
      .toBe(projectileStyle({ ...traits, sourceItemId: 'gumball_launcher' }).shape);
  });
});
