import type Phaser from 'phaser';
import type { MvpRunState } from '../../../sim/run/types';
import { FACADE_BASE_Y, type DressingPlan } from '../rooms/roomDressing';
import { FX_TEXTURES } from '../neon/proceduralTextures';

/** One-room art direction. Reuses the existing lightmap, lights and shadow objects. */
export const BACK_HALL_CONTACT_SHADOW = 'fx:back-hall-contact-shadow';

export const BACK_HALL_PILOT_STYLE = {
  propShadowWidth: 0.88,
  propShadowHeight: 0.13,
  propShadowAlpha: 0.85,
  signHalo: 0.62,
  signReflection: 0.045,
} as const;

/** The same room ID also occurs upstairs, in first wings and in districts. */
export function isBackHallLightingPilot(state: MvpRunState): boolean {
  const room = state.wing.rooms[state.roomIndex];
  return room?.id === 'back_hall' && (state.wing.floor ?? 1) === 1
    && state.wing.part === undefined && state.wing.district === undefined
    && !state.room.interior && room.variantId !== 'prop-test' && room.variantId !== 'prop-test-return';
}

// Positions are the six authored fluorescents in the existing backHall plan.
// The lower-right fixture is weak: the abandoned cart sits at (820, 452).
const FLUORESCENTS: Readonly<Record<string, { radius: number; intensity: number }>> = {
  '160:140': { radius: 168, intensity: 0.68 },
  '480:140': { radius: 148, intensity: 0.56 },
  '800:140': { radius: 156, intensity: 0.60 },
  '160:360': { radius: 168, intensity: 0.64 },
  '480:360': { radius: 160, intensity: 0.52 },
  '800:360': { radius: 116, intensity: 0.26 },
};

/** Pure, non-mutating; all non-pilot plans retain their exact object identity. */
export function applyBackHallLightingPilot(plan: DressingPlan, state: MvpRunState): DressingPlan {
  if (!isBackHallLightingPilot(state)) return plan;
  return {
    ...plan,
    // Raise the neutral visibility floor slightly; darkness comes from spacing,
    // not a full-room black veil. Actor readability lights remain untouched.
    ambient: 0x282b32,
    lights: plan.lights.map(light => {
      // Steady pools avoid adding flicker, including under Flashes: Reduced.
      const { flicker: _flicker, ...steady } = light;
      const fixture = light.color === 0xd8f0ff ? FLUORESCENTS[`${light.x}:${light.y}`] : undefined;
      if (fixture) return { ...steady, ...fixture, color: 0xd4e9e8, squash: 0.62 };
      if (plan.facades.some(facade => facade.sign?.x === light.x && facade.sign.y === light.y)) {
        return { ...steady, radius: 88, intensity: 0.22 };
      }
      // The shop-window face stays legible; only its low floor wash is restrained.
      if (light.y === FACADE_BASE_Y + 34) return { ...steady, intensity: light.intensity * 0.78 };
      return steady;
    }),
  };
}

/** A tight contact core with a feathered edge, on the original 32×12 footprint. */
export function ensureBackHallContactShadow(scene: Phaser.Scene): string {
  if (scene.textures.exists(BACK_HALL_CONTACT_SHADOW)) return BACK_HALL_CONTACT_SHADOW;
  const canvas = scene.textures.createCanvas(BACK_HALL_CONTACT_SHADOW, 32, 12);
  if (!canvas) return FX_TEXTURES.shadow;
  const context = canvas.getContext();
  context.clearRect(0, 0, 32, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 32; x++) {
      const radiusSquared = ((x + 0.5 - 16) / 15) ** 2 + ((y + 0.5 - 6) / 5) ** 2;
      if (radiusSquared >= 1) continue;
      const edge = 1 - radiusSquared;
      const alpha = 0.44 * edge ** 1.6 + 0.27 * edge ** 6;
      context.fillStyle = `rgba(0,0,0,${alpha.toFixed(4)})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  canvas.refresh();
  return BACK_HALL_CONTACT_SHADOW;
}
