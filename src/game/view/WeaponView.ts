/**
 * The janitor's weapon, drawn so you can see what you are holding and what it
 * does.
 *
 * The simulation's melee hit window is six ticks (a tenth of a second), which
 * is correct for game feel but far too short to *see*. This view starts a
 * presentation-only swing whenever a new attack begins and plays it for about
 * a quarter second: the weapon sprite sweeps through the real attack cone and
 * leaves a crescent smear drawn at the weapon's true range and half-angle, so
 * the picture is exactly the hitbox. Ranged weapons are held pointed at the
 * aim and flash on each shot. Nothing here feeds back into the simulation.
 */
import Phaser from 'phaser';
import { ATTACK_ACTIVE_TICKS } from '../../sim/effects/constants';
import { itemIconKey } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import type { PointLight } from '../presentation/lighting/LightingLayer';

export const SWING_VISUAL_TICKS = 16;

/** How each icon is drawn: the angle its business end points in the source art. */
const ICON_HEAD_ANGLE: Readonly<Record<string, number>> = {
  janitor_mop: (3 * Math.PI) / 4,
  broken_broom_handle: (3 * Math.PI) / 4,
  box_cutter: -Math.PI / 4,
};

const SMEAR_COLOR: Readonly<Record<string, number>> = {
  janitor_mop: 0xbfe8ff,
  broken_broom_handle: 0xffd9a0,
  box_cutter: 0xffffff,
};

export type WeaponSnapshot = {
  readonly x: number;
  readonly y: number;
  readonly facingX: number;
  readonly facingY: number;
  readonly attackActiveTicks: number;
  readonly definitionId: string;
  readonly delivery: 'direct' | 'projectile';
  readonly range: number;
  readonly halfAngleRadians: number;
};

