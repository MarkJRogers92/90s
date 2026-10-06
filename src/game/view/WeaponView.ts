/**
 * The janitor's weapon, drawn so you can see what you are holding and what it
 * does.
 *
 * The simulation's melee hit window is six ticks (a tenth of a second), which
 * is correct for game feel but far too short to *see*. This view starts a
 * presentation-only swing whenever a new attack begins and plays it for about
 * a quarter second. Covered weapons attach a material trail to the held head;
 * these trails do not depict the full damage hitbox. Other melee weapons keep
 * the range/cone crescent fallback. Ranged weapons aim with an optional
 * material-specific release. Nothing here feeds back into the simulation.
 */
import Phaser from 'phaser';
import { ATTACK_ACTIVE_TICKS } from '../../sim/effects/constants';
import { itemIconKey } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { heldWeaponTransform, weaponPresentation, type HeldWeaponTransform } from './weaponPresentation';
import type { PointLight } from '../presentation/lighting/LightingLayer';

export const SWING_VISUAL_TICKS = 16;
/** How far the outstretched hands reach in alex-aim.png (24 px from the body centre, less the grip). */
export const AIM_POSE_REACH = 22;

/** World-space palm resolved from the body frame that was actually drawn. */
export type HeldHandAttachment = {
  readonly x: number;
  readonly y: number;
  readonly behind: boolean;
  readonly depth: number;
  readonly alpha: number;
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
  /** Distinguishes separate owned copies; older view callers may omit it. */
  readonly instanceId?: string;
  readonly delivery: 'direct' | 'projectile';
  readonly range: number;
  readonly halfAngleRadians: number;
  readonly attachment?: HeldHandAttachment | null;
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
  private lastDefinitionId: string | null = null;
  private lastInstanceId: string | null = null;
  private heldTransform: HeldWeaponTransform | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.held = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
  }

  /**
   * Notices a new attack: the active window jumping back up to its full
   * length. Safe to call more than once per tick, so the body sprite can ask
   * before the weapon is drawn and both start the swing on the same frame.
   */
  public noteAttack(weapon: Pick<WeaponSnapshot, 'definitionId' | 'instanceId' | 'attackActiveTicks' | 'facingX' | 'facingY'>, tick: number): void {
    const instanceId = weapon.instanceId ?? null;
    const changedWeapon = weapon.definitionId !== this.lastDefinitionId || instanceId !== this.lastInstanceId;
    if (tick < this.lastTick || changedWeapon) {
      this.swingStartTick = null;
      this.heldTransform = null;
    }
    this.lastDefinitionId = weapon.definitionId;
    this.lastInstanceId = instanceId;
    // Keep the previous active-window value across a swap: an unchanged six
    // belongs to the old attack, not a fresh one. A genuine rising edge on the
    // swap tick still starts below, before either body or weapon is drawn.
    this.lastTick = tick;
    if (weapon.attackActiveTicks === ATTACK_ACTIVE_TICKS && this.lastActive !== ATTACK_ACTIVE_TICKS) {
      this.swingStartTick = tick;
      this.swingAngle = Math.atan2(weapon.facingY, weapon.facingX);
    }
    this.lastActive = weapon.attackActiveTicks;
  }

  /** Progress 0..1 of the visible swing at `tick`, or null when idle. */
  public swingAt(tick: number): number | null {
    return swingProgress(this.swingStartTick, tick);
  }

  /** Draws the held weapon and any live swing; returns lights for this frame. */
  public sync(weapon: WeaponSnapshot, tick: number, effects: Phaser.GameObjects.Graphics, actorDepth: number, nativeMeleeEffect = false, nativeRangedEffect = false, aimPose = false): PointLight[] {
    this.noteAttack(weapon, tick);
    const aim = Math.atan2(weapon.facingY, weapon.facingX);
    const lights: PointLight[] = [];

    const key = itemIconKey(weapon.definitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    const progress = swingProgress(this.swingStartTick, tick);

    if (weapon.delivery === 'direct') {
      const half = weapon.halfAngleRadians;
      // While idle the weapon rests at the trailing edge of its cone, ready to swing.
      const sweep = progress === null ? aim - half * 0.9 : this.swingAngle - half + 2 * half * easeOut(progress);
      const reach = progress === null ? 10 : 12 + 4 * Math.sin(Math.PI * progress);
      this.placeHeld(usable, weapon, sweep, reach, actorDepth, progress === null ? 1.05 : 1.35);
      if (progress !== null && (!nativeMeleeEffect || !this.heldTransform)) lights.push(...this.drawSmear(effects, weapon, progress));
    } else {
      const recoil = progress === null ? 0 : Math.max(0, 1 - progress * 3) * 6;
      // The authored aim pose holds the arms out: the gun sits at the outstretched hand.
      this.placeHeld(usable, weapon, aim, (aimPose ? AIM_POSE_REACH : 10) - recoil, actorDepth, 1.1);
      if ((!nativeRangedEffect || !this.heldTransform) && progress !== null && progress < 0.3) {
        const mx = this.heldTransform?.head.x ?? weapon.x + Math.cos(aim) * 34;
        const my = this.heldTransform?.head.y ?? weapon.y - 12 + Math.sin(aim) * 34;
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
      this.heldTransform = null;
      this.held.setVisible(false);
      return;
    }
    if (this.held.texture.key !== usable) this.held.setTexture(usable);
    const size = Math.max(this.held.width, this.held.height);
    // Small tools may override the shared melee/gun tile size. Fusion roots
    // inherit their source icon's metadata, including this visual-only scale.
    const base = (weaponPresentation(weapon.definitionId).heldSize ?? (weapon.delivery === 'direct' ? 40 : 28)) / size;
    const transform = heldWeaponTransform({
      definitionId: weapon.definitionId, aimAngle: angle,
      // Keep subpixels: rounding independently from the body makes the grip
      // chatter during a bob, flinch, or scaled/rotated pose.
      gripX: weapon.attachment?.x ?? Math.round(weapon.x + Math.cos(angle) * reach),
      gripY: weapon.attachment?.y ?? Math.round(weapon.y - 20 + Math.sin(angle) * reach * 0.8),
      scale: base * scale,
    });
    this.heldTransform = transform;
    this.held.alpha = weapon.attachment?.alpha ?? 1;
    this.held
      .setVisible(true)
      .setOrigin(transform.originX, transform.originY)
      .setPosition(transform.grip.x, transform.grip.y)
      .setRotation(transform.rotation)
      .setScale(transform.scale)
      .setFlipY(transform.flipY)
      // Use the displayed palm's layer, even during a cross-body swing or a
      // dash whose facing differs from the continuously aimed weapon.
      .setDepth(weapon.attachment
        ? weapon.attachment.depth + (weapon.attachment.behind ? -1 : 1)
        : Math.sin(angle) < -0.2 ? actorDepth - 1 : actorDepth + 1);
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

  /** Current image geometry, including its actual visible head/nozzle position. */
  public headAt(): (HeldWeaponTransform & { readonly imageDepth: number }) | null {
    return this.heldTransform ? { ...this.heldTransform, imageDepth: this.held.depth } : null;
  }

  public hide(): void {
    this.heldTransform = null;
    this.held.setVisible(false);
  }

  public reset(): void {
    this.swingStartTick = null;
    this.lastActive = 0;
    this.lastTick = -1;
    this.lastDefinitionId = null;
    this.lastInstanceId = null;
    this.heldTransform = null;
    this.held.setVisible(false);
  }

  public destroy(): void {
    this.heldTransform = null;
    this.held.destroy();
  }
}
