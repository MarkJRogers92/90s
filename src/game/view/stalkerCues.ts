/**
 * How the Loss Prevention stalker reads on screen, derived from sim state.
 *
 * Pure: the view draws the door warning, the agent, his flashlight and his
 * label from this and nothing else. While he is arriving the door he will
 * use strobes red and blue with a countdown, so the janitor always sees him
 * coming before he can touch them.
 */
import { STALKER_ARRIVAL_TICKS, type StalkerState } from '../../sim/run/stalker';

export type StalkerCue = {
  readonly phase: 'none' | StalkerState['phase'];
  /** Draw the agent himself (not while he is still outside the door). */
  readonly body: boolean;
  /** 0 when the warning starts to 1 as he walks in; null when not arriving. */
  readonly doorProgress: number | null;
  /** Red or blue strobe half, alternating every 8 ticks. */
  readonly strobeRed: boolean;
  /** Text over him or the door, or nothing. */
  readonly label: string | null;
  /** His flashlight sweeps ahead of him while he hunts. */
  readonly flashlight: boolean;
  /** Sideways stagger in pixels while shoved. */
  readonly sway: number;
};

const NONE: StalkerCue = { phase: 'none', body: false, doorProgress: null, strobeRed: false, label: null, flashlight: false, sway: 0 };

export function stalkerCue(stalker: StalkerState | null, tick: number): StalkerCue {
  if (stalker === null) return NONE;
  const strobeRed = Math.floor(tick / 8) % 2 === 0;
  switch (stalker.phase) {
    case 'arriving':
      return {
        phase: 'arriving',
        body: false,
        doorProgress: Math.max(0, Math.min(1, 1 - stalker.phaseTicks / STALKER_ARRIVAL_TICKS)),
        strobeRed,
        label: `LOSS PREVENTION ${Math.max(1, Math.ceil(stalker.phaseTicks / 60))}`,
        flashlight: false,
        sway: 0,
      };
    case 'writing_up':
      return { phase: 'writing_up', body: true, doorProgress: null, strobeRed, label: 'WRITTEN UP!', flashlight: false, sway: 0 };
    case 'shoved':
      return {
        phase: 'shoved',
        body: true,
        doorProgress: null,
        strobeRed,
        label: null,
        flashlight: false,
        sway: Math.round(3 * Math.sin((stalker.phaseTicks / 50) * Math.PI * 6)),
      };
    default:
      return { phase: 'hunting', body: true, doorProgress: null, strobeRed, label: null, flashlight: true, sway: 0 };
  }
}

export type PoliceWash = {
  /** 0..1 overall strength of the edge glow and wall spill. */
  readonly strength: number;
  /** Which side is red this beat (the other is blue). */
  readonly leftRed: boolean;
  /** Reduced flashes: both sides hold a dim, steady mix instead of alternating. */
  readonly steady: boolean;
};

/** Slower than the door strobe: a cruiser's bar seen through the mall glass. */
export const POLICE_WASH_BEAT_TICKS = 24;

/**
 * Red and blue light washing the room's edges while Loss Prevention is in it,
 * so the janitor feels him before seeing him. It builds while he is at the
 * door and holds while he hunts. Null when he is not coming.
 */
export function policeWash(stalker: StalkerState | null, tick: number, flashes: boolean): PoliceWash | null {
  if (stalker === null) return null;
  const strength = stalker.phase === 'arriving'
    ? 0.6 * Math.max(0, Math.min(1, 1 - stalker.phaseTicks / STALKER_ARRIVAL_TICKS))
    : 1;
  return {
    strength,
    leftRed: Math.floor(tick / POLICE_WASH_BEAT_TICKS) % 2 === 0,
    steady: !flashes,
  };
}
