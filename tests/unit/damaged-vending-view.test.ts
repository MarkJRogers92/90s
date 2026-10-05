// @ts-expect-error Vitest provides the Node built-in for real asset inspection.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0, FILL: 1 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { lightingRenderer } from '../support/lighting-renderer';
import { MallRoomView } from '../../src/game/view/MallRoomView';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { NEON_ASSETS, PRESENTATION_ASSETS } from '../../src/game/presentation/assets';
import { dressingTextureFiles } from '../../src/game/presentation/rooms/roomDressing';
import { presentationDepth } from '../../src/game/presentation/depth';
import { BACK_HALL_CONTACT_SHADOW } from '../../src/game/presentation/lighting/backHallLightingPilot';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { DEFAULT_SETTINGS, gameSettings } from '../../src/game/settings/settings';

const KEY = 'neon:prop:damaged-vending-flicker';
function stateFor() {
  const state = createMvpRun(1);
  moveToRoom(state, 4, 'west');
  state.room.combat.enemies = [];
  return state;
}
function backend(missing = false) {
  // Real PNG dimensions, real production view; only the graphics backend is recorded.
  return lightingRenderer([...NEON_ASSETS, ...PRESENTATION_ASSETS, ...dressingTextureFiles()]
    .filter(asset => !missing || asset.key !== KEY).map(asset => {
      const png = readFileSync(`public${asset.url}`);
      return { key: asset.key, width: png.readUInt32BE(16), height: png.readUInt32BE(20), frames: {} };
    }));
}
afterEach(() => gameSettings().update(DEFAULT_SETTINGS));

// Wrong sheet registration, whole-strip sizing or canvas-bottom anchoring must fail.
describe('damaged vending production renderer', () => {
  it('registers the committed four-cell PNG exactly once', () => {
    const assets = dressingTextureFiles().filter(asset => asset.key === KEY);
    expect(assets).toEqual([{ key: KEY, url: '/assets/neon/props/damaged-vending-flicker.png' }]);
    const png = readFileSync(`public${assets[0]!.url}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([384, 96]);
  });

  it('uses native scale, the authored (48,89) pivot and actual floor depth in every frame', () => {
    const renderer = backend(), state = stateFor();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    const image = renderer.roots.find(root => root.texture.key === KEY);
    expect(image).toBeDefined();
    for (const tick of [0, 17, 23, 28, 48, 101]) {
      state.tick = tick; view.render(state);
      expect(image).toMatchObject({ x: 84, y: 132, width: 96, height: 96, scaleX: 1, scaleY: 1,
        originX: .5, originY: 89 / 96, depth: presentationDepth('actor', 132), flipX: false, rotation: 0 });
    }
    const shadow = renderer.roots.find(root => root.texture.key === BACK_HALL_CONTACT_SHADOW && root.x === 84 && root.y === 131)!;
    expect(shadow.width * shadow.scaleX).toBe(39); // 44 visible pixels, not the padded 96px canvas.
    view.destroy();
    expect(image!.destroyed).toBe(true);
    expect(shadow.destroyed).toBe(true);
  });

  it('plays authored timing from the game tick and immediately freezes frame 0 under Reduced Flashes', () => {
    const renderer = backend(), state = stateFor();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    const image = renderer.roots.find(root => root.texture.key === KEY);
    expect(image).toBeDefined();
    const frameAt = (tick: number) => { state.tick = tick; view.render(state); return image!.frame.name; };
    expect([0, 16, 17, 22, 23, 27, 28, 47, 48].map(frameAt)).toEqual(['0', '0', '1', '1', '2', '2', '3', '3', '0']);
    expect(frameAt(23)).toBe(frameAt(23)); // Paused/unchanged tick does not advance.
    gameSettings().update({ flashes: 'reduced' });
    expect([23, 17, 100, 999].map(frameAt)).toEqual(['0', '0', '0', '0']);
    gameSettings().update({ flashes: 'full' });
    expect(frameAt(23)).toBe('2');
    view.destroy();
  });

  it('fades only for a player behind the visible body, never its transparent canvas padding', () => {
    const renderer = backend(), state = stateFor();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    const image = renderer.roots.find(root => root.texture.key === KEY);
    expect(image).toBeDefined();
    state.room.combat.player.x = 84; state.room.combat.player.y = 100;
    for (let i = 0; i < 20; i++) view.render(state);
    expect(image!.alpha).toBeLessThan(.4);
    state.room.combat.player.x = 125;
    for (let i = 0; i < 20; i++) view.render(state);
    expect(image!.alpha).toBe(1);
    view.destroy();
  });

  it('keeps a visible fallback over the solid base if its art fails to load', () => {
    const renderer = backend(true), state = stateFor();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    expect(view.debugSnapshot().fallbackCount).toBe(1);
    expect(() => view.render(state)).not.toThrow();
    view.destroy();
  });

  it('never leaks or duplicates the prop across normal-room, upstairs and first-wing transitions', () => {
    const renderer = backend(), view = new MvpRunView(renderer.scene), hall = stateFor();
    const outside = createMvpRun(1), upper = createMvpRun(1, { floor: 2 }), first = createMvpRun(1, { part: 1 });
    moveToRoom(upper, 4, 'west'); moveToRoom(first, 4, 'west');
    const active = () => renderer.roots.filter(root => root.texture.key === KEY && !root.destroyed);
    for (const state of [outside, upper, first]) {
      view.sync(hall); expect(active()).toHaveLength(1);
      view.sync(state); expect(active()).toHaveLength(0);
    }
    view.sync(hall); expect(active()).toHaveLength(1);
    view.destroy(); expect(active()).toHaveLength(0);
  });
});
