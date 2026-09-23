/**
 * Graybox/vector presentation for the M5 MVP run.
 *
 * The view draws the current room only: floor, walls, doorways, store
 * fixtures with offer labels, the security sweep cone, the Bench Warrant
 * kiosk, and the room-local combat entities. It reads authoritative run
 * state and never mutates it; damage, movement, economy, and transitions
 * stay in `src/sim`.
 */
import Phaser from 'phaser';
import { centreCameraOnPlayer } from './camera';
import { planRoomEnvironment, planStorefront } from './RoomEnvironment';
import type { PlanRect } from './RoomEnvironment';
import { latestConductiveFeedback } from './visualState';
import { BOSS_MAX_HEALTH, BOSS_SLAM_REACH } from '../../sim/combat/boss';
import { runOfferPriceLabel } from '../../sim/run/economy';
import type { EnemyKind, EnemyState, ProjectileState, SurfacePatchState } from '../../sim/model';
import type { MvpRunState } from '../../sim/run/types';
import type { WingOffer, WingRoomDefinition } from '../../sim/wing/types';
import { securityFacingAtTick } from '../../sim/shop/security';
import {
  ALEX_FRAME_HEIGHT,
  ALEX_IDLE_TEXTURE,
  ALEX_WALK_TEXTURE,
  alexDirectionFor,
  alexIdleFrame,
  alexWalkFrame,
  BENCH_WARRANT_KIOSK_TEXTURE,
  DECAL_ART,
  EFFECT_ART,
  EFFECT_FRAMES,
  ENEMY_ART,
  ENEMY_FRAME_SIZE,
  FIXTURE_ART,
  FLOOR_ART,
  ITEM_ART,
  RC_CAR_TEXTURE,
  rcCarFrame,
  STOREFRONT_ART,
  WALL_ART,
  type AlexDirection,
  type EffectArt,
  type EffectName,
} from '../assets';

/** Sim ticks per walk frame; 60 ticks/s over 6 frames is a ~0.8s cycle. */
const ALEX_WALK_TICKS_PER_FRAME = 8;

/** Unit vector per facing, so anything placed relative to the player can use it. */
const DIRECTION_VECTORS: Record<AlexDirection, { x: number; y: number }> = {
  south: { x: 0, y: 1 },
  'south-west': { x: -0.71, y: 0.71 },
  west: { x: -1, y: 0 },
  'north-west': { x: -0.71, y: -0.71 },
  north: { x: 0, y: -1 },
  'north-east': { x: 0.71, y: -0.71 },
  east: { x: 1, y: 0 },
  'south-east': { x: 0.71, y: 0.71 },
};

/** How far along the facing direction a carried item sits, and how far up. */
const HELD_ITEM_OFFSET = 15;
const HELD_ITEM_LIFT = 8;

/** Effect sprites sit above the player and the car, below the world labels. */
const EFFECT_DEPTH = 4;
/**
 * Decals sit between the floor and the furniture.
 *
 * The Graphics pass draws the floor, walls, doorways and the combat overlays as
 * one object at depth 0, so a decal placed at 0 would tie with all of them. A
 * fractional depth pins it above the floor the Graphics drew and below the
 * fixtures at 1, which is what "flat on the floor" means in the depth ladder.
 */
const DECAL_DEPTH = 0.5;
/** Bound on concurrent effects, so a burst of hits cannot grow the list without limit. */
const MAX_ACTIVE_EFFECTS = 24;

/**
 * The room's static environment, on its own layer beneath everything else.
 *
 * The floor and the walls are not combat overlays: they are the surface the whole
 * scene stands on, so they sit below the shared Graphics pass at depth 0 rather
 * than inside it. Wall pieces are nudged upward by a fraction of their own sort
 * y, so two walls that overlap still draw back to front while the whole layer
 * stays under the pass.
 *
 * This deliberately does NOT occlude entities yet. PROJECTION.md's band 4 sorts
 * walls and entities together, but entities here are drawn by the depth-0
 * Graphics pass, so interleaving the two is a separate change. A wall that hid
 * the player would be a worse bug than a wall that never occludes, so the layer
 * stays beneath and every entity remains readable.
 */
const ENVIRONMENT_DEPTH = -10;
/** Keeps one wall's y-sort fraction far below the gap to the next layer. */
const WALL_SORT_EPSILON = 1 / 100000;

/**
 * A shop's sign board, above the floor and everything lying on it.
 *
 * A board hangs in the air over the shopfront, so it is the one piece of the
 * environment that must draw over a floor decal rather than under it. This is not
 * hypothetical: the Department Outlet places a blood pool inside the shop
 * directly beneath where the board hangs, and if the board sat down on the
 * environment layer that pool would paint over it.
 *
 * It sits below the fixtures at 1 deliberately. A shop with a counter near its
 * front is better served by the counter drawing over the board than by the board
 * hiding the furniture the player has to read.
 */
const SIGN_DEPTH = 0.6;

/** One playing effect: its strip, when it started, and how fast it runs. */
type ActiveEffect = {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly art: EffectArt;
  readonly spawnTick: number;
};

/**
 * The state an effect decision is made against.
 *
 * Deliberately the same shape of comparison the audio cues use: effects and
 * sound are two readings of the same events, so a swing that is heard is a
 * swing that is seen, without either one driving the other.
 */
type EffectBaseline = {
  readonly roomId: string;
  readonly playerHealth: number;
  readonly attackActiveTicks: number;
  readonly playerProjectiles: number;
  readonly enemyHealth: Map<number, number>;
  readonly enemyPositions: Map<number, { x: number; y: number }>;
  /** Identity of the last conductive event acted on, so it fires once. */
  readonly conductiveKey: string | null;
};

