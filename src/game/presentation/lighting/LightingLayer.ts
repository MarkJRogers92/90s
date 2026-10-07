/**
 * The room lighting pass.
 *
 * A lightmap render texture covers the visible stage. Every frame it is
 * filled with the room's ambient colour and every light is stamped onto it
 * additively; the lightmap is then drawn over the world with MULTIPLY. Where
 * nothing shines, the room takes the ambient mood; under a light it returns to
 * full colour. A second additive layer above it carries neon halos, light
 * shafts and muzzle flashes, which are allowed to be brighter than the lit
 * world because that is what makes neon read as neon.
 *
 * The pass is presentation only: it reads positions and never feeds back into
 * the simulation.
 */
import Phaser from 'phaser';
import { presentationDepth } from '../depth';
import { FX_TEXTURES } from '../neon/proceduralTextures';
import type { ColorGrade } from './colorGrade';

export type PointLight = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
  readonly intensity: number;
  /** Optional flicker: 'buzz' is a failing fluorescent, 'pulse' a slow neon breath. */
  readonly flicker?: 'buzz' | 'pulse';
  /** Vertical squash for floor pools seen at an angle. */
  readonly squash?: number;
};

export type StageRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Lighting sits above every lit world band and below unlit effects/prompts. */
export const LIGHTMAP_DEPTH = presentationDepth('tallForeground', 900);
export const GLOW_DEPTH = presentationDepth('tallForeground', 950);

const LIGHT_TEXTURE_SIZE = 128;

export function flickerFactor(light: Pick<PointLight, 'flicker'>, tick: number, seed: number): number {
  if (light.flicker === 'pulse') {
    return 0.85 + 0.15 * Math.sin((tick + seed * 37) / 23);
  }
  if (light.flicker === 'buzz') {
    // A failing tube: mostly on, with short irregular drop-outs.
    const phase = (tick + seed * 53) % 173;
    if (phase < 3 || (phase > 40 && phase < 43) || (phase > 44 && phase < 46)) return 0.25;
    return 1;
  }
  return 1;
}

export class LightingLayer {
  private readonly scene: Phaser.Scene;
  private readonly lightmap: Phaser.GameObjects.RenderTexture;
  private readonly stage: StageRect;
  private ambient = 0x404050;
  private staticLights: PointLight[] = [];
  private dynamicLights: PointLight[] = [];
  /** The floor's colour grade (roadmap V8): a faint additive haze over the stage. */
  private haze: Phaser.GameObjects.Graphics | null = null;

  public constructor(scene: Phaser.Scene, stage: StageRect) {
    this.scene = scene;
    this.stage = stage;
    this.lightmap = scene.add
      .renderTexture(stage.x, stage.y, stage.width, stage.height)
      .setOrigin(0, 0)
      .setDepth(LIGHTMAP_DEPTH)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  public setAmbient(color: number): void {
    this.ambient = color;
  }

  /** Tints the lightmap with a floor's grade and lays its haze over the stage; null clears both. */
  public setGrade(grade: ColorGrade | null): void {
    if (!grade) {
      this.lightmap.setTint(0xffffff);
      this.haze?.setVisible(false);
      return;
    }
    this.lightmap.setTint(grade.tint);
    if (!this.haze) {
      this.haze = this.scene.add.graphics().setDepth(LIGHTMAP_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.haze.clear().fillStyle(grade.haze, grade.hazeAlpha).fillRect(this.stage.x, this.stage.y, this.stage.width, this.stage.height).setVisible(true);
  }

  public setStaticLights(lights: readonly PointLight[]): void {
    this.staticLights = [...lights];
  }

  /** Lights that exist for this frame only: the player's glow, shots, flashes. */
  public addDynamic(light: PointLight): void {
    this.dynamicLights.push(light);
  }

  public render(tick: number): void {
    const map = this.lightmap;
    map.clear();
    map.fill(this.ambient, 1);
    this.staticLights.forEach((light, index) => this.stampLight(light, flickerFactor(light, tick, index)));
    for (const light of this.dynamicLights) this.stampLight(light, 1);
    this.dynamicLights = [];
    map.render();
  }

  private stampLight(light: PointLight, factor: number): void {
    const scale = (light.radius * 2) / LIGHT_TEXTURE_SIZE;
    this.lightmap.stamp(FX_TEXTURES.light, undefined, light.x - this.stage.x, light.y - this.stage.y, {
      scaleX: scale,
      scaleY: scale * (light.squash ?? 1),
      tint: light.color,
      alpha: Math.max(0, Math.min(1, light.intensity * factor)),
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  public setVisible(visible: boolean): void {
    this.lightmap.setVisible(visible);
    this.haze?.setVisible(visible && this.haze.visible);
  }

  public destroy(): void {
    this.lightmap.destroy();
    this.haze?.destroy();
    this.haze = null;
    this.staticLights = [];
    this.dynamicLights = [];
    void this.scene;
  }
}

/** True when WebGL is running on a CPU rasterizer, where full-screen filters are costly. */
export function isSoftwareRenderer(game: Phaser.Game): boolean {
  const renderer = game.renderer as unknown as { gl?: WebGLRenderingContext };
  const gl = renderer.gl;
  if (!gl) return true;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|software|microsoft basic render/i.test(name);
}

/**
 * Installs bloom when the device can afford it and removes it again if the
 * frame rate sags, so neon glows on real GPUs without making a weak machine
 * (or a headless test browser) unplayable. Returns a disposer.
 */
export function installAdaptiveBloom(scene: Phaser.Scene): () => void {
  const params = new URLSearchParams(window.location.search);
  if (params.has('nobloom') || isSoftwareRenderer(scene.game)) return () => undefined;
  let remove: (() => void) | undefined = installBloom(scene.cameras.main);
  let slowFrames = 0;
  let sampled = 0;
  const watch = (): void => {
    if (!remove) return;
    sampled += 1;
    if (scene.game.loop.actualFps < 45) slowFrames += 1;
    // After ~3 seconds, a mostly-slow sample means the effect is too expensive here.
    if (sampled >= 180) {
      if (slowFrames > 120) {
        remove();
        remove = undefined;
      }
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, watch);
    }
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, watch);
  return () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, watch);
    remove?.();
    remove = undefined;
  };
}

/**
 * A soft bloom on the world camera: bright pixels (neon, muzzle flashes,
 * lit windows) are thresholded, blurred and added back, so light bleeds the
 * way it does on a CRT. Returns a disposer; safe when filters are unavailable.
 */
export function installBloom(camera: Phaser.Cameras.Scene2D.Camera): () => void {
  const filters = (camera as unknown as { filters?: { internal?: { addParallelFilters?: () => unknown; remove?: (f: unknown) => void } } }).filters;
  const internal = filters?.internal;
  if (!internal?.addParallelFilters) return () => undefined;
  const parallel = internal.addParallelFilters() as {
    top: { addThreshold: (a: number, b: number) => unknown; addBlur: (q?: number, x?: number, y?: number, s?: number) => unknown };
    blend: { blendMode: number; amount: number };
  };
  parallel.top.addThreshold(0.62, 1);
  parallel.top.addBlur(1, 2, 2, 1.4);
  parallel.blend.blendMode = Phaser.BlendModes.ADD;
  parallel.blend.amount = 0.55;
  return () => {
    internal.remove?.(parallel);
  };
}
