import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { planRoomDressing } from '../../src/game/presentation/rooms/roomDressing';
import { FX_TEXTURES } from '../../src/game/presentation/neon/proceduralTextures';
import {
  applyBackHallLightingPilot,
  BACK_HALL_CONTACT_SHADOW,
  ensureBackHallContactShadow,
  isBackHallLightingPilot,
} from '../../src/game/presentation/lighting/backHallLightingPilot';

function hall(seed = 7) {
  const state = createMvpRun(seed);
  state.roomIndex = state.wing.rooms.findIndex(room => room.id === 'back_hall');
  return state;
}
function plan(state: ReturnType<typeof hall>) {
  return planRoomDressing(state.wing.rooms[state.roomIndex]!, state.wing.floor ?? 1,
    state.room.interior ? state.room.storeIndex : null, state.wing.part, state.wing.district);
}
const luminance = (hex: number) => ((hex >> 16) & 255) * .299 + ((hex >> 8) & 255) * .587 + (hex & 255) * .114;

describe('the Service Hall B lighting pilot', () => {
  it('selects only the original ground-floor boss-wing back hall', () => {
    expect(isBackHallLightingPilot(hall())).toBe(true);
    for (const floor of [1, 2, 3, 4] as const) {
      for (const part of [undefined, 1] as const) {
        const state = createMvpRun(7, { floor, ...(part ? { part } : {}) });
        for (let index = 0; index < state.wing.rooms.length; index++) {
          state.roomIndex = index;
          expect(isBackHallLightingPilot(state)).toBe(floor === 1 && part === undefined && state.wing.rooms[index]!.id === 'back_hall');
        }
      }
    }
    const inside = hall(); inside.room.interior = true;
    expect(isBackHallLightingPilot(inside)).toBe(false);
    for (const district of ['holiday', 'glamour', 'pets', 'rink'] as const) {
      const base = hall(); const state = { ...base, wing: { ...base.wing, district } };
      expect(isBackHallLightingPilot(state)).toBe(false);
    }
    const missing = hall(); missing.roomIndex = -1;
    expect(isBackHallLightingPilot(missing)).toBe(false);
  });

  it('leaves every non-pilot room plan exactly unchanged, including object identity', () => {
    for (const seed of [0, 1, 7, 42]) for (const floor of [1, 2, 3, 4] as const) {
      for (const part of [undefined, 1] as const) {
        const state = createMvpRun(seed, { floor, ...(part ? { part } : {}) });
        for (let index = 0; index < state.wing.rooms.length; index++) {
          state.roomIndex = index;
          if (floor === 1 && part === undefined && state.wing.rooms[index]!.id === 'back_hall') continue;
          const before = plan(state);
          expect(applyBackHallLightingPilot(before, state)).toBe(before);
        }
      }
    }
  });

  it('separates six steady fluorescent pools and leaves the abandoned cart bay dimmer', () => {
    const state = hall(); const before = plan(state); const after = applyBackHallLightingPilot(before, state);
    expect(after).not.toBe(before);
    expect(after.lights).toHaveLength(before.lights.length);
    const pools = after.lights.filter(light => [140, 360].includes(light.y) && [160, 480, 800].includes(light.x));
    expect(pools).toHaveLength(6);
    expect(pools.every(light => light.squash! <= .66)).toBe(true);
    expect(after.lights.every(light => light.flicker === undefined)).toBe(true);
    const cart = pools.find(light => light.x === 800 && light.y === 360)!;
    expect(cart.intensity).toBeLessThanOrEqual(.3);
    expect(cart.radius).toBeLessThan(130);
    expect(pools.filter(light => light !== cart).every(light => light.intensity >= .48)).toBe(true);
    // Preserve a floor visibility baseline instead of making the entire hall darker.
    expect(luminance(after.ambient)).toBeGreaterThanOrEqual(luminance(before.ambient));
    expect(luminance(after.ambient)).toBeLessThan(50);
  });

  it('reduces red sign spill but preserves both exit portals and window illumination', () => {
    const state = hall(); const before = plan(state); const after = applyBackHallLightingPilot(before, state);
    for (const facade of before.facades) {
      if (!facade.sign) continue;
      const original = before.lights.find(light => light.x === facade.sign!.x && light.y === facade.sign!.y)!;
      const revised = after.lights.find(light => light.x === original.x && light.y === original.y)!;
      expect(revised.intensity).toBeLessThan(original.intensity);
      expect(revised.radius).toBeLessThan(original.radius);
    }
    expect(after.lights.filter(light => light.x === 26 || light.x === 934)).toEqual(before.lights.filter(light => light.x === 26 || light.x === 934));
    expect(after.facades).toBe(before.facades);
    expect(after.props).toBe(before.props);
    expect(after.floor).toBe(before.floor);
    expect(after.areaName).toBe(before.areaName);
  });

  it('does not mutate the entire run or the shared original dressing plan', () => {
    for (const seed of [0, 1, 7, 42, 1993, 31337]) {
      const state = hall(seed); const original = plan(state); const before = JSON.stringify({ state, original });
      for (let tick = 0; tick < 240; tick++) applyBackHallLightingPilot(original, state);
      expect(JSON.stringify({ state, original })).toBe(before);
    }
  });
});

