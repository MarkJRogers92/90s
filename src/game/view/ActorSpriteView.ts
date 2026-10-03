import Phaser from 'phaser';
import { ACTOR_TEXTURE_KEYS, ENEMY_TEXTURE_KEYS, type ActorTextureKey } from '../presentation/assets';
import { actorVisualState } from './visualState';
import { flashAllowed, gameSettings } from '../settings/settings';

/** Round 39 display sizes: chosen so the figures match the Mascot's and the Owner's on screen. */
export const ROOFER_DISPLAY_SIZE = 108;
export const DEVELOPER_DISPLAY_SIZE = 160;

export const ACTOR_DIRECTION_ORDER = [
  'south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast',
] as const;
export type ActorDirection = (typeof ACTOR_DIRECTION_ORDER)[number];
export type ActorKind = 'alex' | 'hanger' | 'spitter' | 'lp_manager' | 'mannequin' | 'manager' | 'static' | 'shopper' | 'mascot' | 'owner' | 'roofer' | 'developer' | 'walker' | 'lp_agent'
  | 'elf' | 'spritzer' | 'poodle' | 'goon' | 'santa' | 'glamour_queen' | 'whiskers' | 'zamboni';

export type ActorSnapshot = {
  readonly id: string;
  readonly kind: ActorKind;
  readonly x: number;
  readonly y: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly attackTicks: number;
  readonly damaged: boolean;
  readonly phase: string;
  /** Optional facing that overrides movement (the janitor faces the aim). */
  readonly faceX?: number;
  readonly faceY?: number;
};

export function directionForVector(x: number, y: number, previous: ActorDirection): ActorDirection {
  if (x === 0 && y === 0) return previous;
  const angle = Math.atan2(y, x);
  const index = Math.round((angle - Math.PI / 2) / (Math.PI / 4));
  return ACTOR_DIRECTION_ORDER[((index % 8) + 8) % 8] ?? previous;
}

export function actorFrameFor(
  state: 'idle' | 'walk',
  direction: ActorDirection,
  tick: number,
  walkFrames = 6,
  ticksPerFrame = 5,
): { row: number; column: number } {
  const directionIndex = ACTOR_DIRECTION_ORDER.indexOf(direction);
  return state === 'idle'
    ? { row: 0, column: directionIndex }
    : { row: directionIndex, column: Math.floor(tick / ticksPerFrame) % walkFrames };
}

export function shouldRenderActorSprite(key: string, available: ReadonlySet<string>): boolean {
  return available.has(key);
}

export function actorTextureKey(kind: ActorKind, walking: boolean): ActorTextureKey {
  if (kind === 'hanger') return ACTOR_TEXTURE_KEYS.hangerIdle;
  if (kind !== 'alex') return ACTOR_TEXTURE_KEYS.hangerIdle;
  return walking ? ACTOR_TEXTURE_KEYS.alexWalk : ACTOR_TEXTURE_KEYS.alexIdle;
}

/**
 * The neon pass's enemy art: a walk sheet (one row per facing) when the enemy
 * is moving and one exists, else the 8-facing idle strip. Returns null for the
 * player, whose sheets are the approved presentation-slice art.
 */
/** The Mall Walker's 92 px canvas at the Bargain Hunter's scale (76 px of 96). */
export const WALKER_DISPLAY_SIZE = 73;

/**
 * Round 50: the district monsters (92 px PixelLab canvases) and mini-bosses
 * (160 px), each drawn so the figure sits at the scale of the cast around it.
 */
export const DISTRICT_SPRITES: Readonly<Record<'elf' | 'spritzer' | 'poodle' | 'goon' | 'santa' | 'glamour_queen' | 'whiskers' | 'zamboni', { readonly prefix: string; readonly canvas: number; readonly displaySize: number; readonly ticksPerFrame: number }>> = {
  elf: { prefix: 'elf', canvas: 92, displaySize: 70, ticksPerFrame: 3 },
  spritzer: { prefix: 'spritzer', canvas: 92, displaySize: 73, ticksPerFrame: 4 },
  poodle: { prefix: 'poodle', canvas: 92, displaySize: 66, ticksPerFrame: 3 },
  goon: { prefix: 'goon', canvas: 92, displaySize: 74, ticksPerFrame: 4 },
  santa: { prefix: 'santa', canvas: 160, displaySize: 132, ticksPerFrame: 6 },
  glamour_queen: { prefix: 'glamour-queen', canvas: 160, displaySize: 132, ticksPerFrame: 6 },
  whiskers: { prefix: 'whiskers', canvas: 160, displaySize: 140, ticksPerFrame: 5 },
  zamboni: { prefix: 'zamboni', canvas: 160, displaySize: 136, ticksPerFrame: 6 },
};

