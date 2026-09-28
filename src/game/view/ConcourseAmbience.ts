/**
 * Presentation-only evacuation state for the Opening Concourse.  Its input is
 * a read-only view of the already-authoritative run, so civilians cannot own a
 * collider, body, save field, or random simulation outcome.
 */
export type ConcourseAmbiencePhase = 'busy' | 'warning' | 'evacuating' | 'empty';

export interface ConcourseAmbienceSnapshot {
  readonly phase: ConcourseAmbiencePhase;
  readonly visibleCount: number;
}

export type ConcourseCivilianLane = {
  readonly id: string;
  readonly appearance: 'shopper-a' | 'shopper-b' | 'clerk' | 'security';
  readonly x: number;
  readonly y: number;
  readonly exitX: number;
};

export type ConcourseAmbienceInput = {
  readonly playerX: number;
  readonly roomX: number;
  readonly roomWidth: number;
  readonly inOpeningRoom: boolean;
  /** The active run tick: unchanged while paused or blurred. */
  readonly tick: number;
};

/** Authored collision the strollers keep clear of (the room's walls, planters, fountain). */
export type AmbienceWall = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Where a civilian is and what it is doing this frame. Facing uses the sheet's 8-row order. */
export type CivilianPose = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** 0 south, 1 south-west, 2 west, 3 north-west, 4 north, 5 north-east, 6 east, 7 south-east. */
  readonly facing: number;
  readonly walking: boolean;
  readonly visible: boolean;
};

type Walker = {
  x: number;
  y: number;
  readonly homeX: number;
  readonly homeY: number;
  route: Array<{ x: number; y: number }>;
  pause: number;
  facing: number;
  rng: number;
  exited: boolean;
};

const STROLL_SPEED = 0.45;
const HURRY_SPEED = 1.2;
const WANDER_X = 90;
const WANDER_Y = 45;
const BOUNDS = { left: 56, right: 904, top: 80, bottom: 432 } as const;
/** Cap on steps simulated per sync, so a long tab-away cannot stall a frame. */
const MAX_STEPS_PER_SYNC = 600;

/** The sheet row facing along (dx, dy): screen y grows downward. */
export function facingFor(dx: number, dy: number): number {
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  // atan2 octants east=0, south-east=1, south=2, south-west=3, west=±4, north-west=-3, north=-2, north-east=-1.
  const byOctant: Record<number, number> = { 0: 6, 1: 7, 2: 0, 3: 1, 4: 2, [-4]: 2, [-3]: 3, [-2]: 4, [-1]: 5 };
  return byOctant[octant] ?? 0;
}

function nextRandom(walker: Walker): number {
  let value = walker.rng >>> 0 || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  walker.rng = value >>> 0;
  return walker.rng / 4294967296;
}

const PHASES: readonly ConcourseAmbiencePhase[] = ['busy', 'warning', 'evacuating', 'empty'];
const AUTHORED_LANES: readonly Omit<ConcourseCivilianLane, 'appearance'>[] = [
  { id: 'north-window', x: 240, y: 157, exitX: 42 },
  { id: 'directory', x: 330, y: 222, exitX: 42 },
  { id: 'fountain-west', x: 372, y: 330, exitX: 42 },
  { id: 'fountain-east', x: 600, y: 334, exitX: 918 },
  { id: 'music-front', x: 565, y: 174, exitX: 918 },
  { id: 'east-gate', x: 585, y: 258, exitX: 918 },
];
const APPEARANCES: readonly ConcourseCivilianLane['appearance'][] = ['shopper-a', 'shopper-b', 'clerk', 'security'];

