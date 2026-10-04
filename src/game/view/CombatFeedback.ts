/**
 * Combat feedback: every attack that lands is exaggerated.
 *
 * The simulation already decides every hit. This class only notices the
 * results between two rendered frames — an enemy's health went down, an enemy
 * disappeared, the player's invulnerability window just opened, a telegraph
 * just went off — and turns them into feedback: a white flash and knockback
 * on the sprite, impact stars, comic words, blood, shockwaves, shake, and a
 * request to hold the frame (hit stop). It keeps renderer memory only and is
 * reset per room, so nothing here can influence damage, timing or saves.
 */
import Phaser from 'phaser';
import type { EnemyState, ProjectileState } from '../../sim/model';
import { DECAL_TEXTURE_KEYS, ENEMY_TEXTURE_KEYS, characterFrameSize } from '../presentation/assets';
import { usableTextureKey } from '../presentation/assetFallback';
import { presentationDepth } from '../presentation/depth';
import { FX_TEXTURES, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import type { PointLight } from '../presentation/lighting/LightingLayer';
import { ACTOR_DIRECTION_ORDER, directionForVector, type ActorDirection } from './ActorSpriteView';
import { MaterialImpactView, exactReactionTexture, isMaterialKind, materialHurtFrame, materialHurtTicks, materialImpactLift, type EnemyHurtFrame, type MaterialKind } from './EnemyReactionView';
import { flashAllowed, gameSettings, shakeScale, washScale } from '../settings/settings';
import { isBossKind } from '../../sim/combat/boss';
import {
  HEAVY_HIT_DAMAGE,
  HIT_REACTION_TICKS,
  REST_POSE,
  diffEnemyAttacks,
  hitReaction,
  hitStopFor,
  trackAttacks,
  type HitStopBeat,
  type LandedAttack,
  type SpritePose,
  type TrackedAttack,
} from './combatBeats';
import { DEVELOPER_DISPLAY_SIZE, DISTRICT_SPRITES, ROOFER_DISPLAY_SIZE, WALKER_DISPLAY_SIZE } from './ActorSpriteView';

type Tracked = { health: number; x: number; y: number; kind: EnemyState['kind'] };

type Floater = { image: Phaser.GameObjects.Image; born: number; vx: number; vy: number; life: number; pop: number };
type Spark = { image: Phaser.GameObjects.Image; born: number; vx: number; vy: number; life: number };
type Burst = {
  readonly kind: 'star' | 'ring' | 'shockwave' | 'splat';
  readonly x: number;
  readonly y: number;
  readonly born: number;
  readonly life: number;
  readonly radius: number;
  readonly color: number;
  readonly angle: number;
};
type Reaction = { born: number; dirX: number; dirY: number; heavy: boolean };
type Corpse = { image: Phaser.GameObjects.Image; born: number; frames: number; frameSize: number; row: number; scale: number; feetY: number; material: boolean };

const MAX_DECALS = 70;
const FLOAT_TICKS = 46;
const KILL_WORDS = ['WHAM!', 'SPLAT!', 'BONK!', 'MOPPED!', 'CLEANUP!'] as const;
const CORPSE_FRAME_TICKS = 4;
const CORPSE_HOLD_TICKS = 70;

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

function deathSheet(kind: EnemyState['kind']): string {
  return kind === 'hanger' ? ENEMY_TEXTURE_KEYS.hangerDeath
    : kind === 'spitter' ? ENEMY_TEXTURE_KEYS.spitterDeath
      : kind === 'mannequin' ? ENEMY_TEXTURE_KEYS.mannequinDeath
        : kind === 'static' ? ENEMY_TEXTURE_KEYS.staticDeath
          : kind === 'shopper' ? ENEMY_TEXTURE_KEYS.shopperDeath
            : kind === 'manager' ? ENEMY_TEXTURE_KEYS.managerDeath
              : kind === 'mascot' ? ENEMY_TEXTURE_KEYS.mascotDeath
                : kind === 'owner' ? ENEMY_TEXTURE_KEYS.ownerDeath
                  : kind === 'roofer' ? ENEMY_TEXTURE_KEYS.rooferDeath
                    : kind === 'developer' ? ENEMY_TEXTURE_KEYS.developerDeath
                    : kind === 'walker' ? ENEMY_TEXTURE_KEYS.walkerDeath
                    : kind in DISTRICT_SPRITES ? `neon:enemy:${DISTRICT_SPRITES[kind as keyof typeof DISTRICT_SPRITES].prefix}-death`
              : ENEMY_TEXTURE_KEYS.lpManagerDeath;
}

/** What spills when this kind is hit: blood, green goo, beige plastic chips, or the Hanger's blue ichor. */
function spillColor(kind: EnemyState['kind']): number {
  return kind === 'spitter' ? 0x9aff6a : kind === 'mannequin' ? 0xf0d0a8 : kind === 'static' ? 0x40e0ff : kind === 'hanger' ? 0x6a96b8 : 0xff3a4a;
}

const VIGNETTE_TEXTURE = 'fx:hurt-vignette';

/** A red frame, clear in the middle and thick at the edges. */
function ensureVignette(scene: Phaser.Scene): string {
  if (scene.textures.exists(VIGNETTE_TEXTURE)) return VIGNETTE_TEXTURE;
  const canvas = scene.textures.createCanvas(VIGNETTE_TEXTURE, 320, 200);
  if (!canvas) return VIGNETTE_TEXTURE;
  const context = canvas.getContext();
  const gradient = context.createRadialGradient(160, 100, 60, 160, 100, 190);
  gradient.addColorStop(0, 'rgba(255, 20, 40, 0)');
  gradient.addColorStop(0.55, 'rgba(255, 20, 40, 0.25)');
  gradient.addColorStop(1, 'rgba(160, 0, 20, 0.9)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 200);
  canvas.refresh();
  return VIGNETTE_TEXTURE;
}

export class CombatFeedback {
  private readonly scene: Phaser.Scene;
  private scope = '';
  private tracked = new Map<string, Tracked>();
  private attacks = new Map<string, TrackedAttack>();
  private playerInvulnerable = 0;
  private playerHealth = 0;
  private lastTick = -1;
  private readonly floaters: Floater[] = [];
  private readonly sparks: Spark[] = [];
  private readonly bursts: Burst[] = [];
  private readonly corpses: Corpse[] = [];
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly reactions = new Map<string, Reaction>();
  private readonly hurts = new Map<string, { born: number; direction: ActorDirection; kind: MaterialKind }>();
  /** One impact view per material, made on its first hit (roadmap V1). */
  private readonly materialImpacts = new Map<MaterialKind, MaterialImpactView>();
  private facingFor: (id: string) => ActorDirection = () => 'south';
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly vignette: Phaser.GameObjects.Image;
  private vignetteUntil = 0;
  private readonly impacts: Phaser.GameObjects.Graphics;
  private flashUntil = 0;
  private flashStrength = 0.35;
  private pendingLights: PointLight[] = [];
  private pendingHitStop = 0;
  private lastEnemyShots: Array<{ x: number; y: number }> = [];
  private playerHurtTick: number | null = null;
  private landed: LandedAttack[] = [];
  private seed = 1;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.flash = scene.add
      .rectangle(480, 300, 960, 600, 0xff1a2a, 0)
      .setScrollFactor(0)
      .setDepth(19_000)
      .setBlendMode(Phaser.BlendModes.ADD);
    // Getting hurt reddens the screen edges hard but keeps the middle, where
    // the janitor is, readable through the held frame.
    this.vignette = scene.add
      .image(480, 300, ensureVignette(scene))
      .setDisplaySize(960, 600)
      .setScrollFactor(0)
      .setDepth(19_001)
      .setAlpha(0);
    this.impacts = scene.add.graphics().setDepth(presentationDepth('effect', 80));
  }

  /** Camera shake, scaled by the player's comfort setting (off = none). */
  private shake(duration: number, intensity: number): void {
    const scale = shakeScale(gameSettings().get());
    if (scale > 0) this.scene.cameras.main.shake(duration, intensity * scale);
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  public sync(
    scope: string,
    tick: number,
    enemies: readonly EnemyState[],
    player: { x: number; y: number; invulnerableTicks: number; health: number },
    paused: boolean,
    projectiles: readonly ProjectileState[] = [],
    facingFor: (id: string) => ActorDirection = () => 'south',
  ): void {
    this.facingFor = facingFor;
    if (scope !== this.scope || tick < this.lastTick) {
      this.resetRoom(scope);
      this.snapshot(enemies, projectiles);
      this.playerInvulnerable = player.invulnerableTicks;
      this.playerHealth = player.health;
      this.lastTick = tick;
      return;
    }
    this.landed = [];
    if (!paused && tick !== this.lastTick) {
      // A pooled id with a new kind is a fresh actor, not a hit or attack release.
      for (const enemy of enemies) {
        const id = String(enemy.id), previous = this.tracked.get(id);
        if (previous && previous.kind !== enemy.kind) {
          this.tracked.delete(id);
          this.attacks.delete(id);
          this.hurts.delete(`enemy:${id}`);
          this.reactions.delete(`enemy:${id}`);
        }
      }
      const beats: HitStopBeat[] = [];
      const { hits, deaths } = diffEnemyHealth(this.tracked, enemies);
      for (const hit of hits) beats.push(this.onHit(hit, player, tick));
      for (const death of deaths) beats.push(this.onDeath(death, player, tick));
      this.landed = diffEnemyAttacks(this.attacks, enemies);
      for (const attack of this.landed) {
        const beat = this.onEnemyAttack(attack, tick);
        if (beat) beats.push(beat);
      }
      if (player.invulnerableTicks > this.playerInvulnerable) {
        beats.push(this.onPlayerHurt(player, Math.max(1, this.playerHealth - player.health), enemies, tick));
      }
      this.pendingHitStop = Math.max(this.pendingHitStop, hitStopFor(beats));
      this.snapshot(enemies, projectiles);
      this.playerInvulnerable = player.invulnerableTicks;
      this.playerHealth = player.health;
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

  /** Milliseconds the clock should hold for the beats seen since the last call. */
  public takeHitStop(): number {
    const hold = this.pendingHitStop;
    this.pendingHitStop = 0;
    return hold;
  }

  /** Enemy attacks that went off on the latest synced tick. */
  public landedAttacks(): readonly LandedAttack[] {
    return this.landed;
  }

  /**
   * The last-heart pulse: the red edge swells on each heartbeat and ebbs
   * between them. Layered over (never under) a fresh hurt vignette.
   */
  public heartbeat(active: boolean, sinceBeatMs: number): void {
    if (!active) return;
    const pulse = (0.18 + 0.32 * Math.max(0, 1 - sinceBeatMs / 420)) * washScale(gameSettings().get());
    this.vignette.setAlpha(Math.max(this.vignette.alpha, pulse));
  }

  /** A scuff of dust kicked up where a dash starts. */
  public puff(x: number, y: number, tick: number, dirX: number, dirY: number): void {
    for (let i = 0; i < 9; i += 1) this.spark(x, y, tick, 0xd8d0e8, -dirX, -dirY);
    this.bursts.push({ kind: 'ring', x, y, born: tick, life: 10, radius: 26, color: 0x9ad8ff, angle: 0 });
  }

  /** Ticks since the janitor was last hurt in this room, or null. */
  public playerHurtAge(tick: number): number | null {
    return this.playerHurtTick === null ? null : tick - this.playerHurtTick;
  }

  /** The drawing pose for an actor that was just struck (or rest). */
  public poseFor(id: string, tick: number): SpritePose {
    if (this.hurtFor(id, tick)) return REST_POSE;
    const reaction = this.reactions.get(id);
    if (!reaction) return REST_POSE;
    const age = tick - reaction.born;
    if (age >= HIT_REACTION_TICKS) {
      this.reactions.delete(id);
      return REST_POSE;
    }
    return hitReaction(age, reaction.dirX, reaction.dirY, reaction.heavy);
  }

  /** A visual flinch only; attack telegraphs retain priority over the hurt strip. */
  public hurtFor(id: string, tick: number, attacking = false): EnemyHurtFrame | null {
    const hurt = this.hurts.get(id);
    if (!hurt) return null;
    const age = tick - hurt.born;
    if (age < 0 || age >= materialHurtTicks(hurt.kind)) { this.hurts.delete(id); return null; }
    return attacking ? null : materialHurtFrame(this.scene.textures, hurt.kind, age, hurt.direction);
  }

  private impactView(kind: MaterialKind): MaterialImpactView {
    let view = this.materialImpacts.get(kind);
    if (!view) { view = new MaterialImpactView(this.scene, kind); this.materialImpacts.set(kind, view); }
    return view;
  }

  private snapshot(enemies: readonly EnemyState[], projectiles: readonly ProjectileState[]): void {
    this.tracked = new Map(enemies.map((enemy) => [String(enemy.id), { health: enemy.health, x: enemy.x, y: enemy.y, kind: enemy.kind }]));
    this.attacks = trackAttacks(enemies);
    this.lastEnemyShots = projectiles.filter((shot) => shot.faction === 'enemy').map((shot) => ({ x: shot.x, y: shot.y }));
  }

  private word(text: string, x: number, y: number, tick: number, color: string, scale: number, life = FLOAT_TICKS): void {
    const label = ensurePixelLabel(this.scene, text, color, scale, '#1a0008');
    const image = this.scene.add.image(Math.round(x), Math.round(y), label.key).setDepth(presentationDepth('prompt', 20)).setRotation((this.random() - 0.5) * 0.3);
    this.floaters.push({ image, born: tick, vx: (this.random() - 0.5) * 0.4, vy: -0.7, life, pop: 1.9 });
  }

  private onHit(
    hit: { id: string; amount: number; x: number; y: number; kind: EnemyState['kind'] },
    player: { x: number; y: number },
    tick: number,
  ): HitStopBeat {
    const heavy = hit.amount >= HEAVY_HIT_DAMAGE;
    const dirX = hit.x - player.x;
    const dirY = hit.y - player.y;
    const length = Math.hypot(dirX, dirY) || 1;
    this.reactions.set(`enemy:${hit.id}`, { born: tick, dirX, dirY, heavy });
    if (isMaterialKind(hit.kind)) {
      const id = `enemy:${hit.id}`;
      this.hurts.set(id, { born: tick, direction: this.facingFor(id), kind: hit.kind });
    }
    // The impact lands on the side of the body facing the janitor.
    const ix = hit.x - (dirX / length) * 10;
    const iy = hit.y - 16 - (dirY / length) * 6;
    const label = ensurePixelLabel(this.scene, heavy ? `${hit.amount}!` : `${hit.amount}`, heavy ? '#ffd84a' : '#ffffff', 3, '#3a0010');
    const image = this.scene.add.image(hit.x + (this.random() - 0.5) * 14, hit.y - 44, label.key).setDepth(presentationDepth('prompt', 10));
    this.floaters.push({ image, born: tick, vx: (dirX / length) * 0.9 + (this.random() - 0.5) * 0.5, vy: -1.5, life: FLOAT_TICKS, pop: heavy ? 2.2 : 1.7 });
    if (isMaterialKind(hit.kind)) {
      // Every enemy chips its own material (plastic, CRT glass, chitin, sweat, tar, ice...),
      // centred on the body: HP differences identify a hit, not its source.
      this.impactView(hit.kind).spawn(hit.x, hit.y - materialImpactLift(hit.kind), tick);
    } else {
      const blood = spillColor(hit.kind);
      this.bursts.push({ kind: 'star', x: ix, y: iy, born: tick, life: heavy ? 9 : 7, radius: heavy ? 34 : 24, color: blood, angle: this.random() * Math.PI });
      this.bursts.push({ kind: 'ring', x: ix, y: iy, born: tick, life: 12, radius: heavy ? 46 : 32, color: 0xffffff, angle: 0 });
      this.addDecal(hit.x + (dirX / length) * 14, hit.y + (dirY / length) * 8, this.random() < 0.5 ? DECAL_TEXTURE_KEYS.bloodDrops : DECAL_TEXTURE_KEYS.bloodSplash, 1.7 + this.random() * 0.7, hit.kind);
      // Spray carries on through the enemy, away from the swing.
      for (let i = 0; i < (heavy ? 16 : 10); i += 1) this.spark(ix, iy, tick, blood, dirX / length, dirY / length);
      this.pendingLights.push({ x: ix, y: iy, radius: heavy ? 120 : 90, color: 0xfff0d8, intensity: 1 });
    }
    this.shake(heavy ? 110 : 70, heavy ? 0.006 : 0.0035);
    return { kind: 'hit', heavy };
  }

  private onDeath(death: Tracked & { id: string }, player: { x: number; y: number }, tick: number): HitStopBeat {
    const boss = isBossKind(death.kind);
    const blood = spillColor(death.kind);
    if (death.kind === 'mannequin') this.impactView('mannequin').spawn(death.x, death.y - 18, tick, true);
    else if (death.kind === 'static') this.impactView('static').spawn(death.x, death.y - 43, tick, true);
    else {
      this.addDecal(death.x, death.y + 4, death.kind === 'spitter' ? DECAL_TEXTURE_KEYS.residue : DECAL_TEXTURE_KEYS.bloodPool, boss ? 3.6 : 2.6, death.kind);
      this.addDecal(death.x + 14, death.y + 8, DECAL_TEXTURE_KEYS.bloodDrag, 2, death.kind);
      this.addDecal(death.x - 18, death.y - 4, DECAL_TEXTURE_KEYS.bloodSplash, 1.8, death.kind);
      for (let i = 0; i < (boss ? 60 : 28); i += 1) this.spark(death.x, death.y - 14, tick, blood);
      for (let i = 0; i < 8; i += 1) this.spark(death.x, death.y - 14, tick, 0xffffff);
      this.bursts.push({ kind: 'splat', x: death.x, y: death.y - 16, born: tick, life: 14, radius: boss ? 110 : 56, color: blood, angle: this.random() * Math.PI });
      this.bursts.push({ kind: 'shockwave', x: death.x, y: death.y, born: tick, life: boss ? 34 : 18, radius: boss ? 260 : 90, color: 0xffffff, angle: 0 });
      this.pendingLights.push({ x: death.x, y: death.y, radius: boss ? 320 : 150, color: 0xff6a4a, intensity: 1 });
    }
    const word = boss ? 'CLOSING TIME!' : death.kind === 'mannequin' ? 'CRACK!' : death.kind === 'static' ? 'SHORTED!' : KILL_WORDS[Math.floor(this.random() * KILL_WORDS.length)]!;
    this.word(word, death.x, death.y - 70, tick, boss ? '#ffd84a' : '#ff5a8a', boss ? 5 : 3, boss ? 110 : FLOAT_TICKS + 10);
    this.spawnCorpse(death, player, tick);
    this.hurts.delete(`enemy:${death.id}`);
    this.reactions.delete(`enemy:${death.id}`);
    this.shake(boss ? 600 : 160, boss ? 0.02 : 0.008);
    if (boss) {
      this.flashUntil = tick + 30;
      this.flashStrength = 0.5;
    }
    return { kind: 'kill', boss };
  }

  /** Plays the enemy's death animation where it fell, then leaves the body a moment. */
  private spawnCorpse(death: Tracked & { id: string }, player: { x: number; y: number }, tick: number): void {
    const key = usableTextureKey(this.scene.textures, deathSheet(death.kind));
    if (!key || key !== deathSheet(death.kind)) return;
    if ((death.kind === 'mannequin' || death.kind === 'static') && !exactReactionTexture(this.scene.textures, key, 672, 768)) return;
    const source = this.scene.textures.get(key).getSourceImage() as { width: number; height: number };
    const frameSize = characterFrameSize(source.height, 8);
    const frames = Math.max(1, Math.round(source.width / frameSize));
    // Material art retains its last displayed facing; HP/removal diffs contain no hit source.
    const material = death.kind === 'mannequin' || death.kind === 'static';
    const direction = material
      ? this.facingFor(`enemy:${death.id}`)
      : directionForVector(player.x - death.x, player.y - death.y, 'south');
    const row = ACTOR_DIRECTION_ORDER.indexOf(direction);
    // Death canvases are grown copies of the 64px idle canvas, centred on it,
    // so pixel scale and the feet row come from the idle frame.
    // The mannequin and the upper-floor cast are 96 px PixelLab canvases.
    const bigCanvas = death.kind === 'mannequin' || death.kind === 'static' || death.kind === 'shopper' || death.kind === 'manager' || death.kind === 'mascot' || death.kind === 'owner';
    // The Mall Walker (round 48) is a 92 px canvas, drawn at shopper scale.
    const district = death.kind in DISTRICT_SPRITES ? DISTRICT_SPRITES[death.kind as keyof typeof DISTRICT_SPRITES] : null;
    const idleFrame = district ? district.canvas : death.kind === 'walker' ? 92 : death.kind === 'developer' ? 180 : death.kind === 'roofer' ? 136 : death.kind === 'owner' ? 128 : bigCanvas ? 96 : 64;
    const shown = district ? district.displaySize : death.kind === 'developer' ? DEVELOPER_DISPLAY_SIZE : death.kind === 'roofer' ? ROOFER_DISPLAY_SIZE : death.kind === 'owner' ? 150 : isBossKind(death.kind) ? 128 : death.kind === 'mascot' ? 92 : death.kind === 'shopper' ? 76 : death.kind === 'walker' ? WALKER_DISPLAY_SIZE : bigCanvas ? 72 : 64;
    const scale = shown / idleFrame;
    const feetY = (frameSize - idleFrame) / 2 + idleFrame * 0.84;
    const image = this.scene.add.image(death.x, death.y, key).setDepth(presentationDepth('actor', death.y - 1)).setScale(scale);
    this.corpses.push({ image, born: tick, frames, frameSize, row, scale, feetY, material });
    this.placeCorpse(this.corpses.at(-1)!, 0);
  }

  private placeCorpse(corpse: Corpse, frame: number): void {
    const { image, frameSize, row } = corpse;
    image.setCrop(frame * frameSize, row * frameSize, frameSize, frameSize);
    image.setOrigin((frame * frameSize + frameSize / 2) / image.width, (row * frameSize + corpse.feetY) / image.height);
  }

  private onEnemyAttack(attack: LandedAttack, tick: number): HitStopBeat | null {
    if (attack.kind === 'slam') {
      // The slam goes off whether or not it connects; the floor should feel it.
      this.bursts.push({ kind: 'shockwave', x: attack.x, y: attack.y, born: tick, life: 22, radius: 150, color: 0xffd84a, angle: 0 });
      this.bursts.push({ kind: 'shockwave', x: attack.x, y: attack.y, born: tick + 3, life: 22, radius: 100, color: 0xff4a3a, angle: 0 });
      this.bursts.push({ kind: 'star', x: attack.x, y: attack.y, born: tick, life: 10, radius: 70, color: 0xffd84a, angle: this.random() * Math.PI });
      this.addDecal(attack.x, attack.y + 6, DECAL_TEXTURE_KEYS.scorch, 2.8, 'lp_manager');
      for (let i = 0; i < 24; i += 1) this.spark(attack.x, attack.y, tick, i % 2 ? 0xd8c8a8 : 0xffd84a);
      this.pendingLights.push({ x: attack.x, y: attack.y, radius: 220, color: 0xffd84a, intensity: 1 });
      this.shake(260, 0.014);
      this.reactions.set(`enemy:${attack.id}`, { born: tick, dirX: 0, dirY: 1, heavy: true });
      this.word('SLAM!', attack.x, attack.y - 110, tick, '#ffd84a', 4);
      return { kind: 'slam' };
    }
    if (attack.kind === 'quake') {
      const owner = this.attacks.get(attack.id)?.kind === 'owner';
      this.bursts.push({ kind: 'shockwave', x: attack.x, y: attack.y, born: tick, life: 24, radius: owner ? 240 : 120, color: 0xff8a3a, angle: 0 });
      this.bursts.push({ kind: 'star', x: attack.x, y: attack.y - 20, born: tick, life: 10, radius: owner ? 90 : 50, color: 0xffd84a, angle: this.random() * Math.PI });
      for (let i = 0; i < (owner ? 26 : 12); i += 1) this.spark(attack.x, attack.y, tick, i % 2 ? 0xd8c8a8 : 0x2ad8c8);
      this.shake(owner ? 520 : 240, owner ? 0.022 : 0.012);
      this.word('CRASH!', attack.x, attack.y - (owner ? 110 : 70), tick, '#ff8a3a', owner ? 4 : 3);
      return { kind: 'slam' };
    }
    if (attack.kind === 'volley') {
      this.bursts.push({ kind: 'ring', x: attack.x + attack.aimX * 30, y: attack.y - 30 + attack.aimY * 30, born: tick, life: 12, radius: 60, color: 0xff3fc8, angle: 0 });
      this.pendingLights.push({ x: attack.x, y: attack.y - 30, radius: 160, color: 0xff3fc8, intensity: 1 });
      this.shake(120, 0.006);
      return null;
    }
    // A spit: the mouth bursts and the body recoils away from the shot.
    const mx = attack.x + attack.aimX * 22;
    const my = attack.y - 24 + attack.aimY * 16;
    this.bursts.push({ kind: 'splat', x: mx, y: my, born: tick, life: 9, radius: 26, color: 0xff3fc8, angle: this.random() * Math.PI });
    for (let i = 0; i < 8; i += 1) this.spark(mx, my, tick, 0xff5ad8, attack.aimX, attack.aimY);
    this.pendingLights.push({ x: mx, y: my, radius: 90, color: 0xff3fc8, intensity: 1 });
    this.reactions.set(`enemy:${attack.id}`, { born: tick, dirX: -attack.aimX, dirY: -attack.aimY, heavy: false });
    return null;
  }

  private onPlayerHurt(
    player: { x: number; y: number },
    amount: number,
    enemies: readonly EnemyState[],
    tick: number,
  ): HitStopBeat {
    // Whatever hit the janitor is the nearest enemy or enemy shot of the last frame.
    let source: { x: number; y: number } | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of [...this.lastEnemyShots, ...enemies.filter((enemy) => enemy.health > 0)]) {
      const distance = Math.hypot(candidate.x - player.x, candidate.y - player.y);
      if (distance < best) {
        best = distance;
        source = candidate;
      }
    }
    const dirX = source ? player.x - source.x : 0;
    const dirY = source ? player.y - source.y : 1;
    this.reactions.set('player', { born: tick, dirX, dirY, heavy: true });
    this.playerHurtTick = tick;
    const length = Math.hypot(dirX, dirY) || 1;
    const ix = player.x - (dirX / length) * 12;
    const iy = player.y - 18 - (dirY / length) * 8;
    this.bursts.push({ kind: 'star', x: ix, y: iy, born: tick, life: 11, radius: 40, color: 0xff2a3a, angle: this.random() * Math.PI });
    this.bursts.push({ kind: 'shockwave', x: player.x, y: player.y, born: tick, life: 16, radius: 80, color: 0xff2a3a, angle: 0 });
    for (let i = 0; i < 18; i += 1) this.spark(ix, iy, tick, 0xff2a3a, dirX / length, dirY / length);
    this.shake(300, 0.016);
    this.flashUntil = tick + 10;
    this.flashStrength = 0.14;
    this.vignetteUntil = tick + 40;
    const label = ensurePixelLabel(this.scene, `-${amount}`, '#ff4a5a', 4, '#1a0006');
    const image = this.scene.add.image(player.x, player.y - 56, label.key).setDepth(presentationDepth('prompt', 30));
    this.floaters.push({ image, born: tick, vx: 0, vy: -1.2, life: FLOAT_TICKS + 8, pop: 2 });
    this.word(amount >= 2 ? 'CRUNCH!' : 'OUCH!', player.x + (dirX >= 0 ? 96 : -96), player.y - 70, tick, '#ffffff', 3);
    this.addDecal(player.x, player.y + 4, DECAL_TEXTURE_KEYS.bloodDrops, 1.2, 'hanger');
    this.pendingLights.push({ x: player.x, y: player.y, radius: 140, color: 0xff2a3a, intensity: 1 });
    return { kind: 'playerHurt' };
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
    // Fresh blood reads bright under the mall lights, even on the red food-court tile.
    decal.setTint(kind === 'spitter' ? 0xc8ff9a : kind === 'mannequin' ? 0xf0dcc0 : kind === 'hanger' ? 0x7fb0d0 : isBossKind(kind) && key === DECAL_TEXTURE_KEYS.scorch ? 0x9a8a70 : 0xff8a8a);
    this.decals.push(decal);
    if (this.decals.length > MAX_DECALS) this.decals.shift()?.destroy();
  }

  /** A spark; with a direction it sprays in a 100-degree cone along it. */
  private spark(x: number, y: number, tick: number, color: number, dirX?: number, dirY?: number): void {
    const angle = dirX !== undefined && dirY !== undefined
      ? Math.atan2(dirY, dirX) + (this.random() - 0.5) * 1.75
      : this.random() * Math.PI * 2;
    const speed = 1.6 + this.random() * 3.4;
    const image = this.scene.add
      .image(x, y, FX_TEXTURES.spark)
      .setTint(color)
      .setScale(1 + this.random())
      .setDepth(presentationDepth('effect', 50))
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sparks.push({ image, born: tick, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, life: 16 + Math.floor(this.random() * 14) });
  }

  private drawBursts(tick: number): void {
    const g = this.impacts;
    g.clear();
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i]!;
      const age = tick - burst.born;
      if (age < 0) continue;
      if (age > burst.life) {
        this.bursts.splice(i, 1);
        continue;
      }
      const t = age / burst.life;
      const fade = 1 - t;
      if (burst.kind === 'star') {
        // A comic impact star: it pops to full size in two ticks, then shrinks.
        const size = burst.radius * (age < 2 ? 0.6 + age * 0.4 : 1.2 - t * 0.6);
        const points: Phaser.Math.Vector2[] = [];
        for (let p = 0; p < 16; p += 1) {
          const a = burst.angle + (p * Math.PI) / 8;
          const r = p % 2 === 0 ? size : size * 0.42;
          points.push(new Phaser.Math.Vector2(burst.x + Math.cos(a) * r, burst.y + Math.sin(a) * r * 0.85));
        }
        g.fillStyle(burst.color, 0.9 * fade).fillPoints(points, true);
        const inner = points.map((point) => new Phaser.Math.Vector2(burst.x + (point.x - burst.x) * 0.6, burst.y + (point.y - burst.y) * 0.6));
        g.fillStyle(0xffffff, fade).fillPoints(inner, true);
      } else if (burst.kind === 'ring') {
        g.lineStyle(Math.max(1, 6 * fade), burst.color, fade).strokeCircle(burst.x, burst.y, burst.radius * (0.3 + 0.7 * Math.sqrt(t)));
      } else if (burst.kind === 'shockwave') {
        // Flattened to sit on the floor.
        const r = burst.radius * Math.sqrt(t);
        g.lineStyle(Math.max(1, 10 * fade), burst.color, 0.85 * fade).strokeEllipse(burst.x, burst.y, r * 2, r * 1.1);
        g.lineStyle(Math.max(1, 3 * fade), 0xffffff, fade).strokeEllipse(burst.x, burst.y, r * 1.7, r * 0.93);
      } else {
        // Splat: uneven blobs thrown outward.
        for (let p = 0; p < 9; p += 1) {
          const a = burst.angle + p * 0.7;
          const reach = burst.radius * (0.35 + 0.65 * Math.sqrt(t)) * (0.6 + ((p * 37) % 10) / 20);
          g.fillStyle(burst.color, fade).fillCircle(burst.x + Math.cos(a) * reach, burst.y + Math.sin(a) * reach * 0.8, (burst.radius / 7) * fade + 2);
        }
        g.fillStyle(0xffffff, fade * (age < 3 ? 1 : 0)).fillCircle(burst.x, burst.y, burst.radius * 0.4);
      }
    }
  }

  private animate(tick: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i]!;
      const age = tick - floater.born;
      if (age > floater.life) {
        floater.image.destroy();
        this.floaters.splice(i, 1);
        continue;
      }
      floater.image.x += floater.vx;
      floater.image.y += floater.vy * Math.max(0.15, 1 - age / floater.life);
      const fadeFrom = floater.life - 14;
      floater.image.setAlpha(age < fadeFrom ? 1 : 1 - (age - fadeFrom) / 14);
      // Pop in oversized, overshoot, settle.
      const pop = age < 5 ? floater.pop - ((floater.pop - 0.9) * age) / 5 : age < 9 ? 0.9 + (age - 5) * 0.025 : 1;
      floater.image.setScale(pop);
    }
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i]!;
      const age = tick - spark.born;
      if (age > spark.life) {
        spark.image.destroy();
        this.sparks.splice(i, 1);
        continue;
      }
      spark.vy += 0.2;
      spark.vx *= 0.96;
      spark.image.x += spark.vx;
      spark.image.y += spark.vy;
      spark.image.setAlpha(1 - age / spark.life);
    }
    for (let i = this.corpses.length - 1; i >= 0; i -= 1) {
      const corpse = this.corpses[i]!;
      const age = tick - corpse.born;
      const playTicks = corpse.frames * CORPSE_FRAME_TICKS;
      if (age > playTicks + CORPSE_HOLD_TICKS) {
        corpse.image.destroy();
        this.corpses.splice(i, 1);
        continue;
      }
      this.placeCorpse(corpse, Math.min(corpse.frames - 1, Math.floor(age / CORPSE_FRAME_TICKS)));
      if (!corpse.material && age < 3 && flashAllowed(gameSettings().get())) corpse.image.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else corpse.image.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      corpse.image.setAlpha(age < playTicks + CORPSE_HOLD_TICKS - 24 ? 1 : (playTicks + CORPSE_HOLD_TICKS - age) / 24);
    }
    for (const view of this.materialImpacts.values()) view.sync(tick);
    this.drawBursts(tick);
    const settings = gameSettings().get();
    const remaining = this.flashUntil - tick;
    // Reduced flashes: no full-screen flash at all, and a gentler red edge.
    this.flash.setFillStyle(0xff1a2a, remaining > 0 && flashAllowed(settings) ? (remaining / 10) * this.flashStrength : 0);
    const edge = this.vignetteUntil - tick;
    this.vignette.setAlpha(edge > 0 ? Math.min(1, edge / 24) * washScale(settings) : 0);
  }

  public resetRoom(scope: string): void {
    this.scope = scope;
    this.tracked.clear();
    this.attacks.clear();
    this.reactions.clear();
    this.hurts.clear();
    for (const view of this.materialImpacts.values()) view.reset();
    for (const floater of this.floaters) floater.image.destroy();
    for (const spark of this.sparks) spark.image.destroy();
    for (const decal of this.decals) decal.destroy();
    for (const corpse of this.corpses) corpse.image.destroy();
    this.floaters.length = 0;
    this.sparks.length = 0;
    this.decals.length = 0;
    this.bursts.length = 0;
    this.corpses.length = 0;
    this.impacts.clear();
    this.pendingLights = [];
    this.pendingHitStop = 0;
    this.lastEnemyShots = [];
    this.playerHurtTick = null;
    this.landed = [];
    this.flashUntil = 0;
    this.vignetteUntil = 0;
    this.vignette.setAlpha(0);
  }

  public destroy(): void {
    this.resetRoom('');
    this.flash.destroy();
    this.vignette.destroy();
    this.impacts.destroy();
    for (const view of this.materialImpacts.values()) view.destroy();
    this.materialImpacts.clear();
  }
}
