import Phaser from 'phaser';
import { MOP_HALF_ANGLE_RADIANS, MOP_RANGE } from '../../sim/combat/attack';
import type {
  EnemyState,
  PlayerProjectilePhase,
  ProjectileState,
  RunState,
  SurfacePatchState,
} from '../../sim/model';

/** Cosmetic duration of the conductive feedback flash, in rendered frames. */
const CONDUCTIVE_FEEDBACK_FRAMES = 40;

export class EntityView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private lastConductiveKey = '';
  private conductiveTargetIds: number[] = [];
  private conductiveFeedbackFrames = 0;

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

    for (const patch of state.surfaces) {
      this.drawSurfacePatch(patch);
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
      this.drawStatusMarkers(enemy);
    }

    for (const projectile of state.projectiles) {
      if (projectile.faction === 'player' && projectile.payload) {
        this.drawPlayerProjectile(
          projectile,
          projectile.payload.delivery,
          projectile.phase ?? 'outbound',
        );
        continue;
      }
      graphics.fillStyle(0xff8d64, 1);
      graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
      graphics.lineStyle(2, 0x401b20, 0.9);
      graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
    }

    this.drawConductiveFeedback(state);

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

  /**
   * Wet patches are authoritative room state; the view only draws them.
   */
  private drawSurfacePatch(patch: SurfacePatchState): void {
    const graphics = this.graphics;
    graphics.fillStyle(0x3f8fa8, 0.16);
    graphics.fillCircle(patch.x, patch.y, patch.radius);
    graphics.lineStyle(2, 0x7fd6e8, 0.5);
    graphics.strokeCircle(patch.x, patch.y, patch.radius);
    if (patch.radius > 8) {
      graphics.lineStyle(1, 0xbdeef8, 0.35);
      graphics.strokeCircle(patch.x, patch.y, patch.radius - 6);
    }
    // Deterministic speckles: derived from the patch id, never from randomness.
    const speckles = 5;
    for (let index = 0; index < speckles; index += 1) {
      const angle = ((patch.id + index * 47) % 360) * (Math.PI / 180);
      const distance = patch.radius * (0.25 + (((patch.id + index * 29) % 5) / 10));
      graphics.fillStyle(0x9fe3f2, 0.5);
      graphics.fillCircle(
        patch.x + Math.cos(angle) * distance,
        patch.y + Math.sin(angle) * distance,
        2,
      );
    }
  }

  /**
   * Wet and Sticky markers read straight from `EnemyState.statuses`.
   */
  private drawStatusMarkers(enemy: EnemyState): void {
    const statuses = enemy.statuses;
    if (!statuses) {
      return;
    }
    const graphics = this.graphics;
    const markerY = enemy.y - enemy.radius - 24;
    if (statuses.wetTicks > 0) {
      graphics.fillStyle(0x6fd0e8, 1);
      graphics.fillCircle(enemy.x - 9, markerY, 4);
      graphics.lineStyle(1, 0xbdeef8, 0.9);
      graphics.strokeCircle(enemy.x - 9, markerY, 4);
    }
    if (statuses.stickyTicks > 0) {
      graphics.fillStyle(0xd8e06a, 1);
      graphics.fillCircle(enemy.x + 9, markerY, 4);
      graphics.lineStyle(2, 0xd8e06a, 0.5);
      graphics.lineBetween(enemy.x + 9, markerY + 5, enemy.x + 9, markerY + 11);
    }
  }

  /**
   * Player shots: ordinary water, drifting bubbles, and a visible travel
   * direction so an outbound shot reads differently from a return pass.
   */
  private drawPlayerProjectile(
    projectile: ProjectileState,
    delivery: 'water_projectile' | 'drifting_bubble',
    phase: PlayerProjectilePhase,
  ): void {
    const graphics = this.graphics;
    const returning = phase === 'return';
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY);
    const directionX = speed === 0 ? 1 : projectile.velocityX / speed;
    const directionY = speed === 0 ? 0 : projectile.velocityY / speed;
    const bodyColor = returning ? 0xf6d365 : 0x8ccfc1;
    const accentColor = returning ? 0xfff3c4 : 0xd9f6ff;
    const radius = projectile.radius;

    graphics.lineStyle(3, bodyColor, 0.5);
    graphics.lineBetween(
      projectile.x - directionX * (radius + 10),
      projectile.y - directionY * (radius + 10),
      projectile.x,
      projectile.y,
    );

    if (delivery === 'drifting_bubble') {
      graphics.fillStyle(bodyColor, 0.28);
      graphics.fillCircle(projectile.x, projectile.y, radius);
      graphics.lineStyle(2, bodyColor, 1);
      graphics.strokeCircle(projectile.x, projectile.y, radius);
      graphics.fillStyle(accentColor, 0.85);
      graphics.fillCircle(
        projectile.x - directionX * radius * 0.35,
        projectile.y - directionY * radius * 0.35,
        Math.max(2, radius * 0.32),
      );
    } else {
      graphics.fillStyle(bodyColor, 1);
      graphics.fillCircle(projectile.x, projectile.y, radius);
      graphics.lineStyle(2, 0x401b20, 0.9);
      graphics.strokeCircle(projectile.x, projectile.y, radius + 2);
      graphics.fillStyle(accentColor, 0.9);
      graphics.fillCircle(projectile.x, projectile.y, Math.max(1.5, radius * 0.35));
    }

    const tip = radius + 6;
    graphics.lineStyle(2, accentColor, 0.9);
    graphics.lineBetween(
      projectile.x + directionX * tip,
      projectile.y + directionY * tip,
      projectile.x + directionX * (tip - 6) - directionY * 5,
      projectile.y + directionY * (tip - 6) + directionX * 5,
    );
    graphics.lineBetween(
      projectile.x + directionX * tip,
      projectile.y + directionY * tip,
      projectile.x + directionX * (tip - 6) + directionY * 5,
      projectile.y + directionY * (tip - 6) - directionX * 5,
    );
  }

  /**
   * Recent conductive feedback.
   *
   * The view never decides conduction: it reads the authoritative behavior
   * trace the simulation already wrote and flashes the targets that trace
   * names, for a bounded cosmetic window.
   */
  private drawConductiveFeedback(state: RunState): void {
    this.noteConductiveFeedback(state);
    if (this.conductiveFeedbackFrames <= 0) {
      return;
    }
    this.conductiveFeedbackFrames -= 1;
    const alpha = Math.min(1, this.conductiveFeedbackFrames / CONDUCTIVE_FEEDBACK_FRAMES);
    const targets = this.conductiveTargetIds
      .map((id) => state.enemies.find((enemy) => enemy.id === id))
      .filter((enemy): enemy is EnemyState => Boolean(enemy));
    if (targets.length === 0) {
      return;
    }

    const graphics = this.graphics;
    graphics.lineStyle(2, 0xfff3c4, alpha);
    for (let index = 1; index < targets.length; index += 1) {
      const from = targets[index - 1];
      const to = targets[index];
      if (!from || !to) {
        continue;
      }
      graphics.lineBetween(from.x, from.y, to.x, to.y);
    }
    graphics.lineStyle(2, 0x8bd8ff, alpha);
    for (const target of targets) {
      graphics.strokeCircle(target.x, target.y, target.radius + 6 + (1 - alpha) * 10);
    }
  }

  private noteConductiveFeedback(state: RunState): void {
    let key = '';
    let targetIds: number[] = [];
    for (const line of state.behaviorTrace) {
      const chain = /conductive chain \(root r\d+\): visited \[([0-9,\s]*)\]/.exec(line);
      if (chain && chain[1] !== undefined) {
        const ids = chain[1]
          .split(',')
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value));
        if (ids.length > 0) {
          key = `chain:${ids.join(',')}:${line.length}`;
          targetIds = ids;
        }
      }
      const discharge = /weak discharge on target (\d+)/.exec(line);
      if (discharge && discharge[1] !== undefined) {
        key = `discharge:${discharge[1]}:${line.length}`;
        targetIds = [Number.parseInt(discharge[1], 10)];
      }
    }
    if (key.length === 0 || key === this.lastConductiveKey) {
      return;
    }
    this.lastConductiveKey = key;
    this.conductiveTargetIds = targetIds;
    this.conductiveFeedbackFrames = CONDUCTIVE_FEEDBACK_FRAMES;
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
