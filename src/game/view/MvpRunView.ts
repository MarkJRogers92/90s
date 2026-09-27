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
import { presentationDepth } from '../presentation/depth';
import { usableTextureKey } from '../presentation/assetFallback';
import {
  ACTOR_DEATH_EFFECT_TICKS,
  ActorDeathEffectLifecycle,
  ActorMovementMemory,
  ActorPresentationMemory,
  ActorSpriteView,
  actorFrameFor,
  actorPresentation,
  actorTextureKey,
  type ActorDirection,
  type ActorSnapshot,
  type SpriteSpec,
} from './ActorSpriteView';
import { MallRoomView } from './MallRoomView';
import { CombatFeedback } from './CombatFeedback';
import { enemySpriteSheet } from './ActorSpriteView';
import { itemIconKey } from '../presentation/assets';
import { FX_TEXTURES, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import type { ConcourseAmbienceSnapshot } from './ConcourseAmbience';
import { shouldDrawDirectAttackArc } from './visualState';

type ActorFrameEvidence = {
  readonly spriteActive: boolean;
  readonly vectorFallbackActive: boolean;
  readonly textureKey: string;
  readonly direction: ActorDirection;
  readonly frame: { readonly row: number; readonly column: number };
  readonly walking: boolean;
  readonly damageFlicker: boolean;
  readonly damageCueVisible: boolean;
  readonly damageCueDepth: number | null;
  readonly lungeCueVisible: boolean;
  readonly lungeCueDepth: number | null;
  readonly actorDepth: number;
};

export type ActorPresentationDebugSnapshot = {
  readonly player: (ActorFrameEvidence & { readonly mopArcVisible: boolean; readonly mopArcDepth: number | null }) | null;
  readonly hangers: Array<ActorFrameEvidence & { readonly id: string }>;
  readonly telegraphs: Array<{ readonly id: string; readonly visible: boolean; readonly effectDepth: number }>;
  readonly activeDeathEffectCount: number;
  readonly depthBands: { readonly tallForeground: number; readonly effect: number };
};

export class MvpRunView {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly effectGraphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Image>();
  private readonly actorMemory = new ActorPresentationMemory();
  private readonly actorMovement = new ActorMovementMemory();
  private readonly deathEffects = new ActorDeathEffectLifecycle();
  private readonly actorSprites = new Map<string, ActorSpriteView>();
  private readonly usedActorSpriteIds = new Set<string>();
  private openingConcourse: MallRoomView | undefined;
  private mallRoomKey = '';
  private readonly feedback: CombatFeedback;
  private readonly offerIcons = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedOfferIcons = new Set<string>();
  private readonly storeGraphics: Phaser.GameObjects.Graphics;
  private readonly tokenSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly shadows = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedShadows = new Set<string>();
  private concourseAmbience: ConcourseAmbienceSnapshot | null = null;
  private actorDebug: ActorPresentationDebugSnapshot = this.emptyActorDebug();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.effectGraphics = scene.add.graphics().setDepth(presentationDepth('effect', 1));
    this.feedback = new CombatFeedback(scene);
    this.storeGraphics = scene.add.graphics().setDepth(presentationDepth('decal', 800));
  }

  public sync(state: MvpRunState): void {
    const graphics = this.graphics;
    const room = state.wing.rooms[state.roomIndex];
    if (!room) {
      return;
    }
    const roomKey = `${state.roomIndex}:${room.id}`;
    if (this.openingConcourse && this.mallRoomKey !== roomKey) {
      this.concourseAmbience = this.openingConcourse.leaveRoom(state.tick);
      this.openingConcourse.destroy();
      this.openingConcourse = undefined;
    }
    if (!this.openingConcourse) {
      this.openingConcourse = new MallRoomView(this.scene, graphics, state);
      this.mallRoomKey = roomKey;
    }
    this.openingConcourse.render(state);
    if (room.id === 'service_corridor') {
      this.concourseAmbience = this.openingConcourse.ambienceSnapshot();
    }
    graphics.clear();
    this.effectGraphics.clear();
    this.storeGraphics.clear();
    this.usedActorSpriteIds.clear();
    this.usedShadows.clear();
    this.usedOfferIcons.clear();

    if (room.store) {
      this.drawStore(state, room.store.templateId);
    }

    if (room.benchKiosk) {
      const pulse = 0.35 + 0.25 * Math.sin(state.tick / 12);
      this.effectGraphics.lineStyle(2, 0x6aff8a, pulse);
      this.effectGraphics.strokeEllipse(room.benchKiosk.x, room.benchKiosk.y + 24, 96, 30);
      this.openingConcourse?.addLight({ x: room.benchKiosk.x, y: room.benchKiosk.y, radius: 90, color: 0x9aff9a, intensity: 0.55 + pulse * 0.4 });
      this.setLabel('bench', 'BENCH WARRANT', room.benchKiosk.x - 40, room.benchKiosk.y - 58);
    } else {
      this.clearLabel('bench');
    }

    const opening = this.openingConcourse;
    opening?.beginFrame();
    const actorScope = `${state.roomIndex}:${room.id}`;
    if (this.actorMovement.beginScope(actorScope)) this.actorMemory.reset();
    this.deathEffects.sync(
      actorScope,
      state.tick,
      state.room.combat.enemies.map((enemy) => ({ id: `enemy:${enemy.id}`, x: enemy.x, y: enemy.y })),
    );
    for (const patch of state.room.combat.surfaces) {
      this.drawSurfacePatch(patch, opening?.effectGraphics(`patch:${patch.id}`) ?? this.effectGraphics);
    }

    const hangerEvidence: ActorPresentationDebugSnapshot['hangers'] = [];
    const telegraphs: ActorPresentationDebugSnapshot['telegraphs'] = [];
    for (const enemy of state.room.combat.enemies) {
      const body = opening?.actorGraphics(`enemy:${enemy.id}`, enemy.y) ?? graphics;
      const effects = opening?.effectGraphics(`enemy:${enemy.id}`) ?? this.effectGraphics;
      const enemyDelta = this.actorMovement.movementFor(`enemy:${enemy.id}`, enemy.x, enemy.y);
      const actorDepth = presentationDepth('actor', enemy.y);
      // Stationary spitters turn to face the janitor; everyone else faces their motion.
      const player0 = state.room.combat.player;
      const facing = enemy.kind === 'spitter'
        ? { x: (player0.x - enemy.x) * 1e-3, y: (player0.y - enemy.y) * 1e-3 }
        : enemyDelta;
      const enemySnapshot: ActorSnapshot = {
        id: `enemy:${enemy.id}`, kind: enemy.kind === 'lp_manager' ? 'lp_manager' : enemy.kind,
        x: enemy.x, y: enemy.y, moveX: facing.x, moveY: facing.y,
        attackTicks: 0, damaged: false, phase: enemy.phase,
      };
      const sprite = this.syncActorSprite(enemySnapshot, state.tick, actorDepth);
      const spriteActive = sprite.spriteActive;
      this.drawActorEffectCues(enemySnapshot, sprite, effects);
      if (enemy.kind === 'hanger') {
        hangerEvidence.push({ id: `enemy:${enemy.id}`, ...sprite });
      }
      this.contactShadow(`enemy:${enemy.id}`, enemy.x, enemy.y, enemy.kind === 'lp_manager' ? 2.2 : 1.2);
      if (enemy.phase === 'telegraph') {
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y, radius: enemy.kind === 'lp_manager' ? 190 : 80, color: 0xffd84a, intensity: 0.75 });
      } else if (enemy.kind === 'lp_manager') {
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 20, radius: 110, color: 0xff3a4a, intensity: 0.45 });
      } else {
        // A faint sick underglow keeps every threat readable in the darker rooms.
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 8, radius: 44, color: enemy.kind === 'spitter' ? 0xb0ff8a : 0xff8aa0, intensity: 0.4 });
      }
      telegraphs.push({
        id: `enemy:${enemy.id}`,
        visible: enemy.phase === 'telegraph',
        effectDepth: presentationDepth('effect', 1),
      });
      if (enemy.kind === 'lp_manager') {
        this.drawBoss(enemy, body, effects, !spriteActive);
      } else {
        this.drawEnemy(enemy, body, effects, !spriteActive);
      }
    }

    this.drawDeathEffects(opening);

    for (const projectile of state.room.combat.projectiles) {
      this.drawProjectile(projectile, opening?.effectGraphics(`projectile:${projectile.id}`) ?? this.effectGraphics);
    }

    this.drawCarrier(
      state,
      state.carrier ? opening?.actorGraphics('carrier', state.carrier.y) ?? graphics : graphics,
      state.carrier ? opening?.effectGraphics('carrier') ?? this.effectGraphics : this.effectGraphics,
    );
    const player = state.room.combat.player;
    const playerDelta = this.actorMovement.movementFor('player', player.x, player.y);
    const playerDepth = presentationDepth('actor', player.y);
    const playerSprite = this.syncActorSprite({
      id: 'player', kind: 'alex', x: player.x, y: player.y, moveX: playerDelta.x, moveY: playerDelta.y,
      attackTicks: player.attackActiveTicks, damaged: player.invulnerableTicks > 0, phase: 'idle',
    }, state.tick, playerDepth);
    const playerEffects = opening?.effectGraphics('player') ?? this.effectGraphics;
    this.contactShadow('player', player.x, player.y, 1);
    // The janitor carries a little warm light, so the player never loses themself in the dark.
    opening?.addLight({ x: player.x, y: player.y - 10, radius: 96, color: 0xffe6c8, intensity: 0.62 });
    if (player.attackActiveTicks > 0) {
      opening?.addLight({ x: player.x + player.facing.x * 24, y: player.y + player.facing.y * 24 - 8, radius: 70, color: 0xfff4d0, intensity: 0.7 });
    }
    this.drawPlayer(
      state,
      opening?.actorGraphics('player', state.room.combat.player.y) ?? graphics,
      playerEffects,
      !playerSprite.spriteActive,
    );
    this.drawActorEffectCues({
      id: 'player', kind: 'alex', x: player.x, y: player.y,
      moveX: playerDelta.x, moveY: playerDelta.y,
      attackTicks: player.attackActiveTicks,
      damaged: player.invulnerableTicks > 0,
      phase: 'idle',
    }, playerSprite, playerEffects);
    const mopArcVisible = shouldDrawDirectAttackArc(
      player.attackActiveTicks,
      state.room.combat.compiledLoadout.primary.delivery,
    );
    this.actorDebug = {
      player: {
        ...playerSprite,
        mopArcVisible,
        mopArcDepth: mopArcVisible ? presentationDepth('effect', 1) : null,
      },
      hangers: hangerEvidence,
      telegraphs,
      activeDeathEffectCount: this.deathEffects.snapshot().length,
      depthBands: {
        tallForeground: presentationDepth('tallForeground', 0),
        effect: presentationDepth('effect', 1),
      },
    };
    this.drawTokens(state);
    this.feedback.sync(actorScope, state.tick, state.room.combat.enemies, player, state.paused || state.status !== 'playing');
    for (const light of this.feedback.drainLights()) opening?.addLight(light);
    for (const projectile of state.room.combat.projectiles) {
      const enemyShot = projectile.faction === 'enemy';
      opening?.addLight({ x: projectile.x, y: projectile.y, radius: enemyShot ? 46 : 36, color: enemyShot ? 0xff3fc8 : 0x9ad8ff, intensity: 0.85 });
    }
    opening?.renderLighting(state.tick);
    opening?.endFrame();
    this.pruneShadows();
    this.pruneOfferIcons();
    this.pruneActorSprites();
    this.actorMovement.retain(new Set([
      'player',
      ...state.room.combat.enemies.map((enemy) => `enemy:${enemy.id}`),
    ]));
    this.pruneLabels(state);
  }

  /**
   * The Remote-Control Car, drawn only while the shift owns one.
   *
   * A fused car is the firing origin, so it is drawn with the same tether cue
   * the player needs to judge leash range, plus a distinct fill for the two
   * modes: an independent companion versus the steered emitter mount.
   */
  private drawCarrier(
    state: MvpRunState,
    graphics = this.graphics,
    effects = graphics,
  ): void {
    const carrier = state.carrier;
    if (carrier === null) {
      this.clearLabel('carrier');
      return;
    }
    const player = state.room.combat.player;
    const fused = carrier.mode === 'emitter';

    // The leash, so the player can read why the car stops following.
    effects.lineStyle(1, fused ? 0x8bc9b8 : 0xc4b878, 0.28);
    effects.lineBetween(player.x, player.y, carrier.x, carrier.y);

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

  private drawStore(state: MvpRunState, templateId: string): void {
    const room = state.wing.rooms[state.roomIndex];
    const store = room?.store;
    if (!store) {
      return;
    }
    const floor = this.storeGraphics;
    const cues = this.effectGraphics;
    const carriedHere = state.carried.some((theft) => theft.sourceStoreId === store.templateId);
    if (carriedHere) {
      // Carrying stolen stock out of this store: the shop outline goes hot.
      floor.lineStyle(2, 0xffd84a, 0.5 + 0.3 * Math.sin(state.tick / 6));
      floor.strokeRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);
    }

    // The door mat and anti-theft pillars at the exit.
    const exit = store.exit.bounds;
    floor.fillStyle(0x1a2a30, 1).fillRect(exit.x, exit.y - 6, exit.width, exit.height + 12);
    floor.fillStyle(0x3ff0ff, 0.5).fillRect(exit.x, exit.y + exit.height / 2 - 1, exit.width, 2);
    for (const px of [exit.x - 6, exit.x + exit.width + 2]) {
      cues.fillStyle(0xc8d8e8, 1).fillRect(px, exit.y - 26, 4, 30);
      cues.fillStyle(carriedHere ? 0xff3a4a : 0x6aff8a, 1).fillRect(px, exit.y - 26, 4, 3);
    }

    // The ceiling camera's sweep: a searchlight the player must read to steal.
    const zone = store.sightZone;
    const facing = securityFacingAtTick(zone, state.tick);
    const halfArc = ((zone.arcDegrees * Math.PI) / 180) / 2;
    const firstX = zone.origin.x + Math.cos(facing - halfArc) * zone.range;
    const firstY = zone.origin.y + Math.sin(facing - halfArc) * zone.range;
    const secondX = zone.origin.x + Math.cos(facing + halfArc) * zone.range;
    const secondY = zone.origin.y + Math.sin(facing + halfArc) * zone.range;
    cues.fillStyle(0xffd45d, 0.13);
    cues.fillTriangle(zone.origin.x, zone.origin.y, firstX, firstY, secondX, secondY);
    cues.lineStyle(1, 0xffd45d, 0.75);
    cues.lineBetween(zone.origin.x, zone.origin.y, firstX, firstY);
    cues.lineBetween(zone.origin.x, zone.origin.y, secondX, secondY);
    cues.fillStyle(0x1a1422, 1).fillCircle(zone.origin.x, zone.origin.y, 6);
    cues.fillStyle(state.tick % 40 < 20 ? 0xff3a4a : 0x6a1a22, 1).fillCircle(zone.origin.x, zone.origin.y, 3);
    const reach = zone.range * 0.62;
    this.openingConcourse?.addLight({
      x: zone.origin.x + Math.cos(facing) * reach,
      y: zone.origin.y + Math.sin(facing) * reach,
      radius: 120,
      color: 0xffe08a,
      intensity: 0.5,
      squash: 0.8,
    });

    this.setLabel(`store:${templateId}`, store.name.toUpperCase(), store.bounds.x + 6, store.bounds.y - 16);

    for (const offer of room?.offers ?? []) {
      const status = state.offerStatus[offer.id] ?? 'available';
      if (status === 'available') {
        floor.lineStyle(2, 0x6aff8a, 0.8).strokeEllipse(offer.position.x, offer.position.y, 26, 10);
      } else if (status === 'carried') {
        floor.lineStyle(2, 0xffd84a, 1).strokeEllipse(offer.position.x, offer.position.y, 26, 10);
      } else {
        floor.lineStyle(1, 0x5a5e55, 0.8).strokeEllipse(offer.position.x, offer.position.y, 26, 10);
      }
      this.offerIcon(offer.id, offer.itemDefinitionId, offer.position.x, offer.position.y, state.tick, status);
      // The same run offer price the HUD card shows, so a world label can
      // never disagree with the discounted price the run actually charges.
      this.setLabel(
        `offer:${offer.id}`,
        runOfferPriceLabel(state, offer),
        offer.position.x + 12,
        offer.position.y - 12,
      );
    }
  }

  private drawEnemy(
    enemy: EnemyState,
    graphics = this.graphics,
    effects = graphics,
    drawBody = true,
  ): void {
    if (enemy.kind === 'hanger') {
      if (drawBody) {
        graphics.lineStyle(4, 0x8a3038, 1);
        graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x, enemy.y - 10);
        graphics.lineBetween(enemy.x, enemy.y - 10, enemy.x + 12, enemy.y + 9);
        graphics.lineBetween(enemy.x - 12, enemy.y + 9, enemy.x + 12, enemy.y + 9);
        graphics.fillStyle(0xd35f55, 1);
        graphics.fillCircle(enemy.x, enemy.y - 10, 5);
      }
      if (enemy.phase === 'telegraph') {
        effects.lineStyle(2, 0xffd45d, 0.9);
        effects.strokeCircle(enemy.x, enemy.y, enemy.radius + 8);
      }
    } else {
      if (enemy.phase === 'telegraph') {
        effects.lineStyle(3, 0xffd45d, 0.95);
        effects.strokeCircle(enemy.x, enemy.y, enemy.radius + 8);
        effects.lineStyle(2, 0xffd45d, 0.7);
        effects.lineBetween(
          enemy.x,
          enemy.y,
          enemy.x + enemy.telegraphAimX * 52,
          enemy.y + enemy.telegraphAimY * 52,
        );
      }
      if (drawBody) {
        graphics.fillStyle(0x4d2c59, 1);
        graphics.fillRect(enemy.x - 13, enemy.y - 13, 26, 26);
        graphics.fillStyle(0xc984d8, 1);
        graphics.fillRect(enemy.x - 6, enemy.y - 5, 12, 8);
      }
    }
    this.drawEnemyStatuses(enemy, effects);
    const barY = enemy.y - 46;
    effects.fillStyle(0x12060c, 0.9);
    effects.fillRect(enemy.x - 14, barY, 28, 4);
    effects.fillStyle(0xe8243c, 1);
    effects.fillRect(enemy.x - 13, barY + 1, 26 * Math.max(0, Math.min(1, enemy.health / 8)), 2);
  }

  private drawBoss(
    enemy: EnemyState,
    graphics = this.graphics,
    effects = graphics,
    drawBody = true,
  ): void {
    if (enemy.phase === 'telegraph') {
      // The ring is the authored slam reach itself, not a decorative radius: a
      // smaller ring told players they were safe where the slam still connects.
      effects.fillStyle(0xffd45d, 0.12);
      effects.fillCircle(enemy.x, enemy.y, BOSS_SLAM_REACH);
      effects.lineStyle(3, 0xffd45d, 0.95);
      effects.strokeCircle(enemy.x, enemy.y, BOSS_SLAM_REACH);
      effects.lineStyle(2, 0xffd45d, 0.7);
      effects.lineBetween(
        enemy.x,
        enemy.y,
        enemy.x + enemy.telegraphAimX * 64,
        enemy.y + enemy.telegraphAimY * 64,
      );
    }
    if ((enemy.bossVolleyTelegraphTicks ?? 0) > 0) {
      effects.lineStyle(2, 0x8bd8ff, 0.9);
      effects.strokeCircle(enemy.x, enemy.y, enemy.radius + 16);
    }
    this.drawEnemyStatuses(enemy, effects);
    if (drawBody) {
      graphics.fillStyle(0x5c2936, 1);
      graphics.fillCircle(enemy.x, enemy.y, enemy.radius);
      graphics.lineStyle(3, 0xf6d365, 1);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius);
      graphics.fillStyle(0xf6d365, 1);
      graphics.fillCircle(enemy.x, enemy.y, 5);
    }
    effects.fillStyle(0x2a2424, 0.9);
    effects.fillRect(enemy.x - 24, enemy.y - enemy.radius - 14, 48, 5);
    effects.fillStyle(0xd85c54, 1);
    effects.fillRect(
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
  private drawProjectile(projectile: ProjectileState, graphics = this.graphics): void {
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
  private drawEnemyStatuses(enemy: EnemyState, graphics = this.graphics): void {
    const statuses = enemy.statuses;
    if (!statuses) {
      return;
    }
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

  private drawSurfacePatch(patch: SurfacePatchState, graphics = this.graphics): void {
    graphics.fillStyle(0x3f6f8f, 0.5);
    graphics.fillCircle(patch.x, patch.y, patch.radius);
    graphics.lineStyle(1, 0x8bd8ff, 0.6);
    graphics.strokeCircle(patch.x, patch.y, patch.radius);
  }

  private drawPlayer(
    state: MvpRunState,
    graphics = this.graphics,
    effects = graphics,
    drawBody = true,
  ): void {
    const player = state.room.combat.player;
    const flicker = player.invulnerableTicks > 0 && Math.floor(state.tick / 12) % 2 === 0;
    if (drawBody) {
      graphics.fillStyle(flicker ? 0xdce8c8 : 0x2f5f62, 1);
      graphics.fillCircle(player.x, player.y, player.radius);
      graphics.lineStyle(2, 0xf4edd8, 0.9);
      graphics.strokeCircle(player.x, player.y, player.radius);
    }
    effects.lineStyle(3, 0xf6d365, 1);
    effects.lineBetween(
      player.x,
      player.y,
      player.x + player.facing.x * (player.radius + 6),
      player.y + player.facing.y * (player.radius + 6),
    );
    if (shouldDrawDirectAttackArc(
      player.attackActiveTicks,
      state.room.combat.compiledLoadout.primary.delivery,
    )) {
      const angle = Math.atan2(player.facing.y, player.facing.x);
      effects.lineStyle(3, 0xe8dcc4, 0.95);
      effects.beginPath();
      effects.arc(player.x, player.y, player.radius + 12, angle - 0.7, angle + 0.7);
      effects.strokePath();
    }
  }

  private syncActorSprite(snapshot: ActorSnapshot, tick: number, depth: number): ActorFrameEvidence {
    const visual = actorPresentation(this.actorMemory, snapshot, tick);
    const sheet = enemySpriteSheet(snapshot.kind, visual.walking);
    const walkKey = sheet?.walk && usableTextureKey(this.scene.textures, sheet.walk) ? sheet.walk : null;
    const neonIdle = sheet && usableTextureKey(this.scene.textures, sheet.idle) ? sheet.idle : null;
    const textureKey = walkKey ?? neonIdle ?? actorTextureKey(snapshot.kind, visual.walking);
    const frameSize = walkKey && sheet ? sheet.walkFrameSize : 48;
    const spec: SpriteSpec = sheet
      ? { textureKey, frameWidth: frameSize, frameHeight: frameSize, scale: sheet.scale }
      : { textureKey, frameWidth: 32, frameHeight: 48, scale: 1 };
    const usable = usableTextureKey(this.scene.textures, textureKey) !== null
      && (snapshot.kind === 'alex' || snapshot.kind === 'hanger' || neonIdle !== null);
    let view = this.actorSprites.get(snapshot.id);
    if (!view) {
      view = new ActorSpriteView(this.scene, spec);
      this.actorSprites.set(snapshot.id, view);
    }
    this.usedActorSpriteIds.add(snapshot.id);
    const walkingFrames = (visual.walking && snapshot.kind === 'alex') || walkKey !== null;
    const frame = actorFrameFor(walkingFrames ? 'walk' : 'idle', visual.direction, tick, sheet?.walkFrames ?? 6, sheet?.ticksPerFrame ?? 5);
    const spriteActive = view.sync(snapshot, frame, visual, usable, depth, spec);
    return {
      spriteActive,
      vectorFallbackActive: !spriteActive,
      textureKey,
      direction: visual.direction,
      frame,
      walking: visual.walking,
      damageFlicker: visual.damageFlicker,
      damageCueVisible: visual.damageFeedback,
      damageCueDepth: visual.damageFeedback ? presentationDepth('effect', 1) : null,
      lungeCueVisible: visual.lunge > 0,
      lungeCueDepth: visual.lunge > 0 ? presentationDepth('effect', 1) : null,
      actorDepth: depth,
    };
  }

  private drawActorEffectCues(
    actor: ActorSnapshot,
    evidence: ActorFrameEvidence,
    effects: Phaser.GameObjects.Graphics,
  ): void {
    if (evidence.lungeCueVisible) {
      const magnitude = Math.hypot(actor.moveX, actor.moveY);
      if (magnitude > 0) {
        const directionX = actor.moveX / magnitude;
        const directionY = actor.moveY / magnitude;
        const sideX = -directionY * 5;
        const sideY = directionX * 5;
        effects.lineStyle(2, 0xf6d365, 0.8);
        effects.lineBetween(
          actor.x - directionX * 22 + sideX,
          actor.y - directionY * 22 + sideY,
          actor.x - directionX * 8 + sideX,
          actor.y - directionY * 8 + sideY,
        );
        effects.lineBetween(
          actor.x - directionX * 22 - sideX,
          actor.y - directionY * 22 - sideY,
          actor.x - directionX * 8 - sideX,
          actor.y - directionY * 8 - sideY,
        );
      }
    }
    if (evidence.damageCueVisible) {
      effects.lineStyle(3, 0xffd45d, 0.95);
      effects.strokeCircle(actor.x, actor.y, actor.kind === 'alex' ? 17 : 21);
      effects.lineStyle(1, 0xf4edd8, 0.9);
      effects.strokeCircle(actor.x, actor.y, actor.kind === 'alex' ? 21 : 25);
    }
  }

  private drawDeathEffects(opening: MallRoomView | undefined): void {
    for (const effect of this.deathEffects.snapshot()) {
      const graphics = opening?.effectGraphics(`death:${effect.id}`) ?? this.effectGraphics;
      const progress = 1 - effect.remainingTicks / ACTOR_DEATH_EFFECT_TICKS;
      const radius = 8 + progress * 16;
      graphics.lineStyle(3, 0xf6d365, Math.max(0.1, 1 - progress));
      graphics.strokeCircle(effect.x, effect.y, radius);
      graphics.lineStyle(2, 0xe8dcc4, Math.max(0.1, 1 - progress));
      graphics.lineBetween(effect.x - radius, effect.y, effect.x + radius, effect.y);
      graphics.lineBetween(effect.x, effect.y - radius, effect.x, effect.y + radius);
    }
  }

  private pruneActorSprites(): void {
    for (const [id, sprite] of this.actorSprites) {
      if (!this.usedActorSpriteIds.has(id)) {
        sprite.destroy();
        this.actorSprites.delete(id);
      }
    }
  }

  private setLabel(key: string, text: string, x: number, y: number): void {
    const spec = ensurePixelLabel(this.scene, text.toUpperCase(), key.startsWith('offer:') ? '#6aff8a' : '#ffd84a');
    let label = this.labels.get(key);
    if (!label) {
      label = this.scene.add.image(Math.round(x), Math.round(y), spec.key).setOrigin(0, 0);
      label.setDepth(presentationDepth('prompt', 0));
      this.labels.set(key, label);
      return;
    }
    label.setPosition(Math.round(x), Math.round(y));
    if (label.texture.key !== spec.key) {
      label.setTexture(spec.key);
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

  private contactShadow(id: string, x: number, y: number, scale: number): void {
    this.usedShadows.add(id);
    let shadow = this.shadows.get(id);
    if (!shadow) {
      shadow = this.scene.add.image(x, y, FX_TEXTURES.shadow).setDepth(presentationDepth('lowProp', 900));
      this.shadows.set(id, shadow);
    }
    shadow.setPosition(Math.round(x), Math.round(y + 2)).setScale(scale, scale).setVisible(true);
  }

  /** Dropped Mall Tokens: spinning brass coins with their own little glow. */
  private drawTokens(state: MvpRunState): void {
    const live = new Set<string>();
    for (const token of state.room.tokens) {
      live.add(token.id);
      let sprite = this.tokenSprites.get(token.id);
      if (!sprite) {
        sprite = this.scene.add.image(token.x, token.y, FX_TEXTURES.token).setDepth(presentationDepth('actor', token.y - 1));
        this.tokenSprites.set(token.id, sprite);
      }
      const age = state.tick - token.droppedTick;
      // A short pop out of the body, then a lazy spin and bob on the floor.
      const hop = age < 18 ? Math.sin((age / 18) * Math.PI) * 14 : 0;
      const spin = Math.abs(Math.cos((state.tick + token.x) / 9));
      sprite.setPosition(Math.round(token.x), Math.round(token.y - 6 - hop - Math.sin(state.tick / 11) * 1.5))
        .setScale(Math.max(0.2, spin) * 1.6, 1.6);
      this.contactShadow(`token:${token.id}`, token.x, token.y, 0.35);
      this.openingConcourse?.addLight({ x: token.x, y: token.y - 6, radius: 30, color: 0xffd84a, intensity: 0.65 });
    }
    for (const [id, sprite] of this.tokenSprites) {
      if (!live.has(id)) {
        sprite.destroy();
        this.tokenSprites.delete(id);
      }
    }
  }

  private pruneShadows(): void {
    for (const [id, shadow] of this.shadows) {
      if (!this.usedShadows.has(id)) {
        shadow.destroy();
        this.shadows.delete(id);
      }
    }
  }

  /** Store stock drawn as the actual item, bobbing on its shelf under a spotlight. */
  private offerIcon(offerId: string, itemDefinitionId: string, x: number, y: number, tick: number, status: string): void {
    const key = itemIconKey(itemDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (!usable) return;
    this.usedOfferIcons.add(offerId);
    let icon = this.offerIcons.get(offerId);
    if (!icon) {
      icon = this.scene.add.image(x, y, usable);
      this.offerIcons.set(offerId, icon);
    }
    const scale = Math.min(22 / icon.width, 22 / icon.height);
    const bob = Math.sin((tick + x) / 14) * 2;
    icon.setPosition(Math.round(x), Math.round(y - 30 + bob)).setScale(scale)
      .setDepth(presentationDepth('effect', 5))
      .setAlpha(status === 'available' ? 1 : status === 'carried' ? 0.9 : 0.25)
      .setVisible(status !== 'purchased' && status !== 'secured');
    if (status === 'available') {
      this.openingConcourse?.addLight({ x, y: y - 20, radius: 44, color: 0xfff0b0, intensity: 0.6 });
    }
  }

  private pruneOfferIcons(): void {
    for (const [id, icon] of this.offerIcons) {
      if (!this.usedOfferIcons.has(id)) {
        icon.destroy();
        this.offerIcons.delete(id);
      }
    }
  }

  public destroy(): void {
    for (const shadow of this.shadows.values()) shadow.destroy();
    this.shadows.clear();
    for (const sprite of this.tokenSprites.values()) sprite.destroy();
    this.tokenSprites.clear();
    for (const icon of this.offerIcons.values()) icon.destroy();
    this.offerIcons.clear();
    this.feedback.destroy();
    this.storeGraphics.destroy();
    this.openingConcourse?.destroy();
    this.openingConcourse = undefined;
    this.concourseAmbience = null;
    for (const key of [...this.labels.keys()]) {
      this.clearLabel(key);
    }
    this.graphics.destroy();
    this.effectGraphics.destroy();
    for (const sprite of this.actorSprites.values()) sprite.destroy();
    this.actorSprites.clear();
    this.actorMovement.reset();
    this.actorMemory.reset();
    this.deathEffects.destroy();
    this.actorDebug = this.emptyActorDebug();
  }

  public resetForRun(): void {
    this.feedback.resetRoom('');
    this.mallRoomKey = '';
    this.openingConcourse?.destroy();
    this.openingConcourse = undefined;
    this.concourseAmbience = null;
    for (const sprite of this.actorSprites.values()) sprite.destroy();
    this.actorSprites.clear();
    this.usedActorSpriteIds.clear();
    this.actorMovement.reset();
    this.actorMemory.reset();
    this.deathEffects.reset();
    this.effectGraphics.clear();
    this.actorDebug = this.emptyActorDebug();
  }

  public actorPresentationSnapshot(): ActorPresentationDebugSnapshot {
    return structuredClone(this.actorDebug);
  }

  public concourseAmbienceSnapshot(): ConcourseAmbienceSnapshot | null {
    return this.concourseAmbience ? { ...this.concourseAmbience } : null;
  }

  public presentationSnapshot(): (ReturnType<MallRoomView['debugSnapshot']> & {
    promptDepths: Array<{ id: string; renderDepth: number }>;
  }) | null {
    if (!this.openingConcourse) return null;
    return {
      ...this.openingConcourse.debugSnapshot(),
      promptDepths: [...this.labels].map(([id, label]) => ({ id, renderDepth: label.depth })),
    };
  }

  private emptyActorDebug(): ActorPresentationDebugSnapshot {
    return {
      player: null,
      hangers: [],
      telegraphs: [],
      activeDeathEffectCount: 0,
      depthBands: {
        tallForeground: presentationDepth('tallForeground', 0),
        effect: presentationDepth('effect', 1),
      },
    };
  }
}
