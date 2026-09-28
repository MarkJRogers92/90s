/**
 * Graybox/vector presentation for the M5 MVP run.
 *
 * The view draws the current room only: floor, walls, doorways, store
 * fixtures with offer labels, the security sweep cone, the Bench Warrant
 * kiosk, and the room-local combat entities. It reads authoritative run
 * state and never mutates it; damage, movement, economy, and transitions
 * stay in `src/sim`.
 */
import { runMaxHealth } from '../../sim/run/perks';
import Phaser from 'phaser';
import { BOSS_MAX_HEALTH, BOSS_SLAM_REACH, isBossKind } from '../../sim/combat/boss';
import { itemDefinitionName, runOfferPriceLabel } from '../../sim/run/economy';
import { ITEM_CATALOG } from '../../sim/items/catalog';
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
import { WATCH_HALF_ANGLE } from '../../sim/combat/mannequin';
import { blueLightOfferId, roomEventFor } from '../../sim/run/roomEvents';
import { flashAllowed, gameSettings } from '../settings/settings';
import { SPAWN_IN_TICKS, dashReadiness, shouldHintDash, spawnInPose } from './playerCues';
import { attackFrameFor, combinePoses, glow, dashPose, enemyWindups, playerBodyAction, windupPose, type PlayerBodyAction, type Windup } from './combatBeats';
import { MallRoomView } from './MallRoomView';
import { CombatFeedback } from './CombatFeedback';
import { WeaponView } from './WeaponView';
import { enemySpriteSheet } from './ActorSpriteView';
import { PLAYER_TEXTURE_KEYS, SCENE_TEXTURE_KEYS, characterFrameSize, itemIconKey } from '../presentation/assets';
import { projectileStyle, type ProjectileStyle } from './projectileStyle';
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
  private readonly offerNames = new Map<string, Phaser.GameObjects.Image>();
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
  /** The RC car's sprite and its presentation memory (facing, dust, bump sparks). */
  private carSprite: Phaser.GameObjects.Image | null = null;
  private carLast: { x: number; y: number; bump: number } | null = null;
  private carFacing: 1 | -1 = 1;
  private carDust: Array<{ x: number; y: number; born: number }> = [];
  private carSparks: { x: number; y: number; born: number } | null = null;
  /** Bends effect time after the shift ends (the boss kill cam's slow motion). */
  private timeWarp: ((realMs: number) => number) | null = null;
  /** First effects tick each enemy was seen in this room, for its spawn-in. */
  private readonly enemyFirstSeen = new Map<string, number>();
  private enemyScope = '';
  /** Dashes this run, so the SPACE DASH hint retires once it is learned. */
  private dashesThisRun = 0;
  private lastReadiness = 1;
  private readyFlashTick = -100;
  private dashHint: Phaser.GameObjects.Image | null = null;
  private readonly threats: Array<{ enemy: { x: number; y: number }; windups: readonly Windup[] }> = [];
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
    const blackout = roomEventFor(state, state.roomIndex) === 'blackout';
    this.openingConcourse.setBlackout(blackout);
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
    this.threats.length = 0;
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
        id: `enemy:${enemy.id}`, kind: enemy.kind,
        x: enemy.x, y: enemy.y, moveX: faced.x, moveY: faced.y,
        attackTicks: 0, damaged: false, phase: enemy.phase,
      };
      const spawnAge = fxTick - this.firstSeen(actorScope, `enemy:${enemy.id}`, fxTick);
      const pose = combinePoses(
        combinePoses(windupPose(windups, state.tick), this.feedback.poseFor(`enemy:${enemy.id}`, fxTick)),
        spawnInPose(spawnAge),
      );
      if (spawnAge >= 0 && spawnAge < SPAWN_IN_TICKS) {
        // A floor ring opens under each arrival, so no enemy simply pops in.
        const t = spawnAge / SPAWN_IN_TICKS;
        const r = (isBossKind(enemy.kind) ? 70 : 34) * (0.4 + 0.6 * t);
        effects.lineStyle(4 * (1 - t) + 1, enemy.kind === 'spitter' ? 0x9aff6a : 0xff3a5a, 1 - t).strokeEllipse(enemy.x, enemy.y, r * 2, r);
      }
      this.threats.push({ enemy, windups });
      if (enemy.kind === 'mannequin' && enemy.phase === 'pursue') {
        // Moving: red eyes in the blank face.
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 52, radius: 20, color: 0xff2a3a, intensity: 1 });
        effects.fillStyle(0xff2a3a, 1).fillRect(Math.round(enemy.x) - 4, Math.round(enemy.y) - 54, 2, 2).fillRect(Math.round(enemy.x) + 2, Math.round(enemy.y) - 54, 2, 2);
      }
      if (enemy.elite) {
        // CLEARANCE: a pulsing gold aura and a price-tag label.
        const glow = 0.6 + 0.3 * Math.sin(state.tick / 7 + enemy.id);
        effects.lineStyle(3, 0xffd84a, glow).strokeEllipse(enemy.x, enemy.y + 2, 58, 22);
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 20, radius: 70, color: 0xffd84a, intensity: 0.5 * glow });
        this.eliteTag(`enemy:${enemy.id}`, enemy.x, enemy.y - 70);
      }
      const sheet = enemySpriteSheet(enemySnapshot.kind, false);
      const attackFrames = sheet ? this.sheetColumns(sheet.attack) : 0;
      const attackColumn = attackFrameFor(enemy, windups, attackFrames, state.tick);
      let shown = enemy.elite ? combinePoses(pose, { offsetX: 0, offsetY: 0, scaleX: 1.18, scaleY: 1.18, flash: false, tint: 0x302000 }) : pose;
      // Soaked enemies glow blue and gummed-up ones amber, so a status reads at a glance.
      const wet = (enemy.statuses?.wetTicks ?? 0) > 0;
      const sticky = (enemy.statuses?.stickyTicks ?? 0) > 0;
      if (wet || sticky) {
        const pulse = 0.75 + 0.25 * Math.sin(state.tick / 8 + enemy.id);
        shown = combinePoses(shown, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false, tint: wet ? glow(0x2a90ff, 0.55 * pulse) : glow(0xd08a20, 0.5 * pulse) });
      }
      if (enemy.kind === 'mannequin' && enemy.phase === 'pursue') {
        // A moving mannequin jitters, like a bad stop-motion frame.
        shown = combinePoses(shown, { offsetX: ((state.tick * 7) % 3) - 1, offsetY: ((state.tick * 5) % 3) - 1, scaleX: 1, scaleY: 1, flash: false });
      }
      const sprite = this.syncActorSprite(enemySnapshot, state.tick, actorDepth, shown, attackColumn);
      const spriteActive = sprite.spriteActive;
      this.drawActorEffectCues(enemySnapshot, sprite, effects);
      if (enemy.kind === 'hanger') {
        hangerEvidence.push({ id: `enemy:${enemy.id}`, ...sprite });
      }
      this.contactShadow(`enemy:${enemy.id}`, enemy.x, enemy.y, isBossKind(enemy.kind) ? 2.2 : 1.2);
      if (charge) {
        const color = charge.kind === 'spit' ? 0x9aff6a : charge.kind === 'volley' ? 0xff3fc8 : 0xffb040;
        const size = isBossKind(enemy.kind) ? 200 : 90;
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 16, radius: size * (0.6 + 0.6 * charge.progress), color, intensity: 0.5 + 0.5 * charge.progress });
      } else if (isBossKind(enemy.kind)) {
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
      if (isBossKind(enemy.kind)) {
        this.drawBoss(enemy, body, effects, !spriteActive);
      } else {
        this.drawEnemy(enemy, body, effects, !spriteActive);
      }
    }

    this.drawDeathEffects(opening);

    for (const projectile of state.room.combat.projectiles) {
      this.drawProjectile(projectile, opening?.effectGraphics(`projectile:${projectile.id}`) ?? this.effectGraphics);
    }
    this.drawChainArcs(state);

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
    this.drawDashReadiness(state, playerEffects, fxTick);
    this.drawGazeCone(state, playerEffects);
    this.contactShadow('player', player.x, player.y, 1);
    // The janitor carries a little warm light, so the player never loses themself in the dark.
    opening?.addLight({ x: player.x, y: player.y - 10, radius: blackout ? 70 : 96, color: 0xffe6c8, intensity: blackout ? 0.5 : 0.62 });
    if (blackout) {
      // A flashlight: a cone of pools thrown along the aim, widening with distance.
      const fx = player.facing.x;
      const fy = player.facing.y;
      for (const [distance, radius, intensity] of [[46, 44, 0.85], [100, 62, 0.8], [160, 82, 0.7], [224, 100, 0.55]] as const) {
        opening?.addLight({ x: player.x + fx * distance, y: player.y - 8 + fy * distance, radius, color: 0xfff4d8, intensity });
      }
      // Eyes in the dark: every enemy shows where it is, not what it is doing.
      for (const enemy of state.room.combat.enemies) {
        opening?.addLight({ x: enemy.x, y: enemy.y - (isBossKind(enemy.kind) ? 70 : 34), radius: 18, color: enemy.kind === 'spitter' ? 0x9aff6a : 0xff2a3a, intensity: 0.95 });
      }
    }
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
    this.pruneEliteTags();
    this.pruneOfferIcons();
    this.pruneActorSprites();
    this.actorMovement.retain(new Set([
      'player',
      ...state.room.combat.enemies.map((enemy) => `enemy:${enemy.id}`),
    ]));
    this.pruneLabels(state);
  }

  /**
   * The Remote-Control Car, drawn only while the shift owns one: the PixelLab
   * car, facing the way it drives, bouncing and kicking up dust, its antenna
   * LED blinking amber on its own and cyan with a weapon mounted, a radio link
   * of moving dots back to the janitor (the leash), and sparks when it bumps
   * an enemy. Only RECALLING is spelled out.
   */
  private drawCarrier(
    state: MvpRunState,
    graphics = this.graphics,
    effects = graphics,
  ): void {
    const carrier = state.carrier;
    if (carrier === null) {
      this.clearLabel('carrier');
      this.carSprite?.setVisible(false);
      this.carLast = null;
      return;
    }
    const player = state.room.combat.player;
    const fused = carrier.mode === 'emitter';
    const tint = fused ? 0x3ff0ff : 0xffb040;
    const moveX = this.carLast ? carrier.x - this.carLast.x : 0;
    const moveY = this.carLast ? carrier.y - this.carLast.y : 0;
    const speed = Math.hypot(moveX, moveY);
    if (Math.abs(moveX) > 0.2) this.carFacing = moveX > 0 ? 1 : -1;
    // A bump resets the cooldown upward: that frame the car hit something.
    const bumped = this.carLast !== null && carrier.bumpCooldownTicks > this.carLast.bump;
    this.carLast = { x: carrier.x, y: carrier.y, bump: carrier.bumpCooldownTicks };

    // Radio link: dots running from the janitor out to the car.
    const dx = carrier.x - player.x;
    const dy = carrier.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    for (let d = (state.tick * 2) % 18; d < length; d += 18) {
      effects.fillStyle(tint, 0.55).fillCircle(player.x + (dx / length) * d, player.y - 10 + (dy / length) * d, 1.5);
    }

    // Dust behind the wheels while it drives.
    if (speed > 0.6 && state.tick % 3 === 0) this.carDust.push({ x: carrier.x - this.carFacing * 12, y: carrier.y + 4, born: state.tick });
    this.carDust = this.carDust.filter((puff) => state.tick - puff.born < 18);
    for (const puff of this.carDust) {
      const age = (state.tick - puff.born) / 18;
      effects.fillStyle(0xc8b8a0, 0.35 * (1 - age)).fillCircle(puff.x - this.carFacing * age * 6, puff.y - age * 6, 3 + age * 6);
    }

    // Driving it bounces; parked it idles, the motor rattling the body.
    const bob = speed > 0.6 ? Math.abs(Math.sin(state.tick / 2.5)) * 2 : (state.tick % 4 < 2 ? 0.8 : 0);
    // A glowing floor ring in the car's colour, so it reads on any floor.
    effects.lineStyle(2, tint, 0.8).strokeEllipse(carrier.x, carrier.y + 2, 46, 16);
    effects.fillStyle(tint, 0.12).fillEllipse(carrier.x, carrier.y + 2, 46, 16);
    const key = usableTextureKey(this.scene.textures, SCENE_TEXTURE_KEYS.rcCar);
    if (key) {
      if (!this.carSprite) this.carSprite = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.8);
      this.carSprite
        .setVisible(true)
        .setPosition(Math.round(carrier.x), Math.round(carrier.y - bob))
        .setScale(1.0 * this.carFacing, 1.0)
        .setDepth(presentationDepth('actor', carrier.y));
      this.contactShadow('carrier', carrier.x, carrier.y + 2, 0.5);
    } else {
      graphics.fillStyle(0xd0182a, 1).fillRoundedRect(carrier.x - 14, carrier.y - 10, 28, 14, 4);
    }
    // The antenna LED, and a mounted-weapon ring when the car carries one.
    const antenna = { x: carrier.x - this.carFacing * 21, y: carrier.y - 44 - bob };
    if (Math.floor(state.tick / 12) % 2 === 0) {
      effects.fillStyle(tint, 1).fillCircle(antenna.x, antenna.y, 2);
      effects.fillStyle(tint, 0.25).fillCircle(antenna.x, antenna.y, 6);
    }
    if (fused) {
      const pulse = 0.5 + 0.5 * Math.sin(state.tick / 5);
      effects.lineStyle(2, 0x3ff0ff, 0.5 + 0.4 * pulse).strokeEllipse(carrier.x, carrier.y - 14 - bob, 18 + pulse * 4, 8 + pulse * 2);
    }
    this.openingConcourse?.addLight({ x: carrier.x, y: carrier.y - 8, radius: 44, color: tint, intensity: 0.5 });
    if (bumped) this.carSparks = { x: carrier.x + this.carFacing * 16, y: carrier.y - 6, born: state.tick };
    if (this.carSparks && state.tick - this.carSparks.born < 10) {
      const age = (state.tick - this.carSparks.born) / 10;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const r1 = 6 + age * 14;
        const r2 = r1 + 8 * (1 - age);
        effects.lineStyle(2, 0xffd84a, 1 - age).lineBetween(this.carSparks.x + Math.cos(a) * r1, this.carSparks.y + Math.sin(a) * r1, this.carSparks.x + Math.cos(a) * r2, this.carSparks.y + Math.sin(a) * r2);
      }
      this.openingConcourse?.addLight({ x: this.carSparks.x, y: this.carSparks.y, radius: 70, color: 0xffd84a, intensity: 0.9 * (1 - age) });
    }

    if (carrier.recalling) this.setLabel('carrier', 'RECALLING', carrier.x, carrier.y - 56);
    else this.clearLabel('carrier');
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

    const player = state.room.combat.player;
    // Only the nearest available item's name grows, so neighbours never collide.
    let nearestId: string | null = null;
    let nearestDistance = 150;
    for (const offer of room?.offers ?? []) {
      if ((state.offerStatus[offer.id] ?? 'available') !== 'available') continue;
      const distance = Math.hypot(player.x - offer.position.x, player.y - offer.position.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = offer.id;
      }
    }
    for (const offer of room?.offers ?? []) {
      const status = state.offerStatus[offer.id] ?? 'available';
      const weapon = ITEM_CATALOG.find((definition) => definition.id === offer.itemDefinitionId)?.base !== undefined;
      const kindColor = weapon ? 0x3ff0ff : 0x6aff8a;
      if (status === 'available') {
        // Readable from across the room: a coloured loot beam and pedestal,
        // cyan for weapons and green for passives.
        const pulse = 0.55 + 0.25 * Math.sin((state.tick + offer.position.x) / 18);
        cues.fillStyle(kindColor, 0.1 * pulse).fillRect(offer.position.x - 9, offer.position.y - 58, 18, 58);
        cues.fillStyle(kindColor, 0.22 * pulse).fillRect(offer.position.x - 3, offer.position.y - 58, 6, 58);
        floor.fillStyle(kindColor, 0.18).fillEllipse(offer.position.x, offer.position.y, 40, 15);
        floor.lineStyle(2, kindColor, 0.9).strokeEllipse(offer.position.x, offer.position.y, 40, 15);
        const special = offer.id === blueLightOfferId(state);
        const name = itemDefinitionName(offer.itemDefinitionId).toUpperCase();
        this.offerName(offer.id, special ? `${name} - HALF PRICE` : name, weapon, offer.position.x, offer.position.y - 74, Math.hypot(player.x - offer.position.x, player.y - offer.position.y), offer.id === nearestId, special);
      } else if (status === 'carried') {
        floor.lineStyle(2, 0xffd84a, 1).strokeEllipse(offer.position.x, offer.position.y, 26, 10);
      } else {
        floor.lineStyle(1, 0x5a5e55, 0.8).strokeEllipse(offer.position.x, offer.position.y, 26, 10);
      }
      if (status === 'available' && offer.id === blueLightOfferId(state)) {
        // BLUE LIGHT SPECIAL: a spinning blue beacon over the half-price item.
        const spin = state.tick / 8;
        const bx = offer.position.x;
        // The beacon sits on the item's own ring, so there is no doubt which one is on sale.
        const by = offer.position.y - 72;
        cues.fillStyle(0x1a2a6a, 1).fillRect(bx + 18, by + 2, 12, 8);
        cues.fillStyle(Math.floor(state.tick / 10) % 2 === 0 ? 0x8ab4ff : 0x2a4aff, 1).fillCircle(bx + 24, by, 6);
        this.openingConcourse?.addLight({ x: bx + Math.cos(spin) * 60, y: offer.position.y - 30 + Math.sin(spin) * 22, radius: 80, color: 0x3a6aff, intensity: 0.9, squash: 0.6 });
      }
      if (status !== 'available') this.offerNames.get(offer.id)?.setVisible(false);
      this.offerIcon(offer.id, offer.itemDefinitionId, offer.position.x, offer.position.y, state.tick, status, kindColor);
      // The same run offer price the HUD card shows, so a world label can
      // never disagree with the discounted price the run actually charges.
      this.setLabel(
        `offer:${offer.id}`,
        runOfferPriceLabel(state, offer),
        offer.position.x + 12,
        offer.position.y - 12,
      );
    }
    // The grown name is wider than the gap to its neighbours: any name it
    // would run into steps aside (the store card names the item anyway).
    const featured = nearestId ? this.offerNames.get(nearestId) : undefined;
    if (featured?.visible) {
      const bounds = featured.getBounds();
      for (const [id, image] of this.offerNames) {
        if (id === nearestId || !image.visible) continue;
        const other = image.getBounds();
        const overlaps = other.right + 6 > bounds.left && other.left - 6 < bounds.right && other.bottom > bounds.top && other.top < bounds.bottom;
        if (overlaps) image.setVisible(false);
      }
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
    // Measured against the health it arrived with, so elites and retuned
    // enemies read correctly.
    const key = `enemy:${enemy.id}`;
    const max = Math.max(this.enemyMaxHealth.get(key) ?? 0, enemy.health);
    this.enemyMaxHealth.set(key, max);
    effects.fillRect(enemy.x - 13, barY + 1, 26 * Math.max(0, Math.min(1, enemy.health / max)), 2);
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
      } else if (windup.kind === 'blink') {
        // The Static's landing spot: a crackling ring at the real burst radius,
        // with jagged static lines that grow as it charges.
        const tx = windup.targetX ?? enemy.x;
        const ty = windup.targetY ?? enemy.y;
        const r = windup.reach ?? 48;
        const color = blink ? 0xffffff : 0x40e0ff;
        effects.fillStyle(0x40e0ff, 0.08 + 0.14 * p).fillEllipse(tx, ty, r * 2, r * 1.1);
        effects.lineStyle(3, color, 0.6 + 0.4 * p).strokeEllipse(tx, ty, r * 2, r * 1.1);
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + tick * 0.3;
          const len = r * (0.4 + 0.5 * p);
          effects.lineStyle(2, color, 0.7).lineBetween(tx + Math.cos(a) * 6, ty + Math.sin(a) * 4, tx + Math.cos(a + 0.4) * len, ty + Math.sin(a + 0.4) * len * 0.55);
        }
        // A thin thread back to the Static so the player knows who is coming.
        effects.lineStyle(1, 0x40e0ff, 0.35 * p).lineBetween(enemy.x, enemy.y - 30, tx, ty);
        this.drawAlert(effects, tx, ty - 44, p, 0x40e0ff);
      } else if (windup.kind === 'charge') {
        // The Bargain Hunter's lane: as wide as its body, as long as the charge.
        const length = windup.reach ?? 144;
        const color = blink ? 0xffffff : p > 0.6 ? 0xff5a3a : 0xffc040;
        const nx = -windup.aimY;
        const ny = windup.aimX;
        const w = enemy.radius + 6;
        const ex = enemy.x + windup.aimX * length;
        const ey = enemy.y + windup.aimY * length;
        const lane = [
          new Phaser.Math.Vector2(enemy.x + nx * w, enemy.y + ny * w),
          new Phaser.Math.Vector2(ex + nx * w, ey + ny * w),
          new Phaser.Math.Vector2(ex - nx * w, ey - ny * w),
          new Phaser.Math.Vector2(enemy.x - nx * w, enemy.y - ny * w),
        ];
        effects.fillStyle(color, 0.08 + 0.16 * p).fillPoints(lane, true);
        effects.lineStyle(2, color, 0.5 + 0.5 * p).strokePoints(lane, true);
        // Chevrons marching down the lane.
        for (let d = 24; d < length; d += 30) {
          const cx = enemy.x + windup.aimX * d;
          const cy = enemy.y + windup.aimY * d;
          effects.lineStyle(3, color, p).lineBetween(cx + nx * 8 - windup.aimX * 8, cy + ny * 8 - windup.aimY * 8, cx, cy).lineBetween(cx - nx * 8 - windup.aimX * 8, cy - ny * 8 - windup.aimY * 8, cx, cy);
        }
        this.drawAlert(effects, enemy.x, enemy.y - 70, p, 0xffc040);
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
    const payload = projectile.payload;
    const style = projectileStyle({
      sourceItemId: payload?.payloadEffect.sourceItemId ?? '',
      delivery: payload?.delivery ?? '',
      sticky: (payload?.statusEffects.length ?? 0) > 0,
      returning: projectile.phase === 'return',
      conductive: (payload?.reactionEffects.length ?? 0) > 0,
    });
    this.drawShot(projectile, style, graphics);
  }

  /**
   * Conductive chains as lightning: a jagged bolt from each enemy to the next,
   * re-jittered every couple of ticks, fading over the record's short life,
   * with a flash at every enemy it passes through. A single discharge (the
   * Extension Cord with no globe) is a crackle on the one target.
   */
  private drawChainArcs(state: MvpRunState): void {
    const g = this.effectGraphics;
    for (const arc of state.room.combat.chainArcs ?? []) {
      const age = state.tick - arc.tick;
      const life = 1 - age / 18;
      if (life <= 0) continue;
      const jitterSeed = Math.floor(state.tick / 2) + arc.tick;
      const noise = (n: number) => (Math.sin(n * 12.9898 + jitterSeed * 78.233) * 43758.5453) % 1;
      for (const point of arc.points) {
        g.fillStyle(0xfff27a, 0.35 * life).fillCircle(point.x, point.y - 12, 22);
        this.openingConcourse?.addLight({ x: point.x, y: point.y - 12, radius: 90, color: 0x9ad8ff, intensity: life });
      }
      if (arc.points.length === 1) {
        const p = arc.points[0]!;
        for (let i = 0; i < 5; i += 1) {
          const a = noise(i) * Math.PI * 2;
          g.lineStyle(2, 0xfff27a, life).lineBetween(p.x, p.y - 12, p.x + Math.cos(a) * 20, p.y - 12 + Math.sin(a) * 20);
        }
        continue;
      }
      for (let i = 1; i < arc.points.length; i += 1) {
        const from = arc.points[i - 1]!;
        const to = arc.points[i]!;
        const segments = 7;
        const nx = -(to.y - from.y);
        const ny = to.x - from.x;
        const nl = Math.hypot(nx, ny) || 1;
        const path: Array<{ x: number; y: number }> = [];
        for (let k = 0; k <= segments; k += 1) {
          const t = k / segments;
          const offset = k === 0 || k === segments ? 0 : noise(i * 10 + k) * 18;
          path.push({ x: from.x + (to.x - from.x) * t + (nx / nl) * offset, y: from.y - 12 + (to.y - from.y) * t + (ny / nl) * offset });
        }
        for (const [width, color, alpha] of [[7, 0x6a9aff, 0.35], [3, 0x9ad8ff, 0.9], [1, 0xffffff, 1]] as const) {
          g.lineStyle(width, color, alpha * life).beginPath();
          path.forEach((p, k) => (k === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
          g.strokePath();
        }
      }
    }
  }

  /** One player shot in its weapon's look: a trail, the body, then its modifiers. */
  private drawShot(projectile: ProjectileState, style: ProjectileStyle, g: Phaser.GameObjects.Graphics): void {
    const { x, y } = projectile;
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const ux = projectile.velocityX / speed;
    const uy = projectile.velocityY / speed;
    const angle = Math.atan2(uy, ux);
    // Drawn well above hitbox size: a 3 px bolt is invisible in a fight.
    const r = Math.max(6, projectile.radius * style.scale * 1.8);
    const t = projectile.remainingTicks + projectile.id * 7;
    this.openingConcourse?.addLight({ x, y, radius: 40 + r * 2, color: style.color, intensity: 0.8 });
    // Trails first, streaming back along the flight line.
    for (let i = 1; i <= 5; i += 1) {
      const bx = x - ux * i * (r * 0.9);
      const by = y - uy * i * (r * 0.9);
      const fade = 1 - i / 6;
      switch (style.trail) {
        case 'flame':
          g.fillStyle(i < 3 ? 0xffd84a : 0xff5a3a, 0.8 * fade).fillCircle(bx + Math.sin(t + i) * 1.5, by + Math.cos(t + i) * 1.5, r * (0.9 - i * 0.12));
          if (i > 3) g.fillStyle(0x5a5060, 0.3 * fade).fillCircle(bx - ux * 6, by - uy * 6, r * 0.8);
          break;
        case 'droplets':
          if (i % 2 === 0) g.fillStyle(0x9ae0ff, 0.7 * fade).fillCircle(bx + Math.sin(t * 0.7 + i) * 2, by + Math.cos(t * 0.7 + i) * 2, 1.8);
          break;
        case 'mist':
          g.fillStyle(0xe8f0ff, 0.18 * fade).fillCircle(bx, by, r * (0.5 + i * 0.1));
          break;
        case 'streamers':
          g.fillStyle(i % 2 === 0 ? 0xffd84a : 0x3ff0ff, 0.9 * fade).fillRect(bx + Math.sin(t + i * 2) * 4, by + Math.cos(t + i * 2) * 4, 3, 3);
          break;
        case 'ink':
          g.lineStyle(3, style.color, 0.6 * fade).lineBetween(bx, by, bx + ux * 6, by + uy * 6);
          break;
        case 'ice':
          if (i % 2 === 1) g.fillStyle(0xe0f0ff, 0.8 * fade).fillRect(bx - 1, by - 1, 2, 2);
          break;
        default:
          break;
      }
    }
    const perp = { x: -uy, y: ux };
    const tri = (a: number, b: number, c: number, d: number, e: number, f: number) => g.fillTriangle(a, b, c, d, e, f);
    switch (style.shape) {
      case 'droplet': {
        g.fillStyle(0x0a2a44, 0.9).fillCircle(x, y, r + 2);
        g.fillStyle(style.color, 1).fillCircle(x, y, r);
        tri(x + ux * r * 2, y + uy * r * 2, x + perp.x * r, y + perp.y * r, x - perp.x * r, y - perp.y * r);
        g.fillStyle(style.accent, 1).fillCircle(x - ux * r * 0.3 - perp.x * r * 0.3, y - uy * r * 0.3 - perp.y * r * 0.3, r * 0.35);
        break;
      }
      case 'rocket': {
        const nose = { x: x + ux * r * 1.6, y: y + uy * r * 1.6 };
        const tail = { x: x - ux * r * 1.4, y: y - uy * r * 1.4 };
        g.lineStyle(r * 1.1, style.color, 1).lineBetween(tail.x, tail.y, nose.x, nose.y);
        g.fillStyle(0xffffff, 1);
        tri(nose.x + ux * r, nose.y + uy * r, nose.x + perp.x * r * 0.6, nose.y + perp.y * r * 0.6, nose.x - perp.x * r * 0.6, nose.y - perp.y * r * 0.6);
        g.fillStyle(style.accent, 1);
        tri(tail.x, tail.y, tail.x - ux * r + perp.x * r, tail.y - uy * r + perp.y * r, tail.x + perp.x * r * 0.3, tail.y + perp.y * r * 0.3);
        tri(tail.x, tail.y, tail.x - ux * r - perp.x * r, tail.y - uy * r - perp.y * r, tail.x - perp.x * r * 0.3, tail.y - perp.y * r * 0.3);
        break;
      }
      case 'confetti': {
        g.fillStyle(0x1a0a2a, 0.8).fillCircle(x, y, r + 2);
        const colors = [0xff3fc8, 0xffd84a, 0x3ff0ff, 0x6aff8a];
        for (let i = 0; i < 6; i += 1) {
          const a = t * 0.4 + i * (Math.PI / 3);
          g.fillStyle(colors[i % 4]!, 1).fillRect(x + Math.cos(a) * r * 0.8 - 1.5, y + Math.sin(a) * r * 0.8 - 1.5, 3, 3);
        }
        g.fillStyle(style.color, 1).fillCircle(x, y, r * 0.5);
        break;
      }
      case 'cloud': {
        for (let i = 0; i < 4; i += 1) {
          const a = t * 0.2 + i * (Math.PI / 2);
          g.fillStyle(i % 2 === 0 ? style.color : style.accent, 0.75).fillCircle(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * 0.6);
        }
        break;
      }
      case 'dart': {
        const head = { x: x + ux * r * 1.8, y: y + uy * r * 1.8 };
        g.lineStyle(4, 0x05030a, 1).lineBetween(x - ux * r * 1.5, y - uy * r * 1.5, head.x, head.y);
        g.lineStyle(2, style.color, 1).lineBetween(x - ux * r * 1.5, y - uy * r * 1.5, head.x, head.y);
        g.fillStyle(style.color, 1);
        tri(head.x + ux * 5, head.y + uy * 5, head.x + perp.x * 3, head.y + perp.y * 3, head.x - perp.x * 3, head.y - perp.y * 3);
        break;
      }
      case 'ball': {
        g.fillStyle(0x05030a, 0.9).fillCircle(x, y, r + 2);
        g.fillStyle(style.color, 1).fillCircle(x, y, r);
        // Foam seams spinning as it flies.
        g.lineStyle(2, style.accent, 1).beginPath().arc(x, y, r * 0.7, t * 0.5, t * 0.5 + Math.PI * 0.8).strokePath();
        g.fillStyle(0xffffff, 0.8).fillCircle(x - r * 0.35, y - r * 0.35, r * 0.25);
        break;
      }
      case 'slush': {
        g.fillStyle(0x1a0a2a, 0.9).fillCircle(x, y, r + 2);
        g.fillStyle(style.color, 1).fillCircle(x, y, r);
        g.fillStyle(style.accent, 1).fillCircle(x + perp.x * r * 0.3, y + perp.y * r * 0.3, r * 0.55);
        for (let i = 0; i < 3; i += 1) g.fillStyle(0xffffff, 0.9).fillRect(x + Math.cos(t + i * 2) * r * 0.5, y + Math.sin(t + i * 2) * r * 0.5, 2, 2);
        break;
      }
      case 'bubble': {
        const wob = Math.sin(t / 3) * 1.5;
        g.fillStyle(0xb8f0ff, 0.18).fillEllipse(x, y, (r + wob) * 2, (r - wob) * 2);
        g.lineStyle(2, [0xff9af0, 0x9af0ff, 0xf0ff9a][Math.floor(t / 6) % 3]!, 0.9).strokeEllipse(x, y, (r + wob) * 2, (r - wob) * 2);
        g.fillStyle(0xffffff, 0.9).fillEllipse(x - r * 0.4, y - r * 0.45, r * 0.5, r * 0.3);
        break;
      }
      default: {
        g.fillStyle(style.color, 1).fillCircle(x, y, r);
        g.lineStyle(2, 0x2b3a44, 0.9).strokeCircle(x, y, r + 2);
      }
    }
    if (projectile.hasBurst === true) g.lineStyle(2, style.accent, 0.5).strokeCircle(x, y, r + 7);
    // Modifiers ride on top of the base look.
    if (style.drip) {
      g.fillStyle(0xd7a45c, 0.95).fillCircle(x, y + r + 2, 2.5);
      g.fillStyle(0xd7a45c, 0.7).fillCircle(x - ux * 8, y - uy * 8 + r + 4 + (t % 6), 2);
    }
    if (style.rewind) {
      // Rewinding: a VHS-blue ghost of the shot, doubled back along its path.
      g.lineStyle(2, 0x6a9aff, 0.9).strokeCircle(x, y, r + 5);
      g.fillStyle(0x6a9aff, 0.35).fillCircle(x + ux * 8, y + uy * 8, r);
      tri(x - ux * (r + 10), y - uy * (r + 10), x - ux * (r + 4) + perp.x * 4, y - uy * (r + 4) + perp.y * 4, x - ux * (r + 4) - perp.x * 4, y - uy * (r + 4) - perp.y * 4);
    }
    if (style.sparks) {
      for (let i = 0; i < 3; i += 1) {
        const a = (t * 1.7 + i * 2.1) % (Math.PI * 2);
        const sx = x + Math.cos(a) * (r + 3);
        const sy = y + Math.sin(a) * (r + 3);
        g.lineStyle(2, 0xfff27a, 0.95).lineBetween(sx, sy, sx + Math.cos(a + 1) * 5, sy + Math.sin(a + 1) * 5);
      }
    }
    void angle;
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
    const t = this.scene.time.now / 1000;
    if (statuses.wetTicks > 0) {
      // Soaked: a blue sheen, a puddle underfoot, and drops falling off.
      graphics.fillStyle(0x4ac8ff, 0.22).fillEllipse(enemy.x, enemy.y + enemy.radius * 0.6, enemy.radius * 3.2, enemy.radius * 1.1);
      graphics.lineStyle(2, 0x6fd0ff, 0.9).strokeEllipse(enemy.x, enemy.y + enemy.radius * 0.6, enemy.radius * 3.2, enemy.radius * 1.1);
      for (let i = 0; i < 3; i += 1) {
        const fall = ((t * 1.6 + i / 3 + enemy.id * 0.13) % 1);
        const dx = (i - 1) * enemy.radius * 0.7;
        graphics.fillStyle(0x9ae0ff, 1 - fall * 0.7).fillEllipse(enemy.x + dx, enemy.y - enemy.radius * 2.4 + fall * enemy.radius * 3, 4, 7);
      }
    }
    if (statuses.stickyTicks > 0) {
      // Gummed up: amber goo strands hanging off it, and a sticky smear.
      graphics.fillStyle(0xd7a45c, 0.35).fillEllipse(enemy.x, enemy.y + enemy.radius * 0.7, enemy.radius * 2.6, enemy.radius * 0.9);
      for (let i = 0; i < 4; i += 1) {
        const sx = enemy.x + (i - 1.5) * enemy.radius * 0.55;
        const stretch = 6 + Math.sin(t * 3 + i + enemy.id) * 4;
        graphics.lineStyle(3, 0xe0a040, 0.95).lineBetween(sx, enemy.y - enemy.radius, sx + Math.sin(t + i) * 2, enemy.y + stretch);
        graphics.fillStyle(0xffd070, 1).fillCircle(sx + Math.sin(t + i) * 2, enemy.y + stretch, 3);
      }
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
    // Reduced flashes: sprites never go solid white on a hit or a release.
    if (pose.flash && !flashAllowed(gameSettings().get())) pose = { ...pose, flash: false };
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

  private readonly enemyMaxHealth = new Map<string, number>();
  private readonly eliteTags = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedEliteTags = new Set<string>();

  private eliteTag(id: string, x: number, y: number): void {
    const label = ensurePixelLabel(this.scene, 'CLEARANCE', '#ffd84a', 1, '#2a1400');
    let tag = this.eliteTags.get(id);
    if (!tag) {
      tag = this.scene.add.image(0, 0, label.key).setDepth(presentationDepth('prompt', 2));
      this.eliteTags.set(id, tag);
    }
    this.usedEliteTags.add(id);
    tag.setVisible(true).setPosition(Math.round(x), Math.round(y));
  }

  private pruneEliteTags(): void {
    for (const [id, tag] of this.eliteTags) {
      if (!this.usedEliteTags.has(id)) {
        tag.destroy();
        this.eliteTags.delete(id);
      }
    }
    this.usedEliteTags.clear();
  }

  /**
   * With a mannequin in the room, a faint cone shows where the janitor is
   * looking — exactly the arc (and reach) that freezes them.
   */
  private drawGazeCone(state: MvpRunState, effects: Phaser.GameObjects.Graphics): void {
    if (state.status !== 'playing') return;
    const mannequins = state.room.combat.enemies.filter((enemy) => enemy.kind === 'mannequin' && enemy.health > 0);
    if (mannequins.length === 0) return;
    const player = state.room.combat.player;
    const aim = Math.atan2(player.facing.y, player.facing.x);
    // Watching works at any range with a clear line; the cone spans the room.
    const reach = 620;
    const points = [new Phaser.Math.Vector2(player.x, player.y - 10)];
    for (let i = 0; i <= 10; i += 1) {
      const a = aim - WATCH_HALF_ANGLE + (2 * WATCH_HALF_ANGLE * i) / 10;
      points.push(new Phaser.Math.Vector2(player.x + Math.cos(a) * reach, player.y - 10 + Math.sin(a) * reach));
    }
    const anyWatched = mannequins.some((enemy) => enemy.phase !== 'pursue');
    effects.fillStyle(anyWatched ? 0x3ff0ff : 0xff5a6a, 0.05).fillPoints(points, true);
    effects.lineStyle(1, anyWatched ? 0x3ff0ff : 0xff5a6a, 0.3);
    effects.lineBetween(player.x, player.y - 10, points[1]!.x, points[1]!.y);
    effects.lineBetween(player.x, player.y - 10, points.at(-1)!.x, points.at(-1)!.y);
  }

  /** First tick an id was seen in this room; a new room starts a fresh map. */
  private firstSeen(scope: string, id: string, tick: number): number {
    if (scope !== this.enemyScope) {
      this.enemyScope = scope;
      this.enemyFirstSeen.clear();
      this.enemyMaxHealth.clear();
    }
    let seen = this.enemyFirstSeen.get(id);
    if (seen === undefined || seen > tick) {
      seen = tick;
      this.enemyFirstSeen.set(id, seen);
    }
    return seen;
  }

  /**
   * A thin ring under the janitor that refills as the dash cools down and
   * flashes once when it is ready again, plus a SPACE DASH hint over them when
   * an attack is about to land on them and they have not learned the dash.
   */
  private drawDashReadiness(state: MvpRunState, effects: Phaser.GameObjects.Graphics, fxTick: number): void {
    const player = state.room.combat.player;
    const live = state.status === 'playing' && !state.paused;
    const readiness = dashReadiness(player);
    if ((player.dashTicks ?? 0) === DASH_TICKS) this.dashesThisRun += 1;
    if (readiness >= 1 && this.lastReadiness < 1) this.readyFlashTick = fxTick;
    this.lastReadiness = readiness;
    if (live && readiness < 1) {
      const start = -Math.PI / 2;
      effects.lineStyle(2, 0x3a3050, 0.7).strokeEllipse(player.x, player.y + 2, 40, 16);
      effects.lineStyle(3, 0x3ff0ff, 0.9);
      effects.beginPath();
      // An ellipse arc drawn as a short polyline, filling clockwise.
      const steps = 20;
      for (let i = 0; i <= steps; i += 1) {
        const a = start + (Math.PI * 2 * readiness * i) / steps;
        const x = player.x + Math.cos(a) * 20;
        const y = player.y + 2 + Math.sin(a) * 8;
        if (i === 0) effects.moveTo(x, y);
        else effects.lineTo(x, y);
      }
      effects.strokePath();
    }
    const flashAge = fxTick - this.readyFlashTick;
    if (live && flashAge >= 0 && flashAge < 10) {
      effects.lineStyle(3, 0xffffff, 1 - flashAge / 10).strokeEllipse(player.x, player.y + 2, 40 + flashAge * 3, 16 + flashAge);
    }
    const hint = live && shouldHintDash(this.threats, player, readiness, this.dashesThisRun);
    if (hint) {
      const label = ensurePixelLabel(this.scene, 'SPACE: DASH!', '#3ff0ff', 2, '#06121a');
      if (!this.dashHint) this.dashHint = this.scene.add.image(0, 0, label.key).setDepth(presentationDepth('prompt', 40));
      if (this.dashHint.texture.key !== label.key) this.dashHint.setTexture(label.key);
      const bob = Math.sin(fxTick / 4) * 2;
      // Kept fully on screen even when the janitor hugs a wall.
      const half = this.dashHint.width / 2 + 6;
      const hx = Math.max(half, Math.min(960 - half, player.x));
      // Under the feet, by the dash ring it refers to: damage numbers and
      // OUCH! float up from the head, so the two never stack.
      this.dashHint.setVisible(true).setPosition(Math.round(hx), Math.round(Math.min(466, player.y + 40) + bob)).setScale(1 + Math.max(0, 0.15 * Math.sin(fxTick / 3)));
    } else {
      this.dashHint?.setVisible(false);
    }
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
    const since = this.scene.time.now - this.endedAt;
    return state.tick + Math.floor((this.timeWarp ? this.timeWarp(since) : since) / (1000 / 60));
  }

  /** Slow motion for the effects that play out after the shift ends; null restores real time. */
  public setEffectsTimeWarp(warp: ((realMs: number) => number) | null): void {
    this.timeWarp = warp;
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
      const snack = token.kind === 'snack';
      if (!sprite) {
        sprite = this.scene.add.image(token.x, token.y, snack ? FX_TEXTURES.pretzel : FX_TEXTURES.token).setDepth(presentationDepth('actor', token.y - 1));
        this.tokenSprites.set(token.id, sprite);
      }
      const age = state.tick - token.droppedTick;
      if (snack) {
        // A pretzel sits still and glows warm; it pulses when the janitor is hurt.
        const hop = age < 18 ? Math.sin((age / 18) * Math.PI) * 18 : 0;
        const hurt = state.room.combat.player.health < runMaxHealth(state);
        const pulse = hurt ? 1 + 0.12 * Math.sin(state.tick / 6) : 1;
        sprite.setPosition(Math.round(token.x), Math.round(token.y - 8 - hop)).setScale(2 * pulse);
        this.contactShadow(`token:${token.id}`, token.x, token.y, 0.45);
        this.openingConcourse?.addLight({ x: token.x, y: token.y - 8, radius: hurt ? 50 : 34, color: 0xffa040, intensity: hurt ? 0.9 : 0.55 });
        continue;
      }
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
  /** The item's name over its pedestal: dim from afar, bright up close. */
  private offerName(offerId: string, name: string, weapon: boolean, x: number, y: number, distance: number, featured: boolean, special = false): void {
    const label = ensurePixelLabel(this.scene, name, special ? '#8ab4ff' : weapon ? '#3ff0ff' : '#6aff8a', 1, '#05030a');
    let image = this.offerNames.get(offerId);
    if (!image) {
      image = this.scene.add.image(0, 0, label.key).setDepth(presentationDepth('prompt', 4));
      this.offerNames.set(offerId, image);
    }
    if (image.texture.key !== label.key) image.setTexture(label.key);
    image.setVisible(true).setPosition(Math.round(x), Math.round(y)).setScale(featured ? 2 : 1).setAlpha(featured || distance < 320 ? 1 : 0.65);
  }

  private offerIcon(offerId: string, itemDefinitionId: string, x: number, y: number, tick: number, status: string, ring = 0x6aff8a): void {
    const key = itemIconKey(itemDefinitionId);
    const usable = key ? usableTextureKey(this.scene.textures, key) : null;
    if (!usable) return;
    this.usedOfferIcons.add(offerId);
    let icon = this.offerIcons.get(offerId);
    if (!icon) {
      icon = this.scene.add.image(x, y, usable);
      this.offerIcons.set(offerId, icon);
    }
    const scale = Math.min(36 / icon.width, 36 / icon.height);
    const bob = Math.sin((tick + x) / 14) * 2;
    if (status === 'available') {
      // A dark disc and a coloured ring behind the icon so it reads on any floor.
      const iy = Math.round(y - 40 + bob);
      this.effectGraphics.fillStyle(0x05030a, 0.85).fillCircle(Math.round(x), iy, 24);
      this.effectGraphics.lineStyle(2, ring, 1).strokeCircle(Math.round(x), iy, 24);
    }
    icon.setPosition(Math.round(x), Math.round(y - 40 + bob)).setScale(scale)
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
        this.offerNames.get(id)?.destroy();
        this.offerNames.delete(id);
      }
    }
  }

  private clearDashGhosts(): void {
    for (const ghost of this.dashGhosts) ghost.image.destroy();
    this.dashGhosts.length = 0;
  }

  public destroy(): void {
    this.clearDashGhosts();
    this.carSprite?.destroy();
    this.carSprite = null;
    this.dashHint?.destroy();
    this.dashHint = null;
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
    this.timeWarp = null;
    this.feedback.resetRoom('');
    this.weapon.reset();
    this.clearDashGhosts();
    this.dashesThisRun = 0;
    this.enemyFirstSeen.clear();
    this.enemyScope = '';
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

  /** Forwards the last-heart pulse to the feedback layer. */
  public heartbeat(active: boolean, sinceBeatMs: number): void {
    this.feedback.heartbeat(active, sinceBeatMs);
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