/**
 * PixelLab's v3 animations re-render the largest bosses a little bigger than their
 * walk sheets. The renderer draws every sheet of a kind at one scale, so these attack
 * sheets are shrunk back to the walk figure (around the feet, where the sprite is
 * anchored). Factors come from `animate_characters.py collect` (walk ÷ attack height).
 */
export const ACTION_FIGURE_SCALE: Readonly<Record<string, number>> = {
  'neon:enemy:developer-attack': 0.88,
  'neon:enemy:whiskers-attack': 0.95,
};

export function actionFigureScale(textureKey: string): number {
  return Object.hasOwn(ACTION_FIGURE_SCALE, textureKey) ? ACTION_FIGURE_SCALE[textureKey]! : 1;
}

export function enemySpriteSheet(
  kind: ActorKind,
  walking: boolean,
): { idle: string; walk: string | null; attack: string; walkFrames: number; ticksPerFrame: number; displaySize: number } | null {
  // displaySize is the on-screen frame size; the sheet's own resolution is
  // read from the texture, so a 48px or 64px re-render needs no code change.
  switch (kind) {
    case 'hanger':
      return { idle: ENEMY_TEXTURE_KEYS.hangerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.hangerWalk : null, attack: ENEMY_TEXTURE_KEYS.hangerAttack, walkFrames: 6, ticksPerFrame: 4, displaySize: 64 };
    case 'spitter':
      return { idle: ENEMY_TEXTURE_KEYS.spitterIdle, walk: null, attack: ENEMY_TEXTURE_KEYS.spitterAttack, walkFrames: 1, ticksPerFrame: 5, displaySize: 64 };
    case 'static':
      return { idle: ENEMY_TEXTURE_KEYS.staticIdle, walk: walking ? ENEMY_TEXTURE_KEYS.staticWalk : null, attack: 'neon:enemy:static-attack', walkFrames: 8, ticksPerFrame: 4, displaySize: 72 };
    case 'shopper':
      return { idle: ENEMY_TEXTURE_KEYS.shopperIdle, walk: walking ? ENEMY_TEXTURE_KEYS.shopperWalk : null, attack: 'neon:enemy:shopper-attack', walkFrames: 6, ticksPerFrame: 4, displaySize: 76 };
    case 'mascot':
      return { idle: ENEMY_TEXTURE_KEYS.mascotIdle, walk: walking ? ENEMY_TEXTURE_KEYS.mascotWalk : null, attack: 'neon:enemy:mascot-attack', walkFrames: 6, ticksPerFrame: 5, displaySize: 92 };
    // Round 39: PixelLab grew these canvases (136 and 180 px), so they are drawn larger to keep the figures in scale.
    case 'roofer':
      return { idle: ENEMY_TEXTURE_KEYS.rooferIdle, walk: walking ? ENEMY_TEXTURE_KEYS.rooferWalk : null, attack: 'neon:enemy:roofer-attack', walkFrames: 6, ticksPerFrame: 5, displaySize: ROOFER_DISPLAY_SIZE };
    case 'elf':
    case 'spritzer':
    case 'poodle':
    case 'goon':
    case 'santa':
    case 'glamour_queen':
    case 'whiskers':
    case 'zamboni': {
      const sprite = DISTRICT_SPRITES[kind];
      return { idle: `neon:enemy:${sprite.prefix}-idle`, walk: walking ? `neon:enemy:${sprite.prefix}-walk` : null, attack: `neon:enemy:${sprite.prefix}-attack`, walkFrames: 6, ticksPerFrame: sprite.ticksPerFrame, displaySize: sprite.displaySize };
    }
    case 'walker':
      // Round 48: a 92 px PixelLab canvas, drawn at the Bargain Hunter's scale (76 of 96).
      return { idle: ENEMY_TEXTURE_KEYS.walkerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.walkerWalk : null, attack: 'neon:enemy:walker-attack', walkFrames: 6, ticksPerFrame: 4, displaySize: WALKER_DISPLAY_SIZE };
    case 'developer':
      return { idle: ENEMY_TEXTURE_KEYS.developerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.developerWalk : null, attack: 'neon:enemy:developer-attack', walkFrames: 6, ticksPerFrame: 6, displaySize: DEVELOPER_DISPLAY_SIZE };
    case 'owner':
      return { idle: ENEMY_TEXTURE_KEYS.ownerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.ownerWalk : null, attack: 'neon:enemy:owner-attack', walkFrames: 6, ticksPerFrame: 6, displaySize: 150 };
    case 'manager':
      return { idle: ENEMY_TEXTURE_KEYS.managerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.managerWalk : null, attack: 'neon:enemy:manager-attack', walkFrames: 8, ticksPerFrame: 6, displaySize: 128 };
    case 'mannequin':
      // A 96 px PixelLab canvas drawn at 72: a person-sized display dummy.
      return { idle: ENEMY_TEXTURE_KEYS.mannequinIdle, walk: walking ? ENEMY_TEXTURE_KEYS.mannequinWalk : null, attack: 'neon:enemy:mannequin-attack', walkFrames: 6, ticksPerFrame: 3, displaySize: 72 };
    case 'lp_manager':
      return { idle: ENEMY_TEXTURE_KEYS.lpManagerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.lpManagerWalk : null, attack: ENEMY_TEXTURE_KEYS.lpManagerAttack, walkFrames: 8, ticksPerFrame: 6, displaySize: 128 };
    case 'lp_agent':
      // The four-star stalker: one of the Loss Prevention Manager's own men,
      // drawn from his sheets at person size and tinted cold by the view.
      return { idle: ENEMY_TEXTURE_KEYS.lpManagerIdle, walk: walking ? ENEMY_TEXTURE_KEYS.lpManagerWalk : null, attack: ENEMY_TEXTURE_KEYS.lpManagerAttack, walkFrames: 8, ticksPerFrame: 5, displaySize: 80 };
    default:
      return null;
  }
}

