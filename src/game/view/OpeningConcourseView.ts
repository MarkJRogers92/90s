import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { usableTextureKey } from '../presentation/assetFallback';
import { CIVILIAN_TEXTURE_KEYS, ENVIRONMENT_TEXTURE_KEYS, type CivilianTextureKey, type EnvironmentTextureKey } from '../presentation/assets';
import { presentationDepth } from '../presentation/depth';
import { presentationOcclusionAlpha } from '../presentation/occlusion';
import { ConcourseAmbience, type ConcourseAmbienceSnapshot, type ConcourseCivilianLane } from './ConcourseAmbience';

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
  private readonly actorLayer: Phaser.GameObjects.Layer;
  private readonly tallForeground: Layer;
  private readonly lightsEffects: Layer;
  private readonly effectLayer: Phaser.GameObjects.Layer;
  private readonly actorGraphicsById = new Map<string, { graphics: Phaser.GameObjects.Graphics; baseY: number }>();
  private readonly effectGraphicsById = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly usedActorIds = new Set<string>();
  private readonly usedEffectIds = new Set<string>();
  private readonly occluders: Occluder[] = [];
  private readonly textureKeys = new Set<string>();
  private readonly ambience: ConcourseAmbience;
  private readonly civilianSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly warningEffects: Phaser.GameObjects.Graphics;
  private visibleCivilianCount = 0;
  private fallbackCount = 0;

  public constructor(scene: Phaser.Scene, actors: Phaser.GameObjects.Graphics, state: MvpRunState) {
    this.scene = scene;
    this.actors = actors;
    this.floor = this.layer('floor');
    this.decal = this.layer('decal');
    this.structure = this.layer('structure');
    this.lowProp = this.layer('lowProp');
    this.actorLayer = scene.add.layer().setDepth(presentationDepth('actor', 0));
    this.tallForeground = this.layer('tallForeground');
    this.lightsEffects = this.layer('effect');
    this.effectLayer = scene.add.layer().setDepth(presentationDepth('effect', 1));
    this.ambience = new ConcourseAmbience(state.seed);
    this.warningEffects = scene.add.graphics().setDepth(presentationDepth('effect', 0));
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

  /** Reuse one vector object per entity; Layer sorts children by their own base Y. */
  public actorGraphics(id: string, baseY: number): Phaser.GameObjects.Graphics {
    this.usedActorIds.add(id);
    let entry = this.actorGraphicsById.get(id);
    if (!entry) {
      const graphics = this.scene.add.graphics();
      this.actorLayer.add(graphics);
      entry = { graphics, baseY };
      this.actorGraphicsById.set(id, entry);
    }
    entry.baseY = baseY;
    entry.graphics.setDepth(baseY).clear();
    return entry.graphics;
  }

  /** Attack cues and projectiles stay above every tall foreground object. */
  public effectGraphics(id: string): Phaser.GameObjects.Graphics {
    this.usedEffectIds.add(id);
    let graphics = this.effectGraphicsById.get(id);
    if (!graphics) {
      graphics = this.scene.add.graphics();
      this.effectLayer.add(graphics);
      this.effectGraphicsById.set(id, graphics);
    }
    graphics.clear();
    return graphics;
  }

  public beginFrame(): void {
    this.usedActorIds.clear();
    this.usedEffectIds.clear();
  }

  public endFrame(): void {
    for (const [id, entry] of this.actorGraphicsById) {
      if (!this.usedActorIds.has(id)) {
        entry.graphics.destroy();
        this.actorGraphicsById.delete(id);
      }
    }
    for (const [id, graphics] of this.effectGraphicsById) {
      if (!this.usedEffectIds.has(id)) {
        graphics.destroy();
        this.effectGraphicsById.delete(id);
      }
    }
  }

  private stamp(
    layer: Layer,
    key: EnvironmentTextureKey,
    x: number,
    y: number,
    width: number,
    height: number,
    fallbackColor: number,
    foreground = false,
  ): void {
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
    const floorKey = usableTextureKey(this.scene.textures, ENVIRONMENT_TEXTURE_KEYS.floorTerrazzo);
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
        this.stamp(this.structure, ENVIRONMENT_TEXTURE_KEYS.storefrontFascia, x + panel * 64 + 19, 20, 64, 32, accent);
      }
      this.stamp(this.structure, ENVIRONMENT_TEXTURE_KEYS.signCool, x + 100, 28, 96, 24, accent);
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
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.atriumFountain, 432, 194, 96, 64, 0x63aab5);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.mallBench, 328, 302, 56, 30, 0x826753);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.mallBench, 588, 302, 56, 30, 0x826753);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.planter, 393, 276, 25, 25, 0x477460);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.planter, 543, 276, 25, 25, 0x477460);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.rubbishBin, 875, 333, 20, 25, 0x628d8e);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.railingGlass, 676, 318, 32, 32, 0x9bc6c8);
    this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.securityGate, 912, 189, 32, 32, 0x769c9c);
    if (room.benchKiosk) {
      this.stamp(this.lowProp, ENVIRONMENT_TEXTURE_KEYS.benchWarrantKiosk, room.benchKiosk.x - 32, room.benchKiosk.y - 38, 64, 64, 0x72566c);
    }

    this.stamp(this.tallForeground, ENVIRONMENT_TEXTURE_KEYS.mallDirectory, 264, 156, 17, 54, 0x4a717b, true);
    this.stamp(this.tallForeground, ENVIRONMENT_TEXTURE_KEYS.posterStand, 714, 156, 38, 53, 0x7f7295, true);
    this.stamp(this.tallForeground, ENVIRONMENT_TEXTURE_KEYS.pottedPalm, 166, 286, 38, 58, 0x427c67, true);
    this.stamp(this.tallForeground, ENVIRONMENT_TEXTURE_KEYS.pottedPalm, 790, 286, 38, 58, 0x427c67, true);

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
    this.renderAmbience(snapshot);
  }

  private renderAmbience(snapshot: MvpRunState): void {
    const room = snapshot.wing.rooms[snapshot.roomIndex];
    if (!room) return;
    const ambience = this.ambience.sync({
      playerX: snapshot.room.combat.player.x,
      roomX: room.bounds.x,
      roomWidth: room.bounds.width,
      inOpeningRoom: room.id === 'service_corridor',
      tick: snapshot.tick,
    });
    const active = new Set<string>();
    let visibleCount = 0;
    for (const [index, lane] of this.ambience.debugLanes().entries()) {
      const sprite = this.civilianSprite(lane, ambience.phase);
      if (!sprite) continue;
      active.add(lane.id);
      const walking = ambience.phase === 'busy' || ambience.phase === 'evacuating';
      const movingX = ambience.phase === 'evacuating'
        ? lane.x + Math.sign(lane.exitX - lane.x) * Math.min(Math.abs(lane.exitX - lane.x), this.ambience.debugPhaseAnimationTick() * 1.2)
        : lane.x + (walking ? Math.sin((this.ambience.debugAnimationTick() + index * 17) / 19) * 12 : 0);
      const exitReached = ambience.phase === 'evacuating' && Math.abs(movingX - lane.exitX) < 1;
      const texture = civilianTexture(lane.appearance, walking);
      if (sprite.texture.key !== texture) sprite.setTexture(texture);
      sprite.setVisible(ambience.phase !== 'empty' && !exitReached)
        .setPosition(movingX, lane.y)
        .setDepth(presentationDepth('actor', lane.y));
      const column = walking ? Math.floor(this.ambience.debugAnimationTick() / 5 + index) % 6 : (index + (ambience.phase === 'warning' ? 2 : 0)) % 8;
      const row = walking ? (lane.exitX < lane.x ? 2 : 6) : 0;
      sprite.setCrop(column * 32, row * 48, 32, 48);
      if (sprite.visible) visibleCount += 1;
    }
    for (const [id, sprite] of this.civilianSprites) {
      if (!active.has(id)) sprite.setVisible(false);
    }
    this.visibleCivilianCount = visibleCount;
    this.warningEffects.clear();
    if (ambience.phase === 'warning' || ambience.phase === 'evacuating') {
      const flicker = snapshot.tick % 12 < 4 ? 0.45 : 0.12;
      this.warningEffects.fillStyle(0xffd45d, flicker).fillRect(169, 28, 96, 4);
      this.warningEffects.lineStyle(1, 0xffd45d, 0.65).strokeRect(911, 188 + (snapshot.tick % 8 < 2 ? 1 : 0), 34, 34);
    }
  }

  private civilianSprite(lane: ConcourseCivilianLane, phase: ReturnType<ConcourseAmbience['snapshot']>['phase']): Phaser.GameObjects.Image | null {
    const walking = phase === 'busy' || phase === 'evacuating';
    const key = civilianTexture(lane.appearance, walking);
    if (!usableTextureKey(this.scene.textures, key)) return null;
    let sprite = this.civilianSprites.get(lane.id);
    if (!sprite) {
      sprite = this.scene.add.image(lane.x, lane.y, key).setOrigin(0.5, 0.84);
      this.civilianSprites.set(lane.id, sprite);
    }
    return sprite;
  }

  /** Rebuild on the next room entry; never retain run-specific display state. */
  public resetForRun(): void {
    this.ambience.resetForRun();
    for (const sprite of this.civilianSprites.values()) sprite.setVisible(false);
    this.visibleCivilianCount = 0;
    for (const occluder of this.occluders) occluder.object.setAlpha(1);
  }

  public debugSnapshot(): {
    themeId: string;
    fallbackCount: number;
    occluderCount: number;
    staticDisplayObjectCount: number;
    staticTextureCount: number;
    dynamicDisplayObjectCount: number;
    sceneDisplayObjectCount: number;
    actorDepths: Array<{ id: string; baseY: number; renderDepth: number }>;
    effectDepths: Array<{ id: string; renderDepth: number }>;
    ambience: ConcourseAmbienceSnapshot;
    depthBands: { tallForeground: number; effect: number; prompt: number };
  } {
    return {
      themeId: this.themeId,
      fallbackCount: this.fallbackCount,
      occluderCount: this.occluders.length,
      staticDisplayObjectCount: [this.floor, this.decal, this.structure, this.lowProp, this.tallForeground, this.lightsEffects]
        .reduce((total, layer) => total + layer.list.length, 0),
      staticTextureCount: this.textureKeys.size,
      dynamicDisplayObjectCount: this.actorLayer.list.length + this.effectLayer.list.length,
      sceneDisplayObjectCount: this.scene.sys.displayList.list.length,
      actorDepths: [...this.actorGraphicsById].map(([id, entry]) => ({
        id,
        baseY: entry.baseY,
        renderDepth: this.actorLayer.depth + entry.graphics.depth,
      })),
      effectDepths: [...this.effectGraphicsById].map(([id, graphics]) => ({
        id,
        renderDepth: this.effectLayer.depth + graphics.depth,
      })),
      ambience: this.ambienceSnapshot(),
      depthBands: {
        tallForeground: this.tallForeground.depth,
        effect: this.effectLayer.depth,
        prompt: presentationDepth('prompt', 0),
      },
    };
  }

  /** Marks the renderer-only group empty before the room entry disposes it. */
  public leaveRoom(tick: number): ConcourseAmbienceSnapshot {
    this.ambience.sync({ playerX: 0, roomX: 0, roomWidth: 1, inOpeningRoom: false, tick });
    for (const sprite of this.civilianSprites.values()) sprite.setVisible(false);
    this.visibleCivilianCount = 0;
    this.warningEffects.clear();
    return this.ambienceSnapshot();
  }

  /** Debug reports the sprites actually rendered, not intended lane count. */
  public ambienceSnapshot(): ConcourseAmbienceSnapshot {
    return { phase: this.ambience.snapshot().phase, visibleCount: this.visibleCivilianCount };
  }

  public destroy(): void {
    this.actorLayer.remove(this.actors, false);
    this.scene.sys.displayList.add(this.actors);
    for (const layer of [this.floor, this.decal, this.structure, this.lowProp, this.actorLayer, this.tallForeground, this.lightsEffects, this.effectLayer]) {
      layer.destroy(true);
    }
    this.actorGraphicsById.clear();
    this.effectGraphicsById.clear();
    for (const sprite of this.civilianSprites.values()) sprite.destroy();
    this.civilianSprites.clear();
    this.warningEffects.destroy();
  }
}

function civilianTexture(appearance: ConcourseCivilianLane['appearance'], walking: boolean): CivilianTextureKey {
  const keys = {
    'shopper-a': walking ? CIVILIAN_TEXTURE_KEYS.shopperAWalk : CIVILIAN_TEXTURE_KEYS.shopperAIdle,
    'shopper-b': walking ? CIVILIAN_TEXTURE_KEYS.shopperBWalk : CIVILIAN_TEXTURE_KEYS.shopperBIdle,
    clerk: walking ? CIVILIAN_TEXTURE_KEYS.clerkWalk : CIVILIAN_TEXTURE_KEYS.clerkIdle,
    security: walking ? CIVILIAN_TEXTURE_KEYS.securityWalk : CIVILIAN_TEXTURE_KEYS.securityIdle,
  } as const;
  return keys[appearance];
}
