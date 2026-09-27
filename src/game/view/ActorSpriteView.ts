import Phaser from 'phaser';

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

export type ActorPresentation = {
  readonly direction: ActorDirection;
  readonly walking: boolean;
  readonly attackLean: number;
  readonly damageFlicker: boolean;
  readonly bobY: number;
  readonly lunge: number;
};

/** Renderer memory only: no simulation state or behaviour lives here. */
export class ActorPresentationMemory {
  private readonly directions = new Map<string, ActorDirection>();
  private previouslyVisible = new Set<string>();

  public directionFor(actor: ActorSnapshot): ActorDirection {
    const previous = this.directions.get(actor.id) ?? 'south';
    const next = directionForVector(actor.moveX, actor.moveY, previous);
    this.directions.set(actor.id, next);
    return next;
  }

  public consumeDeaths(currentIds: ReadonlySet<string>): string[] {
    const deaths = [...this.previouslyVisible].filter((id) => !currentIds.has(id));
    this.previouslyVisible = new Set(currentIds);
    return deaths;
  }

  public observe(currentIds: ReadonlySet<string>): void { this.previouslyVisible = new Set(currentIds); }
}

export function actorPresentation(
  memory: ActorPresentationMemory,
  actor: ActorSnapshot,
  tick: number,
  visibleIds: ReadonlySet<string>,
): ActorPresentation {
  memory.observe(visibleIds);
  const direction = memory.directionFor(actor);
  const walking = actor.moveX !== 0 || actor.moveY !== 0;
  return {
    direction,
    walking,
    attackLean: actor.kind === 'alex' && actor.attackTicks > 0 ? 3 : 0,
    damageFlicker: actor.damaged && Math.floor(tick / 4) % 2 === 1,
    bobY: actor.kind === 'hanger' ? Math.sin(tick / 5) * 2 : 0,
    lunge: actor.kind === 'hanger' && actor.phase === 'telegraph' ? 3 : 0,
  };
}

type SpriteSpec = { readonly textureKey: string; readonly frameWidth: number; readonly frameHeight: number; readonly scale: number };

/** Disposable Phaser adapter over snapshots; texture failure returns vector fallback control to the caller. */
export class ActorSpriteView {
  private readonly scene: Phaser.Scene;
  private readonly spec: SpriteSpec;
  private readonly sprite: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, spec: SpriteSpec) {
    this.scene = scene;
    this.spec = spec;
    this.sprite = scene.add.image(0, 0, spec.textureKey).setOrigin(0.5, 0.84).setVisible(false);
  }

  public sync(actor: ActorSnapshot, frame: { row: number; column: number }, visual: ActorPresentation, usable: boolean, depth: number): boolean {
    if (!usable) { this.sprite.setVisible(false); return false; }
    this.sprite.setVisible(true).setPosition(actor.x + visual.lunge, actor.y + visual.bobY).setDepth(depth);
    this.sprite.setAlpha(visual.damageFlicker ? 0.45 : 1).setScale(this.spec.scale, this.spec.scale);
    this.sprite.setCrop(frame.column * this.spec.frameWidth, frame.row * this.spec.frameHeight, this.spec.frameWidth, this.spec.frameHeight);
    this.sprite.setRotation(visual.attackLean ? 0.08 : 0);
    return true;
  }

  public destroy(): void { this.sprite.destroy(); }
}
