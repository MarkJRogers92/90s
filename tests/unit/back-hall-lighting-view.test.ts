import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0, FILL: 1 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { lightingRenderer, MapSurface, type Surface } from '../support/lighting-renderer';
import { MallRoomView } from '../../src/game/view/MallRoomView';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { NEON_ASSETS, PRESENTATION_ASSETS } from '../../src/game/presentation/assets';
import { dressingTextureFiles, planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { BACK_HALL_CONTACT_SHADOW } from '../../src/game/presentation/lighting/backHallLightingPilot';
import { FX_TEXTURES } from '../../src/game/presentation/neon/proceduralTextures';
import { presentationDepth } from '../../src/game/presentation/depth';
import { LIGHTMAP_DEPTH } from '../../src/game/presentation/lighting/LightingLayer';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { collectTokens } from '../../src/sim/run/tokens';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { DEFAULT_SETTINGS, gameSettings } from '../../src/game/settings/settings';

function stateFor(index = 4) {
  const state = createMvpRun(1);
  state.roomIndex = index;
  const room = state.wing.rooms[index]!;
  state.room = { ...state.room, roomId: room.id, variantId: room.variantId,
    combat: buildRoomCombatState(state.wing, index, 'west', state.inventory, state.seed, 0) };
  state.tick = 600;
  state.room.combat.enemies = [];
  state.room.combat.player.x = 440;
  state.room.combat.player.y = 300;
  return state;
}
function backend() {
  // Rendering decisions and lifecycle are real; asset dimensions are immaterial
  // to these lighting tests. Exact asset-transform evidence is captured separately.
  return lightingRenderer([...NEON_ASSETS, ...PRESENTATION_ASSETS, ...dressingTextureFiles()]
    .map(asset => ({ key: asset.key, width: 96, height: 96, frames: {} })));
}
function shadowFor(roots: Surface[], x: number, y: number) {
  return roots.find(root => !root.destroyed && root.depth === presentationDepth('lowProp', 900)
    && root.x === x && root.y === y + 2)!;
}
afterEach(() => gameSettings().update(DEFAULT_SETTINGS));

describe('scoped lighting on the real room and run views', () => {
  it('installs the revised room plan and tighter static prop shadows only in Service Hall B', () => {
    const state = stateFor(); const renderer = backend();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    const original = planRoomDressing(state.wing.rooms[state.roomIndex]!);
    expect(view.plan.ambient).not.toBe(original.ambient);
    const shadows = renderer.roots.filter(root => root.texture.key === BACK_HALL_CONTACT_SHADOW);
    expect(shadows.length).toBeGreaterThan(5);
    const prop = view.plan.props[0]!;
    const shadow = shadows.find(root => root.x === Math.round(prop.x) && root.y === Math.round(prop.y) - 1)!;
    expect(shadow).toBeDefined();
    expect(shadow.alpha).toBe(.85);
    expect(shadow.width * shadow.scaleX).toBeLessThan((prop.width ?? 96) * 1.05);
    view.destroy();
    expect(shadows.every(shadow => shadow.destroyed)).toBe(true);
  });

  it('keeps original shadow texture and plan outside the pilot room', () => {
    const state = stateFor(0); const renderer = backend();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    expect(view.plan).toEqual(planRoomDressing(state.wing.rooms[0]!));
    expect(renderer.textures.has(BACK_HALL_CONTACT_SHADOW)).toBe(false);
    expect(renderer.roots.some(root => root.texture.key === FX_TEXTURES.shadow)).toBe(true);
    view.destroy();
  });

  it('retunes the existing dynamic shadow objects and restores them on leaving or re-entering the pilot', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene);
    const hall = stateFor(); view.sync(hall);
    const shadow = shadowFor(renderer.roots, 440, 300);
    expect(shadow.texture.key).toBe(BACK_HALL_CONTACT_SHADOW);
    expect([shadow.scaleX, shadow.scaleY]).toEqual([1, 1]);
    const outside = stateFor(0); view.sync(outside);
    expect(shadowFor(renderer.roots, 440, 300)).toBe(shadow);
    expect(shadow.texture.key).toBe(FX_TEXTURES.shadow);
    view.sync(hall);
    expect(shadow.texture.key).toBe(BACK_HALL_CONTACT_SHADOW);
    expect(renderer.roots.filter(root => root.kind === 'lightmap' && !root.destroyed)).toHaveLength(1);
    view.destroy();
    expect(shadow.destroyed).toBe(true);
  });

  it('preserves the warm player visibility light above the dim bay without mutating run state', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene); const state = stateFor();
    state.room.combat.player.x = 820; state.room.combat.player.y = 430;
    const original = JSON.stringify(state); view.sync(state);
    expect(JSON.stringify(state)).toBe(original);
    expect(shadowFor(renderer.roots, 820, 430).texture.key).toBe(BACK_HALL_CONTACT_SHADOW);
    const map = renderer.roots.find(root => root instanceof MapSurface) as MapSurface;
    const stamps = map.stamps as Array<{ x: number; y: number; options: { tint: number; alpha: number } }>;
    expect(stamps).toContainEqual(expect.objectContaining({ x: 820, y: 540,
      options: expect.objectContaining({ tint: 0xffe6c8, alpha: .62 }) }));
    expect(map.depth).toBe(LIGHTMAP_DEPTH);
    expect(presentationDepth('effect', 1)).toBeGreaterThan(map.depth);
    view.destroy();
  });

  it('restores its own revised lights after a blackout and holds them steady under Reduced', () => {
    gameSettings().update({ ...DEFAULT_SETTINGS, flashes: 'reduced' });
    const renderer = backend(); const state = stateFor();
    const view = new MallRoomView(renderer.scene, renderer.scene.add.graphics(), state);
    const map = renderer.roots.find(root => root instanceof MapSurface) as MapSurface;
    view.renderLighting(0); const lit = JSON.stringify(map.stamps);
    expect(view.plan.ambient).toBe(0x282b32);
    for (const tick of [1, 42, 90, 173, 200]) { view.renderLighting(tick); expect(JSON.stringify(map.stamps)).toBe(lit); }
    view.setBlackout(true);
    for (let tick = 0; tick < 90; tick++) view.renderLighting(tick);
    expect(map.ambient).toBe(0x040308);
    view.setBlackout(false);
    for (let tick = 0; tick < 90; tick++) view.renderLighting(tick);
    expect(map.ambient).toBe(0x282b32);
    expect(JSON.stringify(map.stamps)).toBe(lit);
    view.destroy();
  });

  it('reuses one soft texture through repeated room rebuilds and destroys the old display objects', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene); const hall = stateFor(), outside = stateFor(0);
    for (let i = 0; i < 12; i++) { view.sync(hall); view.sync(outside); }
    expect(renderer.textures.has(BACK_HALL_CONTACT_SHADOW)).toBe(true);
    expect(renderer.roots.filter(root => root.texture.key === BACK_HALL_CONTACT_SHADOW && !root.destroyed)).toHaveLength(0);
    expect(renderer.roots.filter(root => root instanceof MapSurface && !root.destroyed)).toHaveLength(1);
    view.destroy();
    expect(renderer.roots.filter(root => root instanceof MapSurface && !root.destroyed)).toHaveLength(0);
  });

  it('cannot carry the pilot into a same-ID room upstairs or in a first wing', () => {
    for (const options of [{ floor: 2 as const }, { part: 1 as const }]) {
      const renderer = backend(); const view = new MvpRunView(renderer.scene); const hall = stateFor();
      view.sync(hall);
      const outside = createMvpRun(1, options);
      outside.roomIndex = hall.roomIndex;
      const room = outside.wing.rooms[outside.roomIndex]!;
      outside.room = { ...outside.room, roomId: room.id, variantId: room.variantId,
        combat: buildRoomCombatState(outside.wing, outside.roomIndex, 'west', outside.inventory, outside.seed, 0) };
      outside.room.combat.enemies = []; outside.tick = 600;
      outside.room.combat.player.x = 440; outside.room.combat.player.y = 300;
      view.sync(outside);
      expect(shadowFor(renderer.roots, 440, 300).texture.key).toBe(FX_TEXTURES.shadow);
      const current = renderer.roots.find(root => root instanceof MapSurface && !root.destroyed) as MapSurface;
      expect(current.ambient).toBe(planRoomDressing(room, outside.wing.floor ?? 1, null, outside.wing.part, outside.wing.district).ambient);
      view.destroy();
    }
  });

  it('restores baseline shadows after run reset and safely redraws a rewound pilot frame', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene); const hall = stateFor();
    view.sync(hall); hall.tick = 0; view.sync(hall);
    expect(shadowFor(renderer.roots, 440, 300).texture.key).toBe(BACK_HALL_CONTACT_SHADOW);
    view.resetForRun(); view.sync(stateFor(0));
    expect(shadowFor(renderer.roots, 440, 300).texture.key).toBe(FX_TEXTURES.shadow);
    expect(renderer.roots.filter(root => root instanceof MapSurface && !root.destroyed)).toHaveLength(1);
    view.destroy();
  });

  it('keeps 720 complete fixed-step run states identical with the pilot renderer active', () => {
    for (const seed of [1, 7, 42]) {
      const renderer = backend(); const view = new MvpRunView(renderer.scene);
      const observed = createMvpRun(seed); observed.roomIndex = 4;
      const room = observed.wing.rooms[4]!;
      observed.room = { ...observed.room, roomId: room.id, variantId: room.variantId,
        combat: buildRoomCombatState(observed.wing, 4, 'west', observed.inventory, seed, 0) };
      const control = structuredClone(observed);
      for (let tick = 0; tick < 240; tick++) {
        const input = { moveX: 0, moveY: 0, aimX: 740, aimY: 220, fire: tick % 3 === 0, interact: false, steal: false, recall: false };
        tickMvpRun(observed, input); tickMvpRun(control, input); view.observeStep(observed); view.sync(observed);
        expect(JSON.stringify(observed)).toBe(JSON.stringify(control));
      }
      view.destroy();
    }
  });

  it('keeps pickup sprites stable when fixed-step loot observation alternates with render', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene); const state = stateFor();
    state.room.tokens = [{ id: 'waiting', x: 650, y: 280, value: 4, droppedTick: 0 }];
    view.observeStep(state); view.sync(state);
    const coin = renderer.roots.find(root => root.texture.key === FX_TEXTURES.token && !root.destroyed)!;
    expect(coin).toBeDefined();
    state.tick++; view.observeStep(state); view.sync(state);
    expect(coin.destroyed).toBe(false);
    expect(renderer.roots.filter(root => root.texture.key === FX_TEXTURES.token && !root.destroyed)).toEqual([coin]);
    view.destroy();
  });

  it('retains a real pickup receipt through fixed-step observation and redraw', () => {
    const renderer = backend(); const view = new MvpRunView(renderer.scene); const state = stateFor();
    view.observeStep(state); view.sync(state);
    state.room.tokens = [{ id: 'collected', x: 440, y: 300, value: 4, droppedTick: 0 }];
    state.tick++; collectTokens(state); view.observeStep(state); view.sync(state);
    const receipt = renderer.roots.find(root => root.texture.key.startsWith('label:+$4|') && root.visible && !root.destroyed);
    expect(receipt).toBeDefined();
    state.tick++; view.observeStep(state); view.sync(state);
    expect(receipt!.destroyed).toBe(false);
    expect(receipt!.visible).toBe(true);
    view.destroy();
  });
});
