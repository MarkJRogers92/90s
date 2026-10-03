/**
 * Sprite-backed attack presentation. Images are reused while a projectile id
 * is alive, then released at despawn, room changes, rewind/reset and shutdown.
 * Nothing in this view changes the simulation's hitboxes or attack clock.
 */
import type Phaser from 'phaser';
import type { ProjectileState } from '../../sim/model';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { meleeEffect, projectileEffect, projectileEffectPose, WEAPON_EFFECT_ART, type WeaponEffectArt } from './weaponEffects';

type ProjectileImage = { readonly image: Phaser.GameObjects.Image; born: number };
type HeadPose = { readonly head: { readonly x: number; readonly y: number }; readonly angle: number; readonly flipY: boolean };

export class WeaponEffectView {
  private readonly projectiles = new Map<number, ProjectileImage>();
  private readonly usedProjectiles = new Set<number>();
  private melee: Phaser.GameObjects.Image | null = null;
  private muzzle: Phaser.GameObjects.Image | null = null;
  private scope = '';
  private lastTick = -1;

  public constructor(private readonly scene: Phaser.Scene) {}

  public beginFrame(scope: string, tick: number): void {
    if (scope !== this.scope || tick < this.lastTick) this.reset();
    this.scope = scope;
    this.lastTick = tick;
    this.usedProjectiles.clear();
    this.hideMelee();
    this.muzzle?.setVisible(false);
  }

  /** Null means the caller must keep the existing procedural fallback. */
  public syncProjectile(projectile: ProjectileState, tick: number): { readonly radius: number } | null {
    if (projectile.faction !== 'player') return null;
    const art = projectileEffect({
      sourceItemId: projectile.payload?.payloadEffect.sourceItemId ?? '',
      delivery: projectile.payload?.delivery ?? '',
    });
    if (!art || !usableTextureKey(this.scene.textures, art.key)) return null;
    let entry = this.projectiles.get(projectile.id);
    if (!entry) {
      entry = { image: this.scene.add.image(0, 0, art.key), born: tick };
      this.projectiles.set(projectile.id, entry);
    } else if (entry.image.texture.key !== art.key) {
      entry.image.setTexture(art.key);
      entry.born = tick;
    }
    this.usedProjectiles.add(projectile.id);
    const pose = projectileEffectPose(art, projectile, tick - entry.born);
    this.cropFrame(entry.image, art, pose.frame)
      .setPosition(pose.x, pose.y).setRotation(pose.rotation).setScale(pose.scale)
      .setFlipY(false).setAlpha(1).setVisible(true)
      // A separate global effect image clears room darkness and stays over
      // modifier graphics, so sticky/rewind sparks never swallow its core.
      .setDepth(presentationDepth('effect', 2));
    return { radius: pose.radius };
  }

  public canRenderRanged(definitionId: string): boolean {
    const art = projectileEffect({ sourceItemId: definitionId, delivery: 'water_projectile' });
    return art !== null && usableTextureKey(this.scene.textures, art.key) !== null;
  }

  public syncMuzzle(definitionId: string, progress: number | null, pose: HeadPose | null): void {
    const art = projectileEffect({ sourceItemId: definitionId, delivery: 'water_projectile' });
    // Reuse only a small first-frame material release. Rocket exhaust is
    // cropped before the stick/body, so firing never creates a second rocket.
    // Thrown media, foam balls and nails retain their flash-free presentation.
    const release = art === WEAPON_EFFECT_ART.soaker ? { width: 32, tailX: 4, scale: 0.55, ticks: 3 }
      : art === WEAPON_EFFECT_ART.confetti ? { width: 24, tailX: 4, scale: 0.4, ticks: 2 }
      : art === WEAPON_EFFECT_ART.rocket ? { width: 10, tailX: 2, scale: 0.65, ticks: 2 }
      : art === WEAPON_EFFECT_ART.extinguisher ? { width: 32, tailX: 4, scale: 0.4, ticks: 3 } : null;
    if (!pose || progress === null || progress < 0 || !art || !release || progress >= release.ticks / 16 || !this.canRenderRanged(definitionId)) {
      this.muzzle?.setVisible(false);
      return;
    }
    if (!this.muzzle) this.muzzle = this.scene.add.image(0, 0, art.key);
    if (this.muzzle.texture.key !== art.key) this.muzzle.setTexture(art.key);
    this.muzzle.setCrop(0, 0, release.width, art.height)
      // Register the first painted tail pixel to the exact current nozzle.
      .setOrigin(release.tailX / (art.width * art.frames), art.pivotY / art.height)
      .setPosition(pose.head.x, pose.head.y).setRotation(pose.angle).setFlipY(pose.flipY)
      .setScale(release.scale).setAlpha(1 - progress * 16 / release.ticks).setVisible(true)
      .setDepth(presentationDepth('effect', 2));
  }

  public canRenderMelee(definitionId: string): boolean {
    const art = meleeEffect(definitionId);
    return art !== null && usableTextureKey(this.scene.textures, art.key) !== null;
  }

  public syncMelee(definitionId: string, progress: number | null, pose: HeadPose | null): void {
    const art = meleeEffect(definitionId);
    if (!pose || progress === null || progress < 0 || progress > 1 || !art || !usableTextureKey(this.scene.textures, art.key)) {
      this.hideMelee();
      return;
    }
    if (!this.melee) this.melee = this.scene.add.image(0, 0, art.key);
    const image = this.melee!;
    if (image.texture.key !== art.key) image.setTexture(art.key);
    const frame = Math.min(art.frames - 1, Math.floor(progress * art.frames));
    this.cropFrame(image, art, frame)
      .setPosition(pose.head.x, pose.head.y).setRotation(pose.angle).setFlipY(pose.flipY)
      .setScale(art.baseScale).setAlpha(1 - progress).setVisible(true)
      .setDepth(presentationDepth('effect', 2));
  }

  /** Crop origin is relative to the full horizontal sheet, as with actor art. */
  private cropFrame(image: Phaser.GameObjects.Image, art: WeaponEffectArt, frame: number): Phaser.GameObjects.Image {
    return image.setCrop(frame * art.width, 0, art.width, art.height)
      .setOrigin((frame * art.width + art.pivotX) / (art.width * art.frames), art.pivotY / art.height);
  }

  public endFrame(): void {
    for (const [id, entry] of this.projectiles) {
      if (!this.usedProjectiles.has(id)) {
        entry.image.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  public hideMelee(): void { this.melee?.setVisible(false); }

  public reset(): void {
    for (const entry of this.projectiles.values()) entry.image.destroy();
    this.projectiles.clear();
    this.usedProjectiles.clear();
    this.melee?.destroy();
    this.melee = null;
    this.muzzle?.destroy();
    this.muzzle = null;
    this.scope = '';
    this.lastTick = -1;
  }

  public destroy(): void { this.reset(); }
}
