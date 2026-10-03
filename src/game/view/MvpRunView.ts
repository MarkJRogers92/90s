/**
 * Graybox/vector presentation for the M5 MVP run.
 *
 * The view draws the current room only: floor, walls, doorways, store
 * fixtures with offer labels, the security sweep cone, the Bench Warrant
 * kiosk, and the room-local combat entities. It reads authoritative run
 * state and never mutates it; damage, movement, economy, and transitions
 * stay in `src/sim`.
 */
import { runDashCooldown } from '../../sim/run/perks';
import Phaser from 'phaser';
import { BOSS_MAX_HEALTH, BOSS_SLAM_REACH, isBossKind } from '../../sim/combat/boss';
import { itemDefinitionName, runOfferPriceLabel } from '../../sim/run/economy';
import { ITEM_CATALOG } from '../../sim/items/catalog';
import type { EnemyState, ProjectileState, Rect, SurfacePatchState } from '../../sim/model';
import type { MvpRunState } from '../../sim/run/types';
import { alarmTicksFor } from '../../sim/run/heist';
import { wingEventFor } from '../../sim/run/wingEvents';
import { sprinklerStreaks } from './sprinklerRain';
import { INTERIOR_BOUNDS, INTERIOR_EXIT, STORE_ENTRANCE_HALF_WIDTH, activeStore, roomStores, storeEntrance } from '../../sim/run/storeInterior';
import {
  ARCADE_CABINET,
  ARCADE_PLAY_COST,
  BALL_RADIUS,
  LISTENING_BOOTH,
  LISTEN_TICKS,
  OVEN_ZONE,
  PAINT_SPILLS,
  PITCHING_MACHINE,
  REWIND_TILE,
  STATIC_ZONES,
  ovenPhase,
  pitchWindingUp,
  staticHides,
  type StoreTwistState,
  BUZZER_TILES,
  CACTUS_POTS,
  HAIRSPRAY_ZONES,
  SAMPLE_BOWL,
  STUDIO_FLASH_LANE,
  studioFlashPhase,
  COLD_SNAP_RADIUS,
  FROSTY_MACHINE,
  HOCK_PRICE,
  HOCK_TICKS,
  LIGHTNING_ROD,
  MUSTARD_SPILLS,
  PAWN_COUNTER,
  ROD_ZAP_TICKS,
  coldSnapPhase,
  glareBand,
} from '../../sim/run/storeTwists';
import { alarmCue } from './alarmCues';
import { policeWash, stalkerCue } from './stalkerCues';
import { PROP_TEXTURES } from '../presentation/rooms/roomDressing';
import { HeroPropView } from './HeroPropView';
import { SECRET_MACHINE, secretMachineHere } from '../../sim/run/secretRoom';
import { SHORTCUT_HATCH, shortcutHere } from '../../sim/run/shortcut';
import { VOLATILE_BURST_RADIUS, VOLATILE_FUSE_TICKS } from '../../sim/combat/eliteTraits';

import { presentationDepth } from '../presentation/depth';
import { isBackHallLightingPilot } from '../presentation/lighting/backHallLightingPilot';
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
import { flashAllowed, flickerTick, gameSettings, shakeScale } from '../settings/settings';
import { SPAWN_IN_TICKS, dashReadiness, shouldHintDash, spawnInPose } from './playerCues';
import { attackFrameFor, combinePoses, glow, dashPose, enemyWindups, playerBodyAction, windupPose, type PlayerBodyAction, type Windup } from './combatBeats';
import { MallRoomView } from './MallRoomView';
import { CombatFeedback } from './CombatFeedback';
import { hurtOutranksAttack, materialHurtKey, type EnemyHurtFrame } from './EnemyReactionView';
import { LootView } from './LootView';
import { ELITE_GLYPHS, eliteRingSegments, type EliteMarkTrait } from './eliteMarks';
import { WeaponView } from './WeaponView';
import { WeaponEffectView } from './WeaponEffectView';
import { enemySpriteSheet } from './ActorSpriteView';
import { ENEMY_TEXTURE_KEYS, PLAYER_TEXTURE_KEYS, SCENE_TEXTURE_KEYS, characterFrameSize, itemIconKey } from '../presentation/assets';
import { usableItemIcon } from '../presentation/fusedIconTexture';
import { revealSparkCount, type FusionRevealModel } from '../ui/fusionRevealModel';
import { projectileStyle, type ProjectileStyle } from './projectileStyle';
import { FX_TEXTURES, ensurePixelLabel } from '../presentation/neon/proceduralTextures';
import type { ConcourseAmbienceSnapshot } from './ConcourseAmbience';
import { shouldDrawDirectAttackArc } from './visualState';
import { TAR_PUDDLE_TICKS } from '../../sim/combat/tar';
import type { TarPuddle } from '../../sim/model';
import { ELF_HOP_TICKS } from '../../sim/combat/districtEnemies';

/** How each kind of Clearance elite looks (round 57): aura colour, tag text and colour, and body tint. */
const ELITE_LOOK = {
  plain: { color: 0xffd84a, css: '#ffd84a', label: 'CLEARANCE', tint: 0x302000 },
  swift: { color: 0x3ff0ff, css: '#3ff0ff', label: 'SWIFT', tint: 0x003040 },
  volatile: { color: 0xff7a2a, css: '#ff9a3a', label: 'VOLATILE', tint: 0x401800 },
} as const;

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

/** How high an elf in the air is drawn (round 50): a parabola over its leap. Presentation only. */
function elfLift(enemy: EnemyState): number {
  if (enemy.kind !== 'elf' || enemy.phase !== 'pursue' || (enemy.chargeTicks ?? 0) <= 0) return 0;
  const t = 1 - (enemy.chargeTicks ?? 0) / ELF_HOP_TICKS;
  return Math.sin(t * Math.PI) * 46;
}

