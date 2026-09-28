/**
 * Presentation for one mall room, built from a `DressingPlan`.
 *
 * Replaces the opening-only concourse view: every room in the wing is now a
 * lit, dressed mall space. The layer stack, back to front:
 *
 *   floor → floor inlays/decals → storefront wall → low props
 *   → y-sorted props, civilians and actors → tall foreground (railing)
 *   → LIGHTMAP (multiply) → glow (additive neon, halos) → effects → prompts
 *
 * The view owns display objects only. It reads the run state it is given and
 * never writes to it; collision, combat and economy stay in `src/sim`.
 */
import Phaser from 'phaser';
import type { MvpRunState } from '../../sim/run/types';
import { usableTextureKey } from '../presentation/assetFallback';
import { CIVILIAN_TEXTURE_KEYS, ENVIRONMENT_TEXTURE_KEYS, NEON_CIVILIAN_KEYS, characterFrameSize, type CivilianTextureKey } from '../presentation/assets';
import { presentationDepth } from '../presentation/depth';
import { GLOW_DEPTH, LightingLayer, type PointLight } from '../presentation/lighting/LightingLayer';
import { FX_TEXTURES, ensureFxTextures, ensureNeonSign, floorTextureKey, type NeonSignSpec } from '../presentation/neon/proceduralTextures';
import {
  FACADE_BASE_Y,
  FACADE_HEIGHT,
  FACADE_TEXTURES,
  PROP_TEXTURES,
  STAGE_HEIGHT,
  STAGE_TOP,
  STAGE_WIDTH,
  planRoomDressing,
  type DressingPlan,
  type DressingProp,
} from '../presentation/rooms/roomDressing';
import { croppedFrameOrigin } from './ActorSpriteView';
import { ConcourseAmbience, type ConcourseAmbienceSnapshot, type ConcourseCivilianLane } from './ConcourseAmbience';

type Layer = Phaser.GameObjects.Container;
type Occluder = {
  readonly object: Phaser.GameObjects.Image;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly baseY: number;
};

export type MallRoomAmbienceSnapshot = ConcourseAmbienceSnapshot & {
  readonly inFrameCount: number;
  readonly inFrameIds: readonly string[];
};

const WALL_DARK = 0x16121f;
const WALL_MID = 0x2a2238;
const WALL_EDGE = 0x4a3d62;

export class MallRoomView {
  public readonly themeId: string;
  public readonly plan: DressingPlan;
  public readonly lighting: LightingLayer;
  private readonly scene: Phaser.Scene;
  private readonly actors: Phaser.GameObjects.Graphics;
  private readonly floor: Layer;
  private readonly decal: Layer;
  private readonly structure: Layer;
  private readonly lowProp: Layer;
  private readonly actorLayer: Phaser.GameObjects.Layer;
  private readonly tallForeground: Layer;
  private readonly glow: Layer;
  private readonly effectLayer: Phaser.GameObjects.Layer;
  private readonly sortedProps: Phaser.GameObjects.Image[] = [];
  private readonly pulsing: Array<{ object: Phaser.GameObjects.Image; base: number; seed: number }> = [];
  private readonly actorGraphicsById = new Map<string, { graphics: Phaser.GameObjects.Graphics; baseY: number }>();
  private readonly effectGraphicsById = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly usedActorIds = new Set<string>();
  private readonly usedEffectIds = new Set<string>();
  private readonly occluders: Occluder[] = [];
  private readonly textureKeys = new Set<string>();
  private readonly ambience: ConcourseAmbience | null;
  private readonly civilianSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly warningEffects: Phaser.GameObjects.Graphics;
  private visibleCivilianCount = 0;
  private fallbackCount = 0;

