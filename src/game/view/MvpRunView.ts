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
import { BOSS_MAX_HEALTH } from '../../sim/combat/boss';
import type { EnemyState, ProjectileState, SurfacePatchState } from '../../sim/model';
import type { MvpRunState } from '../../sim/run/types';
import { securityFacingAtTick } from '../../sim/shop/security';

export class MvpRunView {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();

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
      graphics.lineStyle(2, 0xd8e06a, 0.55);
      graphics.strokeCircle(room.benchKiosk.x, room.benchKiosk.y, 48);
      graphics.fillStyle(0x72566c, 1);
      graphics.fillRect(room.benchKiosk.x - 43, room.benchKiosk.y - 12, 86, 24);
      graphics.lineStyle(2, 0xf4edd8, 0.9);
      graphics.strokeRect(room.benchKiosk.x - 43, room.benchKiosk.y - 12, 86, 24);
      this.setLabel('bench', 'BENCH WARRANT', room.benchKiosk.x, room.benchKiosk.y - 22);
    } else {
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

    this.drawPlayer(state);
    this.pruneLabels(state);
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
      this.setLabel(`offer:${offer.id}`, `$${offer.price}`, offer.position.x + 10, offer.position.y - 8);
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
      graphics.lineStyle(3, 0xffd45d, 0.95);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius + 10);
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

  private drawProjectile(projectile: ProjectileState): void {
    const graphics = this.graphics;
    graphics.fillStyle(0xff8d64, 1);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
    graphics.lineStyle(2, 0x401b20, 0.9);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
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
    for (const key of [...this.labels.keys()]) {
      this.clearLabel(key);
    }
    this.graphics.destroy();
  }
}
