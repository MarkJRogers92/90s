import Phaser from 'phaser';
import { centreCameraOnPlayer } from './camera';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../sim/core/geometry';
import type { EnemyState, ProjectileState, SurfacePatchState } from '../../sim/model';
import { BENCH_KIOSK, doorwayForRoom, wallsForRoom } from '../../sim/bench/scenarios';
import type { BenchRoomId, BenchRunState } from '../../sim/bench/types';

export class BenchView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  public constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  public sync(state: BenchRunState): void {
    const graphics = this.graphics;
    const room: BenchRoomId = state.activeRoom;
    graphics.clear();

    graphics.fillStyle(0x1d2124, 1);
    graphics.fillRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);

    graphics.fillStyle(0x8c8873, 1);
    graphics.fillRect(0, 0, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    graphics.lineStyle(1, 0x74705f, 0.35);
    for (let x = 0; x <= PLAYFIELD_WIDTH; x += 32) {
      graphics.lineBetween(x, 0, x, PLAYFIELD_HEIGHT);
    }
    for (let y = 0; y <= PLAYFIELD_HEIGHT; y += 32) {
      graphics.lineBetween(0, y, PLAYFIELD_WIDTH, y);
    }

    for (const wall of wallsForRoom(room)) {
      graphics.fillStyle(0x41453f, 1);
      graphics.fillRect(wall.x, wall.y, wall.width, wall.height);
      graphics.lineStyle(2, 0xc4b878, 0.45);
      graphics.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    const doorway = doorwayForRoom(room);
    graphics.fillStyle(0xf6d365, 1);
    graphics.fillRect(doorway.x, doorway.y, doorway.width, doorway.height);
    graphics.lineStyle(2, 0x12130f, 0.9);
    graphics.strokeRect(doorway.x, doorway.y, doorway.width, doorway.height);

    graphics.lineStyle(2, 0xd8e06a, 0.55);
    graphics.strokeCircle(BENCH_KIOSK.x, BENCH_KIOSK.y, BENCH_KIOSK.range);
    graphics.fillStyle(0x72566c, 1);
    graphics.fillRect(BENCH_KIOSK.x - 43, BENCH_KIOSK.y - 12, 86, 24);
    graphics.lineStyle(2, 0xf4edd8, 0.9);
    graphics.strokeRect(BENCH_KIOSK.x - 43, BENCH_KIOSK.y - 12, 86, 24);

    for (const patch of state.combat.surfaces) {
      this.drawSurfacePatch(patch);
    }

    for (const enemy of state.combat.enemies) {
      this.drawEnemy(enemy);
    }

    for (const projectile of state.combat.projectiles) {
      this.drawProjectile(projectile);
    }

    this.drawTether(state);
    this.drawCarrier(state);
    this.drawPlayer(state);

    centreCameraOnPlayer(this.scene, state.combat.player.x, state.combat.player.y);
  }

  private drawPlayer(state: BenchRunState): void {
    const graphics = this.graphics;
    const player = state.combat.player;
    const flicker = player.invulnerableTicks > 0 && Math.floor(state.combat.tick / 12) % 2 === 0;
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

  private drawCarrier(state: BenchRunState): void {
    const graphics = this.graphics;
    const carrier = state.carrier;
    const emitter = carrier.mode === 'emitter';
    graphics.fillStyle(emitter ? 0xf6d365 : 0xc46a2d, 1);
    graphics.fillRect(
      carrier.x - carrier.radius,
      carrier.y - carrier.radius,
      carrier.radius * 2,
      carrier.radius * 2,
    );
    graphics.lineStyle(2, 0x12130f, 0.9);
    graphics.strokeRect(
      carrier.x - carrier.radius,
      carrier.y - carrier.radius,
      carrier.radius * 2,
      carrier.radius * 2,
    );
    if (emitter) {
      graphics.lineStyle(2, 0xfff3c4, 1);
      graphics.strokeCircle(carrier.x, carrier.y, carrier.radius + 6);
      graphics.lineStyle(2, 0xfff3c4, 0.8);
      graphics.lineBetween(carrier.x - carrier.radius - 10, carrier.y, carrier.x + carrier.radius + 10, carrier.y);
      graphics.lineBetween(carrier.x, carrier.y - carrier.radius - 10, carrier.x, carrier.y + carrier.radius + 10);
    }
    if (carrier.recalling) {
      graphics.lineStyle(2, 0x8bd8ff, 0.9);
      graphics.strokeCircle(carrier.x, carrier.y, carrier.radius + 12);
    }
  }

  private drawTether(state: BenchRunState): void {
    const graphics = this.graphics;
    const player = state.combat.player;
    const carrier = state.carrier;
    graphics.lineStyle(1, state.carrier.mode === 'emitter' ? 0xfff3c4 : 0xc46a2d, 0.7);
    graphics.lineBetween(player.x, player.y, carrier.x, carrier.y);
    graphics.fillStyle(0xf4edd8, 0.9);
    graphics.fillCircle((player.x + carrier.x) / 2, (player.y + carrier.y) / 2, 2);
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
    const statuses = enemy.statuses;
    if (statuses) {
      const markerY = enemy.y - enemy.radius - 24;
      if (statuses.wetTicks > 0) {
        graphics.fillStyle(0x6fd0e8, 1);
        graphics.fillCircle(enemy.x - 9, markerY, 4);
      }
      if (statuses.stickyTicks > 0) {
        graphics.fillStyle(0xd8e06a, 1);
        graphics.fillCircle(enemy.x + 9, markerY, 4);
      }
    }
  }

  private drawProjectile(projectile: ProjectileState): void {
    const graphics = this.graphics;
    if (projectile.faction === 'player') {
      graphics.fillStyle(0x8ccfc1, 1);
      graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
      graphics.lineStyle(2, 0x401b20, 0.9);
      graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
      return;
    }
    graphics.fillStyle(0xff8d64, 1);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
    graphics.lineStyle(2, 0x401b20, 0.9);
    graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
  }

  private drawSurfacePatch(patch: SurfacePatchState): void {
    const graphics = this.graphics;
    graphics.fillStyle(0x3f8fa8, 0.16);
    graphics.fillCircle(patch.x, patch.y, patch.radius);
    graphics.lineStyle(2, 0x7fd6e8, 0.5);
    graphics.strokeCircle(patch.x, patch.y, patch.radius);
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