export type ActorPresentation = {
  readonly direction: ActorDirection;
  readonly walking: boolean;
  readonly attackLean: number;
  readonly damageFlicker: boolean;
  readonly damageFeedback: boolean;
  readonly bobY: number;
  readonly lunge: number;
};

/** Renderer memory only: no simulation state or behaviour lives here. */
export class ActorPresentationMemory {
  private readonly directions = new Map<string, ActorDirection>();

  public directionFor(actor: ActorSnapshot): ActorDirection {
    const previous = this.directions.get(actor.id) ?? 'south';
    const next = actor.faceX !== undefined && actor.faceY !== undefined
      ? directionForVector(actor.faceX, actor.faceY, previous)
      : directionForVector(actor.moveX, actor.moveY, previous);
    this.directions.set(actor.id, next);
    return next;
  }

  /** Last displayed facing, not an inferred attack-source direction. */
  public facingFor(id: string): ActorDirection { return this.directions.get(id) ?? 'south'; }

  public presentFacing(id: string, direction: ActorDirection): void { this.directions.set(id, direction); }

  public reset(): void { this.directions.clear(); }
}

/** Local position deltas scoped to one room; entry teleports are never walks. */
export class ActorMovementMemory {
  private scope: string | null = null;
  private tick: number | null = null;
  private readonly positions = new Map<string, { x: number; y: number }>();

  public beginScope(scope: string, tick?: number): boolean {
    const rewind = tick !== undefined && this.tick !== null && tick < this.tick;
    this.tick = tick ?? this.tick;
    if (this.scope === scope && !rewind) return false;
    this.scope = scope;
    this.positions.clear();
    return true;
  }

  public movementFor(id: string, x: number, y: number): { x: number; y: number } {
    const previous = this.positions.get(id);
    this.positions.set(id, { x, y });
    return previous ? { x: x - previous.x, y: y - previous.y } : { x: 0, y: 0 };
  }

