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
import { securityFacingAtTick } from '../../sim/shop/security';
import { BENCH_WARRANT_KIOSK_TEXTURE } from '../assets';

export class MvpRunView {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private benchKioskSprite: Phaser.GameObjects.Image | undefined;

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
      return;
    }
    const graphics = this.graphics;
    const player = state.room.combat.player;
    const fused = carrier.mode === 'emitter';

    // The leash, so the player can read why the car stops following.
    graphics.lineStyle(1, fused ? 0x8bc9b8 : 0xc4b878, 0.28);
    graphics.lineBetween(player.x, player.y, carrier.x, carrier.y);

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

    this.setLabel(
      'carrier',
      fused ? (carrier.recalling ? 'CAR · RECALL' : 'CAR · EMITTER') : 'CAR · INDEPENDENT',
      carrier.x,
      carrier.y - carrier.radius - 14,
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

    for (const offer of room?.offers ?? []) {
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
      // The same run offer price the HUD card shows, so a world label can
      // never disagree with the discounted price the run actually charges.
      this.setLabel(
        `offer:${offer.id}`,
        runOfferPriceLabel(state, offer),
        offer.position.x + 10,
        offer.position.y - 8,
      );
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
    graphics.fillStyle(flicker ? 0xdce8c8 : 0x2f5f62, 1);
    graphics.fillCircle(player.x, player.y, player.radius);
    graphics.lineStyle(2, 0xf4edd8, 0.9);
    graphics.strokeCircle(player.x, player.y, player.radius);
    graphics.lineStyle(3, 0xf6d365, 1);
    graphics.lineBetween(
      player.x,
      player.y,
      player.x + player.facing.x * (player.radius + 6),
      player.y + player.facing.y * (player.radius + 6),
    );
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
    for (const key of [...this.labels.keys()]) {
      this.clearLabel(key);
    }
    this.graphics.destroy();
  }
}
