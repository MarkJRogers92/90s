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

const PHASES: readonly ConcourseAmbiencePhase[] = ['busy', 'warning', 'evacuating', 'empty'];
const AUTHORED_LANES: readonly Omit<ConcourseCivilianLane, 'appearance'>[] = [
  { id: 'north-window', x: 240, y: 157, exitX: 42 },
  { id: 'directory', x: 330, y: 222, exitX: 42 },
  { id: 'fountain-west', x: 420, y: 310, exitX: 42 },
  { id: 'fountain-east', x: 510, y: 326, exitX: 918 },
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

  public constructor(seed: number) {
    const offset = seededOffset(seed);
    const count = 4 + (offset % 3);
    this.lanes = AUTHORED_LANES.slice(0, count).map((lane, index) => ({
      ...lane,
      appearance: APPEARANCES[(index + Math.floor(offset / 7)) % APPEARANCES.length]!,
    }));
  }

  public sync(input: ConcourseAmbienceInput): ConcourseAmbienceSnapshot {
    if (this.lastSceneTick === null || input.tick > this.lastSceneTick) {
      this.animationTick += this.lastSceneTick === null ? 0 : input.tick - this.lastSceneTick;
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
    }
    return this.snapshot();
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
  }
}
