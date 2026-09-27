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
  NEUTRAL_POSE,
  type ActorDirection,
  type ActorPose,
  type ActorSnapshot,
  type SpriteSpec,
} from './ActorSpriteView';
import { DASH_TICKS } from '../../sim/combat/dash';
import { attackFrameFor, combinePoses, dashPose, enemyWindups, playerBodyAction, windupPose, type PlayerBodyAction, type Windup } from './combatBeats';
import { MallRoomView } from './MallRoomView';
import { CombatFeedback } from './CombatFeedback';
import { WeaponView } from './WeaponView';
import { enemySpriteSheet } from './ActorSpriteView';
import { PLAYER_TEXTURE_KEYS, characterFrameSize, itemIconKey } from '../presentation/assets';
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
  private readonly weapon: WeaponView;
  private readonly offerIcons = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedOfferIcons = new Set<string>();
  private readonly storeGraphics: Phaser.GameObjects.Graphics;
  private readonly tokenSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly shadows = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedShadows = new Set<string>();
  private concourseAmbience: ConcourseAmbienceSnapshot | null = null;
  /** Real time the shift ended in death; the sim clock stops at game over. */
  private deadSince: number | null = null;
  /** Real time the shift ended (won or dead), for the effects clock. */
  private endedAt: number | null = null;
  /** Dash afterimages: frozen copies of the janitor fading out. */
  private readonly dashGhosts: Array<{ image: Phaser.GameObjects.Image; born: number }> = [];
  private actorDebug: ActorPresentationDebugSnapshot = this.emptyActorDebug();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.effectGraphics = scene.add.graphics().setDepth(presentationDepth('effect', 1));
    this.feedback = new CombatFeedback(scene);
    this.weapon = new WeaponView(scene);
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
    // Feedback reads this tick's hits first, so a struck sprite reacts on the
    // same frame the damage number appears.
    const fxTick = this.effectsTick(state);
    this.feedback.sync(
      actorScope,
      fxTick,
      state.room.combat.enemies,
      state.room.combat.player,
      // Only the pause menu stops feedback: the blow that ends a shift lands on
      // the same tick the status changes, and it deserves its impact too.
      state.paused,
      state.room.combat.projectiles,
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
      // A finished shift freezes the simulation mid-telegraph; never leave a
      // frozen warning on screen over the game-over beat.
      const windups = state.status === 'playing' ? enemyWindups(enemy, player0) : [];
      // A charging enemy turns to face its locked aim, so the strike reads.
      const charge = windups.find((windup) => windup.kind !== 'reach');
      const faced = charge ? { x: charge.aimX * 1e-3, y: charge.aimY * 1e-3 } : facing;
      const enemySnapshot: ActorSnapshot = {
        id: `enemy:${enemy.id}`, kind: enemy.kind === 'lp_manager' ? 'lp_manager' : enemy.kind,
        x: enemy.x, y: enemy.y, moveX: faced.x, moveY: faced.y,
        attackTicks: 0, damaged: false, phase: enemy.phase,
      };
      const pose = combinePoses(windupPose(windups, state.tick), this.feedback.poseFor(`enemy:${enemy.id}`, fxTick));
      const sheet = enemySpriteSheet(enemySnapshot.kind, false);
      const attackFrames = sheet ? this.sheetColumns(sheet.attack) : 0;
      const attackColumn = attackFrameFor(enemy, windups, attackFrames, state.tick);
      const sprite = this.syncActorSprite(enemySnapshot, state.tick, actorDepth, pose, attackColumn);
      const spriteActive = sprite.spriteActive;
      this.drawActorEffectCues(enemySnapshot, sprite, effects);
      if (enemy.kind === 'hanger') {
        hangerEvidence.push({ id: `enemy:${enemy.id}`, ...sprite });
      }
      this.contactShadow(`enemy:${enemy.id}`, enemy.x, enemy.y, enemy.kind === 'lp_manager' ? 2.2 : 1.2);
      if (charge) {
        const color = charge.kind === 'spit' ? 0x9aff6a : charge.kind === 'volley' ? 0xff3fc8 : 0xffb040;
        const size = enemy.kind === 'lp_manager' ? 200 : 90;
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 16, radius: size * (0.6 + 0.6 * charge.progress), color, intensity: 0.5 + 0.5 * charge.progress });
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
      this.drawWindups(enemy, windups, effects, state.tick);
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
    const bodyAction = this.playerAction(state, fxTick);
    // Invulnerability freezes with the sim at game over; its flicker and ring
    // would strobe over the death fall, so they only show during a live shift.
    const playerHurtCue = player.invulnerableTicks > 0 && state.status === 'playing';
    const playerSprite = this.syncActorSprite({
      id: 'player', kind: 'alex', x: player.x, y: player.y, moveX: playerDelta.x, moveY: playerDelta.y,
      attackTicks: player.attackActiveTicks, damaged: playerHurtCue, phase: 'idle',
      // Isaac-style: the janitor looks where the pointer aims, even while backpedalling.
      faceX: player.facing.x, faceY: player.facing.y,
    }, state.tick, playerDepth, combinePoses(this.feedback.poseFor('player', fxTick), dashPose(player)), null, bodyAction);
    this.syncDashTrail(state, fxTick);
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
      damaged: playerHurtCue,
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
    } else {
      if (drawBody) {
        graphics.fillStyle(0x4d2c59, 1);
        graphics.fillRect(enemy.x - 13, enemy.y - 13, 26, 26);
        graphics.fillStyle(0xc984d8, 1);
        graphics.fillRect(enemy.x - 6, enemy.y - 5, 12, 8);
      }
    }
    this.drawEnemyStatuses(enemy, effects);
    const barY = enemy.y - 60;
    effects.fillStyle(0x12060c, 0.9);
    effects.fillRect(enemy.x - 14, barY, 28, 4);
    effects.fillStyle(0xe8243c, 1);
    effects.fillRect(enemy.x - 13, barY + 1, 26 * Math.max(0, Math.min(1, enemy.health / 8)), 2);
  }

  /**
   * Exaggerated wind-ups, all drawn from the simulation's own telegraph state
   * so every warning is the real attack: the spit lane along the locked aim,
   * the slam ring at the authored reach, the volley's five real angles, and a
   * hanger rearing as it closes to touching range.
   */
  private drawWindups(enemy: EnemyState, windups: readonly Windup[], effects: Phaser.GameObjects.Graphics, tick: number): void {
    for (const windup of windups) {
      const p = windup.progress;
      const blink = p > 0.75 && Math.floor(tick / 3) % 2 === 0;
      if (windup.kind === 'spit') {
        // A dashed lane that grows along the locked aim toward where the glob goes.
        const ox = enemy.x + windup.aimX * 18;
        const oy = enemy.y - 20 + windup.aimY * 12;
        const length = 70 + 150 * p;
        const color = blink ? 0xffffff : p > 0.6 ? 0xff3fc8 : 0xffd84a;
        const width = 4 + 5 * p;
        for (let d = 0; d < length; d += 16) {
          const end = Math.min(length, d + 9);
          effects.lineStyle(width + 4, 0x12020a, 0.55).lineBetween(ox + windup.aimX * d, oy + windup.aimY * d, ox + windup.aimX * end, oy + windup.aimY * end);
          effects.lineStyle(width, color, 0.55 + 0.45 * p).lineBetween(ox + windup.aimX * d, oy + windup.aimY * d, ox + windup.aimX * end, oy + windup.aimY * end);
        }
        const tx = ox + windup.aimX * length;
        const ty = oy + windup.aimY * length;
        effects.lineStyle(4, color, 0.95).strokeCircle(tx, ty, 14 - 6 * p);
        effects.lineStyle(3, color, 0.4 + 0.5 * p).strokeCircle(enemy.x, enemy.y - 20, 30 + 12 * (1 - p));
        this.drawAlert(effects, enemy.x, enemy.y - 64 - 4 * Math.sin(tick / 3), p, 0xffd84a);
      } else if (windup.kind === 'slam') {
        // The ring is the authored slam reach itself, not a decorative radius: a
        // smaller ring told players they were safe where the slam still connects.
        const reach = windup.reach ?? BOSS_SLAM_REACH;
        const color = p > 0.7 ? 0xff3a2a : 0xffd45d;
        // It fills from the centre out, reaching the edge the tick the slam lands.
        effects.fillStyle(color, 0.16 + 0.2 * p).fillCircle(enemy.x, enemy.y, reach * p);
        effects.fillStyle(color, 0.1).fillCircle(enemy.x, enemy.y, reach);
        effects.lineStyle(blink ? 6 : 4, blink ? 0xffffff : color, 0.95).strokeCircle(enemy.x, enemy.y, reach);
        effects.lineStyle(2, color, 0.5).strokeCircle(enemy.x, enemy.y, reach + 6 + 4 * Math.sin(tick / 2));
        this.drawAlert(effects, enemy.x, enemy.y - 150 - 6 * p, p, color);
      } else if (windup.kind === 'volley') {
        const base = Math.atan2(windup.aimY, windup.aimX);
        const color = blink ? 0xffffff : 0xff3fc8;
        for (const offset of windup.angles ?? []) {
          const a = base + offset;
          const length = 50 + 170 * p;
          const ox = enemy.x + Math.cos(a) * 30;
          const oy = enemy.y - 30 + Math.sin(a) * 30;
          effects.lineStyle(4 + 3 * p, 0x12020a, 0.5).lineBetween(ox, oy, ox + Math.cos(a) * length, oy + Math.sin(a) * length);
          effects.lineStyle(2 + 2 * p, color, 0.5 + 0.5 * p).lineBetween(ox, oy, ox + Math.cos(a) * length, oy + Math.sin(a) * length);
        }
        effects.lineStyle(3, color, 0.9).strokeCircle(enemy.x, enemy.y - 30, 34 + 10 * (1 - p));
      } else if (p > 0.3) {
        // Hangers hurt by touch: claws flare red as they close in.
        const color = p > 0.75 ? 0xff2a2a : 0xff8a4a;
        effects.lineStyle(2 + 2 * p, color, p).strokeEllipse(enemy.x, enemy.y + 4, 56 + 10 * p, 22 + 4 * p);
        if (p > 0.75) this.drawAlert(effects, enemy.x, enemy.y - 58, 1, 0xff2a2a);
      }
    }
  }

  /** A chunky pixel "!" that pops in as a wind-up starts. */
  private drawAlert(effects: Phaser.GameObjects.Graphics, x: number, y: number, progress: number, color: number): void {
    const s = progress < 0.12 ? 2.4 - progress * 5 : 1.8;
    const w = 5 * s;
    const h = 13 * s;
    effects.fillStyle(0x12020a, 1).fillRect(x - w / 2 - 2, y - h - 2, w + 4, h + 4).fillRect(x - w / 2 - 2, y + 3, w + 4, w + 4);
    effects.fillStyle(color, 1).fillRect(x - w / 2, y - h, w, h).fillRect(x - w / 2, y + 5, w, w);
  }

  private drawBoss(
    enemy: EnemyState,
    graphics = this.graphics,
    effects = graphics,
    drawBody = true,
  ): void {
    this.drawEnemyStatuses(enemy, effects);
    if (drawBody) {
      graphics.fillStyle(0x5c2936, 1);
      graphics.fillCircle(enemy.x, enemy.y, enemy.radius);
      graphics.lineStyle(3, 0xf6d365, 1);
      graphics.strokeCircle(enemy.x, enemy.y, enemy.radius);
      graphics.fillStyle(0xf6d365, 1);
      graphics.fillCircle(enemy.x, enemy.y, 5);
    }
    // The boss's health lives in the HUD's boss bar; a world bar would cut
    // across the 128px sprite.
    void BOSS_MAX_HEALTH;
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
      // A hot magenta glob with a dark outline and a fading trail, so it reads
      // on bright terrazzo and dark carpet alike. The solid core is the hitbox.
      const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
      const bx = -projectile.velocityX / speed;
      const by = -projectile.velocityY / speed;
      for (let i = 4; i >= 1; i -= 1) {
        const r = projectile.radius * (1 - i * 0.16);
        graphics.fillStyle(0xff3fc8, 0.5 - i * 0.1).fillCircle(projectile.x + bx * i * 7, projectile.y + by * i * 7, r);
      }
      const wobble = Math.sin((projectile.remainingTicks + projectile.id) / 2) * 0.8;
      graphics.fillStyle(0x1a0010, 0.95).fillCircle(projectile.x, projectile.y, projectile.radius + 4);
      graphics.fillStyle(0xff3fc8, 1).fillEllipse(projectile.x, projectile.y, (projectile.radius + 2 + wobble) * 2, (projectile.radius + 2 - wobble) * 2);
      graphics.fillStyle(0xffd0f4, 1).fillCircle(projectile.x - 1.5, projectile.y - 1.5, projectile.radius * 0.5);
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
    const primary = state.room.combat.compiledLoadout.primary;
    if (state.status === 'dead') {
      // The mop falls with him: the death sheet has empty hands.
      this.weapon.hide();
      return;
    }
    const lights = this.weapon.sync({
      x: player.x,
      y: player.y,
      facingX: player.facing.x,
      facingY: player.facing.y,
      attackActiveTicks: player.attackActiveTicks,
      definitionId: primary.definitionId,
      delivery: primary.delivery,
      range: primary.range,
      halfAngleRadians: primary.halfAngleRadians,
    }, state.tick, effects, presentationDepth('actor', player.y));
    for (const light of lights) this.openingConcourse?.addLight(light);
  }

  /** Columns in an 8-row sheet, or 0 when the texture is not loaded. */
  private sheetColumns(key: string): number {
    if (!this.scene.textures.exists(key) || usableTextureKey(this.scene.textures, key) !== key) return 0;
    const source = this.scene.textures.get(key).getSourceImage() as { width: number; height: number };
    return Math.max(1, Math.round(source.width / characterFrameSize(source.height, 8)));
  }

  private syncActorSprite(
    snapshot: ActorSnapshot,
    tick: number,
    depth: number,
    pose: ActorPose = NEUTRAL_POSE,
    attackColumn: number | null = null,
    bodyAction: PlayerBodyAction | null = null,
  ): ActorFrameEvidence {
    const visual = actorPresentation(this.actorMemory, snapshot, tick);
    if (snapshot.kind === 'alex') {
      const neon = this.neonPlayerSpec(visual.walking, bodyAction);
      if (neon) return this.syncSheetSprite(snapshot, visual, tick, depth, neon, pose);
    }
    const sheet = enemySpriteSheet(snapshot.kind, visual.walking);
    // An attack in progress draws from the attack sheet, which shares the walk
    // sheet's layout (one row per facing, canvases grown around the idle one).
    const attacking = sheet !== null && attackColumn !== null;
    const walkKey = attacking ? sheet.attack
      : sheet?.walk && usableTextureKey(this.scene.textures, sheet.walk) ? sheet.walk : null;
    const neonIdle = sheet && usableTextureKey(this.scene.textures, sheet.idle) ? sheet.idle : null;
    const textureKey = walkKey ?? neonIdle ?? actorTextureKey(snapshot.kind, visual.walking);
    let spec: SpriteSpec = { textureKey, frameWidth: 32, frameHeight: 48, scale: 1 };
    let walkFrames = sheet?.walkFrames ?? 6;
    if (sheet && (walkKey || neonIdle)) {
      const source = this.scene.textures.get(textureKey).getSourceImage() as { width: number; height: number };
      const frameSize = characterFrameSize(source.height, walkKey ? 8 : 1);
      if (walkKey) walkFrames = Math.max(1, Math.round(source.width / frameSize));
      // Walk canvases are grown copies of the idle canvas at the same pixel
      // scale, so the scale always comes from the idle frame size.
      const idleSource = neonIdle ? (this.scene.textures.get(neonIdle).getSourceImage() as { height: number }) : source;
      const idleFrame = neonIdle ? characterFrameSize(idleSource.height, 1) : frameSize;
      // A grown walk canvas is centred on the idle canvas, so the feet sit
      // half the growth lower than 84% of the idle frame.
      const feetY = (frameSize - idleFrame) / 2 + idleFrame * 0.84;
      spec = { textureKey, frameWidth: frameSize, frameHeight: frameSize, scale: sheet.displaySize / idleFrame, feetY };
    } else if (snapshot.kind === 'hanger') {
      spec = { textureKey, frameWidth: 48, frameHeight: 48, scale: 1 };
    }
    const usable = usableTextureKey(this.scene.textures, textureKey) !== null
      && (snapshot.kind === 'alex' || snapshot.kind === 'hanger' || neonIdle !== null);
    let view = this.actorSprites.get(snapshot.id);
    if (!view) {
      view = new ActorSpriteView(this.scene, spec);
      this.actorSprites.set(snapshot.id, view);
    }
    this.usedActorSpriteIds.add(snapshot.id);
    const walkingFrames = (visual.walking && snapshot.kind === 'alex') || walkKey !== null;
    const walkFrame = actorFrameFor(walkingFrames ? 'walk' : 'idle', visual.direction, tick, walkFrames, sheet?.ticksPerFrame ?? 5);
    const frame = attacking ? { row: walkFrame.row, column: Math.min(walkFrames - 1, attackColumn) } : walkFrame;
    // The walk bob and lunge would fight the attack pose, so an attack stands still.
    const shownVisual = attacking ? { ...visual, lunge: 0, bobY: 0 } : visual;
    const spriteActive = view.sync(snapshot, frame, shownVisual, usable, depth, spec, pose);
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

  /**
   * Afterimages while the janitor dashes: every other tick a frozen copy of
   * the current frame, tinted cyan and fading over ten ticks, plus a dust puff
   * on the first tick of the dash.
   */
  private syncDashTrail(state: MvpRunState, fxTick: number): void {
    const player = state.room.combat.player;
    const dashTicks = player.dashTicks ?? 0;
    const sprite = this.actorSprites.get('player');
    if (dashTicks === DASH_TICKS) {
      this.feedback.puff(player.x, player.y, fxTick, player.dashX ?? 0, player.dashY ?? 0);
    }
    if (dashTicks > 0 && fxTick % 2 === 0 && sprite && !this.dashGhosts.some((ghost) => ghost.born === fxTick)) {
      const image = sprite.ghost();
      if (image) {
        image.setTint(0x40d8ff).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
        this.dashGhosts.push({ image, born: fxTick });
      }
    }
    for (let i = this.dashGhosts.length - 1; i >= 0; i -= 1) {
      const ghost = this.dashGhosts[i]!;
      const age = fxTick - ghost.born;
      if (age > 10 || age < 0) {
        ghost.image.destroy();
        this.dashGhosts.splice(i, 1);
        continue;
      }
      ghost.image.setAlpha(0.6 * (1 - age / 10));
    }
  }

  /**
   * The clock combat feedback runs on. It is the simulation tick while the
   * shift is live, and keeps counting in real 60 Hz ticks after the shift
   * ends, so the last hit's stars, words and sparks finish and fade instead
   * of freezing on top of the death fall. (The pause menu still freezes.)
   */
  private effectsTick(state: MvpRunState): number {
    if (state.status === 'playing') {
      this.endedAt = null;
      return state.tick;
    }
    if (this.endedAt === null) this.endedAt = this.scene.time.now;
    return state.tick + Math.floor((this.scene.time.now - this.endedAt) / (1000 / 60));
  }

  /**
   * The janitor's action this frame: death, a hurt flinch, or the body swing
   * that goes with a melee weapon's visible swing. Detection runs before the
   * sprite so the body and the weapon start the swing on the same frame.
   */
  private playerAction(state: MvpRunState, fxTick: number): PlayerBodyAction | null {
    const player = state.room.combat.player;
    const primary = state.room.combat.compiledLoadout.primary;
    this.weapon.noteAttack({ attackActiveTicks: player.attackActiveTicks, facingX: player.facing.x, facingY: player.facing.y }, state.tick);
    const dead = state.status === 'dead';
    if (dead && this.deadSince === null) this.deadSince = this.scene.time.now;
    if (!dead) this.deadSince = null;
    return playerBodyAction(
      {
        swing: primary.delivery === 'direct' ? this.weapon.swingAt(state.tick) : null,
        hurtAge: this.feedback.playerHurtAge(fxTick),
        deadMs: this.deadSince === null ? null : this.scene.time.now - this.deadSince,
      },
      {
        swing: this.sheetColumns(PLAYER_TEXTURE_KEYS.swing),
        hurt: this.sheetColumns(PLAYER_TEXTURE_KEYS.hurt),
        death: this.sheetColumns(PLAYER_TEXTURE_KEYS.death),
      },
    );
  }

  /** The 64px PixelLab janitor, when its sheets loaded. */
  private neonPlayerSpec(
    walking: boolean,
    action: PlayerBodyAction | null = null,
  ): { textureKey: string; rows: 1 | 8; walkFrames: number; column?: number } | null {
    const textures = this.scene.textures;
    const walk = usableTextureKey(textures, PLAYER_TEXTURE_KEYS.walk);
    const idle = usableTextureKey(textures, PLAYER_TEXTURE_KEYS.idle);
    if (action) {
      const key = PLAYER_TEXTURE_KEYS[action.sheet];
      return { textureKey: key, rows: 8, walkFrames: this.sheetColumns(key), column: action.column };
    }
    if (walking && walk) {
      const source = textures.get(walk).getSourceImage() as { width: number; height: number };
      const frame = characterFrameSize(source.height, 8);
      return { textureKey: walk, rows: 8, walkFrames: Math.max(1, Math.round(source.width / frame)) };
    }
    return idle ? { textureKey: idle, rows: 1, walkFrames: 1 } : null;
  }

  private syncSheetSprite(
    snapshot: ActorSnapshot,
    visual: ReturnType<typeof actorPresentation>,
    tick: number,
    depth: number,
    sheet: { textureKey: string; rows: 1 | 8; walkFrames: number; column?: number },
    pose: ActorPose = NEUTRAL_POSE,
  ): ActorFrameEvidence {
    const source = this.scene.textures.get(sheet.textureKey).getSourceImage() as { height: number };
    const size = characterFrameSize(source.height, sheet.rows);
    // Action canvases grow around the idle canvas, so the feet sit half the
    // growth lower than 84% of the idle frame.
    const idleKey = usableTextureKey(this.scene.textures, PLAYER_TEXTURE_KEYS.idle);
    const idleSize = idleKey ? characterFrameSize((this.scene.textures.get(idleKey).getSourceImage() as { height: number }).height, 1) : size;
    const feetY = (size - idleSize) / 2 + idleSize * 0.84;
    const spec: SpriteSpec = { textureKey: sheet.textureKey, frameWidth: size, frameHeight: size, scale: 1, feetY };
    let view = this.actorSprites.get(snapshot.id);
    if (!view) {
      view = new ActorSpriteView(this.scene, spec);
      this.actorSprites.set(snapshot.id, view);
    }
    this.usedActorSpriteIds.add(snapshot.id);
    const moving = actorFrameFor(sheet.rows === 8 ? 'walk' : 'idle', visual.direction, tick, sheet.walkFrames, 5);
    const frame = sheet.column === undefined ? moving : { row: moving.row, column: sheet.column };
    const spriteActive = view.sync(snapshot, frame, visual, true, depth, spec, pose);
    return {
      spriteActive,
      vectorFallbackActive: !spriteActive,
      textureKey: sheet.textureKey,
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

  private clearDashGhosts(): void {
    for (const ghost of this.dashGhosts) ghost.image.destroy();
    this.dashGhosts.length = 0;
  }

  public destroy(): void {
    this.clearDashGhosts();
    for (const shadow of this.shadows.values()) shadow.destroy();
    this.shadows.clear();
    for (const sprite of this.tokenSprites.values()) sprite.destroy();
    this.tokenSprites.clear();
    for (const icon of this.offerIcons.values()) icon.destroy();
    this.offerIcons.clear();
    this.feedback.destroy();
    this.weapon.destroy();
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
    this.weapon.reset();
    this.clearDashGhosts();
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

  /** Milliseconds the scene should hold its clock for hits landed this frame. */
  public takeHitStop(): number {
    return this.feedback.takeHitStop();
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
