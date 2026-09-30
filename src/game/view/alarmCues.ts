/**
 * How the store alarm reads on screen, derived from the sim's alarm state.
 *
 * Pure: the view draws the beacons, the countdown over the door and the
 * shutter from this and nothing else. The shutter creeps down over the
 * countdown so the door visibly closes on a slow janitor; the sim only makes
 * it solid when the countdown ends.
 */
import type { StoreAlarm } from '../../sim/run/heist';

export type AlarmCue = {
  readonly phase: 'none' | 'ringing' | 'locked' | 'lifted';
  /** 0 open to 1 fully down. */
  readonly shutterDrop: number;
  /** Text over the door: whole seconds left, LOCKED IN, or nothing. */
  readonly countdown: string | null;
  /** Beacon on/off, alternating every 10 ticks. */
  readonly flash: boolean;
};

const NONE: AlarmCue = { phase: 'none', shutterDrop: 0, countdown: null, flash: false };

export function alarmCue(alarm: StoreAlarm | null, totalTicks: number, tick: number, steady = false): AlarmCue {
  if (alarm === null) return NONE;
  // Reduced flashes hold the beacon lit instead of alternating.
  const flash = steady || Math.floor(tick / 10) % 2 === 0;
  if (alarm.shutter === 'closed') return { phase: 'locked', shutterDrop: 1, countdown: 'LOCKED IN', flash };
  if (alarm.shutter === 'lifted') return { phase: 'lifted', shutterDrop: 0, countdown: null, flash: false };
  const elapsed = 1 - alarm.ticksLeft / Math.max(1, totalTicks);
  return {
    phase: 'ringing',
    // Eased so the door reads open early and is visibly closing by the last second.
    shutterDrop: Math.max(0, Math.min(0.95, Math.pow(Math.max(0, elapsed), 1.3))),
    countdown: String(Math.max(1, Math.ceil(alarm.ticksLeft / 60))),
    flash,
  };
}