export class MvpRunView {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly effectGraphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Image>();
  private readonly actorMemory = new ActorPresentationMemory();
  private readonly actorMovement = new ActorMovementMemory();
  private readonly deathEffects = new ActorDeathEffectLifecycle();
  private readonly actorSprites = new Map<string, ActorSpriteView>();
  /** Screen-fixed red/blue edge glow while Loss Prevention is in the room. */
  private policeGlow: Phaser.GameObjects.Graphics | null = null;
  private readonly usedActorSpriteIds = new Set<string>();
  private openingConcourse: MallRoomView | undefined;
  private mallRoomKey = '';
  private readonly feedback: CombatFeedback;
  private readonly weapon: WeaponView;
  private readonly weaponEffects: WeaponEffectView;
  private readonly offerIcons = new Map<string, Phaser.GameObjects.Image>();
  private readonly offerNames = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedOfferIcons = new Set<string>();
  /** Mall Mart's carts, one image each, by cart id. */
  private readonly cartImages = new Map<number, Phaser.GameObjects.Image>();
  /** Round 53: props and hero fusions. */
  private readonly heroProps: HeroPropView;
  /** Round 35: the themed stores' twist props (machine, toys, booth, oven), by id. */
  private readonly twistImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedTwistImages = new Set<string>();
  private readonly storeGraphics: Phaser.GameObjects.Graphics;
  private readonly loot: LootView;
  private readonly shadows = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedShadows = new Set<string>();
  private concourseAmbience: ConcourseAmbienceSnapshot | null = null;
  /** Real time the shift ended in death; the sim clock stops at game over. */
  private deadSince: number | null = null;
  /** Real time the shift ended (won or dead), for the effects clock. */
  private endedAt: number | null = null;
  /**
   * Effect ticks that played while a cinematic held the sim (the boss title
   * card). Added to every effects tick so spawn-ins, idles and feedback keep
   * moving under the card, and the clock never runs backwards afterwards.
   */
  private heldTicks = 0;
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
    this.weaponEffects = new WeaponEffectView(scene);
    this.storeGraphics = scene.add.graphics().setDepth(presentationDepth('decal', 800));
    this.heroProps = new HeroPropView(scene);
    this.loot = new LootView(scene);
  }

  /** Presentation observation only; called after each authoritative fixed step. */
  public observeLoot(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    if (!room) return;
    this.loot.observe(state, `${state.seed}:${state.wing.floor ?? 1}:${state.roomIndex}:${room.id}:${state.room.interior ? `inside-${state.room.storeIndex}` : 'concourse'}`);
  }

  /** Where the janitor stood last frame, for effects fired from outside a sync. */
  private lastPlayer: { x: number; y: number } | null = null;

  public sync(state: MvpRunState): void {
    this.lastPlayer = { x: state.room.combat.player.x, y: state.room.combat.player.y };
    const graphics = this.graphics;
    const room = state.wing.rooms[state.roomIndex];
    if (!room) {
      this.weaponEffects.reset();
      return;
    }
    // Going into a store and back out rebuilds the room, like a doorway.
    const roomKey = `${state.roomIndex}:${room.id}:${state.room.interior ? `inside-${state.room.storeIndex}` : 'concourse'}`;
    // The lighting pilot can end even when a restored room has the same ID.
    // Keep loot/weapon event scopes unchanged; only the room view uses this key.
    const mallRoomKey = `${roomKey}${isBackHallLightingPilot(state) ? ':lighting-pilot' : ''}`;
    this.weaponEffects.beginFrame(roomKey, state.tick);
    if (this.mallRoomKey !== mallRoomKey) this.weapon.reset();
    if (this.openingConcourse && this.mallRoomKey !== mallRoomKey) {
      this.concourseAmbience = this.openingConcourse.leaveRoom(state.tick);
      this.openingConcourse.destroy();
      this.openingConcourse = undefined;
    }
    if (!this.openingConcourse) {
      this.openingConcourse = new MallRoomView(this.scene, graphics, state);
      this.mallRoomKey = mallRoomKey;
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

    const inside = activeStore(state);
    if (inside) {
      this.drawStore(state, inside.templateId);
    } else if (!state.room.interior) {
      // Not in the back room (round 53), which is inside but no store.
      roomStores(room).forEach((_, index) => this.drawStoreEntrance(state, index));
    }
    // Every frame, so a store's carts and labels go away with the store.
    this.drawStoreTwist(state);

    // Sprinklers (a floor event): pale streaks of spray over the whole room.
    if (wingEventFor(state.wing) === 'sprinklers') {
      this.effectGraphics.lineStyle(1.5, 0xb4e6ff, 0.5);
      for (const streak of sprinklerStreaks(state.tick)) {
        this.effectGraphics.lineBetween(streak.x, streak.y, streak.x - 2, streak.y + streak.length);
      }
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
    if (this.actorMovement.beginScope(actorScope, state.tick)) this.actorMemory.reset();
    this.deathEffects.sync(
      actorScope,
      state.tick,
      state.room.combat.enemies.map((enemy) => ({ id: `enemy:${enemy.id}`, kind: enemy.kind, x: enemy.x, y: enemy.y })),
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
      (id) => this.actorMemory.facingFor(id),
    );
    for (const patch of state.room.combat.surfaces) {
      this.drawSurfacePatch(patch, opening?.effectGraphics(`patch:${patch.id}`) ?? this.effectGraphics);
    }
    // Tar is on the floor: the decal layer, under everyone standing in it.
    for (const puddle of state.room.combat.tar ?? []) this.drawTarPuddle(puddle, this.storeGraphics, state.tick);
    // Glamour Row: perfume clouds hang above the floor, so they go on the effect layer.
    for (const cloud of state.room.combat.perfume ?? []) this.drawPerfumeCloud(cloud, this.effectGraphics, state.tick);
    // Round 53: carts, soda machines, racks, and the hero fusions' moves.
    this.heroProps.sync(state.room.combat, state.tick, {
      floor: this.storeGraphics,
      effects: this.effectGraphics,
      light: (x, y, radius, color, intensity) => this.openingConcourse?.addLight({ x, y, radius, color, intensity }),
      shadow: (id, x, y, scale) => this.contactShadow(id, x, y, scale),
    });

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
        // An elf mid-leap is drawn up its arc; its shadow stays on the floor.
        x: enemy.x, y: enemy.y - elfLift(enemy), moveX: faced.x, moveY: faced.y,
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
      if (enemy.elite) {
        // CLEARANCE: a pulsing aura and a price-tag label. Gold for the plain elite;
        // a Swift one is cyan and a Volatile one orange (round 57), so the trait reads at a glance.
        const trait = enemy.trait ?? 'plain';
        const look = ELITE_LOOK[trait];
        const glow = 0.6 + 0.3 * Math.sin(state.tick / (enemy.trait === 'swift' ? 4 : 7) + enemy.id);
        this.openingConcourse?.addLight({ x: enemy.x, y: enemy.y - 20, radius: 70, color: look.color, intensity: 0.5 * glow });
        const tagWidth = this.eliteTag(`enemy:${enemy.id}`, enemy.x, enemy.y - 70, look.label, look.css);
        this.drawEliteMark(effects, enemy, trait, state.tick, glow, tagWidth / 2, !flashAllowed(gameSettings().get()));
      }
      const sheet = enemySpriteSheet(enemySnapshot.kind, false);
      const attackFrames = sheet ? this.sheetColumns(sheet.attack) : 0;
      const attackColumn = attackFrameFor(enemy, windups, attackFrames, state.tick);
      let shown = enemy.elite ? combinePoses(pose, { offsetX: 0, offsetY: 0, scaleX: 1.18, scaleY: 1.18, flash: false, tint: ELITE_LOOK[enemy.trait ?? 'plain'].tint }) : pose;
      // Soaked enemies glow blue and gummed-up ones amber, so a status reads at a glance.
      const wet = (enemy.statuses?.wetTicks ?? 0) > 0;
      const sticky = (enemy.statuses?.stickyTicks ?? 0) > 0;
      if (wet || sticky) {
        const pulse = 0.75 + 0.25 * Math.sin(state.tick / 8 + enemy.id);
        shown = combinePoses(shown, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false, tint: wet ? glow(0x2a90ff, 0.55 * pulse) : glow(0xd08a20, 0.5 * pulse) });
      }
      const flinchFirst = hurtOutranksAttack(enemy.kind);
      const hurt = this.feedback.hurtFor(`enemy:${enemy.id}`, fxTick, !flinchFirst && (attackColumn !== null || charge !== undefined));
      this.drawMannequinEyes(enemySnapshot, effects, hurt);
      if (!hurt && enemy.kind === 'mannequin' && enemy.phase === 'pursue') {
        // A moving mannequin jitters, like a bad stop-motion frame.
        shown = combinePoses(shown, { offsetX: ((state.tick * 7) % 3) - 1, offsetY: ((state.tick * 5) % 3) - 1, scaleX: 1, scaleY: 1, flash: false });
      }
      const sprite = this.syncActorSprite(enemySnapshot, state.tick, actorDepth, shown, hurt && flinchFirst ? null : attackColumn, null, hurt);
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
      this.drawProjectile(projectile, opening?.effectGraphics(`projectile:${projectile.id}`) ?? this.effectGraphics, state.tick, state.status !== 'dead');
    }
    this.drawChainArcs(state);

    this.drawCarrier(
      state,
      state.carrier ? opening?.actorGraphics('carrier', state.carrier.y) ?? graphics : graphics,
      state.carrier ? opening?.effectGraphics('carrier') ?? this.effectGraphics : this.effectGraphics,
    );
    this.drawStalker(
      state,
      fxTick,
      state.stalker ? opening?.effectGraphics('stalker') ?? this.effectGraphics : this.effectGraphics,
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
    this.loot.sync(state, `${state.seed}:${state.wing.floor ?? 1}:${roomKey}`, {
      shadow: (id, x, y, scale) => this.contactShadow(id, x, y, scale),
      light: light => opening?.addLight(light),
    });
    for (const light of this.feedback.drainLights()) opening?.addLight(light);
    for (const projectile of state.room.combat.projectiles) {
      const enemyShot = projectile.faction === 'enemy';
      if (!enemyShot && state.status === 'dead') continue;
      opening?.addLight({ x: projectile.x, y: projectile.y, radius: enemyShot ? 46 : 36, color: enemyShot ? 0xff3fc8 : 0x9ad8ff, intensity: 0.85 });
    }
    opening?.renderLighting(state.tick);
    opening?.endFrame();
    this.weaponEffects.endFrame();
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

  /**
   * Loss Prevention on a four-star janitor's trail (see stalker.ts). While he
   * is on his way the door he will use strobes red and blue under a
   * countdown; once he is in, a person-sized agent in the Loss Prevention
   * Manager's suit, tinted cold, walks the janitor down behind a flashlight.
   */
  private drawStalker(state: MvpRunState, fxTick: number, effects: Phaser.GameObjects.Graphics): void {
    const stalker = state.stalker;
    const cue = stalkerCue(stalker, state.tick);
    this.drawPoliceWash(state);
    if (stalker === null || cue.phase === 'none') {
      this.clearLabel('stalker');
      return;
    }
    // Reduced flashes: the warning holds red instead of strobing.
    const strobe = cue.strobeRed || !flashAllowed(gameSettings().get()) ? 0xff2a3a : 0x2a6aff;
    if (cue.doorProgress !== null) {
      // The doorway warning: a strobing floor ring that tightens as he nears.
      const radius = 70 - 34 * cue.doorProgress;
      effects.lineStyle(3, strobe, 0.55 + 0.4 * cue.doorProgress).strokeEllipse(stalker.x, stalker.y, radius * 2, radius);
      effects.fillStyle(strobe, 0.08 + 0.12 * cue.doorProgress).fillEllipse(stalker.x, stalker.y, radius * 2, radius);
      this.openingConcourse?.addLight({ x: stalker.x, y: stalker.y - 20, radius: 90 + 40 * cue.doorProgress, color: strobe, intensity: 0.7 });
    }
    if (cue.body) {
      const delta = this.actorMovement.movementFor('stalker', stalker.x, stalker.y);
      const depth = presentationDepth('actor', stalker.y);
      const cold = glow(0x2a50c0, cue.phase === 'writing_up' ? 0.25 : 0.4);
      this.syncActorSprite({
        id: 'stalker', kind: 'lp_agent', x: stalker.x + cue.sway, y: stalker.y,
        moveX: delta.x, moveY: delta.y, attackTicks: 0, damaged: cue.phase === 'shoved', phase: cue.phase,
        faceX: stalker.facingX, faceY: stalker.facingY,
      }, state.tick, depth, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false, tint: cold });
      this.contactShadow('stalker', stalker.x, stalker.y, 1.3);
      // Shoulder light strobes like a cruiser's bar, so he reads in a blackout.
      this.openingConcourse?.addLight({ x: stalker.x, y: stalker.y - 30, radius: 46, color: strobe, intensity: 0.55 });
      if (cue.flashlight) {
        // A flashlight beam thrown ahead of him along his facing.
        for (let step = 1; step <= 3; step += 1) {
          const reach = 34 * step;
          const lx = stalker.x + stalker.facingX * reach;
          const ly = stalker.y - 16 + stalker.facingY * reach * 0.6;
          this.openingConcourse?.addLight({ x: lx, y: ly, radius: 18 + 10 * step, color: 0xfff2c0, intensity: 0.35 });
          effects.fillStyle(0xfff2c0, 0.06).fillEllipse(lx, ly + 16, 24 + 14 * step, 10 + 5 * step);
        }
      }
      if (cue.phase === 'shoved') {
        // Seeing stars: three little sparks orbiting his head.
        for (let index = 0; index < 3; index += 1) {
          const angle = fxTick / 6 + (index * Math.PI * 2) / 3;
          effects.fillStyle(0xffe066, 0.9).fillRect(Math.round(stalker.x + Math.cos(angle) * 14) - 1, Math.round(stalker.y - 78 + Math.sin(angle) * 5) - 1, 3, 3);
        }
      }
    }
    if (cue.label) {
      this.setLabel('stalker', cue.label, stalker.x - cue.label.length * 4, stalker.y - (cue.body ? 96 : 60));
    } else {
      this.clearLabel('stalker');
    }
  }

  /**
   * Red and blue bleeding in at the screen's edges and spilling on the
   * storefront wall while Loss Prevention is in the room (see policeWash).
   */
  private drawPoliceWash(state: MvpRunState): void {
    const flashes = flashAllowed(gameSettings().get());
    const wash = state.status === 'playing' ? policeWash(state.stalker, state.tick, flashes) : null;
    if (!wash || wash.strength <= 0) {
      this.policeGlow?.clear().setVisible(false);
      return;
    }
    if (!this.policeGlow) {
      this.policeGlow = this.scene.add.graphics()
        .setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(presentationDepth('prompt', 900));
    }
    const RED = 0xff2a3a;
    const BLUE = 0x2a6aff;
    const PURPLE = 0x9a3aff;
    const left = wash.steady ? PURPLE : wash.leftRed ? RED : BLUE;
    const right = wash.steady ? PURPLE : wash.leftRed ? BLUE : RED;
    const peak = (wash.steady ? 0.07 : 0.14) * wash.strength;
    const { width, height } = this.scene.scale;
    const g = this.policeGlow.clear().setVisible(true);
    // A soft gradient from each side edge: stacked bands, fading inward.
    const bands = 6;
    const band = 16;
    for (let index = 0; index < bands; index += 1) {
      const alpha = peak * (1 - index / bands);
      g.fillStyle(left, alpha).fillRect(index * band, 0, band, height);
      g.fillStyle(right, alpha).fillRect(width - (index + 1) * band, 0, band, height);
    }
    // The wall catches it too: two pools on the storefronts, trading colour.
    this.openingConcourse?.addLight({ x: 240, y: 30, radius: 230, color: left, intensity: 0.4 * wash.strength });
    this.openingConcourse?.addLight({ x: 720, y: 30, radius: 230, color: right, intensity: 0.4 * wash.strength });
  }

  /**
   * On a storefront's concourse, each shop's door in the back wall is a way
   * in: a lit mat at its foot and chevrons climbing toward it.
   */
  private drawStoreEntrance(state: MvpRunState, index: number): void {
    const cues = this.effectGraphics;
    const floor = this.storeGraphics;
    const x = storeEntrance(index).x;
    const pulse = 0.5 + 0.35 * Math.sin(state.tick / 10);
    floor.fillStyle(0x1a2a30, 0.9).fillRect(x - STORE_ENTRANCE_HALF_WIDTH, 12, STORE_ENTRANCE_HALF_WIDTH * 2, 22);
    floor.fillStyle(0x3ff0ff, 0.35 * pulse).fillRect(x - STORE_ENTRANCE_HALF_WIDTH, 12, STORE_ENTRANCE_HALF_WIDTH * 2, 22);
    floor.lineStyle(2, 0x3ff0ff, 0.8).strokeRect(x - STORE_ENTRANCE_HALF_WIDTH, 12, STORE_ENTRANCE_HALF_WIDTH * 2, 22);
    // Three chevrons stepping up toward the door, lit in turn.
    for (let index = 0; index < 3; index += 1) {
      const lit = Math.floor(state.tick / 8) % 3 === 2 - index;
      const y = 56 + index * 16;
      cues.lineStyle(3, 0xffd84a, lit ? 0.95 : 0.35);
      cues.lineBetween(x - 12, y + 6, x, y - 2).lineBetween(x, y - 2, x + 12, y + 6);
    }
    this.openingConcourse?.addLight({ x, y: 40, radius: 70, color: 0x3ff0ff, intensity: 0.4 * pulse });
  }

  /**
   * While the store alarm rings, chevrons on the floor run from the janitor
   * to the door, so four seconds is never spent looking for the way out.
   */
  private drawEscapeChevrons(state: MvpRunState, exit: Rect, cues: Phaser.GameObjects.Graphics): void {
    const player = state.room.combat.player;
    const doorX = exit.x + exit.width / 2;
    const doorY = exit.y + exit.height;
    const dx = doorX - player.x;
    const dy = doorY - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 40) return;
    const ux = dx / distance;
    const uy = dy / distance;
    const flash = Math.floor(state.tick / 5);
    for (let step = 40, index = 0; step < distance - 10; step += 34, index += 1) {
      const cx = player.x + ux * step;
      const cy = player.y + uy * step;
      const lit = (flash - index) % 4 === 0;
      // A chevron pointing along the way out.
      const px = -uy * 9;
      const py = ux * 9;
      cues.lineStyle(3, lit ? 0xffffff : 0xff3a4a, lit ? 1 : 0.7);
      cues.lineBetween(cx - ux * 8 + px, cy - uy * 8 + py, cx, cy).lineBetween(cx, cy, cx - ux * 8 - px, cy - uy * 8 - py);
    }
  }

  /**
   * What makes each store play differently (see storeTwists.ts): Mall Mart's
   * carts, the Arcade Annex's lit cabinet, and Cinema Snacks' buttered floor.
   */
  private drawStoreTwist(state: MvpRunState): void {
    const twist = state.room.twist;
    const effects = this.effectGraphics;
    const floor = this.storeGraphics;
    const seen = new Set<number>();
    for (const cart of twist?.carts ?? []) {
      seen.add(cart.id);
      let image = this.cartImages.get(cart.id);
      if (!image) {
        const key = usableTextureKey(this.scene.textures, PROP_TEXTURES.cart.key);
        if (!key) continue;
        image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setDisplaySize(44, 41);
        this.cartImages.set(cart.id, image);
      }
      const rolling = Math.hypot(cart.vx, cart.vy) > 0.5;
      image.setPosition(Math.round(cart.x), Math.round(cart.y + 12)).setDepth(presentationDepth('actor', cart.y)).setVisible(true)
        .setFlipX(cart.vx < 0);
      this.contactShadow(`cart:${cart.id}`, cart.x, cart.y + 10, 1);
      if (rolling) {
        // Speed lines behind a rolling cart.
        const back = Math.atan2(-cart.vy, -cart.vx);
        for (let i = 1; i <= 3; i += 1) {
          effects.lineStyle(2, 0xffffff, 0.5 - i * 0.12)
            .lineBetween(cart.x + Math.cos(back + 0.3 * (i - 2)) * 18, cart.y + Math.sin(back + 0.3 * (i - 2)) * 10, cart.x + Math.cos(back + 0.3 * (i - 2)) * 32, cart.y + Math.sin(back + 0.3 * (i - 2)) * 18);
        }
      }
    }
    for (const [id, image] of this.cartImages) {
      if (!seen.has(id)) {
        image.destroy();
        this.cartImages.delete(id);
      }
    }
    if (twist?.storeId === 'arcade-annex') {
      // The one lit cabinet that takes coins: a pulsing ring and a PLAY sign.
      const pulse = 0.5 + 0.4 * Math.sin(state.tick / 9);
      const busy = twist.cabinetCooldown > 0;
      floor.lineStyle(2, busy ? 0xffd84a : 0x3ff0ff, pulse).strokeEllipse(ARCADE_CABINET.x - 20, ARCADE_CABINET.y + 4, 70, 24);
      this.setLabel('arcade-play', busy ? 'PLAYING...' : `PLAY $${ARCADE_PLAY_COST}`, ARCADE_CABINET.x - 70, ARCADE_CABINET.y - 96);
      this.openingConcourse?.addLight({ x: ARCADE_CABINET.x, y: ARCADE_CABINET.y - 40, radius: 70, color: busy ? 0xffd84a : 0x3ff0ff, intensity: 0.5 + 0.4 * (busy ? pulse : 0) });
    } else {
      this.clearLabel('arcade-play');
    }
    this.drawThemedTwist(state, twist);
    this.drawDistrictTwist(state, twist);
    this.drawSecret(state);
    this.drawShortcut(state);
    this.drawBursts(state);
    if (twist?.storeId === 'cinema-snacks') {
      // Butter: greasy yellow sheen streaks across the floor, drawn above the
      // lightmap so the room's darkness does not swallow it.
      for (let i = 0; i < 7; i += 1) {
        const x = 110 + i * 125 + ((i * 37) % 50);
        const y = 120 + ((i * 53) % 200);
        const shimmer = 0.16 + 0.08 * Math.sin(state.tick / 20 + i);
        effects.fillStyle(0xffe27a, shimmer).fillEllipse(x, y, 96, 16);
        effects.fillStyle(0xffffff, shimmer * 0.8).fillEllipse(x - 18, y - 2, 30, 4);
      }
    }
  }

  /** A twist prop image, kept by id and dropped once a frame stops drawing it. */
  /**
   * Round 53: the suspicious vending machine (a cola machine that flickers
   * green now and then), and in the back room the countdown, the sealed
   * grille over the passage, and the way out once it is won.
   */
  private drawSecret(state: MvpRunState): void {
    const shown = new Set<string>();
    const effects = this.effectGraphics;
    if (secretMachineHere(state)) {
      const m = SECRET_MACHINE;
      const glitch = (state.tick % 97) < 7 || (state.tick % 151) < 4;
      this.twistProp('secret-machine', PROP_TEXTURES.sodaMachine, m.x, m.y + 30, 0.9)?.setTint(glitch ? 0x8affb0 : 0xffffff);
      this.openingConcourse?.addLight({ x: m.x, y: m.y, radius: 70, color: glitch ? 0x6aff8a : 0xff6a6a, intensity: glitch ? 0.9 : 0.45 });
      const player = state.room.combat.player;
      if (Math.hypot(player.x - m.x, player.y - m.y) < 160) {
        this.setLabel('secret-hint', '?', m.x - 4, m.y - 40 + Math.sin(state.tick / 8) * 3);
        shown.add('secret-hint');
      }
    }
    const secret = state.room.secret;
    if (secret) {
      const exit = INTERIOR_EXIT;
      if (secret.phase === 'fight') {
        const seconds = Math.ceil(secret.ticksLeft / 60);
        this.setLabel('secret-timer', `SURVIVE ${seconds}`, 480 - 40, INTERIOR_BOUNDS.y + 170);
        shown.add('secret-timer');
        // The passage is grilled shut until the clock runs out.
        effects.fillStyle(0x4a5560, 0.95).fillRect(exit.x, exit.y - 30, exit.width, 34);
        for (let y = exit.y - 28; y < exit.y + 4; y += 5) effects.fillStyle(0x9aa8b4, 0.9).fillRect(exit.x, y, exit.width, 2);
        const urgent = seconds <= 5 && state.tick % 30 < 15;
        this.openingConcourse?.addLight({ x: 480, y: INTERIOR_BOUNDS.y + 90, radius: 200, color: 0xff3a3a, intensity: urgent ? 0.6 : 0.25 });
      } else {
        this.setLabel('secret-timer', 'GRAB IT AND GO', 480 - 56, INTERIOR_BOUNDS.y + 170);
        shown.add('secret-timer');
        this.drawEscapeChevrons(state, exit, effects);
      }
    }
    for (const id of ['secret-hint', 'secret-timer']) if (!shown.has(id)) this.clearLabel(id);
  }

  /**
   * Round 57: a fallen Volatile elite's lit fuse. A ring marks the blast's
   * reach, flickers, and fills in as the fuse burns, so there is time to see it
   * and step out before it goes off.
   */
  private drawBursts(state: MvpRunState): void {
    const bursts = state.room.combat.bursts;
    if (!bursts || bursts.length === 0) return;
    const g = this.effectGraphics;
    const reach = VOLATILE_BURST_RADIUS;
    for (const burst of bursts) {
      const progress = 1 - burst.fuseTicks / VOLATILE_FUSE_TICKS;
      g.fillStyle(0xff5a1a, 0.1 + 0.22 * progress).fillEllipse(burst.x, burst.y + 2, reach * 2, reach);
      g.lineStyle(3, 0xff7a2a, state.tick % 6 < 3 ? 1 : 0.6).strokeEllipse(burst.x, burst.y + 2, reach * 2, reach);
      g.lineStyle(2, 0xffd84a, 0.9).strokeEllipse(burst.x, burst.y + 2, reach * 2 * progress, reach * progress);
      this.openingConcourse?.addLight({ x: burst.x, y: burst.y - 10, radius: 110, color: 0xff7a2a, intensity: 0.4 + 0.6 * progress });
    }
  }

  /**
   * Round 57: the staff passage, a hazard-striped hatch in the back wall of a
   * safe concourse with a STAFF ONLY sign and a pulsing amber light. It is
   * drawn while it is unused and gone once the janitor has crawled through.
   */
  private drawShortcut(state: MvpRunState): void {
    if (!shortcutHere(state)) {
      this.clearLabel('shortcut-sign');
      return;
    }
    const h = SHORTCUT_HATCH;
    const g = this.effectGraphics;
    const left = h.x - 24;
    const top = h.y - 46;
    g.fillStyle(0x14161a, 0.96).fillRect(left, top, 48, 50);
    // Hazard stripes down both jambs and across the lintel.
    for (let i = 0; i < 7; i += 1) {
      const stripe = i % 2 === 0 ? 0xffd84a : 0x1a1a1a;
      g.fillStyle(stripe, 1).fillRect(left, top + i * 7, 5, 7).fillRect(left + 43, top + i * 7, 5, 7);
    }
    for (let i = 0; i < 7; i += 1) g.fillStyle(i % 2 === 0 ? 0xffd84a : 0x1a1a1a, 1).fillRect(left + i * 7, top - 4, 7, 5);
    // The grille and its latch.
    for (let y = top + 8; y < top + 46; y += 6) g.fillStyle(0x56606a, 0.9).fillRect(left + 8, y, 32, 2);
    g.fillStyle(0xff9a3a, 1).fillRect(left + 38, top + 24, 4, 6);
    const pulse = 0.5 + 0.35 * Math.sin(state.tick / 14);
    this.openingConcourse?.addLight({ x: h.x, y: h.y - 20, radius: 80, color: 0xffb040, intensity: 0.35 + 0.35 * pulse });
    this.setLabel('shortcut-sign', 'STAFF ONLY', h.x - 28, top - 16);
  }

  private twistProp(id: string, texture: { readonly key: string }, x: number, y: number, scale: number, flipX = false): Phaser.GameObjects.Image | null {
    this.usedTwistImages.add(id);
    let image = this.twistImages.get(id);
    if (!image) {
      const key = usableTextureKey(this.scene.textures, texture.key);
      if (!key) return null;
      image = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
      this.twistImages.set(id, image);
    }
    image.setPosition(Math.round(x), Math.round(y)).setScale(scale).setFlipX(flipX).setDepth(presentationDepth('actor', y)).setVisible(true);
    return image;
  }

  /** Round 35: the seven themed stores' twists (see storeTwists.ts). */
  private drawThemedTwist(state: MvpRunState, twist: StoreTwistState | null): void {
    const effects = this.effectGraphics;
    const light = (x: number, y: number, radius: number, color: number, intensity: number): void =>
      this.openingConcourse?.addLight({ x, y, radius, color, intensity });
    const labels = ['twist-listen', 'twist-rewind'];
    const shown = new Set<string>();
    switch (twist?.storeId) {
      case 'sports-locker': {
        const winding = pitchWindingUp(twist);
        const shake = winding ? ((state.tick % 4) - 1.5) : 0;
        this.twistProp('machine', PROP_TEXTURES.pitchingMachine, PITCHING_MACHINE.x + shake, PITCHING_MACHINE.y + 14, 1.7);
        this.contactShadow('twist:machine', PITCHING_MACHINE.x, PITCHING_MACHINE.y + 12, 1.2);
        light(PITCHING_MACHINE.x + 6, PITCHING_MACHINE.y - 50, 56, 0xb8ffc8, 0.7);
        if (winding) {
          // The lane lights up before each pitch, so the ball is never a surprise.
          const pulse = 0.18 + 0.14 * Math.sin(state.tick / 3);
          const right = 920;
          effects.fillStyle(0xff5a3a, pulse).fillRect(PITCHING_MACHINE.x + 20, PITCHING_MACHINE.y - BALL_RADIUS - 3, right - PITCHING_MACHINE.x - 20, BALL_RADIUS * 2 + 6);
          light(PITCHING_MACHINE.x + 20, PITCHING_MACHINE.y - 10, 60, 0xff5a3a, 0.8);
        }
        for (const ball of twist.balls) {
          effects.fillStyle(0x000000, 0.3).fillEllipse(ball.x, ball.y + 10, 14, 5);
          effects.fillStyle(0xf4f0e0, 1).fillCircle(ball.x, ball.y - 6, BALL_RADIUS);
          effects.lineStyle(1, 0xd02030, 1).beginPath().arc(ball.x - 3, ball.y - 6, 5, -1.1, 1.1).strokePath();
          effects.beginPath().arc(ball.x + 3, ball.y - 6, 5, Math.PI - 1.1, Math.PI + 1.1).strokePath();
          effects.lineStyle(2, 0xffffff, 0.35).lineBetween(ball.x - 10, ball.y - 6, ball.x - 26, ball.y - 6);
        }
        break;
      }
      case 'hardware-hut':
        // Wet paint: glossy puddles with a highlight, drawn above the lightmap.
        PAINT_SPILLS.forEach((spill, index) => {
          const sheen = 0.5 + 0.08 * Math.sin(state.tick / 25 + index);
          effects.fillStyle(spill.color, sheen).fillEllipse(spill.x, spill.y, spill.rx * 2, spill.ry * 2);
          effects.fillStyle(spill.color, sheen * 0.8).fillEllipse(spill.x + spill.rx * 0.7, spill.y + spill.ry * 0.5, spill.rx * 0.5, spill.ry * 0.6);
          effects.fillStyle(0xffffff, 0.35).fillEllipse(spill.x - spill.rx * 0.35, spill.y - spill.ry * 0.35, spill.rx * 0.5, 5);
        });
        break;
      case 'toy-box':
        for (const toy of twist.toys) {
          const bob = Math.abs(Math.sin((state.tick + toy.id * 11) / 5)) * 3;
          const tilt = Math.sin((state.tick + toy.id * 11) / 5) * 6;
          const image = this.twistProp(`toy:${toy.id}`, PROP_TEXTURES.windUpToy, toy.x, toy.y + 8 - bob, 1.5, toy.vx < 0);
          image?.setAngle(tilt);
          this.contactShadow(`twist:toy:${toy.id}`, toy.x, toy.y + 8, 0.6);
          light(toy.x, toy.y - 6, 30, 0xfff09a, 0.6);
        }
        break;
      case 'radio-shed': {
        const on = staticHides(state, { x: STATIC_ZONES[0]!.x + 1, y: STATIC_ZONES[0]!.y + 1 });
        STATIC_ZONES.forEach((z, index) => {
          // The band reaches above the floor zone so a hidden enemy's whole body is covered.
          const top = z.y - 50;
          const height = z.height + 50;
          if (!on) {
            effects.lineStyle(1, 0x9ab4ff, 0.25).strokeRect(z.x, top, z.width, height);
            return;
          }
          // Snow: a dark band full of flickering pixels that hides whoever is in it.
          effects.fillStyle(0x12121a, 0.9).fillRect(z.x, top, z.width, height);
          for (let i = 0; i < 140; i += 1) {
            const n = Math.imul(i * 7919 + index * 31 + flickerTick(gameSettings().get(), state.tick) * 104729, 2654435761) >>> 0;
            const grey = (n >>> 24) & 0xff;
            effects.fillStyle((grey << 16) | (grey << 8) | grey, 0.9).fillRect(z.x + (n % z.width), top + ((n >>> 12) % height), 3, 2);
          }
          for (let y = top; y < z.y + z.height; y += 6) effects.fillStyle(0xffffff, 0.05).fillRect(z.x, y, z.width, 1);
          light(z.x + z.width / 2, z.y + z.height / 2, 100, 0x9ab4ff, 0.5);
        });
        break;
      }
      case 'spiral-records': {
        const b = LISTENING_BOOTH;
        this.twistProp('booth', PROP_TEXTURES.listeningBooth, b.x, b.y - 6, 1.3);
        const grooving = twist.grooveTicks > 0;
        const ring = twist.grooveUsed ? 0x6a5a8a : 0xff3fc8;
        effects.lineStyle(2, ring, twist.grooveUsed ? 0.4 : 0.6 + 0.3 * Math.sin(state.tick / 10)).strokeEllipse(b.x, b.y + 4, b.radius * 2.4, b.radius * 1.1);
        if (twist.listenTicks > 0) {
          const t = twist.listenTicks / LISTEN_TICKS;
          effects.lineStyle(4, 0xffd84a, 1).beginPath().arc(b.x, b.y - 90, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
        }
        if (!twist.grooveUsed) {
          this.setLabel('twist-listen', 'LISTEN', b.x - 30, b.y - 110);
          shown.add('twist-listen');
        }
        light(b.x, b.y - 30, 70, 0xff3fc8, grooving ? 0.9 : 0.5);
        if (grooving) {
          // In the groove: notes bob round the janitor and a pink ring pulses.
          const player = state.room.combat.player;
          effects.lineStyle(2, 0xff3fc8, 0.5 + 0.3 * Math.sin(state.tick / 4)).strokeEllipse(player.x, player.y + 2, 46, 18);
          for (let i = 0; i < 3; i += 1) {
            const a = state.tick / 14 + (i * Math.PI * 2) / 3;
            const nx = player.x + Math.cos(a) * 24;
            const ny = player.y - 40 + Math.sin(a * 2) * 6;
            effects.fillStyle(0xff9ae6, 1).fillCircle(nx, ny, 3).fillRect(nx + 2, ny - 10, 2, 10);
          }
        }
        break;
      }
      case 'slice-station': {
        const phase = ovenPhase(twist);
        const z = OVEN_ZONE;
        this.twistProp('oven', PROP_TEXTURES.pizzaOven, z.x + z.width / 2 + 10, z.y + 10, 1.1);
        const heat = phase === 'blast' ? 1 : phase === 'warn' ? 0.35 + 0.3 * Math.abs(Math.sin(state.tick / 5)) : 0.12;
        effects.fillStyle(phase === 'blast' ? 0xff4a1a : 0xff9a3a, heat * 0.45).fillRect(z.x, z.y, z.width, z.height);
        effects.lineStyle(2, 0xff7a2a, 0.3 + heat * 0.6).strokeRect(z.x, z.y, z.width, z.height);
        if (phase === 'blast') {
          for (let i = 0; i < 6; i += 1) {
            const x = z.x + 10 + i * 16;
            const wave = Math.sin(state.tick / 3 + i) * 4;
            effects.lineStyle(2, 0xffd08a, 0.6).lineBetween(x + wave, z.y + z.height - 10, x - wave, z.y + 20);
          }
        }
        light(z.x + z.width / 2, z.y + z.height / 2, 90 + heat * 60, 0xff6a2a, 0.3 + heat * 0.8);
        break;
      }
      case 'video-world': {
        const t = REWIND_TILE;
        const ready = !twist.rewindUsed;
        const primed = ready && twist.lastHit > 0;
        const glow = primed ? 0.7 + 0.3 * Math.sin(state.tick / 5) : ready ? 0.45 : 0.15;
        effects.fillStyle(0x0a1a2a, 0.8).fillRoundedRect(t.x - t.radius, t.y - t.radius * 0.6, t.radius * 2, t.radius * 1.2, 6);
        effects.lineStyle(2, 0x3ff0ff, glow).strokeRoundedRect(t.x - t.radius, t.y - t.radius * 0.6, t.radius * 2, t.radius * 1.2, 6);
        effects.fillStyle(0x3ff0ff, glow);
        effects.fillTriangle(t.x - 2, t.y - 8, t.x - 2, t.y + 8, t.x - 14, t.y);
        effects.fillTriangle(t.x + 12, t.y - 8, t.x + 12, t.y + 8, t.x, t.y);
        if (ready) {
          this.setLabel('twist-rewind', primed ? 'REWIND!' : 'REWIND', t.x - 34, t.y - 46);
          shown.add('twist-rewind');
          light(t.x, t.y, 50, 0x3ff0ff, glow);
        }
        break;
      }
      default:
        break;
    }
    for (const id of labels) if (!shown.has(id)) this.clearLabel(id);
    for (const [id, image] of this.twistImages) {
      if (!this.usedTwistImages.has(id)) {
        image.destroy();
        this.twistImages.delete(id);
      }
    }
    this.usedTwistImages.clear();
  }

  private drawStore(state: MvpRunState, templateId: string): void {
    const room = state.wing.rooms[state.roomIndex];
    const store = activeStore(state);
    if (!store || store.templateId !== templateId) {
      return;
    }
    // Only this shop's shelves: the room's other shop is behind its own door.
    const shelf = (room?.offers ?? []).filter((offer) => offer.storeId === store.templateId);
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

    // The store alarm after a grab: beacons, the countdown over the door, and
    // the shutter creeping down across it (see alarmCues.ts).
    const alarmHere = state.alarm !== null && state.alarm.storeId === store.templateId ? state.alarm : null;
    const cue = alarmCue(alarmHere, alarmTicksFor(state), state.tick, !flashAllowed(gameSettings().get()));
    if (cue.phase === 'ringing' || cue.phase === 'locked') {
      const red = cue.flash ? 0xff2a3a : 0x6a1a22;
      floor.lineStyle(3, red, 0.9).strokeRect(store.bounds.x, store.bounds.y, store.bounds.width, store.bounds.height);
      for (const bx of [store.bounds.x + 14, store.bounds.x + store.bounds.width - 14]) {
        const by = store.bounds.y + 14;
        cues.fillStyle(0x1a1422, 1).fillCircle(bx, by, 7);
        cues.fillStyle(red, 1).fillCircle(bx, by, 4);
        this.openingConcourse?.addLight({ x: bx, y: by + 40, radius: 150, color: 0xff2a3a, intensity: cue.flash ? 0.9 : 0.25 });
      }
      this.openingConcourse?.addLight({ x: exit.x + exit.width / 2, y: exit.y - 30, radius: 110, color: 0xff2a3a, intensity: cue.flash ? 0.7 : 0.3 });
    }
    if (cue.shutterDrop > 0) {
      // A roll-down security grille, hanging from the door header.
      const full = 46;
      const height = Math.max(3, Math.round(full * cue.shutterDrop));
      const top = exit.y + exit.height - full;
      cues.fillStyle(0x4a5560, 0.95).fillRect(exit.x, top, exit.width, height);
      for (let y = top + 2; y < top + height; y += 5) {
        cues.fillStyle(0x9aa8b4, 0.9).fillRect(exit.x, y, exit.width, 2);
      }
      cues.fillStyle(0x1a2028, 1).fillRect(exit.x, top + height - 3, exit.width, 3);
    }
    if (cue.countdown !== null) {
      const text = cue.phase === 'locked' ? 'LOCKED IN' : `SHUTTER ${cue.countdown}`;
      this.setLabel('store-alarm', text, exit.x + exit.width / 2 - text.length * 4, exit.y - 70);
    } else {
      this.clearLabel('store-alarm');
    }

    if (cue.phase === 'ringing') this.drawEscapeChevrons(state, exit, cues);

    const player = state.room.combat.player;
    // Only the nearest available item's name grows, so neighbours never collide.
    let nearestId: string | null = null;
    let nearestDistance = 150;
    for (const offer of shelf) {
      if ((state.offerStatus[offer.id] ?? 'available') !== 'available') continue;
      const distance = Math.hypot(player.x - offer.position.x, player.y - offer.position.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = offer.id;
      }
    }
    for (const offer of shelf) {
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
      // A recipe hint: a signature pair shelved together is tied by a gold
      // link while both halves are still on the shelf (drawn once, from the first).
      const partner = offer.pairedWith ? shelf.find((other) => other.itemDefinitionId === offer.pairedWith) : undefined;
      if (partner && status === 'available' && (state.offerStatus[partner.id] ?? 'available') === 'available') {
        const glow = 0.55 + 0.35 * Math.sin(state.tick / 12);
        if (offer.position.x < partner.position.x || (offer.position.x === partner.position.x && offer.position.y < partner.position.y)) {
          // Gold sparks run along the floor from one half to the other.
          const dx = partner.position.x - offer.position.x;
          const dy = partner.position.y - offer.position.y;
          const steps = Math.max(4, Math.floor(Math.hypot(dx, dy) / 14));
          for (let step = 1; step < steps; step += 1) {
            const t = (step + (state.tick / 10) % 1) / steps;
            cues.fillStyle(0xffd84a, glow * (step % 2 === 0 ? 1 : 0.55)).fillRect(Math.round(offer.position.x + dx * t) - 2, Math.round(offer.position.y + dy * t) - 2, 4, 4);
          }
        }
        const top = offer.position.y - 96;
        cues.fillStyle(0x3a2a06, 1).fillTriangle(offer.position.x, top - 9, offer.position.x - 8, top, offer.position.x + 8, top);
        cues.fillTriangle(offer.position.x, top + 9, offer.position.x - 8, top, offer.position.x + 8, top);
        cues.fillStyle(0xffd84a, glow + 0.1).fillTriangle(offer.position.x, top - 7, offer.position.x - 6, top, offer.position.x + 6, top);
        cues.fillTriangle(offer.position.x, top + 7, offer.position.x - 6, top, offer.position.x + 6, top);
        this.openingConcourse?.addLight({ x: offer.position.x, y: top, radius: 28, color: 0xffd84a, intensity: 0.7 });
      }
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
    // A posed display has no health bar: it should read as a mannequin, not a foe.
    if (enemy.dormant) return;
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
  /** A perfume cloud (Glamour Row): a soft pink haze with drifting sparkles, fading out. */
  private drawPerfumeCloud(cloud: TarPuddle, graphics: Phaser.GameObjects.Graphics, tick: number): void {
    const fade = Math.min(1, cloud.ticks / 40);
    for (let i = 0; i < 4; i += 1) {
      const a = tick / 40 + i * 1.7;
      graphics.fillStyle(0xff9ad8, 0.13 * fade).fillCircle(cloud.x + Math.cos(a) * cloud.radius * 0.3, cloud.y - 8 + Math.sin(a) * cloud.radius * 0.18, cloud.radius * (0.7 + 0.08 * i));
    }
    graphics.lineStyle(1, 0xffc8ec, 0.35 * fade).strokeEllipse(cloud.x, cloud.y, cloud.radius * 2, cloud.radius * 1.1);
    for (let i = 0; i < 5; i += 1) {
      const n = (tick * 3 + i * 47 + Math.round(cloud.x)) % 120;
      graphics.fillStyle(0xffffff, 0.6 * fade * (1 - n / 120)).fillRect(cloud.x - cloud.radius * 0.6 + ((i * 29) % (cloud.radius * 1.2)), cloud.y - n / 3, 2, 2);
    }
  }

  /** Round 50: the district stores' twists (see storeTwists.ts). Shapes and labels; nothing here decides anything. */
  private drawDistrictTwist(state: MvpRunState, twist: StoreTwistState | null): void {
    const effects = this.effectGraphics;
    const floor = this.storeGraphics;
    const light = (x: number, y: number, radius: number, color: number, intensity: number): void =>
      this.openingConcourse?.addLight({ x, y, radius, color, intensity });
    const labels = ['twist-sample', 'twist-flash', 'twist-parrot', 'twist-skates', 'twist-punch', 'twist-shades', 'twist-quiet', 'twist-frozen', 'twist-hock'];
    const shown = new Set<string>();
    const label = (key: string, text: string, x: number, y: number): void => {
      this.setLabel(key, text, x, y);
      shown.add(key);
    };
    switch (twist?.storeId) {
      case 'candy-cauldron': {
        const b = SAMPLE_BOWL;
        this.twistProp('bowl', PROP_TEXTURES.gumballStand, b.x, b.y + 10, 1.2);
        floor.lineStyle(2, twist.sampleUsed ? 0x6a5a6a : 0xff6ad8, twist.sampleUsed ? 0.35 : 0.6 + 0.3 * Math.sin(state.tick / 10)).strokeEllipse(b.x, b.y + 6, b.radius * 2.4, b.radius);
        if (!twist.sampleUsed) label('twist-sample', 'FREE SAMPLE', b.x - 50, b.y - 90);
        light(b.x, b.y - 30, 60, 0xff6ad8, twist.sampleUsed ? 0.3 : 0.7);
        break;
      }
      case 'novelty-nook':
        BUZZER_TILES.forEach((tile, index) => {
          const ready = (twist.buzzerCharge[index] ?? 0) === 0;
          const zap = !ready && (twist.buzzerCharge[index] ?? 0) > 100;
          floor.fillStyle(ready ? 0xffd84a : 0x5a4a2a, ready ? 0.35 : 0.2).fillEllipse(tile.x, tile.y, tile.radius * 2.2, tile.radius);
          floor.lineStyle(2, ready ? 0xffd84a : 0x8a7a4a, ready ? 0.8 : 0.4).strokeEllipse(tile.x, tile.y, tile.radius * 2.2, tile.radius);
          if (zap) {
            // A crackle over the tile just after it went off.
            for (let i = 0; i < 4; i += 1) {
              const a = (state.tick * 0.7 + i * 1.6) % (Math.PI * 2);
              effects.lineStyle(2, 0xfff6a0, 0.9).lineBetween(tile.x, tile.y - 20, tile.x + Math.cos(a) * 26, tile.y - 20 + Math.sin(a) * 14);
            }
            light(tile.x, tile.y - 20, 50, 0xfff6a0, 0.9);
          }
        });
        light(480, 120, 260, 0x9a4aff, 0.5);
        break;
      case 'glam-snaps': {
        const lane = STUDIO_FLASH_LANE;
        const phase = studioFlashPhase(twist);
        // The umbrella flash on its stand at the west wall.
        effects.fillStyle(0xf4f0ff, 0.9).fillTriangle(lane.x + 10, lane.y - 30, lane.x + 46, lane.y - 50, lane.x + 46, lane.y - 10);
        effects.lineStyle(2, 0x2a2a3a, 1).lineBetween(lane.x + 28, lane.y - 30, lane.x + 28, lane.y + lane.height);
        if (phase === 'warn') {
          const pulse = 0.1 + 0.1 * Math.sin(state.tick / 3);
          effects.fillStyle(0xffffff, pulse).fillRect(lane.x, lane.y, lane.width, lane.height);
          light(lane.x + 40, lane.y - 30, 70, 0xffffff, 0.9);
          label('twist-flash', 'SMILE!', lane.x + 60, lane.y - 70);
        } else if (phase === 'pop') {
          // The pop itself: a white wash over the lane (soft when flashing is reduced).
          effects.fillStyle(0xffffff, flashAllowed(gameSettings().get()) ? 0.7 : 0.25).fillRect(lane.x, lane.y, lane.width, lane.height);
          light(lane.x + lane.width / 2, lane.y + lane.height / 2, 300, 0xffffff, 1);
        }
        if (twist.dazzleTicks > 0) {
          const player = state.room.combat.player;
          for (let i = 0; i < 3; i += 1) {
            const a = state.tick / 6 + (i * Math.PI * 2) / 3;
            effects.fillStyle(0xfff6a0, 1).fillCircle(player.x + Math.cos(a) * 18, player.y - 52 + Math.sin(a) * 5, 2.5);
          }
        }
        break;
      }
      case 'hair-affair':
        HAIRSPRAY_ZONES.forEach((zone, index) => {
          for (let i = 0; i < 6; i += 1) {
            const drift = Math.sin(state.tick / 50 + i + index) * 10;
            effects.fillStyle(0xd8e8ff, 0.09).fillEllipse(zone.x + zone.width * ((i + 0.5) / 6) + drift, zone.y + zone.height / 2 + ((i * 13) % 20) - 10, zone.width * 0.45, zone.height * 0.7);
          }
          floor.lineStyle(1, 0xb8c8ff, 0.3).strokeRect(zone.x, zone.y, zone.width, zone.height);
        });
        break;
      case 'pet-palace':
        // The parrot on its perch by the door: one beady eye on the shelves.
        effects.lineStyle(2, 0x6a4a2a, 1).lineBetween(130, 300, 130, 350).lineBetween(110, 300, 150, 300);
        effects.fillStyle(0x3aff6a, 1).fillEllipse(130, 286, 18, 24);
        effects.fillStyle(0xff3a3a, 1).fillCircle(130, 274, 6);
        effects.fillStyle(0xffd84a, 1).fillTriangle(134, 272, 142, 275, 134, 278);
        if (state.alarm !== null) label('twist-parrot', 'SQUAWK! THIEF!', 70, 230);
        break;
      case 'green-thumb':
        CACTUS_POTS.forEach((pot) => {
          floor.fillStyle(0xb85a2a, 1).fillRect(pot.x - 12, pot.y - 4, 24, 14);
          effects.fillStyle(0x2a8a3a, 1).fillRoundedRect(pot.x - 7, pot.y - 40, 14, 38, 6);
          effects.fillStyle(0x2a8a3a, 1).fillRoundedRect(pot.x - 17, pot.y - 30, 8, 16, 4).fillRoundedRect(pot.x + 9, pot.y - 34, 8, 14, 4);
          for (let i = 0; i < 6; i += 1) effects.fillStyle(0xf0f0c0, 1).fillRect(pot.x - 6 + ((i * 5) % 13), pot.y - 36 + i * 5, 1, 1);
        });
        break;
      case 'skate-shack': {
        const player = state.room.combat.player;
        // Skates on: blades under the janitor and a cold sheen on the floor.
        effects.lineStyle(2, 0xd8f0ff, 0.9).lineBetween(player.x - 10, player.y + 4, player.x - 2, player.y + 4).lineBetween(player.x + 2, player.y + 4, player.x + 10, player.y + 4);
        label('twist-skates', 'SKATES ON', 60, 330);
        break;
      }
      case 'cocoa-hut':
        label('twist-punch', twist.purchases % 2 === 1 ? 'NEXT ONE FREE!' : `PUNCH CARD ${twist.purchases % 2}/2`, 60, 330);
        break;
      // Round 55: the floor-exclusive stores.
      case 'shade-station': {
        const band = glareBand(twist);
        const top = INTERIOR_BOUNDS.y;
        const height = INTERIOR_BOUNDS.height;
        effects.fillStyle(0xfff6c0, 0.14).fillRect(band.x, top, band.width, height);
        effects.fillStyle(0xffffff, 0.12).fillRect(band.x + band.width * 0.35, top, band.width * 0.3, height);
        light(band.x + band.width / 2, top + height / 2, 120, 0xfff0a0, 0.6);
        const player = state.room.combat.player;
        // The janitor's shades.
        effects.fillStyle(0x101018, 1).fillRect(player.x - 7, player.y - 34, 6, 3).fillRect(player.x + 1, player.y - 34, 6, 3);
        label('twist-shades', 'SHADES ON', 60, 330);
        break;
      }
      case 'page-turner':
        label('twist-quiet', state.alarm !== null ? 'ding... ding...' : 'QUIET PLEASE', 60, 330);
        break;
      case 'pretzel-pit':
        for (const spill of MUSTARD_SPILLS) {
          floor.fillStyle(0xe8b800, 0.6).fillEllipse(spill.x, spill.y, spill.rx * 2, spill.ry * 2);
          floor.fillStyle(0xfff060, 0.35).fillEllipse(spill.x - spill.rx * 0.3, spill.y - spill.ry * 0.3, spill.rx * 0.6, spill.ry * 0.5);
        }
        break;
      case 'frosty-freeze': {
        const m = FROSTY_MACHINE;
        this.twistProp('freezer', PROP_TEXTURES.vending, m.x, m.y + 10, 2.2)?.setTint(0xc0f0ff);
        const phase = coldSnapPhase(twist);
        const humming = phase === 'warn';
        const alpha = humming ? 0.3 + 0.3 * Math.abs(Math.sin(state.tick / 5)) : 0.15;
        floor.lineStyle(2, 0x9ae8ff, alpha + 0.2).strokeEllipse(m.x, m.y, COLD_SNAP_RADIUS * 2, COLD_SNAP_RADIUS);
        if (humming || twist.dazzleTicks > 0) floor.fillStyle(0xd8f6ff, alpha * 0.6).fillEllipse(m.x, m.y, COLD_SNAP_RADIUS * 2, COLD_SNAP_RADIUS);
        light(m.x, m.y - 30, 90, 0x9ae8ff, humming ? 0.9 : 0.4);
        if (twist.dazzleTicks > 0) label('twist-frozen', 'FROZEN!', state.room.combat.player.x - 30, state.room.combat.player.y - 70);
        break;
      }
      case 'antenna-annex': {
        const r = LIGHTNING_ROD;
        const charging = twist.age % ROD_ZAP_TICKS >= ROD_ZAP_TICKS - 30;
        effects.lineStyle(3, 0x8a8a9a, 1).lineBetween(r.x, r.y, r.x, r.y - 90);
        effects.fillStyle(charging ? 0xf0ffff : 0x6a8a9a, 1).fillCircle(r.x, r.y - 92, charging ? 6 + Math.sin(state.tick / 2) : 5);
        floor.lineStyle(1, 0x8affff, 0.25).strokeEllipse(r.x, r.y + 4, 100, 36);
        light(r.x, r.y - 90, 70, 0x8affff, charging ? 0.9 : 0.3);
        if (twist.zap) {
          // A jagged bolt from the rod's tip to whoever it hit.
          let x = r.x;
          let y = r.y - 92;
          for (let i = 1; i <= 5; i += 1) {
            const nx = r.x + ((twist.zap.x - r.x) * i) / 5 + (i < 5 ? ((state.tick * 7 + i * 13) % 17) - 8 : 0);
            const ny = r.y - 92 + ((twist.zap.y - 20 - (r.y - 92)) * i) / 5;
            effects.lineStyle(3, 0xf0ffff, 0.9).lineBetween(x, y, nx, ny);
            x = nx;
            y = ny;
          }
        }
        break;
      }
      case 'pawn-palace': {
        const c = PAWN_COUNTER;
        floor.lineStyle(2, twist.hocked ? 0x6a4a4a : 0xff5a4a, twist.hocked ? 0.35 : 0.6 + 0.3 * Math.sin(state.tick / 10)).strokeEllipse(c.x, c.y + 4, c.radius * 2.4, c.radius * 1.1);
        if (twist.hockTicks > 0) {
          effects.fillStyle(0x2a1a1a, 0.8).fillRect(c.x - 30, c.y - 70, 60, 6);
          effects.fillStyle(0xff5a4a, 1).fillRect(c.x - 30, c.y - 70, (60 * twist.hockTicks) / HOCK_TICKS, 6);
        }
        if (!twist.hocked) label('twist-hock', `HOCK A HEART $${HOCK_PRICE}`, c.x - 80, c.y - 100);
        break;
      }
      default:
        break;
    }
    for (const key of labels) if (!shown.has(key)) this.clearLabel(key);
  }

  /** A tar puddle on the Roof: glossy black, hot at the rim while fresh, fading as it dries. */
  private drawTarPuddle(puddle: TarPuddle, graphics: Phaser.GameObjects.Graphics, tick: number): void {
    const heat = Math.min(1, puddle.ticks / TAR_PUDDLE_TICKS);
    const fade = Math.min(1, puddle.ticks / 30);
    const w = puddle.radius * 2;
    const h = puddle.radius * 1.15;
    graphics.fillStyle(0x0b0705, 0.82 * fade).fillEllipse(puddle.x, puddle.y, w, h);
    graphics.fillStyle(0x1c120c, 0.7 * fade).fillEllipse(puddle.x - puddle.radius * 0.12, puddle.y - 2, w * 0.7, h * 0.6);
    graphics.lineStyle(2, 0xff6a1a, (0.2 + 0.5 * heat) * fade).strokeEllipse(puddle.x, puddle.y, w, h);
    // A slow bubble and a sheen, so it reads as liquid and not a hole.
    const bubble = (tick + puddle.x) % 90;
    if (bubble < 20 && heat > 0.2) graphics.lineStyle(1, 0x5a3a28, 0.8 * fade).strokeCircle(puddle.x + puddle.radius * 0.3, puddle.y - 3, 2 + bubble / 8);
    graphics.fillStyle(0x8a7a90, 0.35 * fade).fillEllipse(puddle.x - puddle.radius * 0.35, puddle.y - h * 0.22, w * 0.18, 3);
  }

  private drawWindups(enemy: EnemyState, windups: readonly Windup[], effects: Phaser.GameObjects.Graphics, tick: number): void {
    for (const windup of windups) {
      const p = windup.progress;
      // The last quarter of a wind-up strobes white, unless flashing is reduced.
      const blink = p > 0.75 && flashAllowed(gameSettings().get()) && Math.floor(tick / 3) % 2 === 0;
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
      } else if (windup.kind === 'lob') {
        // A tar bucket in the air: its shadow closes in on the landing ring,
        // and the bucket itself arcs over from whoever threw it.
        const tx = windup.targetX ?? enemy.x;
        const ty = windup.targetY ?? enemy.y;
        const r = windup.reach ?? 36;
        const color = blink ? 0xffffff : p > 0.7 ? 0xff5a1a : 0xffb02a;
        effects.fillStyle(0x1a0c04, 0.18 + 0.32 * p).fillEllipse(tx, ty, r * 2 * (0.35 + 0.65 * p), r * 1.1 * (0.35 + 0.65 * p));
        effects.lineStyle(3, color, 0.6 + 0.4 * p).strokeEllipse(tx, ty, r * 2, r * 1.1);
        effects.lineStyle(1, color, 0.4).strokeEllipse(tx, ty, r * 2 + 8 + 3 * Math.sin(tick / 3), r * 1.1 + 5);
        const bx = enemy.x + (tx - enemy.x) * p;
        const by = enemy.y - 24 + (ty - enemy.y + 24) * p - Math.sin(Math.PI * p) * 110;
        effects.fillStyle(0x2a2a30, 1).fillRect(bx - 6, by - 7, 12, 12);
        effects.fillStyle(0xff7a1a, 0.9).fillRect(bx - 5, by - 7, 10, 3);
        effects.lineStyle(1, 0xc8c8d0, 0.9).strokeRect(bx - 6, by - 7, 12, 12);
        if (enemy.kind === 'roofer') this.drawAlert(effects, tx, ty - 40, p, 0xffb02a);
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
  private drawProjectile(projectile: ProjectileState, graphics = this.graphics, tick = 0, playerAlive = true): void {
    // Death freezes simulation projectiles in place. Stop submitting player
    // shots so the native pool releases them, without painting fallback ghosts.
    if (!playerAlive && projectile.faction === 'player') return;
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
    const native = this.weaponEffects.syncProjectile(projectile, tick);
    this.drawShot(projectile, style, graphics, native?.radius);
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
  private drawShot(projectile: ProjectileState, style: ProjectileStyle, g: Phaser.GameObjects.Graphics, nativeRadius?: number): void {
    const { x, y } = projectile;
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
    const ux = projectile.velocityX / speed;
    const uy = projectile.velocityY / speed;
    const angle = Math.atan2(uy, ux);
    // Native material cores choose their own modest bounds. Unsupported art
    // keeps the existing procedural size and silhouette as a safe fallback.
    const r = nativeRadius ?? Math.max(6, projectile.radius * style.scale * 1.8);
    const t = projectile.remainingTicks + projectile.id * 7;
    this.openingConcourse?.addLight({ x, y, radius: 40 + r * 2, color: style.color, intensity: 0.8 });
    const perp = { x: -uy, y: ux };
    const tri = (a: number, b: number, c: number, d: number, e: number, f: number) => g.fillTriangle(a, b, c, d, e, f);
    // Authored sheets already contain their material motion. Never paint the
    // old generic body or broad trail underneath a native core.
    if (nativeRadius === undefined) {
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
      this.weaponEffects.hideMelee();
      return;
    }
    const lights = this.weapon.sync({
      x: player.x,
      y: player.y,
      facingX: player.facing.x,
      facingY: player.facing.y,
      attackActiveTicks: player.attackActiveTicks,
      definitionId: primary.definitionId,
      instanceId: state.inventory.selectedPrimaryInstanceId,
      delivery: primary.delivery,
      range: primary.range,
      halfAngleRadians: primary.halfAngleRadians,
    }, state.tick, effects, presentationDepth('actor', player.y),
    this.weaponEffects.canRenderMelee(primary.definitionId), this.weaponEffects.canRenderRanged(primary.definitionId));
    const progress = this.weapon.swingAt(state.tick);
    const head = this.weapon.headAt();
    if (primary.delivery === 'direct') this.weaponEffects.syncMelee(primary.definitionId, progress, head);
    else this.weaponEffects.syncMuzzle(primary.definitionId, progress, head);
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
    hurt: EnemyHurtFrame | null = null,
  ): ActorFrameEvidence {
    let visual = actorPresentation(this.actorMemory, snapshot, tick);
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
    const hurtKey = materialHurtKey(this.scene.textures, snapshot.kind);
    const nativeHurt = !attacking && !(snapshot.kind === 'static' && snapshot.phase === 'telegraph') && hurtKey && hurt && hurt.spec.textureKey === hurtKey ? hurt : null;
    if (nativeHurt) {
      visual = { ...visual, direction: nativeHurt.direction, bobY: 0, lunge: 0, attackLean: 0, damageFlicker: false, damageFeedback: false };
      this.actorMemory.presentFacing(snapshot.id, nativeHurt.direction);
    }
    const walkKey = nativeHurt ? nativeHurt.spec.textureKey : attacking ? sheet.attack
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
    if (nativeHurt) spec = nativeHurt.spec;
    const usable = usableTextureKey(this.scene.textures, textureKey) !== null
      && (nativeHurt !== null || snapshot.kind === 'alex' || snapshot.kind === 'hanger' || neonIdle !== null);
    let view = this.actorSprites.get(snapshot.id);
    if (!view) {
      view = new ActorSpriteView(this.scene, spec);
      this.actorSprites.set(snapshot.id, view);
    }
    this.usedActorSpriteIds.add(snapshot.id);
    const walkingFrames = (visual.walking && snapshot.kind === 'alex') || walkKey !== null;
    const walkFrame = actorFrameFor(walkingFrames ? 'walk' : 'idle', visual.direction, tick, walkFrames, sheet?.ticksPerFrame ?? 5);
    const frame = nativeHurt ? nativeHurt.frame : attacking ? { row: walkFrame.row, column: Math.min(walkFrames - 1, attackColumn) } : walkFrame;
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

  /** Fixed pursuit eyes belong to the idle/walk head, not a moving hurt pose. */
  private drawMannequinEyes(actor: ActorSnapshot, effects: Phaser.GameObjects.Graphics, hurt: EnemyHurtFrame | null): void {
    if (actor.kind !== 'mannequin' || actor.phase !== 'pursue' || hurt) return;
    this.openingConcourse?.addLight({ x: actor.x, y: actor.y - 52, radius: 20, color: 0xff2a3a, intensity: 1 });
    effects.fillStyle(0xff2a3a, 1).fillRect(Math.round(actor.x) - 4, Math.round(actor.y) - 54, 2, 2).fillRect(Math.round(actor.x) + 2, Math.round(actor.y) - 54, 2, 2);
  }

  private readonly enemyMaxHealth = new Map<string, number>();
  private readonly eliteTags = new Map<string, Phaser.GameObjects.Image>();
  private readonly usedEliteTags = new Set<string>();

  /** Returns the tag's width, so the trait glyph can sit beside it. */
  private eliteTag(id: string, x: number, y: number, text = 'CLEARANCE', css = '#ffd84a'): number {
    const label = ensurePixelLabel(this.scene, text, css, 1, '#2a1400');
    let tag = this.eliteTags.get(id);
    if (!tag) {
      tag = this.scene.add.image(0, 0, label.key).setDepth(presentationDepth('prompt', 2));
      this.eliteTags.set(id, tag);
    }
    this.usedEliteTags.add(id);
    // A pooled tag follows a trait change rather than keeping its first word.
    if (tag.texture.key !== label.key) tag.setTexture(label.key);
    tag.setVisible(true).setPosition(Math.round(x), Math.round(y));
    return label.width;
  }

  /**
   * The elite's floor ring and trait glyph (roadmap V10): Swift is a dashed,
   * turning ring and a double chevron; Volatile a double ring and a lit fuse;
   * plain Clearance one ring and a price tag. Shape carries the trait as well as colour.
   */
  private drawEliteMark(effects: Phaser.GameObjects.Graphics, at: { readonly x: number; readonly y: number }, trait: EliteMarkTrait, tick: number, glow: number, tagHalfWidth: number, reducedMotion = false): void {
    const look = ELITE_LOOK[trait];
    const ring = eliteRingSegments(trait, tick, reducedMotion);
    const cx = at.x, cy = at.y + 2;
    effects.lineStyle(3, look.color, glow);
    if (ring.dashes > 0) {
      const step = (Math.PI * 2) / ring.dashes;
      for (let i = 0; i < ring.dashes; i += 1) {
        const a0 = ring.offset + i * step, a1 = a0 + step * 0.55;
        effects.lineBetween(cx + Math.cos(a0) * 29, cy + Math.sin(a0) * 11, cx + Math.cos(a1) * 29, cy + Math.sin(a1) * 11);
      }
    } else {
      effects.strokeEllipse(cx, cy, 58, 22);
      if (ring.rings > 1) effects.strokeEllipse(cx, cy, 42, 15);
    }
    // 7x7 glyph at 2 px a pixel, dark-outlined so it reads on lit floors, left of the tag.
    const gx = Math.round(at.x - tagHalfWidth - 18), gy = Math.round(at.y - 70 - 7);
    const glyph = ELITE_GLYPHS[trait];
    effects.fillStyle(0x140a04, 0.9);
    for (const [x, y] of glyph) effects.fillRect(gx + x * 2 + 1, gy + y * 2 + 1, 2, 2);
    effects.fillStyle(look.color, 1);
    for (const [x, y] of glyph) effects.fillRect(gx + x * 2, gy + y * 2, 2, 2);
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
    const readiness = dashReadiness(player, runDashCooldown(state));
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
    const held = Math.floor(this.heldTicks);
    if (state.status === 'playing') {
      this.endedAt = null;
      return state.tick + held;
    }
    if (this.endedAt === null) this.endedAt = this.scene.time.now;
    const since = this.scene.time.now - this.endedAt;
    return state.tick + held + Math.floor((this.timeWarp ? this.timeWarp(since) : since) / (1000 / 60));
  }

  /** Lets effects run on while a cinematic holds the sim clock. */
  public advanceHeldEffects(elapsedMs: number): void {
    this.heldTicks += Math.max(0, elapsedMs) / (1000 / 60);
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
    this.weapon.noteAttack({
      definitionId: primary.definitionId,
      instanceId: state.inventory.selectedPrimaryInstanceId,
      attackActiveTicks: player.attackActiveTicks,
      facingX: player.facing.x,
      facingY: player.facing.y,
    }, state.tick);
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
    if (evidence.damageCueVisible && actor.kind !== 'mannequin') {
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
    // The back room's labels (round 53) come and go in drawSecret.
    const keep = new Set<string>(['bench', 'secret-hint', 'secret-timer', 'shortcut-sign']);
    if (state.carrier !== null) {
      keep.add('carrier');
    }
    if (state.stalker !== null) {
      keep.add('stalker');
    }
    const inside = activeStore(state);
    if (room && inside) {
      keep.add('store-alarm');
      keep.add('arcade-play');
      for (const offer of room.offers.filter((candidate) => candidate.storeId === inside.templateId)) {
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
    const texture = this.openingConcourse?.contactShadowTexture ?? FX_TEXTURES.shadow;
    let shadow = this.shadows.get(id);
    if (!shadow) {
      shadow = this.scene.add.image(x, y, texture).setDepth(presentationDepth('lowProp', 900));
      this.shadows.set(id, shadow);
    }
    if (shadow.texture.key !== texture) shadow.setTexture(texture);
    shadow.setPosition(Math.round(x), Math.round(y + 2)).setScale(scale, scale).setVisible(true);
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
    this.heroProps.destroy();
    for (const image of this.cartImages.values()) image.destroy();
    this.cartImages.clear();
    this.policeGlow?.destroy();
    this.policeGlow = null;
    this.clearDashGhosts();
    this.carSprite?.destroy();
    this.carSprite = null;
    this.dashHint?.destroy();
    this.dashHint = null;
    for (const shadow of this.shadows.values()) shadow.destroy();
    this.shadows.clear();
    this.loot.destroy();
    for (const icon of this.offerIcons.values()) icon.destroy();
    this.offerIcons.clear();
    this.feedback.destroy();
    this.weapon.destroy();
    this.weaponEffects.destroy();
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
    this.loot.reset();
    this.timeWarp = null;
    this.heldTicks = 0;
    this.feedback.resetRoom('');
    this.weapon.reset();
    this.weaponEffects.reset();
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
  /**
   * The moment a fusion lands: welding sparks and a shockwave ring off the
   * janitor, and a FUSED! stamp that floats up. Real-time tweens, since the
   * sim has only just resumed and this is pure presentation.
   */
  /**
   * The Bench Warrant's reveal (round 34): a ring and sparks burst off the
   * janitor, the fused item's icon rises out of the burst in its glow, and a
   * rubber stamp slams down over it in the reveal's ink.
   */
  public celebrateFusion(reveal: FusionRevealModel): void {
    const player = this.lastPlayer;
    if (!player) return;
    const scene = this.scene;
    const depth = 9_000;
    const ink = Phaser.Display.Color.HexStringToColor(reveal.color).color;
    const cx = player.x;
    const cy = player.y - 14;
    const ring = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    const state = { t: 0 };
    scene.tweens.add({
      targets: state, t: 1, duration: 520, ease: 'Cubic.easeOut',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(4 * (1 - state.t) + 1, ink, 1 - state.t).strokeCircle(cx, cy, 12 + state.t * 90 * (0.8 + reveal.parts * 0.1));
        ring.lineStyle(2, 0x3ff0ff, (1 - state.t) * 0.8).strokeCircle(cx, cy, 6 + state.t * 60);
      },
      onComplete: () => ring.destroy(),
    });
    // Sparks fly in from all round and then burst out: more for bigger fusions.
    const count = revealSparkCount(reveal.parts, !flashAllowed(gameSettings().get()));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const far = 70 + Math.random() * 30;
      const spark = scene.add.rectangle(cx + Math.cos(angle) * far, cy + Math.sin(angle) * far, 3, 3, i % 2 === 0 ? 0xffd84a : ink)
        .setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.chain({
        targets: spark,
        tweens: [
          { x: cx, y: cy, duration: 180, ease: 'Quad.easeIn' },
          { x: cx + Math.cos(angle) * (40 + Math.random() * 50), y: cy + Math.sin(angle) * (40 + Math.random() * 50), alpha: 0, duration: 420 + Math.random() * 220, ease: 'Quad.easeOut' },
        ],
        onComplete: () => spark.destroy(),
      });
    }
    const iconKey = reveal.itemDefinitionId ? usableItemIcon(scene, reveal.itemDefinitionId) : null;
    const icon = iconKey ? scene.add.image(cx, cy, iconKey).setDepth(depth + 1).setScale(0.2).setAlpha(0) : null;
    if (icon) {
      scene.tweens.add({ targets: icon, y: cy - 58, scale: 64 / Math.max(icon.width, icon.height, 1), alpha: 1, delay: 160, duration: 300, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: icon, y: cy - 90, alpha: 0, delay: 1_500, duration: 500, onComplete: () => icon.destroy() });
    }
    // The stamp drops from above, lands with a thud and a shake, and inks a ring.
    const label = ensurePixelLabel(scene, reveal.stamp, reveal.color, 3, '#06120a');
    const stampY = cy - (icon ? 26 : 48);
    const stamp = scene.add.image(cx, stampY, label.key).setDepth(depth + 2).setScale(3).setAlpha(0).setAngle(-8);
    scene.tweens.add({
      targets: stamp, scale: 1, alpha: 1, delay: icon ? 420 : 120, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => {
        const shake = shakeScale(gameSettings().get());
        if (shake > 0) scene.cameras.main.shake(90, 0.004 * shake);
        const splat = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
        splat.lineStyle(2, ink, 0.9).strokeRect(cx - stamp.width / 2 - 6, stampY - stamp.height / 2 - 4, stamp.width + 12, stamp.height + 8);
        scene.tweens.add({ targets: splat, alpha: 0, scale: { from: 1, to: 1.04 }, duration: 500, onComplete: () => splat.destroy() });
      },
    });
    scene.tweens.add({ targets: stamp, y: stampY - 36, alpha: 0, delay: 1_600, duration: 600, onComplete: () => stamp.destroy() });
  }

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
    propImages: ReturnType<HeroPropView['debugSnapshot']>;
  }) | null {
    if (!this.openingConcourse) return null;
    return {
      ...this.openingConcourse.debugSnapshot(),
      promptDepths: [...this.labels].map(([id, label]) => ({ id, renderDepth: label.depth })),
      propImages: this.heroProps.debugSnapshot(),
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
