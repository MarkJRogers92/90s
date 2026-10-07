// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { TAB: 9 } } }, BlendModes: { ADD: 1 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { GameHud } from '../../src/game/ui/GameHud';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { hudRenderer } from '../support/hud-renderer';
import { DEFAULT_SETTINGS, gameSettings } from '../../src/game/settings/settings';
import { NEON_ASSETS, PORTRAIT_TEXTURE_KEYS } from '../../src/game/presentation/assets';

/**
 * Roadmap V5: Alex's HUD portrait is drawn at its native 56 px (the 128 px
 * painting at 0.4375 dropped uneven pixels), and a hurt portrait shows for the
 * whole recovery window under every Flashes setting; the red blink is extra.
 */
function setup() {
  const r = hudRenderer();
  const hud = new GameHud(r.scene);
  hud.setCoachAllowed(false);
  const state = createMvpRun(7);
  state.room.combat.enemies = [];
  state.room = { ...state.room, variantId: 'prop-test' };
  hud.sync(state);
  const portrait = () => r.images.find((image) => image.texture.key === PORTRAIT_TEXTURE_KEYS.alex || image.texture.key === PORTRAIT_TEXTURE_KEYS.alexHurt)!;
  return { r, hud, state, portrait };
}

describe('Alex\'s HUD portrait (roadmap V5)', () => {
  it('ships 56 px portraits, calm and hurt, and loads them', () => {
    for (const file of ['portraits/alex-56.png', 'portraits/alex-56-hurt.png']) {
      const png = readFileSync(`public/assets/neon/${file}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual([56, 56]);
    }
    expect(NEON_ASSETS.find((asset) => asset.key === PORTRAIT_TEXTURE_KEYS.alex)?.url).toMatch(/portraits\/alex-56\.png$/);
    expect(NEON_ASSETS.find((asset) => asset.key === PORTRAIT_TEXTURE_KEYS.alexHurt)?.url).toMatch(/portraits\/alex-56-hurt\.png$/);
  });

  it('starts on the calm face (the 56 px file drawn at 56 px is exactly 1x)', () => {
    const { portrait } = setup();
    expect(portrait().texture.key).toBe(PORTRAIT_TEXTURE_KEYS.alex);
  });

  it('winces for the whole recovery window, with flashes on or reduced, and recovers after', () => {
    for (const flashes of ['full', 'reduced'] as const) {
      gameSettings().update({ ...DEFAULT_SETTINGS, flashes });
      const { hud, state, portrait } = setup();
      for (let tick = 0; tick < 12; tick += 1) {
        state.room.combat.player.invulnerableTicks = 30;
        state.tick = 700 + tick;
        hud.sync(state);
        expect(portrait().texture.key, `${flashes} tick ${tick}`).toBe(PORTRAIT_TEXTURE_KEYS.alexHurt);
      }
      state.room.combat.player.invulnerableTicks = 0;
      state.tick += 1;
      hud.sync(state);
      expect(portrait().texture.key).toBe(PORTRAIT_TEXTURE_KEYS.alex);
      expect(portrait().tint).toBe(0xffffff);
    }
    gameSettings().update(DEFAULT_SETTINGS);
  });

  it('adds the red blink only when flashes are allowed', () => {
    gameSettings().update({ ...DEFAULT_SETTINGS, flashes: 'reduced' });
    const reduced = setup();
    const tints = new Set<number>();
    for (let tick = 0; tick < 12; tick += 1) {
      reduced.state.room.combat.player.invulnerableTicks = 30;
      reduced.state.tick = 700 + tick;
      reduced.hud.sync(reduced.state);
      tints.add(reduced.portrait().tint);
    }
    expect([...tints]).toEqual([0xffffff]);
    gameSettings().update(DEFAULT_SETTINGS);
  });
});