function seededOffset(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

/** Cosmetic deterministic selection and monotonic threshold progression. */
export class ConcourseAmbience {
  private readonly lanes: readonly ConcourseCivilianLane[];
  private phase: ConcourseAmbiencePhase = 'busy';
  private animationTick = 0;
  private phaseStartedAtTick = 0;
  private lastSceneTick: number | null = null;
  private walkers: Walker[] = [];
  private readonly offset: number;

  public constructor(seed: number, private readonly walls: readonly AmbienceWall[] = []) {
    const offset = seededOffset(seed);
    this.offset = offset;
    const count = 4 + (offset % 3);
    this.lanes = AUTHORED_LANES.slice(0, count).map((lane, index) => ({
      ...lane,
      appearance: APPEARANCES[(index + Math.floor(offset / 7)) % APPEARANCES.length]!,
    }));
    this.walkers = this.freshWalkers();
  }

  private freshWalkers(): Walker[] {
    return this.lanes.map((lane, index) => ({
      x: lane.x,
      y: lane.y,
      homeX: lane.x,
      homeY: lane.y,
      route: [],
      // Staggered first steps, so the crowd does not set off in unison.
      pause: 10 + ((this.offset >>> (index * 3)) % 70),
      facing: lane.exitX < lane.x ? 2 : 6,
      rng: (this.offset + index * 2654435761) >>> 0,
      exited: false,
    }));
  }

  public sync(input: ConcourseAmbienceInput): ConcourseAmbienceSnapshot {
    let steps = 0;
    if (this.lastSceneTick === null || input.tick > this.lastSceneTick) {
      steps = this.lastSceneTick === null ? 0 : input.tick - this.lastSceneTick;
      this.animationTick += steps;
      this.lastSceneTick = input.tick;
    }
    const progress = (input.playerX - input.roomX) / input.roomWidth;
    const threshold = input.inOpeningRoom
      ? progress >= 0.72
        ? 'evacuating'
        : progress >= 0.55
          ? 'warning'
          : 'busy'
      : 'empty';
    if (PHASES.indexOf(threshold) > PHASES.indexOf(this.phase)) {
      this.phase = threshold;
      this.phaseStartedAtTick = this.animationTick;
      if (threshold === 'warning' || threshold === 'evacuating') this.startPhase(threshold);
    }
    for (let step = 0; step < Math.min(steps, MAX_STEPS_PER_SYNC); step += 1) this.stepWalkers();
    return this.snapshot();
  }

  /** Every civilian's position, facing and gait this frame. */
  public civilianPoses(): readonly CivilianPose[] {
    return this.walkers.map((walker, index) => ({
      id: this.lanes[index]!.id,
      x: walker.x,
      y: walker.y,
      facing: walker.facing,
      walking: this.phase === 'evacuating' ? !walker.exited : this.phase === 'busy' && walker.route.length > 0 && walker.pause <= 0,
      visible: this.phase !== 'empty' && !walker.exited,
    }));
  }

  private startPhase(phase: 'warning' | 'evacuating'): void {
    this.walkers.forEach((walker, index) => {
      const lane = this.lanes[index]!;
      walker.facing = lane.exitX < walker.x ? 2 : 6;
      walker.route = phase === 'evacuating' ? this.exitRoute(walker, lane.exitX) : [];
      walker.pause = 0;
    });
  }

  /** Straight out along the current row if it is clear, else via the nearest clear row. */
  private exitRoute(walker: Walker, exitX: number): Array<{ x: number; y: number }> {
    for (const shift of [0, 24, -24, 48, -48, 72, -72, 110, -110]) {
      const y = Math.max(BOUNDS.top, Math.min(BOUNDS.bottom, walker.y + shift));
      if (this.clearPath(walker.x, walker.y, walker.x, y) && this.clearPath(walker.x, y, exitX, y)) {
        return shift === 0 ? [{ x: exitX, y }] : [{ x: walker.x, y }, { x: exitX, y }];
      }
    }
    return [{ x: exitX, y: walker.y }];
  }

  private stepWalkers(): void {
    if (this.phase === 'empty' || this.phase === 'warning') return;
    const hurry = this.phase === 'evacuating';
    this.walkers.forEach((walker, index) => {
      if (walker.exited) return;
      if (walker.pause > 0) {
        walker.pause -= 1;
        return;
      }
      if (walker.route.length === 0) {
        if (!hurry) this.chooseStroll(walker);
        return;
      }
      const target = walker.route[0]!;
      const dx = target.x - walker.x;
      const dy = target.y - walker.y;
      const distance = Math.hypot(dx, dy);
      const speed = hurry ? HURRY_SPEED : STROLL_SPEED;
      if (distance > 0) walker.facing = facingFor(dx, dy);
      if (distance <= speed) {
        walker.x = target.x;
        walker.y = target.y;
        walker.route.shift();
        if (walker.route.length > 0) return;
        if (hurry) {
          walker.exited = Math.abs(walker.x - this.lanes[index]!.exitX) < 1;
          return;
        }
        // Arrived: browse a while, sometimes turning to the shop windows.
        walker.pause = 40 + Math.floor(nextRandom(walker) * 110);
        if (nextRandom(walker) < 0.4) walker.facing = 4;
        return;
      }
      walker.x += (dx / distance) * speed;
      walker.y += (dy / distance) * speed;
    });
  }

  private chooseStroll(walker: Walker): void {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const x = Math.max(BOUNDS.left, Math.min(BOUNDS.right, walker.homeX + (nextRandom(walker) * 2 - 1) * WANDER_X));
      const y = Math.max(BOUNDS.top, Math.min(BOUNDS.bottom, walker.homeY + (nextRandom(walker) * 2 - 1) * WANDER_Y));
      if (Math.hypot(x - walker.x, y - walker.y) < 24) continue;
      if (this.blocked(x, y) || !this.clearPath(walker.x, walker.y, x, y)) continue;
      walker.route = [{ x, y }];
      return;
    }
    walker.pause = 30;
  }

  private blocked(x: number, y: number): boolean {
    return this.walls.some((wall) => x > wall.x - 10 && x < wall.x + wall.width + 10 && y > wall.y - 8 && y < wall.y + wall.height + 8);
  }

  private clearPath(ax: number, ay: number, bx: number, by: number): boolean {
    const samples = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      if (this.blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  public snapshot(): ConcourseAmbienceSnapshot {
    return { phase: this.phase, visibleCount: this.phase === 'empty' ? 0 : this.lanes.length };
  }

  /** Authored route data is intentionally presentation-private, except for unit evidence. */
  public debugLanes(): readonly ConcourseCivilianLane[] { return this.lanes.map((lane) => ({ ...lane })); }
  public debugAnimationTick(): number { return this.animationTick; }
  public debugPhaseAnimationTick(): number { return this.animationTick - this.phaseStartedAtTick; }

  public resetForRun(): void {
    this.phase = 'busy';
    this.animationTick = 0;
    this.phaseStartedAtTick = 0;
    this.lastSceneTick = null;
    this.walkers = this.freshWalkers();
  }
}
