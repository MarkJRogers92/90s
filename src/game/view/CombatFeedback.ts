/**
 * Combat feedback: damage numbers, blood, sparks, shake and flashes.
 *
 * The simulation already decides every hit. This class only notices the
 * results between two rendered frames — an enemy's health went down, an enemy
 * disappeared, the player's invulnerability window just opened — and turns
 * them into feedback. It keeps renderer memory only and is reset per room, so
 * nothing here can influence damage, timing or saves.
 */
import Phaser from 'phaser';
import type { EnemyState } from '../../sim/model';
import { DECAL_TEXTURE_KEYS } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { FX_TEXTURES, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import type { PointLight } from '../presentation/lighting/LightingLayer';

type Tracked = { health: number; x: number; y: number; kind: EnemyState['kind'] };

type Floater = { image: Phaser.GameObjects.Image; born: number; vx: number; vy: number };
type Spark = { image: Phaser.GameObjects.Image; born: number; vx: number; vy: number; life: number };

const MAX_DECALS = 70;
const FLOAT_TICKS = 42;

/** Pure: which enemies lost health or vanished since the last frame. */
export function diffEnemyHealth(
  previous: ReadonlyMap<string, Tracked>,
  current: readonly EnemyState[],
): { hits: Array<{ id: string; amount: number; x: number; y: number; kind: EnemyState['kind'] }>; deaths: Array<Tracked & { id: string }> } {
  const hits: Array<{ id: string; amount: number; x: number; y: number; kind: EnemyState['kind'] }> = [];
  const seen = new Set<string>();
  for (const enemy of current) {
    const id = String(enemy.id);
    seen.add(id);
    const before = previous.get(id);
    if (before && enemy.health < before.health) {
      hits.push({ id, amount: before.health - enemy.health, x: enemy.x, y: enemy.y, kind: enemy.kind });
    }
  }
  const deaths = [...previous].filter(([id]) => !seen.has(id)).map(([id, tracked]) => ({ id, ...tracked }));
  return { hits, deaths };
}

export class CombatFeedback {
  private readonly scene: Phaser.Scene;
  private scope = '';
  private tracked = new Map<string, Tracked>();
  private playerInvulnerable = 0;
  private lastTick = -1;
  private readonly floaters: Floater[] = [];
  private readonly sparks: Spark[] = [];
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly flash: Phaser.GameObjects.Rectangle;
  private flashUntil = 0;
  private pendingLights: PointLight[] = [];
  private seed = 1;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.flash = scene.add
      .rectangle(480, 300, 960, 600, 0xff1a2a, 0)
      .setScrollFactor(0)
      .setDepth(19_000)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  public sync(scope: string, tick: number, enemies: readonly EnemyState[], player: { x: number; y: number; invulnerableTicks: number }, paused: boolean): void {
    if (scope !== this.scope || tick < this.lastTick) {
      this.resetRoom(scope);
      this.snapshot(enemies);
      this.playerInvulnerable = player.invulnerableTicks;
      this.lastTick = tick;
      return;
    }
    if (!paused && tick !== this.lastTick) {
      const { hits, deaths } = diffEnemyHealth(this.tracked, enemies);
      for (const hit of hits) this.onHit(hit, tick);
      for (const death of deaths) this.onDeath(death, tick);
      if (player.invulnerableTicks > this.playerInvulnerable) this.onPlayerHurt(player, tick);
      this.snapshot(enemies);
      this.playerInvulnerable = player.invulnerableTicks;
    }
    this.lastTick = tick;
    this.animate(tick);
  }

  /** Lights spawned by this frame's feedback (hit flashes), then cleared. */
  public drainLights(): PointLight[] {
    const lights = this.pendingLights;
    this.pendingLights = [];
    return lights;
  }

  private snapshot(enemies: readonly EnemyState[]): void {
    this.tracked = new Map(enemies.map((enemy) => [String(enemy.id), { health: enemy.health, x: enemy.x, y: enemy.y, kind: enemy.kind }]));
  }

  private onHit(hit: { amount: number; x: number; y: number; kind: EnemyState['kind'] }, tick: number): void {
    const label = ensurePixelLabel(this.scene, `${hit.amount}`, hit.amount >= 3 ? '#ffd84a' : '#ffffff', 2, '#3a0010');
    const image = this.scene.add.image(hit.x + (this.random() - 0.5) * 10, hit.y - 30, label.key).setDepth(presentationDepth('prompt', 10));
    this.floaters.push({ image, born: tick, vx: (this.random() - 0.5) * 0.6, vy: -1.1 });
    this.addDecal(hit.x, hit.y, this.random() < 0.5 ? DECAL_TEXTURE_KEYS.bloodDrops : DECAL_TEXTURE_KEYS.bloodSplash, 0.9 + this.random() * 0.5, hit.kind);
    for (let i = 0; i < 6; i += 1) this.spark(hit.x, hit.y - 12, tick, hit.kind === 'spitter' ? 0x9aff6a : 0xff3a4a);
    this.pendingLights.push({ x: hit.x, y: hit.y, radius: 70, color: 0xffe0c0, intensity: 0.8 });
  }

  private onDeath(death: Tracked, tick: number): void {
    this.addDecal(death.x, death.y + 4, death.kind === 'spitter' ? DECAL_TEXTURE_KEYS.residue : DECAL_TEXTURE_KEYS.bloodPool, death.kind === 'lp_manager' ? 2.4 : 1.5, death.kind);
    this.addDecal(death.x + 14, death.y + 8, DECAL_TEXTURE_KEYS.bloodDrag, 1.2, death.kind);
    for (let i = 0; i < 18; i += 1) this.spark(death.x, death.y - 14, tick, death.kind === 'spitter' ? 0x9aff6a : 0xff2a3a);
    this.pendingLights.push({ x: death.x, y: death.y, radius: 120, color: 0xff6a4a, intensity: 0.9 });
    this.scene.cameras.main.shake(120, 0.004);
  }

  private onPlayerHurt(player: { x: number; y: number }, tick: number): void {
    this.scene.cameras.main.shake(180, 0.008);
    this.flashUntil = tick + 14;
    this.addDecal(player.x, player.y + 4, DECAL_TEXTURE_KEYS.bloodDrops, 0.8, 'hanger');
  }

  private addDecal(x: number, y: number, key: string, scale: number, kind: EnemyState['kind']): void {
    const usable = usableTextureKey(this.scene.textures, key);
    if (!usable) return;
    const decal = this.scene.add
      .image(Math.round(x), Math.round(y), usable)
      .setDepth(presentationDepth('decal', 500 + y / 10))
      .setScale(scale)
      .setRotation(this.random() * Math.PI * 2)
      .setAlpha(0.92);
    if (kind === 'spitter') decal.setTint(0xb8ff9a);
    this.decals.push(decal);
    if (this.decals.length > MAX_DECALS) this.decals.shift()?.destroy();
  }

  private spark(x: number, y: number, tick: number, color: number): void {
    const angle = this.random() * Math.PI * 2;
    const speed = 1.2 + this.random() * 2.4;
    const image = this.scene.add
      .image(x, y, FX_TEXTURES.spark)
      .setTint(color)
      .setDepth(presentationDepth('effect', 50))
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sparks.push({ image, born: tick, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, life: 16 + Math.floor(this.random() * 12) });
  }

  private animate(tick: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i]!;
      const age = tick - floater.born;
      if (age > FLOAT_TICKS) {
        floater.image.destroy();
        this.floaters.splice(i, 1);
        continue;
      }
      floater.image.x += floater.vx;
      floater.image.y += floater.vy * Math.max(0.2, 1 - age / FLOAT_TICKS);
      floater.image.setAlpha(age < 28 ? 1 : 1 - (age - 28) / 14);
      floater.image.setScale(age < 4 ? 1.4 - age * 0.1 : 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i]!;
      const age = tick - spark.born;
      if (age > spark.life) {
        spark.image.destroy();
        this.sparks.splice(i, 1);
        continue;
      }
      spark.vy += 0.18;
      spark.image.x += spark.vx;
      spark.image.y += spark.vy;
      spark.image.setAlpha(1 - age / spark.life);
    }
    const remaining = this.flashUntil - tick;
    this.flash.setFillStyle(0xff1a2a, remaining > 0 ? (remaining / 14) * 0.35 : 0);
  }

  public resetRoom(scope: string): void {
    this.scope = scope;
    this.tracked.clear();
    for (const floater of this.floaters) floater.image.destroy();
    for (const spark of this.sparks) spark.image.destroy();
    for (const decal of this.decals) decal.destroy();
    this.floaters.length = 0;
    this.sparks.length = 0;
    this.decals.length = 0;
    this.pendingLights = [];
    this.flashUntil = 0;
  }

  public destroy(): void {
    this.resetRoom('');
    this.flash.destroy();
  }
}
