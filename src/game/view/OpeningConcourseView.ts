import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { presentationOcclusionAlpha } from '../presentation/occlusion';

type Layer = Phaser.GameObjects.Container;
type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Occluder = {
  readonly object: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  readonly rect: Rect;
};

/** Disposable environment for the existing safe entry room. Owns display only. */
export class OpeningConcourseView {
  public readonly themeId = 'opening_concourse';
  private readonly scene: Phaser.Scene;
  private readonly actors: Phaser.GameObjects.Graphics;
  private readonly floor: Layer;
  private readonly decal: Layer;
  private readonly structure: Layer;
  private readonly lowProp: Layer;
  private readonly actorLayer: Layer;
  private readonly tallForeground: Layer;
  private readonly lightsEffects: Layer;
  private readonly occluders: Occluder[] = [];
  private readonly textureKeys = new Set<string>();
  private fallbackCount = 0;

  public constructor(scene: Phaser.Scene, actors: Phaser.GameObjects.Graphics, state: MvpRunState) {
    this.scene = scene;
    this.actors = actors;
    this.floor = this.layer('floor');
    this.decal = this.layer('decal');
    this.structure = this.layer('structure');
    this.lowProp = this.layer('lowProp');
    this.actorLayer = this.layer('actor');
    this.tallForeground = this.layer('tallForeground');
    this.lightsEffects = this.layer('effect');
    this.actorLayer.add(actors);
    this.buildStatic(state);
  }

  private layer(band: Parameters<typeof presentationDepth>[0]): Layer {
    return this.scene.add.container(0, 0).setDepth(presentationDepth(band, 0));
  }

