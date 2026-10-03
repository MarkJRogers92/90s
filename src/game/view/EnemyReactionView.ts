/** Renderer-only material hurt/impact contracts (mannequin, CRT Static, Hanger); never changes combat state. */
import type Phaser from 'phaser';
import { ENEMY_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { ACTOR_DIRECTION_ORDER, type ActorDirection, type SpriteSpec } from './ActorSpriteView';

export const MANNEQUIN_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const MANNEQUIN_HURT_TICKS = 14;
export const STATIC_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const STATIC_HURT_TICKS = 14;
export const HANGER_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const MAX_MANNEQUIN_IMPACTS = 24;
export const MAX_STATIC_IMPACTS = 24;
const IMPACT_FRAME_SIZE = 48;
const IMPACT_FRAMES = 6;
const IMPACT_FRAME_TICKS = 2;
const IMPACT_TICKS = IMPACT_FRAMES * IMPACT_FRAME_TICKS;

export type MaterialKind = 'mannequin' | 'static' | 'hanger';
type MaterialReaction = {
  readonly hurtKey: string;
  readonly impactKey: string;
  readonly frameTicks: readonly number[];
  /** Hurt sheets are 4 frames by 8 facings, at the walk sheet's own canvas and scale. */
  readonly frameSize: number;
  readonly scale: number;
  readonly feetY: number;
  /** Matte fallback flecks when the impact strip is missing. */
  readonly flecks: readonly [number, number];
};
const MATERIAL_REACTIONS: Readonly<Record<MaterialKind, MaterialReaction>> = {
  mannequin: { hurtKey: ENEMY_TEXTURE_KEYS.mannequinHurt, impactKey: ENEMY_TEXTURE_KEYS.mannequinPlasticImpact, frameTicks: MANNEQUIN_HURT_FRAME_TICKS, frameSize: 96, scale: .75, feetY: 80.64, flecks: [0xd5c8b3, 0xede4d2] },
  static: { hurtKey: ENEMY_TEXTURE_KEYS.staticHurt, impactKey: ENEMY_TEXTURE_KEYS.staticCrtImpact, frameTicks: STATIC_HURT_FRAME_TICKS, frameSize: 96, scale: .75, feetY: 80.64, flecks: [0x817763, 0x6aa2a8] },
  // Derived from hanger-walk.png (92 px canvas, 64 px idle at scale 1): art/enemy-reactions/hanger.
  hanger: { hurtKey: ENEMY_TEXTURE_KEYS.hangerHurt, impactKey: ENEMY_TEXTURE_KEYS.hangerShellImpact, frameTicks: HANGER_HURT_FRAME_TICKS, frameSize: 92, scale: 1, feetY: 67.76, flecks: [0x6a96b8, 0x9cc4e0] },
};

export function isMaterialKind(kind: string): kind is MaterialKind {
  return Object.hasOwn(MATERIAL_REACTIONS, kind);
}
/**
 * Whether a hit flinch may interrupt this kind's attack pose. Only the Hanger:
 * it bites on contact with no timed wind-up, so its attack sheet is a proximity
 * loop, and its reach ring (drawn separately) still warns. Telegraphed attacks
 * (the Static's blink, the Mannequin's lunge) always keep priority.
 */
export function hurtOutranksAttack(kind: string): boolean {
  return kind === 'hanger';
}
export function materialHurtTicks(kind: MaterialKind): number {
  return MATERIAL_REACTIONS[kind].frameTicks.reduce((sum, ticks) => sum + ticks, 0);
}
/** The hurt sheet a kind may draw, if its exact authored dimensions loaded. */
export function materialHurtKey(textures: Phaser.Textures.TextureManager, kind: string): string | null {
  if (!isMaterialKind(kind)) return null;
  const r = MATERIAL_REACTIONS[kind];
  return exactReactionTexture(textures, r.hurtKey, r.frameSize * r.frameTicks.length, r.frameSize * 8) ? r.hurtKey : null;
}

export type EnemyHurtFrame = {
  readonly direction: ActorDirection;
  readonly frame: { readonly row: number; readonly column: number };
  readonly spec: SpriteSpec;
};

export function exactReactionTexture(textures: Phaser.Textures.TextureManager, key: string, width: number, height: number): boolean {
  if (usableTextureKey(textures, key) !== key) return false;
  const source = textures.get(key).getSourceImage() as { width: number; height: number };
  return source.width === width && source.height === height;
}

export function mannequinHurtFrame(textures: Phaser.Textures.TextureManager, age: number, direction: ActorDirection): EnemyHurtFrame | null {
  return materialHurtFrame(textures, 'mannequin', age, direction);
}

export function staticHurtFrame(textures: Phaser.Textures.TextureManager, age: number, direction: ActorDirection): EnemyHurtFrame | null {
  return materialHurtFrame(textures, 'static', age, direction);
}

export function materialHurtFrame(textures: Phaser.Textures.TextureManager, kind: MaterialKind, age: number, direction: ActorDirection): EnemyHurtFrame | null {
  const r = MATERIAL_REACTIONS[kind], frameTicks = r.frameTicks;
  if (age < 0 || age >= materialHurtTicks(kind) || materialHurtKey(textures, kind) === null) return null;
  let column = 0, end = frameTicks[0]!;
  while (age >= end && column < frameTicks.length - 1) end += frameTicks[++column]!;
  return {
    direction, frame: { row: ACTOR_DIRECTION_ORDER.indexOf(direction), column },
    spec: { textureKey: r.hurtKey, frameWidth: r.frameSize, frameHeight: r.frameSize, scale: r.scale, feetY: r.feetY },
  };
}

type MaterialImpact = { readonly born: number; readonly x: number; readonly y: number; readonly scale: number; readonly image: Phaser.GameObjects.Image | null };

/** Small opaque chips. Native strip when present, a few matte pixel flecks otherwise. */
class MaterialImpactView {
  private readonly effects: MaterialImpact[] = [];
  private readonly graphics: Phaser.GameObjects.Graphics;
  public constructor(private readonly scene: Phaser.Scene, private readonly material: MaterialKind) {
    this.graphics = scene.add.graphics().setDepth(presentationDepth('effect', 48));
  }
  public spawn(x: number, y: number, tick: number, death = false): void {
    if (this.effects.length >= (this.material === 'static' ? MAX_STATIC_IMPACTS : MAX_MANNEQUIN_IMPACTS)) this.effects.shift()?.image?.destroy();
    const key = MATERIAL_REACTIONS[this.material].impactKey;
    const image = exactReactionTexture(this.scene.textures, key, IMPACT_FRAME_SIZE * IMPACT_FRAMES, IMPACT_FRAME_SIZE)
      ? this.scene.add.image(x, y, key).setDepth(presentationDepth('effect', 48)) : null;
    this.effects.push({ born: tick, x, y, scale: death ? 1 : .75, image });
  }
  public sync(tick: number): void {
    this.graphics.clear();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]!, age = tick - effect.born;
      if (age < 0 || age >= IMPACT_TICKS) {
        effect.image?.destroy(); this.effects.splice(i, 1); continue;
      }
      const column = Math.floor(age / IMPACT_FRAME_TICKS);
      if (effect.image) {
        effect.image.setCrop(column * IMPACT_FRAME_SIZE, 0, IMPACT_FRAME_SIZE, IMPACT_FRAME_SIZE)
          .setOrigin((column * IMPACT_FRAME_SIZE + 24) / 288, .5).setScale(effect.scale);
      } else {
        // Fixed small count and age-derived motion: pause/re-render cannot drift.
        for (let chip = 0; chip < 5; chip++) {
          const angle = chip * 2.4;
          const distance = (3 + age * .9) * effect.scale;
          const color = MATERIAL_REACTIONS[this.material].flecks[chip % 2 ? 0 : 1];
          this.graphics.fillStyle(color, 1 - age / IMPACT_TICKS)
            .fillRect(Math.round(effect.x + Math.cos(angle) * distance), Math.round(effect.y + Math.sin(angle) * distance + age * age * .035), 2, chip % 2 ? 2 : 3);
        }
      }
    }
  }
  public reset(): void {
    for (const effect of this.effects) effect.image?.destroy();
    this.effects.length = 0; this.graphics.clear();
  }
  public destroy(): void { this.reset(); this.graphics.destroy(); }
}

export class MannequinImpactView extends MaterialImpactView {
  public constructor(scene: Phaser.Scene) { super(scene, 'mannequin'); }
}

/** Local casing/glass debris. No additive burst, screen flash or inferred hit direction. */
export class StaticImpactView extends MaterialImpactView {
  public constructor(scene: Phaser.Scene) { super(scene, 'static'); }
}

/** Chitin shell chips in the Hanger's own blues; no blood, no additive flash. */
export class HangerImpactView extends MaterialImpactView {
  public constructor(scene: Phaser.Scene) { super(scene, 'hanger'); }
}