  public retain(activeIds: ReadonlySet<string>): void {
    for (const id of this.positions.keys()) {
      if (!activeIds.has(id)) this.positions.delete(id);
    }
  }

  public reset(): void {
    this.scope = null;
    this.tick = null;
    this.positions.clear();
  }
}

export function actorPresentation(
  memory: ActorPresentationMemory,
  actor: ActorSnapshot,
  tick: number,
): ActorPresentation {
  const direction = memory.directionFor(actor);
  const walking = actor.moveX !== 0 || actor.moveY !== 0;
  const state = actorVisualState({ moving: walking, attackTicks: actor.attackTicks, invulnerableTicks: actor.damaged ? 1 : 0, phase: actor.phase, isHanger: actor.kind === 'hanger', tick, flashes: flashAllowed(gameSettings().get()) });
  return {
    direction,
    walking: state.walking,
    attackLean: state.attackLean,
    damageFlicker: state.damageFlicker,
    damageFeedback: state.damageFeedback,
    bobY: state.bobY,
    lunge: state.lunge,
  };
}

export const ACTOR_DEATH_EFFECT_TICKS = 18;
export const MAX_ACTOR_DEATH_EFFECTS = 16;

type DeathTrackedActor = {
  readonly id: string;
  readonly kind?: ActorKind;
  readonly x: number;
  readonly y: number;
};

export type ActorDeathEffect = DeathTrackedActor & {
  readonly startedTick: number;
  readonly remainingTicks: number;
};

/**
 * Renderer-only enemy disappearance memory.
 *
 * A scope change (room transition), a backwards tick (fresh run), reset, or
 * destroy clears both the baseline and effects. Re-syncing the same snapshot
 * cannot emit twice, and the fixed cap prevents presentation accumulation.
 */
export class ActorDeathEffectLifecycle {
  private scope: string | null = null;
  private lastTick: number | null = null;
  private previous = new Map<string, DeathTrackedActor>();
  private effects = new Map<string, Omit<ActorDeathEffect, 'remainingTicks'>>();

  public sync(scope: string, tick: number, actors: readonly DeathTrackedActor[]): void {
    // Presence includes every kind: a reused id is not a disappearance.
    const current = new Map(actors.map((actor) => [actor.id, { ...actor }]));
    if (this.scope !== scope || (this.lastTick !== null && tick < this.lastTick)) {
      this.scope = scope;
      this.lastTick = tick;
      this.previous = current;
      this.effects.clear();
      return;
    }

    this.expire(tick);
    for (const [id, actor] of this.previous) {
      // Authored material falls own their death feedback; never add a second ring.
      if (!current.has(id) && actor.kind !== 'mannequin' && actor.kind !== 'static'
        && !this.effects.has(id) && this.effects.size < MAX_ACTOR_DEATH_EFFECTS) {
        this.effects.set(id, { ...actor, startedTick: tick });
      }
    }
    this.previous = current;
    this.lastTick = tick;
  }

  public snapshot(): ActorDeathEffect[] {
    const tick = this.lastTick ?? 0;
    return [...this.effects.values()].map((effect) => ({
      ...effect,
      remainingTicks: Math.max(0, ACTOR_DEATH_EFFECT_TICKS - (tick - effect.startedTick)),
    }));
  }

  public reset(): void {
    this.scope = null;
    this.lastTick = null;
    this.previous.clear();
    this.effects.clear();
  }

  public destroy(): void { this.reset(); }

  private expire(tick: number): void {
    for (const [id, effect] of this.effects) {
      if (tick - effect.startedTick >= ACTOR_DEATH_EFFECT_TICKS) this.effects.delete(id);
    }
  }
}

export type SpriteSpec = {
  readonly textureKey: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly scale: number;
  /** Pixel row of the feet inside a frame; defaults to 84% of the frame height. */
  readonly feetY?: number;
};

