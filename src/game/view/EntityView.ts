import Phaser from 'phaser';
import { MOP_HALF_ANGLE_RADIANS, MOP_RANGE } from '../../sim/combat/attack';
import type { RunState } from '../../sim/model';

export class EntityView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  public sync(state: RunState): void {
    const graphics = this.graphics;
    graphics.clear();

    graphics.fillStyle(0x242823, 1);
    graphics.fillRect(0, 0, 960, 480);
    graphics.fillStyle(0x8c8873, 1);
    graphics.fillRect(18, 18, 924, 444);
    graphics.lineStyle(1, 0x74705f, 0.7);
    for (let x = 18; x <= 942; x += 32) {
      graphics.lineBetween(x, 18, x, 462);
    }
    for (let y = 18; y <= 462; y += 32) {
      graphics.lineBetween(18, y, 942, y);
    }

    graphics.lineStyle(10, 0x3b3f39, 1);
    graphics.strokeRect(13, 13, 934, 454);
    graphics.fillStyle(0x41453f, 1);
    for (const wall of state.walls) {
      graphics.fillRect(wall.x, wall.y, wall.width, wall.height);
      graphics.lineStyle(2, 0xc4b878, 0.45);
      graphics.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    graphics.fillStyle(0x72566c, 1);
    graphics.fillRect(72, 70, 86, 24);
    graphics.fillStyle(0x3f4b41, 1);
    graphics.fillRect(820, 58, 66, 34);
    graphics.fillStyle(0x66745f, 1);
    graphics.fillCircle(853, 57, 16);

    for (const enemy of state.enemies) {
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

    for (const projectile of state.projectiles) {
      graphics.fillStyle(projectile.faction === 'enemy' ? 0xff8d64 : 0x8ccfc1, 1);
      graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
      graphics.lineStyle(2, 0x401b20, 0.9);
      graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
    }

    const flicker = state.player.invulnerableTicks > 0 && Math.floor(state.tick / 12) % 2 === 0;
    graphics.fillStyle(flicker ? 0xdce8c8 : 0x2f5f62, 1);
    graphics.fillRect(state.player.x - 9, state.player.y - 12, 18, 24);
    graphics.fillStyle(0xf0d0a2, 1);
    graphics.fillCircle(state.player.x, state.player.y - 15, 7);
    graphics.fillStyle(0xf6d365, 1);
    graphics.fillRect(state.player.x - 10, state.player.y - 23, 20, 5);

    if (state.player.attackActiveTicks > 0) {
      const facingAngle = Math.atan2(state.player.facing.y, state.player.facing.x);
      graphics.lineStyle(9, 0x8bc9b8, 0.25);
      graphics.beginPath();
      graphics.arc(
        state.player.x,
        state.player.y,
        MOP_RANGE,
        facingAngle - MOP_HALF_ANGLE_RADIANS,
        facingAngle + MOP_HALF_ANGLE_RADIANS,
      );
      graphics.strokePath();
      graphics.lineStyle(5, 0xc8b581, 1);
      graphics.lineBetween(
        state.player.x,
        state.player.y,
        state.player.x + state.player.facing.x * 56,
        state.player.y + state.player.facing.y * 56,
      );
      graphics.fillStyle(0xc4d8cb, 1);
      graphics.fillCircle(
        state.player.x + state.player.facing.x * 62,
        state.player.y + state.player.facing.y * 62,
        8,
      );
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
