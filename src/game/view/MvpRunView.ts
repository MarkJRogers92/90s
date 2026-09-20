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
import { BOSS_MAX_HEALTH, BOSS_SLAM_REACH } from '../../sim/combat/boss';
import { runOfferPriceLabel } from '../../sim/run/economy';
import type { EnemyState, ProjectileState, SurfacePatchState } from '../../sim/model';
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
  FIXTURE_ART,
  ITEM_ART,
  RC_CAR_TEXTURE,
  rcCarFrame,
  type AlexDirection,
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

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
  }

  public sync(state: MvpRunState): void {
    const graphics = this.graphics;
    const room = state.wing.rooms[state.roomIndex];
    if (!room) {
      return;
    }
    graphics.clear();

    graphics.fillStyle(0x1d2124, 1);
    graphics.fillRect(room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height);
    graphics.fillStyle(0x8c8873, 1);
    graphics.fillRect(room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height);
    graphics.lineStyle(1, 0x74705f, 0.35);
    for (let x = room.bounds.x; x <= room.bounds.x + room.bounds.width; x += 32) {
      graphics.lineBetween(x, room.bounds.y, x, room.bounds.y + room.bounds.height);
    }
    for (let y = room.bounds.y; y <= room.bounds.y + room.bounds.height; y += 32) {
      graphics.lineBetween(room.bounds.x, y, room.bounds.x + room.bounds.width, y);
    }

    for (const wall of room.walls) {
      graphics.fillStyle(0x41453f, 1);
      graphics.fillRect(wall.x, wall.y, wall.width, wall.height);
      graphics.lineStyle(2, 0xc4b878, 0.45);
      graphics.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    for (const doorway of room.doorways) {
      graphics.fillStyle(0xf6d365, 1);
      graphics.fillRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
      graphics.lineStyle(2, 0x12130f, 0.9);
      graphics.strokeRect(doorway.rect.x, doorway.rect.y, doorway.rect.width, doorway.rect.height);
    }

    this.syncFixtures(room);

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

    for (const projectile of state.room.combat.projectiles) {
      this.drawProjectile(projectile);
    }

    this.drawCarrier(state);
    this.drawPlayer(state);
    this.pruneLabels(state);
  }

  /**
   * The Remote-Control Car, drawn only while the shift owns one.
   *
   * A fused car is the firing origin, so it is drawn with the same tether cue
   * the player needs to judge leash range, plus a distinct fill for the two
   * modes: an independent companion versus the steered emitter mount.
   */
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
    graphics.fillStyle(carriedHere ? 0x4a3f57 : 0x35383a, 1);
    graphics.fillRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);
    graphics.lineStyle(2, carriedHere ? 0xf6d365 : 0xc4b878, carriedHere ? 1 : 0.6);
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

    this.setLabel(`store:${templateId}`, store.name, store.bounds.x + 6, store.bounds.y - 4);

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

  private drawEnemy(enemy: EnemyState): void {
    const graphics = this.graphics;
    if (enemy.kind === 'hanger') {
      graphics.lineStyle(4, 0x8a3038, 1);
      graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x, enemy.y - 10);
      graphics.lineBetween(enemy.x, enemy.y - 10, enemy.x + 12, enemy.y + 9);
      graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x + 12, enemy.y + 9);
      graphics.fillStyle(0xd35f55, 1);
      graphics.fillCircle(enemy.x, enemy.y - 10, 5);
    } else {
      if (enemy.phase === 'telegraph') {
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
      graphics.fillStyle(0x4d2c59, 1);
      graphics.fillRect(enemy.x - 13, enemy.y - 13, 26, 26);
      graphics.fillStyle(0xc984d8, 1);
      graphics.fillRect(enemy.x - 6, enemy.y - 5, 12, 8);
    }
    this.drawEnemyStatuses(enemy);
    graphics.fillStyle(0x2a2424, 0.9);
    graphics.fillRect(enemy.x - 15, enemy.y - enemy.radius - 12, 30, 4);
    graphics.fillStyle(0xd85c54, 1);
    graphics.fillRect(
      enemy.x - 15,
      enemy.y - enemy.radius - 12,
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
    graphics.fillStyle(0x5c2936, 1);
    graphics.fillCircle(enemy.x, enemy.y, enemy.radius);
    graphics.lineStyle(3, 0xf6d365, 1);
    graphics.strokeCircle(enemy.x, enemy.y, enemy.radius);
    graphics.fillStyle(0xf6d365, 1);
    graphics.fillCircle(enemy.x, enemy.y, 5);
    graphics.fillStyle(0x2a2424, 0.9);
    graphics.fillRect(enemy.x - 24, enemy.y - enemy.radius - 14, 48, 5);
    graphics.fillStyle(0xd85c54, 1);
    graphics.fillRect(
      enemy.x - 24,
      enemy.y - enemy.radius - 14,
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