  public constructor(scene: Phaser.Scene, actors: Phaser.GameObjects.Graphics, state: MvpRunState) {
    this.scene = scene;
    this.actors = actors;
    ensureFxTextures(scene);
    const room = state.wing.rooms[state.roomIndex]!;
    this.plan = planRoomDressing(room, state.wing.floor === 2 ? 2 : 1);
    this.themeId = this.plan.themeId;
    this.floor = this.layer('floor');
    this.decal = this.layer('decal');
    this.structure = this.layer('structure');
    this.lowProp = this.layer('lowProp');
    this.actorLayer = scene.add.layer().setDepth(presentationDepth('actor', 0));
    this.tallForeground = this.layer('tallForeground');
    this.glow = scene.add.container(0, 0).setDepth(GLOW_DEPTH);
    this.effectLayer = scene.add.layer().setDepth(presentationDepth('effect', 1));
    this.warningEffects = scene.add.graphics().setDepth(presentationDepth('effect', 0));
    this.lighting = new LightingLayer(scene, { x: 0, y: STAGE_TOP, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.lighting.setAmbient(this.plan.ambient);
    this.lighting.setStaticLights(this.plan.lights);
    // Civilians stroll around the opening room's own collision (planters, fountain).
    this.ambience = this.plan.civilians ? new ConcourseAmbience(state.seed, state.wing.rooms[0]?.walls ?? []) : null;
    this.actorLayer.add(actors);
    this.build(state);
  }

  private layer(band: Parameters<typeof presentationDepth>[0]): Layer {
    return this.scene.add.container(0, 0).setDepth(presentationDepth(band, 0));
  }

  private graphics(layer: Layer): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics();
    layer.add(graphics);
    return graphics;
  }

  /* ---------------------------------------------------------------------- */
  /* Per-frame entity drawing surfaces (same contract as the old concourse)   */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* Static build                                                             */
  /* ---------------------------------------------------------------------- */

  private build(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    if (!room) return;
    this.buildFloor(room.bounds);
    this.buildStoreZone();
    this.buildNeonStrips();
    this.buildBackWall();
    this.buildSideWalls(room);
    this.buildRailing();
    for (const prop of this.plan.props) this.placeProp(prop);
    if (room.benchKiosk) {
      // The Bench Warrant is a repair desk you can walk up to; the older
      // presentation-slice kiosk sprite stays as the fallback.
      const kiosk = usableTextureKey(this.scene.textures, PROP_TEXTURES.benchKiosk.key)
        ? PROP_TEXTURES.benchKiosk.key
        : ENVIRONMENT_TEXTURE_KEYS.benchWarrantKiosk;
      this.placeImage(kiosk, room.benchKiosk.x, room.benchKiosk.y + 30, 80, 91, true);
    }
    for (const floorSign of this.plan.floorSigns) this.placeSign(floorSign, floorSign.x, floorSign.y, false);
  }

  private buildFloor(bounds: { x: number; y: number; width: number; height: number }): void {
    const ground = this.graphics(this.floor);
    ground.fillStyle(0x100c18, 1).fillRect(0, STAGE_TOP, STAGE_WIDTH, STAGE_HEIGHT);
    const key = usableTextureKey(this.scene.textures, floorTextureKey(this.plan.floor));
    if (key) {
      this.floor.add(this.scene.add.tileSprite(bounds.x, bounds.y, bounds.width, bounds.height, key).setOrigin(0, 0));
      this.textureKeys.add(key);
    } else {
      this.fallbackCount += 1;
      ground.fillStyle(0x5c4d5c, 1).fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    // A long soft floor sheen, as if the polish catches the ceiling lights.
    const sheen = this.graphics(this.decal);
    for (let i = 0; i < 6; i += 1) {
      sheen.fillStyle(0xffffff, 0.018).fillRect(0, 60 + i * 70, STAGE_WIDTH, 26);
    }
  }

  private buildStoreZone(): void {
    const zone = this.plan.storeZone;
    if (!zone) return;
    const key = usableTextureKey(this.scene.textures, floorTextureKey(zone.floor));
    const { x, y, width, height } = zone.bounds;
    if (key) {
      this.decal.add(this.scene.add.tileSprite(x, y, width, height, key).setOrigin(0, 0));
      this.textureKeys.add(key);
    }
    const trim = this.graphics(this.decal);
    trim.lineStyle(3, 0x1a1422, 1).strokeRect(x, y, width, height);
  }

  private buildNeonStrips(): void {
    const floorLines = this.graphics(this.decal);
    const halo = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.glow.add(halo);
    for (const ring of this.plan.neonRings) {
      floorLines.lineStyle(3, ring.color, 1).strokeEllipse(ring.x, ring.y, ring.width, ring.height);
      halo.lineStyle(10, ring.color, 0.12).strokeEllipse(ring.x, ring.y, ring.width, ring.height);
      halo.lineStyle(3, ring.color, 0.45).strokeEllipse(ring.x, ring.y, ring.width, ring.height);
    }
    for (const strip of this.plan.neonStrips) {
      floorLines.lineStyle(3, strip.color, 1).lineBetween(strip.x1, strip.y1, strip.x2, strip.y2);
      halo.lineStyle(10, strip.color, 0.12).lineBetween(strip.x1, strip.y1, strip.x2, strip.y2);
      halo.lineStyle(3, strip.color, 0.5).lineBetween(strip.x1, strip.y1, strip.x2, strip.y2);
    }
  }

  private buildBackWall(): void {
    const top = FACADE_BASE_Y - FACADE_HEIGHT;
    const wall = this.graphics(this.structure);
    // The dark mass of the wall behind and between the shop panels.
    wall.fillStyle(WALL_DARK, 1).fillRect(0, STAGE_TOP, STAGE_WIDTH, FACADE_BASE_Y - STAGE_TOP);
    wall.fillStyle(WALL_MID, 1).fillRect(0, top, STAGE_WIDTH, 10);
    // Pillars between panels, each with a thin neon accent up its face.
    let cursor = 0;
    const pillars: Array<{ x: number; width: number }> = [];
    for (const facade of this.plan.facades) {
      if (facade.x > cursor) pillars.push({ x: cursor, width: facade.x - cursor });
      cursor = facade.x + FACADE_TEXTURES[facade.facade].width;
    }
    if (cursor < STAGE_WIDTH) pillars.push({ x: cursor, width: STAGE_WIDTH - cursor });
    const accents = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.glow.add(accents);
    pillars.forEach((pillar, index) => {
      wall.fillStyle(WALL_MID, 1).fillRect(pillar.x, top, pillar.width, FACADE_HEIGHT - 20);
      wall.fillStyle(WALL_EDGE, 1).fillRect(pillar.x, top, 2, FACADE_HEIGHT - 20);
      wall.fillStyle(0x0c0912, 1).fillRect(pillar.x + pillar.width - 2, top, 2, FACADE_HEIGHT - 20);
      const accent = index % 2 === 0 ? 0x3ff0ff : 0xff3fc8;
      if (pillar.width >= 10) {
        const cx = pillar.x + Math.floor(pillar.width / 2);
        wall.fillStyle(accent, 1).fillRect(cx - 1, top + 14, 2, FACADE_HEIGHT - 60);
        accents.fillStyle(accent, 0.18).fillRect(cx - 5, top + 10, 10, FACADE_HEIGHT - 52);
      }
    });
    // Sidewalk kerb along the whole wall base.
    wall.fillStyle(0x3a3246, 1).fillRect(0, FACADE_BASE_Y - 6, STAGE_WIDTH, 6);
    wall.fillStyle(0x6a5e7a, 1).fillRect(0, FACADE_BASE_Y - 6, STAGE_WIDTH, 1);

    for (const facade of this.plan.facades) {
      const texture = FACADE_TEXTURES[facade.facade];
      const key = usableTextureKey(this.scene.textures, texture.key);
      if (key) {
        this.structure.add(this.scene.add.image(facade.x, top, key).setOrigin(0, 0));
        this.textureKeys.add(key);
      } else {
        this.fallbackCount += 1;
        wall.fillStyle(0x2c3550, 1).fillRect(facade.x, top, texture.width, FACADE_HEIGHT);
        wall.fillStyle(facade.spill, 0.35).fillRect(facade.x + 20, top + 60, texture.width - 40, 70);
      }
      if (facade.sign) this.placeSign(facade.sign, facade.sign.x, facade.sign.y, true);
    }
  }

  /** A neon sign: dark backing plate, crisp tube, additive halo, floor reflection. */
  private placeSign(spec: NeonSignSpec, cx: number, cy: number, reflect: boolean): void {
    const sign = ensureNeonSign(this.scene, spec);
    const plate = this.graphics(this.structure);
    plate.fillStyle(0x0a0710, 0.92).fillRoundedRect(cx - sign.width / 2 + 6, cy - sign.height / 2 + 6, sign.width - 12, sign.height - 12, 3);
    const halo = this.scene.add.image(cx, cy, sign.halo).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
    const core = this.scene.add.image(cx, cy, sign.core);
    this.glow.add([halo, core]);
    this.pulsing.push({ object: halo, base: 0.9, seed: this.pulsing.length });
    this.textureKeys.add(sign.core);
    if (reflect) {
      // Polished floor: a faint, stretched, upside-down smear of the sign.
      const reflection = this.scene.add
        .image(cx, FACADE_BASE_Y + 22, sign.halo)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.08)
        .setFlipY(true)
        .setScale(1, 1.6);
      this.glow.add(reflection);
    }
  }

  private buildSideWalls(room: MvpRunState['wing']['rooms'][number]): void {
    const walls = this.graphics(this.tallForeground);
    const glow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.glow.add(glow);
    const depth = 14;
    for (const side of ['west', 'east'] as const) {
      const x = side === 'west' ? 0 : STAGE_WIDTH - depth;
      const door = room.doorways.find((doorway) => doorway.side === side);
      const segments = door
        ? [
            { y: FACADE_BASE_Y, height: door.rect.y - FACADE_BASE_Y },
            { y: door.rect.y + door.rect.height, height: 470 - (door.rect.y + door.rect.height) },
          ]
        : [{ y: FACADE_BASE_Y, height: 470 - FACADE_BASE_Y }];
      for (const segment of segments) {
        walls.fillStyle(WALL_DARK, 1).fillRect(x, segment.y, depth, segment.height);
        walls.fillStyle(WALL_EDGE, 1).fillRect(side === 'west' ? x + depth - 2 : x, segment.y, 2, segment.height);
      }
      if (door) {
        const color = 0x3ff0ff;
        const inner = side === 'west' ? depth : STAGE_WIDTH - depth;
        // A lit exit portal: the next room glows through the opening.
        walls.fillStyle(0x07050c, 1).fillRect(x, door.rect.y, depth, door.rect.height);
        glow.fillStyle(color, 0.16).fillRect(side === 'west' ? 0 : STAGE_WIDTH - 40, door.rect.y, 40, door.rect.height);
        glow.lineStyle(2, color, 0.9).lineBetween(inner, door.rect.y, inner, door.rect.y + door.rect.height);
        glow.lineStyle(6, color, 0.2).lineBetween(inner, door.rect.y, inner, door.rect.y + door.rect.height);
        const chevron = side === 'west' ? -1 : 1;
        const ax = side === 'west' ? 34 : STAGE_WIDTH - 34;
        const ay = door.rect.y + door.rect.height / 2;
        for (let i = 0; i < 2; i += 1) {
          const ox = ax + chevron * i * 8;
          glow.lineStyle(2, 0xffd84a, 0.8).lineBetween(ox - chevron * 4, ay - 6, ox + chevron * 2, ay);
          glow.lineStyle(2, 0xffd84a, 0.8).lineBetween(ox + chevron * 2, ay, ox - chevron * 4, ay + 6);
        }
      }
    }
  }

  private buildRailing(): void {
    const y = 462;
    const railing = this.graphics(this.tallForeground);
    railing.fillStyle(0x0c0a14, 1).fillRect(0, y + 8, STAGE_WIDTH, 480 - y);
    const key = usableTextureKey(this.scene.textures, ENVIRONMENT_TEXTURE_KEYS.railingGlass);
    if (key) {
      this.tallForeground.add(this.scene.add.tileSprite(0, y - 10, STAGE_WIDTH, 32, key).setOrigin(0, 0).setAlpha(0.85));
      this.textureKeys.add(key);
    }
    railing.fillStyle(0xb8c8d8, 1).fillRect(0, y - 11, STAGE_WIDTH, 2);
    railing.fillStyle(0x5a6a80, 1).fillRect(0, y - 9, STAGE_WIDTH, 1);
  }

  private placeProp(prop: DressingProp): void {
    const texture = PROP_TEXTURES[prop.prop];
    const width = prop.width ?? texture.width;
    const height = prop.height ?? (texture.height * width) / texture.width;
    const image = this.placeImage(texture.key, prop.x, prop.y, width, height, true, prop.flipX);
    if (image && (prop.prop === 'fountain' || prop.prop === 'palm' || prop.prop === 'pillar' || prop.prop === 'bunny' || prop.prop === 'crates')) {
      this.occluders.push({
        object: image,
        rect: { x: prop.x - width / 2, y: prop.y - height, width, height },
        baseY: prop.y,
      });
    }
  }

  /** Places an image by its base centre, y-sorted against the actors. */
  private placeImage(key: string, x: number, y: number, width: number, height: number, sorted: boolean, flipX = false): Phaser.GameObjects.Image | null {
    const usable = usableTextureKey(this.scene.textures, key);
    if (!usable) {
      this.fallbackCount += 1;
      const block = this.graphics(this.lowProp);
      block.fillStyle(0x3a3050, 1).fillRect(x - width / 2, y - height, width, height);
      return null;
    }
    this.textureKeys.add(usable);
    const shadow = this.scene.add.image(Math.round(x), Math.round(y) - 1, FX_TEXTURES.shadow)
      .setDisplaySize(Math.round(width * 1.05), Math.max(6, Math.round(height * 0.16)))
      .setAlpha(0.8);
    this.lowProp.add(shadow);
    const image = this.scene.add.image(Math.round(x), Math.round(y), usable)
      .setOrigin(0.5, 1)
      .setDisplaySize(Math.round(width), Math.round(height))
      .setFlipX(flipX);
    if (sorted) {
      image.setDepth(presentationDepth('actor', y));
      this.sortedProps.push(image);
    } else {
      this.lowProp.add(image);
    }
    return image;
  }

  /* ---------------------------------------------------------------------- */
  /* Per-frame                                                                */
  /* ---------------------------------------------------------------------- */

  public render(snapshot: MvpRunState): void {
    const foot = snapshot.room.combat.player;
    for (const occluder of this.occluders) {
      const r = occluder.rect;
      const behind = foot.y < occluder.baseY && foot.x > r.x && foot.x < r.x + r.width && foot.y > r.y;
      occluder.object.setAlpha(behind ? 0.5 : 1);
    }
    for (const entry of this.pulsing) {
      entry.object.setAlpha(entry.base * (0.82 + 0.18 * Math.sin((snapshot.tick + entry.seed * 41) / 17)));
    }
    this.renderAmbience(snapshot);
  }

  /** Commits the lightmap for this frame after the caller added dynamic lights. */
  private blackout = false;

  /**
   * BLACKOUT: near-black ambient and the room's own lights down to embers.
   * Neon signs keep their additive glow, so the mall still reads as a mall.
   */
  public setBlackout(on: boolean): void {
    if (on === this.blackout) return;
    this.blackout = on;
    this.lighting.setAmbient(on ? 0x040308 : this.plan.ambient);
    this.lighting.setStaticLights(on ? this.plan.lights.map((light) => ({ ...light, intensity: light.intensity * 0.12 })) : this.plan.lights);
  }

  public renderLighting(tick: number): void {
    this.lighting.render(tick);
  }

  public addLight(light: PointLight): void {
    this.lighting.addDynamic(light);
  }

  private renderAmbience(snapshot: MvpRunState): void {
    this.warningEffects.clear();
    if (!this.ambience) return;
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
    const poses = this.ambience.civilianPoses();
    for (const [index, lane] of this.ambience.debugLanes().entries()) {
      const pose = poses[index];
      if (!pose) continue;
      const walking = pose.walking;
      const sprite = this.civilianSprite(lane, walking);
      if (!sprite) continue;
      active.add(lane.id);
      const texture = civilianTexture(this.scene, lane.appearance, walking);
      if (sprite.texture.key !== texture) sprite.setTexture(texture);
      sprite.setVisible(pose.visible)
        .setPosition(Math.round(pose.x), Math.round(pose.y))
        .setDepth(presentationDepth('actor', pose.y));
      // 64px neon shoppers: the walk sheet has a row per facing and the idle
      // strip a column per facing. The older 32x48 sheets only face west/east.
      const neonSheet = texture.startsWith('neon:civilian:');
      const frame = neonSheet
        ? { width: characterFrameSize(sprite.height, walking ? 8 : 1), height: characterFrameSize(sprite.height, walking ? 8 : 1) }
        : { width: 32, height: 48 };
      const westish = pose.facing >= 1 && pose.facing <= 3;
      const walkFrames = Math.max(1, Math.floor(sprite.width / frame.width));
      const step = Math.floor(this.ambience.debugAnimationTick() / (this.ambience.snapshot().phase === 'evacuating' ? 4 : 7) + index);
      const row = walking ? (neonSheet ? pose.facing : westish ? 2 : 6) : 0;
      const column = walking ? step % (neonSheet ? walkFrames : 6) : neonSheet ? pose.facing : (index + (ambience.phase === 'warning' ? 2 : 0)) % 8;
      sprite.setCrop(column * frame.width, row * frame.height, frame.width, frame.height);
      const origin = croppedFrameOrigin({ row, column }, { width: sprite.width, height: sprite.height }, frame);
      sprite.setOrigin(origin.x, origin.y);
      if (sprite.visible) visibleCount += 1;
    }
    for (const [id, sprite] of this.civilianSprites) {
      if (!active.has(id)) sprite.setVisible(false);
    }
    this.visibleCivilianCount = visibleCount;
    if (ambience.phase === 'warning' || ambience.phase === 'evacuating') {
      // The mall PA has called it: a red alarm strobe sweeps the concourse.
      const strobe = snapshot.tick % 30 < 15;
      this.addLight({ x: strobe ? 240 : 720, y: 120, radius: 260, color: 0xff2a3a, intensity: 0.55, squash: 0.6 });
      this.warningEffects.fillStyle(0xff2a3a, strobe ? 0.5 : 0.15).fillRect(0, FACADE_BASE_Y - FACADE_HEIGHT, STAGE_WIDTH, 4);
    }
  }

  private civilianSprite(lane: ConcourseCivilianLane, walking: boolean): Phaser.GameObjects.Image | null {
    const key = civilianTexture(this.scene, lane.appearance, walking);
    if (!usableTextureKey(this.scene.textures, key)) return null;
    let sprite = this.civilianSprites.get(lane.id);
    if (!sprite) {
      sprite = this.scene.add.image(lane.x, lane.y, key).setOrigin(0.5, 0.84);
      this.civilianSprites.set(lane.id, sprite);
    }
    return sprite;
  }

  public resetForRun(): void {
    this.ambience?.resetForRun();
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
    ambience: MallRoomAmbienceSnapshot;
    depthBands: { tallForeground: number; effect: number; prompt: number };
  } {
    return {
      themeId: this.themeId,
      fallbackCount: this.fallbackCount,
      occluderCount: this.occluders.length,
      staticDisplayObjectCount: [this.floor, this.decal, this.structure, this.lowProp, this.tallForeground, this.glow]
        .reduce((total, layer) => total + layer.list.length, 0) + this.sortedProps.length,
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

  public leaveRoom(tick: number): ConcourseAmbienceSnapshot {
    this.ambience?.sync({ playerX: 0, roomX: 0, roomWidth: 1, inOpeningRoom: false, tick });
    for (const sprite of this.civilianSprites.values()) sprite.setVisible(false);
    this.visibleCivilianCount = 0;
    this.warningEffects.clear();
    return this.ambienceSnapshot();
  }

  public ambienceSnapshot(): MallRoomAmbienceSnapshot {
    const camera = this.scene.cameras.main.worldView;
    const inFrameIds = [...this.civilianSprites].filter(([, sprite]) => {
      if (!sprite.visible) return false;
      // Cropped sheets keep full-sheet bounds, so measure the 32x48 frame itself.
      const left = sprite.x - 16;
      const right = sprite.x + 16;
      const top = sprite.y - 48 * 0.84;
      const bottom = top + 48;
      return left >= camera.x && right <= camera.right && top >= camera.y && bottom <= camera.bottom;
    }).map(([id]) => id);
    return {
      phase: this.ambience?.snapshot().phase ?? 'empty',
      visibleCount: this.visibleCivilianCount,
      inFrameCount: inFrameIds.length,
      inFrameIds,
    };
  }

  public destroy(): void {
    this.actorLayer.remove(this.actors, false);
    this.scene.sys.displayList.add(this.actors);
    for (const layer of [this.floor, this.decal, this.structure, this.lowProp, this.actorLayer, this.tallForeground, this.glow, this.effectLayer]) {
      layer.destroy(true);
    }
    for (const image of this.sortedProps) image.destroy();
    this.sortedProps.length = 0;
    this.actorGraphicsById.clear();
    this.effectGraphicsById.clear();
    for (const sprite of this.civilianSprites.values()) sprite.destroy();
    this.civilianSprites.clear();
    this.warningEffects.destroy();
    this.lighting.destroy();
  }
}

function civilianTexture(scene: Phaser.Scene, appearance: ConcourseCivilianLane['appearance'], walking: boolean): string {
  const neon = NEON_CIVILIAN_KEYS[appearance];
  const neonKey = walking ? neon.walk : neon.idle;
  if (usableTextureKey(scene.textures, neonKey)) return neonKey;
  return legacyCivilianTexture(appearance, walking);
}

function legacyCivilianTexture(appearance: ConcourseCivilianLane['appearance'], walking: boolean): CivilianTextureKey {
  const keys = {
    'shopper-a': walking ? CIVILIAN_TEXTURE_KEYS.shopperAWalk : CIVILIAN_TEXTURE_KEYS.shopperAIdle,
    'shopper-b': walking ? CIVILIAN_TEXTURE_KEYS.shopperBWalk : CIVILIAN_TEXTURE_KEYS.shopperBIdle,
    clerk: walking ? CIVILIAN_TEXTURE_KEYS.clerkWalk : CIVILIAN_TEXTURE_KEYS.clerkIdle,
    security: walking ? CIVILIAN_TEXTURE_KEYS.securityWalk : CIVILIAN_TEXTURE_KEYS.securityIdle,
  } as const;
  return keys[appearance];
}