function textureBackend(fail = false) {
  const keys = new Set<string>(); const calls: Array<{ x: number; y: number; fill: string }> = [];
  let created = 0;
  const context = { fillStyle: '', clearRect: () => {}, fillRect: (x: number, y: number) => calls.push({ x, y, fill: context.fillStyle }) };
  const scene = { textures: {
    exists: (key: string) => keys.has(key),
    createCanvas: (key: string, width: number, height: number) => {
      created++; if (fail) return null;
      expect([width, height]).toEqual([32, 12]); keys.add(key);
      return { getContext: () => context, refresh: () => {} };
    },
  } } as unknown as Phaser.Scene;
  return { scene, calls, created: () => created };
}

describe('the scoped soft contact-shadow texture', () => {
  it('keeps the existing 32×12 footprint and creates a single reusable texture', () => {
    const renderer = textureBackend();
    expect(ensureBackHallContactShadow(renderer.scene)).toBe(BACK_HALL_CONTACT_SHADOW);
    expect(ensureBackHallContactShadow(renderer.scene)).toBe(BACK_HALL_CONTACT_SHADOW);
    expect(renderer.created()).toBe(1);
    expect(renderer.calls.length).toBeGreaterThan(100);
    expect(renderer.calls.length).toBeLessThanOrEqual(384);
  });

  it('makes a tight opaque centre with a monotonic feather to transparent edges', () => {
    const renderer = textureBackend(); ensureBackHallContactShadow(renderer.scene);
    const alpha = (x: number, y: number) => {
      const pixel = renderer.calls.find(pixel => pixel.x === x && pixel.y === y);
      return pixel ? Number(pixel.fill.match(/,\s*([\d.]+)\)$/)![1]) : 0;
    };
    expect(alpha(15, 5)).toBeGreaterThan(.6);
    expect(alpha(15, 5)).toBeLessThanOrEqual(.75);
    expect(alpha(15, 5)).toBeGreaterThan(alpha(8, 5));
    expect(alpha(8, 5)).toBeGreaterThan(alpha(3, 5));
    expect(alpha(3, 5)).toBeLessThan(.12);
    expect(alpha(0, 0)).toBe(0);
    for (let x = 0; x < 32; x++) expect(alpha(x, 5)).toBeCloseTo(alpha(31 - x, 5), 6);
  });

  it('falls back to the existing shadow when a canvas texture is unavailable', () => {
    const renderer = textureBackend(true);
    expect(ensureBackHallContactShadow(renderer.scene)).toBe(FX_TEXTURES.shadow);
    expect(renderer.calls).toHaveLength(0);
  });
});
