import Phaser from 'phaser';
import { ACTOR_TEXTURE_KEYS, type ActorTextureKey } from '../presentation/assets';
import { actorVisualState } from './visualState';

export const ACTOR_DIRECTION_ORDER = [
  'south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast',
] as const;
export type ActorDirection = (typeof ACTOR_DIRECTION_ORDER)[number];
export type ActorKind = 'alex' | 'hanger';

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
};

export function directionForVector(x: number, y: number, previous: ActorDirection): ActorDirection {
  if (x === 0 && y === 0) return previous;
  const angle = Math.atan2(y, x);
  const index = Math.round((angle - Math.PI / 2) / (Math.PI / 4));
  return ACTOR_DIRECTION_ORDER[((index % 8) + 8) % 8] ?? previous;
}

export function actorFrameFor(state: 'idle' | 'walk', direction: ActorDirection, tick: number): { row: number; column: number } {
  const directionIndex = ACTOR_DIRECTION_ORDER.indexOf(direction);
  return state === 'idle'
    ? { row: 0, column: directionIndex }
    : { row: directionIndex, column: Math.floor(tick / 5) % 6 };
}

export function shouldRenderActorSprite(key: string, available: ReadonlySet<string>): boolean {
  return available.has(key);
}

export function actorTextureKey(kind: ActorKind, walking: boolean): ActorTextureKey {
  if (kind === 'hanger') return ACTOR_TEXTURE_KEYS.hangerIdle;
  return walking ? ACTOR_TEXTURE_KEYS.alexWalk : ACTOR_TEXTURE_KEYS.alexIdle;
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
    const next = directionForVector(actor.moveX, actor.moveY, previous);
    this.directions.set(actor.id, next);
    return next;
  }

  public reset(): void { this.directions.clear(); }
}

/** Local position deltas scoped to one room; entry teleports are never walks. */
export class ActorMovementMemory {
  private scope: string | null = null;
  private readonly positions = new Map<string, { x: number; y: number }>();

  public beginScope(scope: string): boolean {
    if (this.scope === scope) return false;
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
  const state = actorVisualState({ moving: walking, attackTicks: actor.attackTicks, invulnerableTicks: actor.damaged ? 1 : 0, phase: actor.phase, isHanger: actor.kind === 'hanger', tick });
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
      if (!current.has(id) && !this.effects.has(id) && this.effects.size < MAX_ACTOR_DEATH_EFFECTS) {
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

export type SpriteSpec = { readonly textureKey: string; readonly frameWidth: number; readonly frameHeight: number; readonly scale: number };

/** Full-sheet origin that places one cropped frame's feet at the world point. */
export function croppedFrameOrigin(
  frame: { readonly row: number; readonly column: number },
  sheet: { readonly width: number; readonly height: number },
  frameSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  return {
    x: (frame.column * frameSize.width + frameSize.width * 0.5) / sheet.width,
    y: (frame.row * frameSize.height + frameSize.height * 0.84) / sheet.height,
  };
}

/** Disposable Phaser adapter over snapshots; texture failure returns vector fallback control to the caller. */
export class ActorSpriteView {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private textureKey: string;

  public constructor(scene: Phaser.Scene, spec: SpriteSpec) {
    this.scene = scene;
    this.textureKey = spec.textureKey;
    this.sprite = scene.add.image(0, 0, spec.textureKey).setOrigin(0.5, 0.84).setVisible(false);
  }

  public sync(actor: ActorSnapshot, frame: { row: number; column: number }, visual: ActorPresentation, usable: boolean, depth: number, spec: SpriteSpec): boolean {
    if (!usable) { this.sprite.setVisible(false); return false; }
    if (this.textureKey !== spec.textureKey) {
      this.sprite.setTexture(spec.textureKey);
      this.textureKey = spec.textureKey;
    }
    const lunge = directionUnit(visual.direction);
    this.sprite.setVisible(true).setPosition(actor.x + lunge.x * visual.lunge, actor.y + visual.bobY + lunge.y * visual.lunge).setDepth(depth);
    this.sprite.setAlpha(visual.damageFlicker ? 0.45 : 1).setScale(spec.scale, spec.scale);
    this.sprite.setCrop(frame.column * spec.frameWidth, frame.row * spec.frameHeight, spec.frameWidth, spec.frameHeight);
    const origin = croppedFrameOrigin(
      frame,
      { width: this.sprite.width, height: this.sprite.height },
      { width: spec.frameWidth, height: spec.frameHeight },
    );
    this.sprite.setOrigin(origin.x, origin.y);
    this.sprite.setRotation(visual.attackLean ? 0.08 : 0);
    return true;
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
