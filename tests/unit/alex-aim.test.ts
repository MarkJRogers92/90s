// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { playerBodyAction } from '../../src/game/view/combatBeats';
import { CHARACTER_ASSETS, PLAYER_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { WeaponView } from '../../src/game/view/WeaponView';

const frames = { swing: 7, hurt: 6, death: 7, dash: 4, aim: 4 };
const none = { swing: null, hurtAge: null, deadMs: null, dashAge: null, aim: null };

describe('Alex aims a ranged weapon with his arms forward (roadmap V4, PixelLab)', () => {
  it('snaps straight to the arms-forward frames when a shot fires, then holds', () => {
    expect(playerBodyAction({ ...none, aim: 0 }, frames)).toEqual({ sheet: 'aim', column: 2 });
    expect(playerBodyAction({ ...none, aim: 0.6 }, frames)).toEqual({ sheet: 'aim', column: 3 });
    expect(playerBodyAction({ ...none, aim: 1 }, frames)).toEqual({ sheet: 'aim', column: 3 });
  });
  it('yields to death, hurt and the dash; does nothing without the sheet', () => {
    expect(playerBodyAction({ ...none, aim: 0.5, hurtAge: 1 }, frames)?.sheet).toBe('hurt');
    expect(playerBodyAction({ ...none, aim: 0.5, dashAge: 1 }, frames)?.sheet).toBe('dash');
    expect(playerBodyAction({ ...none, aim: 0.5, deadMs: 1 }, frames)?.sheet).toBe('death');
    expect(playerBodyAction({ ...none, aim: 0.5 }, { ...frames, aim: 0 })).toBeNull();
  });
  it('registers alex-aim at the 92 px action canvas', () => {
    expect(PLAYER_TEXTURE_KEYS.aim).toBe('neon:player:alex-aim');
    const found = CHARACTER_ASSETS.filter((asset) => asset.key === PLAYER_TEXTURE_KEYS.aim);
    expect(found).toHaveLength(1);
    const png = readFileSync(`public${found[0]!.url}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([368, 736]);
  });
  it('holds the gun out at the outstretched hand while the aim pose shows', () => {
    const grip = (aiming: boolean) => {
      const held = { width: 32, height: 32, texture: { key: '' } } as Record<string, unknown>;
      for (const m of ['setVisible', 'setPosition', 'setRotation', 'setScale', 'setFlipY', 'setOrigin', 'setDepth', 'destroy']) held[m] = () => held;
      held.setTexture = (key: string) => { held.texture = { key }; return held; };
      const scene = { add: { image: () => held }, textures: { exists: () => true, get: (key: string) => ({ key }) } } as unknown as Phaser.Scene;
      const fx: Record<string, unknown> = {}; for (const m of ['fillStyle', 'fillCircle', 'lineStyle']) fx[m] = () => fx;
      const view = new WeaponView(scene);
      view.sync({ x: 100, y: 100, definitionId: 'pump_soaker', facingX: 1, facingY: 0, attackActiveTicks: 0, delivery: 'projectile', range: 60, halfAngleRadians: 1 }, 10, fx as unknown as Phaser.GameObjects.Graphics, 100, false, false, aiming);
      return view.headAt()!.grip.x - 100;
    };
    expect(grip(true)).toBeGreaterThanOrEqual(grip(false) + 10);
  });
});
