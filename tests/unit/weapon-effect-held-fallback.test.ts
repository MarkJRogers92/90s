import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { WeaponView, type WeaponSnapshot } from '../../src/game/view/WeaponView';
vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));

function missingHeldView() {
  const held = { setVisible() { return this; } };
  const scene = { add: { image: () => held }, textures: { exists: () => false } } as unknown as Phaser.Scene;
  const graphics: Record<string, unknown> = {};
  for (const name of ['fillStyle', 'fillCircle', 'fillPoints', 'lineStyle', 'beginPath', 'arc', 'strokePath', 'fillRect']) graphics[name] = () => graphics;
  return { view: new WeaponView(scene), effects: graphics as unknown as Phaser.GameObjects.Graphics };
}

describe('native effects preserve fallback without a held-icon anchor', () => {
  it.each([['janitor_mop', 'direct'], ['broken_broom_handle', 'direct'], ['box_cutter', 'direct'], ['pump_soaker', 'projectile'], ['party_popper', 'projectile'], ['bottle_rocket_pack', 'projectile'], ['fire_extinguisher', 'projectile']] as const)('%s keeps its existing fallback cue if the held icon is unavailable', (definitionId, delivery) => {
    const { view, effects } = missingHeldView();
    const weapon: WeaponSnapshot = { x: 100, y: 100, facingX: 1, facingY: 0, attackActiveTicks: 6,
      definitionId, delivery, range: 60, halfAngleRadians: Math.PI / 4 };
    const lights = view.sync(weapon, 0, effects, 100, true, true);
    expect(view.headAt()).toBeNull();
    expect(lights).toHaveLength(1);
    expect(lights[0]!.intensity).toBeGreaterThan(0);
  });
});