export class MvpRunView {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private benchKioskSprite: Phaser.GameObjects.Image | undefined;
  private playerSprite: Phaser.GameObjects.Sprite | undefined;
  private playerFacing: AlexDirection = 'south';
  private lastPlayerPosition: { x: number; y: number } | undefined;
  private carSprite: Phaser.GameObjects.Sprite | undefined;
  private carFacing: AlexDirection = 'south';
  private lastCarrierPosition: { x: number; y: number } | undefined;
  private readonly fixtureSprites: Phaser.GameObjects.Image[] = [];
  private readonly offerSprites: Phaser.GameObjects.Image[] = [];
  private heldItemSprite: Phaser.GameObjects.Image | undefined;
  private heldItemId: string | undefined;
  private readonly enemySprites = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly enemyFacing = new Map<number, AlexDirection>();
  private readonly lastEnemyPositions = new Map<number, { x: number; y: number }>();
  private readonly effects: ActiveEffect[] = [];
  private lastEffectBaseline: EffectBaseline | undefined;
  private effectsSpawned = 0;
  private readonly decalSprites: Phaser.GameObjects.Image[] = [];
  private decalsDrawn = 0;
  /** Which room the environment layer was built for, so it rebuilds only on a change. */
  private environmentKey: string | undefined;
  private floorSprite: Phaser.GameObjects.TileSprite | undefined;
  private readonly wallSprites: Phaser.GameObjects.Image[] = [];
  private storeFloorSprite: Phaser.GameObjects.TileSprite | undefined;
  /** The shop's frontage and sign, in creation order, torn down with the room. */
  private readonly storefrontSprites: Phaser.GameObjects.GameObject[] = [];

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
  }

  /**
   * Effect counters, so acceptance can prove effects were spawned rather than
   * only that their art loaded. `spawned` is cumulative for the scene's life.
   */
  public get effectCounts(): { spawned: number; active: number } {
    return { spawned: this.effectsSpawned, active: this.effects.length };
  }

  /** How many of the room's decals are actually on screen, for acceptance. */
  public get drawnDecalCount(): number {
    return this.decalsDrawn;
  }

  public sync(state: MvpRunState): void {
    const graphics = this.graphics;
    const room = state.wing.rooms[state.roomIndex];
    if (!room) {
      return;
    }
    graphics.clear();

    // The room's own surface: real tiled floor and wall art, on a layer beneath
    // this Graphics pass so everything below still lands on top of it.
    this.syncEnvironment(room);

    // Fallback for a missing floor texture, so a failed load degrades to the old
    // flat room rather than a black one.
    if (!this.floorSprite) {
      graphics.fillStyle(0x8c8873, 1);
      graphics.fillRect(room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height);
    }

    // A doorway is a hole in a wall, and tile art cannot say that on its own: both
    // sides of the opening are wall. This lit threshold band keeps the one cue the
    // flat yellow rect used to carry, in the floor's own lightest tone.
    for (const doorway of room.doorways) {
      graphics.fillStyle(0xecd1ba, 1);
      graphics.fillRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
      graphics.lineStyle(1, 0x796453, 0.8);
      graphics.strokeRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
    }

    this.syncFixtures(room);
    this.syncDecals(room);

    if (room.store) {
      this.drawStore(state, room.store.templateId);
    }

    if (room.benchKiosk) {
      this.syncBenchKiosk(room.benchKiosk.x, room.benchKiosk.y);
    } else {
      this.benchKioskSprite?.setVisible(false);
      this.clearLabel('bench');
    }

    for (const patch of state.room.combat.surfaces) {
      this.drawSurfacePatch(patch);
    }

    for (const enemy of state.room.combat.enemies) {
      if (enemy.kind === 'lp_manager') {
        this.drawBoss(enemy);
      } else {
        this.drawEnemy(enemy);
      }
    }

    this.syncEnemySprites(state);
    this.syncEffects(state);

    for (const projectile of state.room.combat.projectiles) {
      this.drawProjectile(projectile);
    }

    this.drawCarrier(state);
    this.drawPlayer(state);
    this.pruneLabels(state);

    centreCameraOnPlayer(this.scene, state.room.combat.player.x, state.room.combat.player.y);
  }

  /**
   * The Remote-Control Car, drawn only while the shift owns one.
   *
   * A fused car is the firing origin, so it is drawn with the same tether cue
   * the player needs to judge leash range, plus a distinct fill for the two
   * modes: an independent companion versus the steered emitter mount.
   */
  /**
   * The room's static environment: the tiled floor and the real wall art.
   *
   * Rebuilt only when the room changes, because a room's environment is static for
   * the whole visit. The plan is pure, so re-planning it every tick would destroy
   * and recreate ~90 sprites sixty times a second for no visible difference.
   *
   * The floor is one repeating TileSprite rather than 450 blitted tiles: the plan
   * describes the grid, and a tiled sprite is the renderer's cheapest faithful
   * reading of "this texture, this rectangle, drawn 1:1". The walls are one image
   * per module, each cropped to the piece's `source`, which is how a module that
   * the run's leftover or the room's edge cuts short is drawn at its true size
   * instead of being stretched or overflowing floor it does not own.
   */
  private syncEnvironment(room: WingRoomDefinition): void {
    const key = `${room.id}:${room.variantId}`;
    if (this.environmentKey === key) {
      return;
    }
    this.floorSprite?.destroy();
    this.floorSprite = undefined;
    for (const sprite of this.wallSprites) {
      sprite.destroy();
    }
    this.wallSprites.length = 0;
    this.storeFloorSprite?.destroy();
    this.storeFloorSprite = undefined;
    for (const displayObject of this.storefrontSprites) {
      displayObject.destroy();
    }
    this.storefrontSprites.length = 0;
    this.environmentKey = key;

    const plan = planRoomEnvironment(room);
    const floorArt = FLOOR_ART[plan.floorKind];
    if (this.scene.textures.exists(floorArt.texture)) {
      this.floorSprite = this.scene.add
        .tileSprite(
          plan.floor.originX,
          plan.floor.originY,
          plan.floor.columns * plan.floor.tileSize,
          plan.floor.rows * plan.floor.tileSize,
          floorArt.texture,
        )
        .setOrigin(0, 0)
        .setDepth(ENVIRONMENT_DEPTH);
    }

    // Back to front, so a wall standing in front of another covers it.
    const pieces = [...plan.wallPieces].sort((left, right) => left.orderY - right.orderY);
    for (const piece of pieces) {
      const art = WALL_ART[piece.kind];
      if (!this.scene.textures.exists(art.texture)) {
        continue;
      }
      const sprite = this.scene.add
        .image(piece.rect.x, piece.rect.y, art.texture)
        .setOrigin(0, 0)
        .setCrop(piece.source.x, piece.source.y, piece.source.width, piece.source.height)
        .setDepth(ENVIRONMENT_DEPTH + piece.orderY * WALL_SORT_EPSILON);
      this.wallSprites.push(sprite);
    }

    this.syncStorefront(room);
  }

  /**
   * A shop's own floor, frontage and sign.
   *
   * The shop's floor is laid first and at the same depth as the room floor, so
   * being created after it is what puts it on top: the shop changes material at
   * its threshold, which is most of what makes it read as a separate space
   * instead of a coloured rectangle painted on the mall.
   *
   * The frontage is a repeating band, two strips flanking the doorway, and the
   * sign hangs over the door. The frontage lives on the environment layer beneath
   * the depth-0 pass, so it never hides an entity, for the reason the walls do
   * not. The sign is the one exception, and says so where its depth is defined.
   */
  private syncStorefront(room: WingRoomDefinition): void {
    const store = room.store;
    if (!store) {
      return;
    }
    const plan = planStorefront(store);

    const floorArt = FLOOR_ART[plan.floor.kind];
    if (this.scene.textures.exists(floorArt.texture)) {
      this.storeFloorSprite = this.scene.add
        .tileSprite(
          plan.floor.rect.x,
          plan.floor.rect.y,
          plan.floor.rect.width,
          plan.floor.rect.height,
          floorArt.texture,
        )
        .setOrigin(0, 0)
        .setDepth(ENVIRONMENT_DEPTH);
    }

    const fasciaArt = STOREFRONT_ART['storefront-fascia'];
    if (this.scene.textures.exists(fasciaArt.texture)) {
      for (const band of plan.fascia) {
        const bandSprite = this.scene.add
          .tileSprite(
            band.rect.x,
            band.rect.y,
            band.rect.width,
            band.rect.height,
            fasciaArt.texture,
          )
          .setOrigin(0, 0)
          .setDepth(ENVIRONMENT_DEPTH + band.orderY * WALL_SORT_EPSILON);
        this.storefrontSprites.push(bandSprite);
      }
    }

    const signArt = STOREFRONT_ART[plan.sign.kind];
    if (this.scene.textures.exists(signArt.texture)) {
      const signSprite = this.scene.add
        .image(plan.sign.rect.x, plan.sign.rect.y, signArt.texture)
        .setOrigin(0, 0)
        .setDepth(SIGN_DEPTH);
      this.storefrontSprites.push(signSprite);
    }
  }

  private drawCarrier(state: MvpRunState): void {
    const carrier = state.carrier;
    if (carrier === null) {
      this.clearLabel('carrier');
      this.carSprite?.setVisible(false);
      this.lastCarrierPosition = undefined;
      return;
    }
    const graphics = this.graphics;
    const player = state.room.combat.player;
    const fused = carrier.mode === 'emitter';

    // The leash, so the player can read why the car stops following.
    graphics.lineStyle(1, fused ? 0x8bc9b8 : 0xc4b878, 0.28);
    graphics.lineBetween(player.x, player.y, carrier.x, carrier.y);

    if (!this.syncCarSprite(carrier.x, carrier.y)) {
      graphics.fillStyle(fused ? 0x8bc9b8 : 0xd7a45c, 1);
      graphics.fillRect(
        carrier.x - carrier.radius,
        carrier.y - carrier.radius,
        carrier.radius * 2,
        carrier.radius * 2,
      );
      graphics.lineStyle(2, 0x12130f, 0.9);
      graphics.strokeRect(
        carrier.x - carrier.radius - 1,
        carrier.y - carrier.radius - 1,
        carrier.radius * 2 + 2,
        carrier.radius * 2 + 2,
      );
    } else {
      // The sprite supplies the silhouette, so the mode colour moves to a
      // ground ring: an independent companion and a steered emitter mount
      // still have to be told apart at a glance.
      graphics.lineStyle(2, fused ? 0x8bc9b8 : 0xd7a45c, 0.7);
      graphics.strokeEllipse(
        carrier.x,
        carrier.y + carrier.radius - 3,
        (carrier.radius + 6) * 2,
        carrier.radius + 4,
      );
    }

    // The carrier trails the player, so a label drawn just above it lands across
    // the character every time rather than occasionally — unlike the fixed
    // store and bench labels, which only collide if the player walks onto them.
    // Clear the sprite's full height so both the car's state and Alex stay legible.
    this.setLabel(
      'carrier',
      fused ? (carrier.recalling ? 'CAR · RECALL' : 'CAR · EMITTER') : 'CAR · INDEPENDENT',
      carrier.x,
      carrier.y - carrier.radius - ALEX_FRAME_HEIGHT,
    );
  }

  private syncBenchKiosk(x: number, y: number): void {
    const graphics = this.graphics;
    graphics.lineStyle(2, 0xd8e06a, 0.55);
    graphics.strokeCircle(x, y, 48);
    this.setLabel('bench', 'BENCH WARRANT', x, y - 72);

    if (!this.scene.textures.exists(BENCH_WARRANT_KIOSK_TEXTURE)) {
      this.benchKioskSprite?.setVisible(false);
      this.drawBenchKioskFallback(x, y);
      return;
    }

    if (!this.benchKioskSprite) {
      this.benchKioskSprite = this.scene.add
        .image(Math.round(x), Math.round(y), BENCH_WARRANT_KIOSK_TEXTURE)
        .setOrigin(0.5, 1)
        .setDepth(1);
    }
    this.benchKioskSprite.setPosition(Math.round(x), Math.round(y)).setVisible(true);
  }

  /**
   * Mall furniture: benches, vending machines, gondola shelving.
   *
   * Base-anchored, so each fixture's world position is the bottom of its sprite.
   * They are sprites rather than graphics because Phaser cannot place a texture
   * inside a Graphics pass, and they sit at depth 1 -- above the floor and walls
   * that Graphics draws, below the player and the car at depth 2.
   *
   * A fixture has no collision: it is set dressing, so it can never block a path
   * or hold an enemy spawn. Draw a fixture only where the authored room leaves a
   * clear lane, which is why the templates place them away from interior walls.
   */
  private syncFixtures(room: WingRoomDefinition): void {
    const fixtures = room.fixtures;
    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      if (!fixture) {
        continue;
      }
      const art = FIXTURE_ART[fixture.kind];
      if (!this.scene.textures.exists(art.texture)) {
        continue;
      }
      let sprite = this.fixtureSprites[index];
      if (!sprite) {
        sprite = this.scene.add
          .image(Math.round(fixture.x), Math.round(fixture.y), art.texture)
          .setOrigin(0.5, 1)
          .setDepth(1);
        this.fixtureSprites[index] = sprite;
      }
      sprite
        .setTexture(art.texture)
        .setPosition(Math.round(fixture.x), Math.round(fixture.y))
        .setVisible(true);
    }
    // A room with fewer fixtures than the last one must not leave ghosts behind.
    for (let index = fixtures.length; index < this.fixtureSprites.length; index += 1) {
      this.fixtureSprites[index]?.setVisible(false);
    }
  }

  /**
   * The item the player is currently carrying, drawn beside them.
   *
   * The id comes from the compiled loadout the HUD already reports, so the
   * thing drawn in the character's hands cannot disagree with the PRIMARY line.
   * Offset along the facing direction, because a carried object on the far side
   * from the way you are walking reads as detached.
   *
   * A held item is drawn over the body rather than layered into it: at 32x48 a
   * separate arm layer per item would be a lot of art for a small read, and the
   * body is deliberately left free of held equipment so it stays one asset.
   */
  private syncHeldItem(state: MvpRunState): void {
    const player = state.room.combat.player;
    const primaryId = state.room.combat.compiledLoadout.primary.definitionId;
    const art = ITEM_ART[primaryId];
    if (!art || !this.scene.textures.exists(art.texture)) {
      this.heldItemSprite?.setVisible(false);
      this.heldItemId = undefined;
      return;
    }
    const facing = alexDirectionFor(player.facing.x, player.facing.y);
    const vector = DIRECTION_VECTORS[facing];
    const x = Math.round(player.x + vector.x * HELD_ITEM_OFFSET);
    const y = Math.round(player.y + vector.y * HELD_ITEM_OFFSET - HELD_ITEM_LIFT);

    if (!this.heldItemSprite || this.heldItemId !== primaryId) {
      this.heldItemSprite?.destroy();
      this.heldItemSprite = this.scene.add
        .image(x, y, art.texture)
        .setOrigin(0.5, 0.5)
        .setDepth(3);
      this.heldItemId = primaryId;
    }
    this.heldItemSprite.setPosition(x, y).setVisible(true);
  }

  /**
   * The item's own sprite, sitting inside the status marker the Graphics pass
   * already drew.
   *
   * The marker is kept rather than replaced: it carries available / carried /
   * taken, and a sprite cannot say those. An item with no art keeps the plain
   * marker, so items can gain art one at a time.
   */
  private syncOfferSprite(index: number, offer: WingOffer, status: string): void {
    const art = ITEM_ART[offer.itemDefinitionId];
    const existing = this.offerSprites[index];
    if (!art || !this.scene.textures.exists(art.texture)) {
      existing?.setVisible(false);
      return;
    }
    const x = Math.round(offer.position.x);
    const y = Math.round(offer.position.y);
    const alpha = status === 'available' ? 1 : 0.4;
    if (!existing) {
      this.offerSprites[index] = this.scene.add
        .image(x, y, art.texture)
        .setOrigin(0.5, 0.5)
        .setDepth(1)
        .setAlpha(alpha);
      return;
    }
    existing.setTexture(art.texture).setPosition(x, y).setVisible(true).setAlpha(alpha);
  }

  private drawBenchKioskFallback(x: number, y: number): void {
    const graphics = this.graphics;
    graphics.fillStyle(0x72566c, 1);
    graphics.fillRect(x - 43, y - 12, 86, 24);
    graphics.lineStyle(2, 0xf4edd8, 0.9);
    graphics.strokeRect(x - 43, y - 12, 86, 24);
  }

  private drawStore(state: MvpRunState, templateId: string): void {
    const graphics = this.graphics;
    const room = state.wing.rooms[state.roomIndex];
    const store = room?.store;
    if (!store) {
      return;
    }
    const carriedHere = state.carried.some((theft) => theft.sourceStoreId === store.templateId);
    // The shop's floor, frontage and sign are real art now, drawn on the
    // environment layer beneath this pass (see `syncStorefront`). What stays here
    // is the one thing art cannot say: whether you have already stolen from this
    // shop. A raised outline carries that, so it no longer needs a filled slab
    // covering the floor the shop just gained.
    graphics.lineStyle(carriedHere ? 3 : 1, carriedHere ? 0xf6d365 : 0x2a2620, carriedHere ? 1 : 0.5);
    graphics.strokeRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);

    const exit = store.exit.bounds;
    graphics.fillStyle(0x8bc9b8, 1);
    graphics.fillRect(exit.x, exit.y, exit.width, exit.height);
    graphics.lineStyle(2, 0x12130f, 0.8);
    graphics.strokeRect(exit.x, exit.y, exit.width, exit.height);

    const zone = store.sightZone;
    const facing = securityFacingAtTick(zone, state.tick);
    const halfArc = ((zone.arcDegrees * Math.PI) / 180) / 2;
    const firstX = zone.origin.x + Math.cos(facing - halfArc) * zone.range;
    const firstY = zone.origin.y + Math.sin(facing - halfArc) * zone.range;
    const secondX = zone.origin.x + Math.cos(facing + halfArc) * zone.range;
    const secondY = zone.origin.y + Math.sin(facing + halfArc) * zone.range;
    graphics.fillStyle(0xffd45d, 0.22);
    graphics.fillTriangle(zone.origin.x, zone.origin.y, firstX, firstY, secondX, secondY);
    graphics.lineStyle(1, 0xffd45d, 0.6);
    graphics.lineBetween(zone.origin.x, zone.origin.y, firstX, firstY);
    graphics.lineBetween(zone.origin.x, zone.origin.y, secondX, secondY);
    graphics.fillStyle(0xffd45d, 1);
    graphics.fillCircle(zone.origin.x, zone.origin.y, 4);

    this.syncSignLabel(`store:${templateId}`, store.name, planStorefront(store).sign.rect);

    const offers = room?.offers ?? [];
    for (let index = 0; index < offers.length; index += 1) {
      const offer = offers[index];
      if (!offer) {
        continue;
      }
      const status = state.offerStatus[offer.id] ?? 'available';
      if (status === 'available') {
        graphics.fillStyle(0x8bc9b8, 1);
        graphics.fillCircle(offer.position.x, offer.position.y, 7);
        graphics.lineStyle(2, 0x12130f, 0.9);
        graphics.strokeCircle(offer.position.x, offer.position.y, 7);
      } else if (status === 'carried') {
        graphics.lineStyle(2, 0xf6d365, 1);
        graphics.strokeCircle(offer.position.x, offer.position.y, 7);
      } else {
        graphics.lineStyle(2, 0x5a5e55, 0.8);
        graphics.lineBetween(offer.position.x - 6, offer.position.y - 6, offer.position.x + 6, offer.position.y + 6);
        graphics.lineBetween(offer.position.x - 6, offer.position.y + 6, offer.position.x + 6, offer.position.y - 6);
      }
      this.syncOfferSprite(index, offer, status);
      // The same run offer price the HUD card shows, so a world label can
      // never disagree with the discounted price the run actually charges.
      this.setLabel(
        `offer:${offer.id}`,
        runOfferPriceLabel(state, offer),
        offer.position.x + 10,
        offer.position.y - 8,
      );
    }
    for (let index = offers.length; index < this.offerSprites.length; index += 1) {
      this.offerSprites[index]?.setVisible(false);
    }
  }

  /** One effect sprite of one strip, or nothing when its art did not load. */
  private spawnEffect(name: EffectName, x: number, y: number, tick: number): void {
    const art = EFFECT_ART[name];
    if (!this.scene.textures.exists(art.texture) || this.effects.length >= MAX_ACTIVE_EFFECTS) {
      return;
    }
    const sprite = this.scene.add
      .sprite(Math.round(x), Math.round(y), art.texture, 0)
      .setOrigin(0.5, 0.5)
      .setDepth(EFFECT_DEPTH);
    this.effects.push({ sprite, art, spawnTick: tick });
    this.effectsSpawned += 1;
  }

  /**
   * Combat effects, driven by the same state deltas the audio cues read.
   *
   * Every effect is anchored to a position the state already reports, so an
   * effect cannot describe a hit the simulation did not record. An enemy that
   * died is no longer in the list, which is why the baseline remembers its last
   * position: the burst belongs where it was, not where nothing is.
   */
  private syncEffects(state: MvpRunState): void {
    const combat = state.room.combat;
    const player = combat.player;
    const roomId = state.room.roomId;
    const enemyHealth = new Map<number, number>();
    const enemyPositions = new Map<number, { x: number; y: number }>();
    for (const enemy of combat.enemies) {
      if (enemy.health > 0) {
        enemyHealth.set(enemy.id, enemy.health);
        enemyPositions.set(enemy.id, { x: enemy.x, y: enemy.y });
      }
    }
    const playerProjectiles = combat.projectiles.filter(
      (shot) => shot.faction === 'player',
    ).length;
    // Read before the branch so the same value is both acted on and recorded.
    const conductive = latestConductiveFeedback(combat.behaviorTrace);

    const previous = this.lastEffectBaseline;
    // A room change replaces every enemy at once. That is not a massacre, so the
    // baseline is rebuilt silently rather than firing a burst per departure.
    if (previous && previous.roomId === roomId) {
      if (player.attackActiveTicks > 0 && previous.attackActiveTicks === 0) {
        this.spawnEffect('melee-swing', player.x, player.y, state.tick);
      }
      if (playerProjectiles > previous.playerProjectiles) {
        this.spawnEffect('muzzle-flash', player.x, player.y, state.tick);
      }
      if (player.health < previous.playerHealth) {
        this.spawnEffect('blood-hit', player.x, player.y, state.tick);
      }
      // The compiled primary decides which impact reads correctly: a projectile
      // weapon should not look like a bat landing.
      const impact =
        combat.compiledLoadout.primary.delivery === 'projectile'
          ? 'bullet-impact'
          : 'blunt-impact';
      for (const enemy of combat.enemies) {
        const before = previous.enemyHealth.get(enemy.id);
        if (before !== undefined && enemy.health > 0 && enemy.health < before) {
          this.spawnEffect(impact, enemy.x, enemy.y - 8, state.tick);
        }
      }
      for (const [id, health] of previous.enemyHealth) {
        if (health <= 0 || enemyHealth.has(id)) {
          continue;
        }
        const last = previous.enemyPositions.get(id);
        if (last) {
          this.spawnEffect('blood-hit', last.x, last.y - 8, state.tick);
          // A death also throws debris, so the two read as one event rather than
          // a spurt that leaves nothing behind.
          this.spawnEffect('debris', last.x, last.y, state.tick);
        }
      }
      // A conductive chain is an electrical event the simulation already reports,
      // so it gets the shock strip rather than a generic hit.
      if (conductive && conductive.key !== previous.conductiveKey) {
        const target = combat.enemies.find(
          (enemy) => enemy.id === conductive.targetIds[0],
        );
        if (target) {
          this.spawnEffect('electric-shock', target.x, target.y, state.tick);
        }
      }
    }
    this.lastEffectBaseline = {
      roomId,
      playerHealth: player.health,
      attackActiveTicks: player.attackActiveTicks,
      playerProjectiles,
      enemyHealth,
      enemyPositions,
      conductiveKey: conductive?.key ?? null,
    };

    // Advance every live effect from the run tick, so its life is a function of
    // state a test can read rather than of wall-clock time.
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (!effect) {
        continue;
      }
      const frame = Math.floor((state.tick - effect.spawnTick) / effect.art.frameTicks);
      if (frame >= EFFECT_FRAMES) {
        effect.sprite.destroy();
        this.effects.splice(index, 1);
        continue;
      }
      effect.sprite.setFrame(frame).setVisible(true);
    }
  }

  /**
   * Floor decals, drawn from the room definition.
   *
   * Keyed by index and hidden when a room has fewer, so a doorway cannot leave
   * the last room's damage lying on the new floor.
   */
  private syncDecals(room: WingRoomDefinition): void {
    const decals = room.decals;
    let drawn = 0;
    for (let index = 0; index < decals.length; index += 1) {
      const decal = decals[index];
      if (!decal) {
        continue;
      }
      const art = DECAL_ART[decal.kind];
      if (!this.scene.textures.exists(art.texture)) {
        continue;
      }
      const x = Math.round(decal.x);
      const y = Math.round(decal.y);
      let sprite = this.decalSprites[index];
      if (!sprite) {
        sprite = this.scene.add
          .image(x, y, art.texture)
          .setOrigin(0.5, 0.5)
          .setDepth(DECAL_DEPTH);
        this.decalSprites[index] = sprite;
      }
      sprite.setTexture(art.texture).setPosition(x, y).setVisible(true);
      drawn += 1;
    }
    for (let index = decals.length; index < this.decalSprites.length; index += 1) {
      this.decalSprites[index]?.setVisible(false);
    }
    this.decalsDrawn = drawn;
  }

  /** The enemy sheet's texture key, or undefined when it failed to load. */
  private enemySpriteKey(kind: EnemyKind): string | undefined {
    const art = ENEMY_ART[kind];
    return this.scene.textures.exists(art.texture) ? art.texture : undefined;
  }

  /**
   * Y of the top of an enemy's health bar, clear of whatever drew the body.
   *
   * The Graphics pass sits at depth 0 and sprites at depth 2, so a sprite would
   * cover a bar drawn just above the collision circle. With a sprite present the
   * bar moves above the sheet; the vector fallback keeps the original offset.
   */
  private enemyBarTop(enemy: EnemyState, hasSprite: boolean, fallbackOffset: number): number {
    return hasSprite
      ? enemy.y + enemy.radius - ENEMY_FRAME_SIZE - 6
      : enemy.y - enemy.radius - fallbackOffset;
  }

  /**
   * Enemy bodies as sprites, one per living enemy.
   *
   * `EnemyState` carries no heading -- only an aim vector and a phase -- so the
   * facing is derived from the frame-to-frame movement delta, exactly as the
   * player's walk facing is. That keeps presentation state out of the sim.
   *
   * Sprites are keyed by enemy id and destroyed when their id stops appearing,
   * which also stops a room change from leaving ghosts behind.
   */
  private syncEnemySprites(state: MvpRunState): void {
    const seen = new Set<number>();
    for (const enemy of state.room.combat.enemies) {
      const texture = this.enemySpriteKey(enemy.kind);
      if (!texture) {
        continue;
      }
      seen.add(enemy.id);

      const last = this.lastEnemyPositions.get(enemy.id);
      const dx = last ? enemy.x - last.x : 0;
      const dy = last ? enemy.y - last.y : 0;
      if (dx * dx + dy * dy > 0.25) {
        this.enemyFacing.set(enemy.id, alexDirectionFor(dx, dy));
      }
      this.lastEnemyPositions.set(enemy.id, { x: enemy.x, y: enemy.y });

      const frame = alexIdleFrame(this.enemyFacing.get(enemy.id) ?? 'south');
      const feetX = Math.round(enemy.x);
      const feetY = Math.round(enemy.y + enemy.radius);
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.scene.add
          .sprite(feetX, feetY, texture, frame)
          .setOrigin(0.5, 1)
          .setDepth(2);
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setTexture(texture, frame).setPosition(feetX, feetY).setVisible(true);
    }

    for (const [id, sprite] of [...this.enemySprites]) {
      if (seen.has(id)) {
        continue;
      }
      sprite.destroy();
      this.enemySprites.delete(id);
      this.enemyFacing.delete(id);
      this.lastEnemyPositions.delete(id);
    }
  }

  private drawEnemy(enemy: EnemyState): void {
    const graphics = this.graphics;
    const hasSprite = this.enemySpriteKey(enemy.kind) !== undefined;

    // The telegraph runs whether or not a sheet loaded: it is a gameplay readout
    // of where the shot will go, not decoration on the body.
    if (enemy.kind !== 'hanger' && enemy.phase === 'telegraph') {
      graphics.lineStyle(3, 0xffd45d, 0.95);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius + 8);
      graphics.lineStyle(2, 0xffd45d, 0.7);
      graphics.lineBetween(
        enemy.x,
        enemy.y,
        enemy.x + enemy.telegraphAimX * 52,
        enemy.y + enemy.telegraphAimY * 52,
      );
    }

    // The sheet supplies the body when it loaded; this vector body is the
    // fallback, so the run stays playable if the art is missing.
    if (!hasSprite) {
      if (enemy.kind === 'hanger') {
        graphics.lineStyle(4, 0x8a3038, 1);
        graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x, enemy.y - 10);
        graphics.lineBetween(enemy.x, enemy.y - 10, enemy.x + 12, enemy.y + 9);
        graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x + 12, enemy.y + 9);
        graphics.fillStyle(0xd35f55, 1);
        graphics.fillCircle(enemy.x, enemy.y - 10, 5);
      } else {
        graphics.fillStyle(0x4d2c59, 1);
        graphics.fillRect(enemy.x - 13, enemy.y - 13, 26, 26);
        graphics.fillStyle(0xc984d8, 1);
        graphics.fillRect(enemy.x - 6, enemy.y - 5, 12, 8);
      }
    }

    this.drawEnemyStatuses(enemy);
    const barTop = this.enemyBarTop(enemy, hasSprite, 12);
    graphics.fillStyle(0x2a2424, 0.9);
    graphics.fillRect(enemy.x - 15, barTop, 30, 4);
    graphics.fillStyle(0xd85c54, 1);
    graphics.fillRect(
      enemy.x - 15,
      barTop,
      30 * Math.max(0, Math.min(1, enemy.health / 8)),
      4,
    );
  }

  private drawBoss(enemy: EnemyState): void {
    const graphics = this.graphics;
    if (enemy.phase === 'telegraph') {
      // The ring is the authored slam reach itself, not a decorative radius: a
      // smaller ring told players they were safe where the slam still connects.
      graphics.fillStyle(0xffd45d, 0.12);
      graphics.fillCircle(enemy.x, enemy.y, BOSS_SLAM_REACH);
      graphics.lineStyle(3, 0xffd45d, 0.95);
      graphics.strokeCircle(enemy.x, enemy.y, BOSS_SLAM_REACH);
      graphics.lineStyle(2, 0xffd45d, 0.7);
      graphics.lineBetween(
        enemy.x,
        enemy.y,
        enemy.x + enemy.telegraphAimX * 64,
        enemy.y + enemy.telegraphAimY * 64,
      );
    }
    if ((enemy.bossVolleyTelegraphTicks ?? 0) > 0) {
      graphics.lineStyle(2, 0x8bd8ff, 0.9);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius + 16);
    }
    this.drawEnemyStatuses(enemy);
    const hasSprite = this.enemySpriteKey(enemy.kind) !== undefined;
    if (!hasSprite) {
      graphics.fillStyle(0x5c2936, 1);
      graphics.fillCircle(enemy.x, enemy.y, enemy.radius);
      graphics.lineStyle(3, 0xf6d365, 1);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius);
      graphics.fillStyle(0xf6d365, 1);
      graphics.fillCircle(enemy.x, enemy.y, 5);
    }
    const barTop = this.enemyBarTop(enemy, hasSprite, 14);
    graphics.fillStyle(0x2a2424, 0.9);
    graphics.fillRect(enemy.x - 24, barTop, 48, 5);
    graphics.fillStyle(0xd85c54, 1);
    graphics.fillRect(
      enemy.x - 24,
      barTop,
      48 * Math.max(0, Math.min(1, enemy.health / BOSS_MAX_HEALTH)),
      5,
    );
  }

  /**
   * One projectile, drawn so its owner and payload are readable at a glance.
   *
   * Enemy fire is magenta and player fire is not, because the boss's phase-2
   * volley arrives as a five-shot fan: if every shot were one colour, a hit the
   * player could not have avoided would look identical to their own. Within the
   * player's shots, water reads blue and physical reads bone, and a burst reads
   * as a wide translucent bubble so a spread is distinguishable from a bolt.
   */
  private drawProjectile(projectile: ProjectileState): void {
    const graphics = this.graphics;
    if (projectile.faction === 'enemy') {
      graphics.fillStyle(0xff5d7a, 1);
      graphics.fillRect(
        projectile.x - projectile.radius,
        projectile.y - projectile.radius,
        projectile.radius * 2,
        projectile.radius * 2,
      );
      graphics.lineStyle(2, 0x4a1220, 0.95);
      graphics.strokeRect(
        projectile.x - projectile.radius - 2,
        projectile.y - projectile.radius - 2,
        projectile.radius * 2 + 4,
        projectile.radius * 2 + 4,
      );
      return;
    }
    const water = projectile.payload?.payloadKind === 'water';
    if (projectile.hasBurst === true) {
      graphics.fillStyle(water ? 0x6fb7e8 : 0xe8dcc4, 0.28);
      graphics.fillCircle(projectile.x, projectile.y, projectile.radius + 5);
    }
    graphics.fillStyle(water ? 0x6fb7e8 : 0xf0e6d2, 1);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
    graphics.lineStyle(2, 0x2b3a44, 0.9);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
  }

  /**
   * Wet and Sticky markers an enemy is currently carrying.
   *
   * The statuses the central tick already applies are otherwise invisible, and
   * a player cannot learn to compose Wet with a conductive reaction if the
   * applied state cannot be seen on the target it is applied to.
   */
  private drawEnemyStatuses(enemy: EnemyState): void {
    const statuses = enemy.statuses;
    if (!statuses) {
      return;
    }
    const graphics = this.graphics;
    if (statuses.wetTicks > 0) {
      graphics.lineStyle(2, 0x6fb7e8, 0.95);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius + 4);
      graphics.fillStyle(0x6fb7e8, 0.9);
      graphics.fillCircle(enemy.x, enemy.y - enemy.radius - 2, 3);
    }
    if (statuses.stickyTicks > 0) {
      graphics.lineStyle(2, 0xd7a45c, 0.95);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius + 7);
    }
  }

  private drawSurfacePatch(patch: SurfacePatchState): void {
    const graphics = this.graphics;
    graphics.fillStyle(0x3f6f8f, 0.5);
    graphics.fillCircle(patch.x, patch.y, patch.radius);
    graphics.lineStyle(1, 0x8bd8ff, 0.6);
    graphics.strokeCircle(patch.x, patch.y, patch.radius);
  }

  private drawPlayer(state: MvpRunState): void {
    const graphics = this.graphics;
    const player = state.room.combat.player;
    const flicker = player.invulnerableTicks > 0 && Math.floor(state.tick / 12) % 2 === 0;

    if (!this.syncPlayerSprite(state, flicker)) {
      // Vector fallback: the run stays playable if the sheets fail to load.
      graphics.fillStyle(flicker ? 0xdce8c8 : 0x2f5f62, 1);
      graphics.fillCircle(player.x, player.y, player.radius);
      graphics.lineStyle(2, 0xf4edd8, 0.9);
      graphics.strokeCircle(player.x, player.y, player.radius);
    }

    this.syncHeldItem(state);

    // The aim line stays vector: it is a gameplay readout of `player.facing`,
    // which is the attack direction and need not match where the sprite faces.
    graphics.lineStyle(3, 0xf6d365, 1);
    graphics.lineBetween(
      player.x,
      player.y,
      player.x + player.facing.x * (player.radius + 6),
      player.y + player.facing.y * (player.radius + 6),
    );
  }

  /**
   * Places Alex's feet on the bottom of the sim's collision circle.
   *
   * `player.facing` is the aim vector, so the walk direction is derived here
   * from the frame-to-frame movement delta instead. That keeps the sim free of
   * presentation state, and it is why this tracking lives in the view.
   */
  private syncPlayerSprite(state: MvpRunState, flicker: boolean): boolean {
    if (
      !this.scene.textures.exists(ALEX_IDLE_TEXTURE) ||
      !this.scene.textures.exists(ALEX_WALK_TEXTURE)
    ) {
      this.playerSprite?.setVisible(false);
      return false;
    }

    const player = state.room.combat.player;
    const last = this.lastPlayerPosition;
    const dx = last ? player.x - last.x : 0;
    const dy = last ? player.y - last.y : 0;
    const moving = dx * dx + dy * dy > 0.25;
    if (moving) {
      this.playerFacing = alexDirectionFor(dx, dy);
    }
    this.lastPlayerPosition = { x: player.x, y: player.y };

    const step = Math.floor(state.tick / ALEX_WALK_TICKS_PER_FRAME);
    const texture = moving ? ALEX_WALK_TEXTURE : ALEX_IDLE_TEXTURE;
    const frame = moving
      ? alexWalkFrame(this.playerFacing, step)
      : alexIdleFrame(this.playerFacing);

    const feetX = Math.round(player.x);
    const feetY = Math.round(player.y + player.radius);
    if (!this.playerSprite) {
      this.playerSprite = this.scene.add
        .sprite(feetX, feetY, texture, frame)
        .setOrigin(0.5, 1)
        .setDepth(2);
    }
    this.playerSprite
      .setTexture(texture, frame)
      .setPosition(feetX, feetY)
      .setVisible(true)
      .setAlpha(flicker ? 0.45 : 1);
    return true;
  }

  /**
   * Places the RC car centred on its collision circle rather than base-anchored
   * like an upright sprite: the car's footprint is a circle at (x, y), so the
   * art is centred on it too.
   *
   * `CarrierState` carries no heading, so the facing is derived from the
   * frame-to-frame delta, exactly as the player's walk facing is.
   */
  private syncCarSprite(x: number, y: number): boolean {
    if (!this.scene.textures.exists(RC_CAR_TEXTURE)) {
      this.carSprite?.setVisible(false);
      return false;
    }

    const last = this.lastCarrierPosition;
    const dx = last ? x - last.x : 0;
    const dy = last ? y - last.y : 0;
    if (dx * dx + dy * dy > 0.25) {
      this.carFacing = alexDirectionFor(dx, dy);
    }
    this.lastCarrierPosition = { x, y };

    const frame = rcCarFrame(this.carFacing);
    const centreX = Math.round(x);
    const centreY = Math.round(y);
    if (!this.carSprite) {
      this.carSprite = this.scene.add
        .sprite(centreX, centreY, RC_CAR_TEXTURE, frame)
        .setOrigin(0.5, 0.5)
        .setDepth(2);
    }
    this.carSprite.setPosition(centreX, centreY).setFrame(frame).setVisible(true);
    return true;
  }

  private setLabel(key: string, text: string, x: number, y: number): void {
    let label = this.labels.get(key);
    if (!label) {
      label = this.scene.add.text(x, y, text, {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: '#f4edd8',
        backgroundColor: 'rgba(9, 11, 13, 0.75)',
        padding: { x: 3, y: 2 },
      });
      label.setDepth(10);
      this.labels.set(key, label);
      return;
    }
    label.setPosition(x, y);
    if (label.text !== text) {
      label.setText(text);
    }
  }

  /**
   * The shop's name, centred on its sign board.
   *
   * A dedicated text object rather than `setLabel`, because the board is only
   * 96px wide and `setLabel` is 11px, at which "Department Outlet" is wider than
   * the sign it hangs on. At 9px every authored store name fits, and centring is
   * what makes the board look like it was meant to carry the name rather than the
   * name having drifted off its edge.
   *
   * It keeps `setLabel`'s dark plate. The board is not a flat surface: it is lit
   * panels separated by dark gaps, so bare dark text dropped out wherever it
   * crossed a gap and the name read as fragments. The plate is what makes the
   * words legible over both the warm and the cool board.
   */
  private syncSignLabel(key: string, text: string, rect: PlanRect): void {
    let label = this.labels.get(key);
    if (!label) {
      label = this.scene.add
        .text(rect.x + rect.width / 2, rect.y + rect.height / 2, text, {
          fontFamily: '"Courier New", monospace',
          fontSize: '9px',
          color: '#f4edd8',
          backgroundColor: 'rgba(9, 11, 13, 0.75)',
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5, 0.5)
        .setDepth(10);
      this.labels.set(key, label);
      return;
    }
    label.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (label.text !== text) {
      label.setText(text);
    }
  }

  private clearLabel(key: string): void {
    const label = this.labels.get(key);
    if (label) {
      label.destroy();
      this.labels.delete(key);
    }
  }

  private pruneLabels(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    const keep = new Set<string>(['bench']);
    if (state.carrier !== null) {
      keep.add('carrier');
    }
    if (room?.store) {
      keep.add(`store:${room.store.templateId}`);
      for (const offer of room.offers) {
        keep.add(`offer:${offer.id}`);
      }
    }
    for (const key of [...this.labels.keys()]) {
      if (!keep.has(key)) {
        this.clearLabel(key);
      }
    }
  }

  public destroy(): void {
    this.benchKioskSprite?.destroy();
    this.benchKioskSprite = undefined;
    this.playerSprite?.destroy();
    this.playerSprite = undefined;
    this.carSprite?.destroy();
    this.carSprite = undefined;
    for (const sprite of this.enemySprites.values()) {
      sprite.destroy();
    }
    this.enemySprites.clear();
    this.enemyFacing.clear();
    this.lastEnemyPositions.clear();
    for (const effect of this.effects) {
      effect.sprite.destroy();
    }
    this.effects.length = 0;
    this.lastEffectBaseline = undefined;
    for (const sprite of this.fixtureSprites) {
      sprite.destroy();
    }
    this.fixtureSprites.length = 0;
    for (const sprite of this.offerSprites) {
      sprite.destroy();
    }
    this.offerSprites.length = 0;
    this.heldItemSprite?.destroy();
    this.heldItemSprite = undefined;
    this.heldItemId = undefined;
    for (const key of [...this.labels.keys()]) {
      this.clearLabel(key);
    }
    this.graphics.destroy();
  }
}
