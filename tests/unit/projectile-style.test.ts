import { describe, expect, it } from 'vitest';
import { projectileStyle } from '../../src/game/view/projectileStyle';

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