/** Pure: swing progress 0..1 for a swing that started at `startTick`, or null when idle. */
export function swingProgress(startTick: number | null, tick: number): number | null {
  if (startTick === null) return null;
  const age = tick - startTick;
  if (age < 0 || age > SWING_VISUAL_TICKS) return null;
  return age / SWING_VISUAL_TICKS;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export class WeaponView {
  private readonly scene: Phaser.Scene;
  private readonly held: Phaser.GameObjects.Image;
  private swingStartTick: number | null = null;
  private swingAngle = 0;
  private lastActive = 0;
  private lastTick = -1;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.held = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
  }

  /** Draws the held weapon and any live swing; returns lights for this frame. */
  public sync(weapon: WeaponSnapshot, tick: number, effects: Phaser.GameObjects.Graphics, actorDepth: number): PointLight[] {
    if (tick < this.lastTick) this.swingStartTick = null;
    this.lastTick = tick;
    const aim = Math.atan2(weapon.facingY, weapon.facingX);
    // A new attack is the active window jumping back up to its full length.
    if (weapon.attackActiveTicks === ATTACK_ACTIVE_TICKS && this.lastActive !== ATTACK_ACTIVE_TICKS) {
      this.swingStartTick = tick;
      this.swingAngle = aim;
    }
    this.lastActive = weapon.attackActiveTicks;
    const lights: PointLight[] = [];

    const key = itemIconKey(weapon.definitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    const progress = swingProgress(this.swingStartTick, tick);

    if (weapon.delivery === 'direct') {
      const half = weapon.halfAngleRadians;
      // While idle the weapon rests at the trailing edge of its cone, ready to swing.
      const sweep = progress === null ? aim - half * 0.9 : this.swingAngle - half + 2 * half * easeOut(progress);
      const reach = progress === null ? 22 : 26 + 10 * Math.sin(Math.PI * progress);
      this.placeHeld(usable, weapon, sweep, reach, actorDepth, progress === null ? 1.05 : 1.35);
      if (progress !== null) lights.push(...this.drawSmear(effects, weapon, progress));
    } else {
      const recoil = progress === null ? 0 : Math.max(0, 1 - progress * 3) * 6;
      this.placeHeld(usable, weapon, aim, 20 - recoil, actorDepth, 1.1);
      if (progress !== null && progress < 0.3) {
        const mx = weapon.x + Math.cos(aim) * 34;
        const my = weapon.y - 12 + Math.sin(aim) * 34;
        effects.fillStyle(0xfff4c0, 1 - progress * 3).fillCircle(mx, my, 7 - progress * 12);
        effects.fillStyle(0xffffff, 1 - progress * 3).fillCircle(mx, my, 3);
        lights.push({ x: mx, y: my, radius: 70, color: 0xfff0b0, intensity: 0.9 * (1 - progress * 3) });
      }
    }
    return lights;
  }

  private placeHeld(
    usable: string | null,
    weapon: WeaponSnapshot,
    angle: number,
    reach: number,
    actorDepth: number,
    scale: number,
  ): void {
    if (!usable) {
      this.held.setVisible(false);
      return;
    }
    if (this.held.texture.key !== usable) this.held.setTexture(usable);
    const headAngle = ICON_HEAD_ANGLE[weapon.definitionId] ?? 0;
    const size = Math.max(this.held.width, this.held.height);
    // Melee weapons are held at a readable length; guns stay compact.
    const base = (weapon.delivery === 'direct' ? 40 : 28) / size;
    this.held
      .setVisible(true)
      .setPosition(Math.round(weapon.x + Math.cos(angle) * reach), Math.round(weapon.y - 20 + Math.sin(angle) * reach * 0.8))
      .setRotation(angle - headAngle)
      .setScale(base * scale)
      .setFlipY(false)
      // Behind the janitor when pointing up the screen, in front otherwise.
      .setDepth(Math.sin(angle) < -0.2 ? actorDepth - 1 : actorDepth + 1);
  }

  /** The crescent the swing leaves: exactly the cone the simulation checks. */
  private drawSmear(effects: Phaser.GameObjects.Graphics, weapon: WeaponSnapshot, progress: number): PointLight[] {
    const color = SMEAR_COLOR[weapon.definitionId] ?? 0xffffff;
    const start = this.swingAngle - weapon.halfAngleRadians;
    const end = start + 2 * weapon.halfAngleRadians * easeOut(Math.min(1, progress * 1.4));
    const inner = 16;
    const outer = weapon.range;
    const fade = 1 - progress;
    const cx = weapon.x;
    const cy = weapon.y - 14;
    const steps = 14;
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = start + ((end - start) * i) / steps;
      points.push(new Phaser.Math.Vector2(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer));
    }
    for (let i = steps; i >= 0; i -= 1) {
      const a = start + ((end - start) * i) / steps;
      // Thicker toward the leading edge, like a real motion smear.
      const r = inner + (outer - inner) * (0.35 + 0.4 * (i / steps));
      points.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    effects.fillStyle(color, 0.6 * fade).fillPoints(points, true);
    effects.lineStyle(5, 0xffffff, 0.95 * fade);
    effects.beginPath();
    effects.arc(cx, cy, outer, start, end);
    effects.strokePath();
    effects.lineStyle(10, color, 0.35 * fade);
    effects.beginPath();
    effects.arc(cx, cy, outer - 5, start, end);
    effects.strokePath();

    if (weapon.definitionId === 'janitor_mop') {
      // The mop is wet: droplets fling off the head along the swing.
      for (let i = 0; i < 7; i += 1) {
        const a = start + ((end - start) * (i + 0.5)) / 7;
        const r = outer * (0.85 + 0.45 * progress) + (i % 3) * 5;
        effects.fillStyle(0x9ad8ff, fade).fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 3, 3);
      }
    }
    const tip = end;
    return [{ x: cx + Math.cos(tip) * outer * 0.7, y: cy + Math.sin(tip) * outer * 0.7, radius: 80, color, intensity: 0.7 * fade }];
  }

  public hide(): void {
    this.held.setVisible(false);
  }

  public reset(): void {
    this.swingStartTick = null;
    this.lastActive = 0;
    this.lastTick = -1;
    this.held.setVisible(false);
  }

  public destroy(): void {
    this.held.destroy();
  }
}