/** Full-sheet origin that places one cropped frame's feet at the world point. */
export function croppedFrameOrigin(
  frame: { readonly row: number; readonly column: number },
  sheet: { readonly width: number; readonly height: number },
  frameSize: { readonly width: number; readonly height: number },
  feetY = frameSize.height * 0.84,
): { readonly x: number; readonly y: number } {
  return {
    x: (frame.column * frameSize.width + frameSize.width * 0.5) / sheet.width,
    y: (frame.row * frameSize.height + feetY) / sheet.height,
  };
}

// Phaser.TintModes values, inlined so this module stays importable without a
// browser (the pure helpers above are unit tested under Node).
const TINT_FILL = 1;
const TINT_ADD = 2;

/** Presentation-only adjustments layered on a frame: hit reactions and wind-ups. */
export type ActorPose = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly flash: boolean;
  /** Additive glow colour while an attack charges. */
  readonly tint?: number;
};

export const NEUTRAL_POSE: ActorPose = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false };

/** Disposable Phaser adapter over snapshots; texture failure returns vector fallback control to the caller. */
export class ActorSpriteView {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private textureKey: string;
  private crop = { x: 0, y: 0, w: 0, h: 0 };

  public constructor(scene: Phaser.Scene, spec: SpriteSpec) {
    this.scene = scene;
    this.textureKey = spec.textureKey;
    this.sprite = scene.add.image(0, 0, spec.textureKey).setOrigin(0.5, 0.84).setVisible(false);
  }

  public sync(
    actor: ActorSnapshot,
    frame: { row: number; column: number },
    visual: ActorPresentation,
    usable: boolean,
    depth: number,
    spec: SpriteSpec,
    pose: ActorPose = NEUTRAL_POSE,
  ): boolean {
    if (!usable) { this.sprite.setVisible(false); return false; }
    if (this.textureKey !== spec.textureKey) {
      this.sprite.setTexture(spec.textureKey);
      this.textureKey = spec.textureKey;
    }
    const lunge = directionUnit(visual.direction);
    this.sprite
      .setVisible(true)
      .setPosition(actor.x + lunge.x * visual.lunge + pose.offsetX, actor.y + visual.bobY + lunge.y * visual.lunge + pose.offsetY)
      .setDepth(depth);
    this.sprite.setAlpha(visual.damageFlicker && !pose.flash ? 0.45 : 1).setScale(spec.scale * pose.scaleX, spec.scale * pose.scaleY);
    // A struck sprite goes solid white for a few frames; a charging one glows.
    if (pose.flash) this.sprite.setTint(0xffffff).setTintMode(TINT_FILL);
    else if (pose.tint !== undefined) this.sprite.setTint(pose.tint).setTintMode(TINT_ADD);
    else this.sprite.clearTint();
    this.crop = { x: frame.column * spec.frameWidth, y: frame.row * spec.frameHeight, w: spec.frameWidth, h: spec.frameHeight };
    this.sprite.setCrop(this.crop.x, this.crop.y, this.crop.w, this.crop.h);
    const origin = croppedFrameOrigin(
      frame,
      { width: this.sprite.width, height: this.sprite.height },
      { width: spec.frameWidth, height: spec.frameHeight },
      spec.feetY,
    );
    this.sprite.setOrigin(origin.x, origin.y);
    this.sprite.setRotation(visual.attackLean ? 0.08 : 0);
    return true;
  }

  /** A frozen copy of the current frame, for afterimages. Caller owns it. */
  public ghost(): Phaser.GameObjects.Image | null {
    if (!this.sprite.visible) return null;
    return this.scene.add
      .image(this.sprite.x, this.sprite.y, this.textureKey)
      .setCrop(this.crop.x, this.crop.y, this.crop.w, this.crop.h)
      .setOrigin(this.sprite.originX, this.sprite.originY)
      .setScale(this.sprite.scaleX, this.sprite.scaleY)
      .setDepth(this.sprite.depth - 1);
  }

  public destroy(): void { this.sprite.destroy(); }
}

function directionUnit(direction: ActorDirection): { x: number; y: number } {
  switch (direction) {
    case 'south': return { x: 0, y: 1 };
    case 'southwest': return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    case 'west': return { x: -1, y: 0 };
    case 'northwest': return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    case 'north': return { x: 0, y: -1 };
    case 'northeast': return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    case 'east': return { x: 1, y: 0 };
    case 'southeast': return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  }
}
