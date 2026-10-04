/** Renderer-only material hurt/impact contracts (every enemy kind, roadmap V1); never changes combat state. */
import type Phaser from 'phaser';
import { ENEMY_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { ACTOR_DIRECTION_ORDER, enemySpriteSheet, type ActorDirection, type SpriteSpec } from './ActorSpriteView';
import type { EnemyKind } from '../../sim/model';

export const MANNEQUIN_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const MANNEQUIN_HURT_TICKS = 14;
export const STATIC_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const STATIC_HURT_TICKS = 14;
export const HANGER_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
/** Every other enemy flinches like the Hanger; bosses flinch shorter (roadmap V1). */
export const NATIVE_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const BOSS_HURT_FRAME_TICKS = [2, 2, 2, 1] as const;
export const MAX_MANNEQUIN_IMPACTS = 24;
export const MAX_STATIC_IMPACTS = 24;
const IMPACT_FRAME_SIZE = 48;
const IMPACT_FRAMES = 6;
const IMPACT_FRAME_TICKS = 2;
const IMPACT_TICKS = IMPACT_FRAMES * IMPACT_FRAME_TICKS;

type NativeKind = Exclude<EnemyKind, 'mannequin' | 'static' | 'hanger'>;
export type MaterialKind = 'mannequin' | 'static' | 'hanger' | NativeKind;
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
  /** How far above the feet a hit's impact strip is centred. */
  readonly impactLift: number;
};

/**
 * Roadmap V1 (art/enemy-reactions/materials): hurt frame (the walk canvas, grown evenly for a
 * PixelLab strip), idle frame, and the impact's fallback flecks in the enemy's own material.
 * Scale and feet follow syncActorSprite: displaySize / idle, and 84% of the idle frame.
 */
const NATIVE: Readonly<Record<NativeKind, { readonly frame: number; readonly idle: number; readonly flecks: readonly [number, number]; readonly boss?: true }>> = {
  walker: { frame: 100, idle: 92, flecks: [0x90d0f0, 0xd8f0ff] },        // sweat
  shopper: { frame: 96, idle: 96, flecks: [0xd8c890, 0xf4f0e0] },        // coupons
  mascot: { frame: 132, idle: 96, flecks: [0xf0c070, 0xfff4d8] },        // foam stuffing
  roofer: { frame: 152, idle: 136, flecks: [0x302830, 0x706878] },       // tar
  spitter: { frame: 64, idle: 64, flecks: [0x9aff6a, 0xc8ffa0] },        // goo
  elf: { frame: 108, idle: 92, flecks: [0xf0c030, 0xfff090] },           // glitter
  spritzer: { frame: 104, idle: 92, flecks: [0xe090e0, 0xffd8f8] },      // perfume mist
  poodle: { frame: 92, idle: 92, flecks: [0xf090b0, 0xffc8e0] },         // fur
  goon: { frame: 104, idle: 92, flecks: [0xa8e8f0, 0xf0ffff] },          // ice
  lp_manager: { frame: 64, idle: 64, flecks: [0xc0c8d8, 0xf4f0e0], boss: true },
  manager: { frame: 96, idle: 96, flecks: [0xd0d0c8, 0xf8f8f0], boss: true },
  owner: { frame: 128, idle: 128, flecks: [0x90c880, 0xe8f8d8], boss: true },
  developer: { frame: 180, idle: 180, flecks: [0x7098e0, 0xd8e8ff], boss: true },
  santa: { frame: 160, idle: 160, flecks: [0xf03030, 0xffffff], boss: true },
  glamour_queen: { frame: 160, idle: 160, flecks: [0xf080c8, 0xffe0f4], boss: true },
  whiskers: { frame: 160, idle: 160, flecks: [0xe09850, 0xf8e0c0], boss: true },
  zamboni: { frame: 160, idle: 160, flecks: [0xa8e8f0, 0xf0ffff], boss: true },
};

function nativeReaction(kind: NativeKind): MaterialReaction {
  const { frame, idle, flecks, boss } = NATIVE[kind];
  const prefix = kind.replace('_', '-'), displaySize = enemySpriteSheet(kind, false)!.displaySize;
  return {
    hurtKey: `neon:enemy:${prefix}-hurt`, impactKey: `neon:enemy:${prefix}-impact`,
    frameTicks: boss ? BOSS_HURT_FRAME_TICKS : NATIVE_HURT_FRAME_TICKS,
    frameSize: frame, scale: displaySize / idle, feetY: (frame - idle) / 2 + idle * 0.84,
    flecks, impactLift: Math.round(displaySize * 0.36),
  };
}
const MATERIAL_REACTIONS: Readonly<Record<MaterialKind, MaterialReaction>> = {
  mannequin: { hurtKey: ENEMY_TEXTURE_KEYS.mannequinHurt, impactKey: ENEMY_TEXTURE_KEYS.mannequinPlasticImpact, frameTicks: MANNEQUIN_HURT_FRAME_TICKS, frameSize: 96, scale: .75, feetY: 80.64, flecks: [0xd5c8b3, 0xede4d2], impactLift: 24 },
  static: { hurtKey: ENEMY_TEXTURE_KEYS.staticHurt, impactKey: ENEMY_TEXTURE_KEYS.staticCrtImpact, frameTicks: STATIC_HURT_FRAME_TICKS, frameSize: 96, scale: .75, feetY: 80.64, flecks: [0x817763, 0x6aa2a8], impactLift: 43 },
  // Derived from hanger-walk.png (92 px canvas, 64 px idle at scale 1): art/enemy-reactions/hanger.
  hanger: { hurtKey: ENEMY_TEXTURE_KEYS.hangerHurt, impactKey: ENEMY_TEXTURE_KEYS.hangerShellImpact, frameTicks: HANGER_HURT_FRAME_TICKS, frameSize: 92, scale: 1, feetY: 67.76, flecks: [0x6a96b8, 0x9cc4e0], impactLift: 22 },
  ...Object.fromEntries((Object.keys(NATIVE) as NativeKind[]).map((kind) => [kind, nativeReaction(kind)])) as Record<NativeKind, MaterialReaction>,
};

export function isMaterialKind(kind: string): kind is MaterialKind {
  return Object.hasOwn(MATERIAL_REACTIONS, kind);
}
/**
 * Whether a hit flinch may interrupt this kind's attack pose. Only the contact
 * biters: the Hanger (its attack sheet is a proximity loop, and its reach ring,
 * drawn separately, still warns) and the Mall Walker (no wind-up at all).
 * Telegraphed attacks (every wind-up, charge and lob) always keep priority.
 */
export function hurtOutranksAttack(kind: string): boolean {
  return kind === 'hanger' || kind === 'walker';
}
/** How far above the feet this kind's impact strip is centred. */
export function materialImpactLift(kind: MaterialKind): number {
  return MATERIAL_REACTIONS[kind].impactLift;
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
export class MaterialImpactView {
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
