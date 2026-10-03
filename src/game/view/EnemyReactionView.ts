/** Renderer-only mannequin and CRT material/frame contracts; never changes combat state. */
import type Phaser from 'phaser';
import { ENEMY_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { ACTOR_DIRECTION_ORDER, type ActorDirection, type SpriteSpec } from './ActorSpriteView';

export const MANNEQUIN_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const MANNEQUIN_HURT_TICKS = 14;
export const STATIC_HURT_FRAME_TICKS = [3, 3, 4, 4] as const;
export const STATIC_HURT_TICKS = 14;
export const MAX_MANNEQUIN_IMPACTS = 24;
export const MAX_STATIC_IMPACTS = 24;
const IMPACT_FRAME_SIZE = 48;
const IMPACT_FRAMES = 6;
const IMPACT_FRAME_TICKS = 2;
const IMPACT_TICKS = IMPACT_FRAMES * IMPACT_FRAME_TICKS;

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
  return materialHurtFrame(textures, ENEMY_TEXTURE_KEYS.mannequinHurt, age, direction, MANNEQUIN_HURT_FRAME_TICKS);
}

export function staticHurtFrame(textures: Phaser.Textures.TextureManager, age: number, direction: ActorDirection): EnemyHurtFrame | null {
  return materialHurtFrame(textures, ENEMY_TEXTURE_KEYS.staticHurt, age, direction, STATIC_HURT_FRAME_TICKS);
}

function materialHurtFrame(textures: Phaser.Textures.TextureManager, textureKey: string, age: number, direction: ActorDirection, frameTicks: readonly number[]): EnemyHurtFrame | null {
  if (age < 0 || age >= frameTicks.reduce((sum, ticks) => sum + ticks, 0) || !exactReactionTexture(textures, textureKey, 384, 768)) return null;
  let column = 0, end = frameTicks[0]!;
  while (age >= end && column < frameTicks.length - 1) end += frameTicks[++column]!;
  return {
    direction, frame: { row: ACTOR_DIRECTION_ORDER.indexOf(direction), column },
    spec: { textureKey, frameWidth: 96, frameHeight: 96, scale: .75, feetY: 80.64 },
  };
}

type MaterialImpact = { readonly born: number; readonly x: number; readonly y: number; readonly scale: number; readonly image: Phaser.GameObjects.Image | null };

/** Small opaque chips. Native strip when present, a few matte pixel flecks otherwise. */
class MaterialImpactView {
  private readonly effects: MaterialImpact[] = [];
  private readonly graphics: Phaser.GameObjects.Graphics;
  public constructor(private readonly scene: Phaser.Scene, private readonly material: 'mannequin' | 'static') {
    this.graphics = scene.add.graphics().setDepth(presentationDepth('effect', 48));
  }
  public spawn(x: number, y: number, tick: number, death = false): void {
    if (this.effects.length >= (this.material === 'static' ? MAX_STATIC_IMPACTS : MAX_MANNEQUIN_IMPACTS)) this.effects.shift()?.image?.destroy();
    const key = this.material === 'static' ? ENEMY_TEXTURE_KEYS.staticCrtImpact : ENEMY_TEXTURE_KEYS.mannequinPlasticImpact;
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
          const color = this.material === 'static' ? (chip % 2 ? 0x817763 : 0x6aa2a8) : (chip % 2 ? 0xd5c8b3 : 0xede4d2);
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