  private graphics(layer: Layer): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    layer.add(graphics);
    return graphics;
  }

  private stamp(
    layer: Layer,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fallbackColor: number,
    foreground = false,
  ): void {
    const key = `presentation:environment:${name}`;
    const usable = usableTextureKey(this.scene.textures, key);
    let object: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (usable) {
      object = this.scene.add.image(Math.round(x), Math.round(y), usable).setOrigin(0, 0);
      object.setDisplaySize(Math.round(width), Math.round(height));
      this.textureKeys.add(usable);
    } else {
      this.fallbackCount += 1;
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(fallbackColor, 1).fillRect(Math.round(x), Math.round(y), width, height);
      graphics.lineStyle(2, 0x35515a, 1).strokeRect(Math.round(x), Math.round(y), width, height);
      object = graphics;
    }
    layer.add(object);
    if (foreground) this.occluders.push({ object, rect: { x, y, width, height } });
  }

  private buildStatic(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    if (!room) return;
    const bounds = room.bounds;
    const ground = this.graphics(this.floor);
    ground.fillStyle(0xc2c8bd, 1).fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    const floorKey = usableTextureKey(this.scene.textures, 'presentation:environment:floor-terrazzo');
    if (floorKey) {
      this.floor.add(this.scene.add.tileSprite(bounds.x, bounds.y, bounds.width, bounds.height, floorKey).setOrigin(0, 0));
      this.textureKeys.add(floorKey);
    } else {
      this.fallbackCount += 1;
      ground.lineStyle(1, 0x9ea9a7, 0.7);
      for (let x = 0; x <= bounds.width; x += 32) ground.lineBetween(x, 0, x, bounds.height);
      for (let y = 0; y <= bounds.height; y += 32) ground.lineBetween(0, y, bounds.width, y);
    }

    const inlay = this.graphics(this.decal);
    inlay.fillStyle(0xf1f0d8, 0.42).fillRect(20, 178, 920, 124);
    inlay.lineStyle(2, 0x5b9a9f, 0.72).strokeRect(22, 180, 916, 120);
    inlay.fillStyle(0x35656c, 0.16).fillEllipse(480, 270, 124, 27);
    inlay.fillStyle(0xe8faf7, 0.28).fillRect(450, 298, 62, 3);
    for (const doorway of room.doorways) {
      inlay.fillStyle(0xe5d18b, 1).fillRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
      inlay.lineStyle(2, 0x27414a, 1).strokeRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
    }

    const masonry = this.graphics(this.structure);
    // Two shallow 3/4 retail fronts; their side returns give a visible depth cue.
    for (const [x, accent, name] of [[72, 0x61c8ca, 'VIDEO WORLD'], [592, 0xd986bb, 'MUSIC MART']] as const) {
      masonry.fillStyle(0x233f4a, 1).fillRect(x, 22, 296, 103);
      masonry.fillStyle(0x355b66, 1).fillTriangle(x + 296, 22, x + 318, 40, x + 296, 125);
      masonry.fillStyle(0xb7d5d1, 1).fillRect(x + 8, 46, 280, 68);
      masonry.fillStyle(0x406979, 1).fillRect(x + 13, 49, 270, 60);
      masonry.fillStyle(0x8cc0bc, 0.38).fillRect(x + 18, 52, 4, 50);
      masonry.fillStyle(accent, 1).fillRect(x, 22, 296, 5);
      masonry.fillStyle(0xf6e4aa, 1).fillRect(x, 114, 296, 6);
      masonry.lineStyle(2, 0x1d343e, 1).strokeRect(x, 22, 296, 103);
      for (let panel = 0; panel < 4; panel += 1) {
        this.stamp(this.structure, 'storefront-fascia', x + panel * 64 + 19, 20, 64, 32, accent);
      }
      this.stamp(this.structure, 'sign-cool', x + 100, 28, 96, 24, accent);
      const sign = this.scene.add.text(x + 109, 34, name, {
        fontFamily: '"Courier New", monospace', fontSize: '10px', color: '#fff1b7',
      });
      this.structure.add(sign);
    }
    // The authored wall rectangles remain the only collision landmarks.
    for (const wall of room.walls) {
      masonry.fillStyle(0x243f4a, 1).fillRect(wall.x, wall.y, wall.width, wall.height);
      masonry.fillStyle(0x4c7680, 1).fillRect(wall.x, wall.y, wall.width, Math.min(5, wall.height));
      masonry.lineStyle(2, 0xe3d6a3, 1).strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    const props = this.graphics(this.lowProp);
    props.fillStyle(0x28434c, 0.28).fillEllipse(480, 276, 112, 17);
    this.stamp(this.lowProp, 'atrium-fountain', 432, 194, 96, 64, 0x63aab5);
    this.stamp(this.lowProp, 'mall-bench', 328, 302, 56, 30, 0x826753);
    this.stamp(this.lowProp, 'mall-bench', 588, 302, 56, 30, 0x826753);
    this.stamp(this.lowProp, 'planter', 393, 276, 25, 25, 0x477460);
    this.stamp(this.lowProp, 'planter', 543, 276, 25, 25, 0x477460);
    this.stamp(this.lowProp, 'rubbish-bin', 875, 333, 20, 25, 0x628d8e);
    this.stamp(this.lowProp, 'railing-glass', 676, 318, 32, 32, 0x9bc6c8);
    this.stamp(this.lowProp, 'security-gate', 912, 189, 32, 32, 0x769c9c);
    if (room.benchKiosk) {
      this.stamp(this.lowProp, 'bench-warrant-kiosk', room.benchKiosk.x - 32, room.benchKiosk.y - 38, 64, 64, 0x72566c);
    }

    this.stamp(this.tallForeground, 'mall-directory', 264, 156, 17, 54, 0x4a717b, true);
    this.stamp(this.tallForeground, 'poster-stand', 714, 156, 38, 53, 0x7f7295, true);
    this.stamp(this.tallForeground, 'potted-palm', 166, 286, 38, 58, 0x427c67, true);
    this.stamp(this.tallForeground, 'potted-palm', 790, 286, 38, 58, 0x427c67, true);

    const light = this.graphics(this.lightsEffects);
    light.fillStyle(0xffffdf, 0.12).fillRect(40, 0, 880, 38);
    light.fillStyle(0x7ce7e1, 0.32).fillRect(82, 124, 272, 2);
    light.fillStyle(0xf5a1dc, 0.32).fillRect(602, 124, 272, 2);
  }

  public render(snapshot: MvpRunState): void {
    const foot = snapshot.room.combat.player;
    for (const occluder of this.occluders) {
      occluder.object.setAlpha(presentationOcclusionAlpha('tallForeground', foot, occluder.rect));
    }
  }

  /** Rebuild on the next room entry; never retain run-specific display state. */
  public resetForRun(): void {
    for (const occluder of this.occluders) occluder.object.setAlpha(1);
  }

  public debugSnapshot(): {
    themeId: string;
    fallbackCount: number;
    occluderCount: number;
    staticDisplayObjectCount: number;
    staticTextureCount: number;
  } {
    return {
      themeId: this.themeId,
      fallbackCount: this.fallbackCount,
      occluderCount: this.occluders.length,
      staticDisplayObjectCount: [this.floor, this.decal, this.structure, this.lowProp, this.tallForeground, this.lightsEffects]
        .reduce((total, layer) => total + layer.list.length, 0),
      staticTextureCount: this.textureKeys.size,
    };
  }

  public destroy(): void {
    this.actorLayer.remove(this.actors, false);
    this.scene.sys.displayList.add(this.actors);
    for (const layer of [this.floor, this.decal, this.structure, this.lowProp, this.actorLayer, this.tallForeground, this.lightsEffects]) {
      layer.destroy(true);
    }
  }
}
