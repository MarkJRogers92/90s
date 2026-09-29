/**
 * A tiny synthesized sound layer: no audio assets, no external requests.
 *
 * Every cue is one or two short oscillator envelopes, with a shared noise
 * buffer for the noisy ones. That choice is deliberate for this project: the
 * repository forbids external runtime assets and must ship no binary payloads
 * before an art pass, but a horror-comedy game with no sound is missing half its
 * register. Oscillators give a full cue set for a few hundred lines and zero
 * download.
 *
 * The engine never throws. Web Audio may be absent (tests, SSR), a context may
 * refuse to start before a user gesture, and a queued voice may fail — none of
 * which may break the game loop, so every path degrades to silence.
 */
import { deriveAudioCues, createAudioSnapshot } from './cues';
import type { AudioCue, AudioSnapshot } from './cues';
import type { MvpRunState } from '../../sim/run/types';
import { MusicPlayer } from './music';
import { musicCue } from './musicState';
import { gameSettings } from '../settings/settings';

type Tone = {
  readonly wave: OscillatorType;
  readonly from: number;
  readonly to: number;
  readonly ms: number;
  readonly gain: number;
  /** Delay before this tone starts, for arpeggios and chimes. */
  readonly atMs?: number;
};

type NoiseLayer = {
  readonly ms: number;
  readonly gain: number;
  /** Low-pass cutoff at the start of the burst. */
  readonly cutoff: number;
  /** Cutoff at the end: a falling sweep turns hiss into a wet splat. */
  readonly cutoffTo?: number;
  readonly atMs?: number;
};

type Recipe = {
  readonly tones: readonly Tone[];
  /** Noise bursts layered under the tones, for whooshes and impacts. */
  readonly noise?: readonly NoiseLayer[];
  /** Minimum ms between two plays of this cue, so cues cannot machine-gun. */
  readonly minGapMs: number;
};

const RECIPES: Record<AudioCue, Recipe> = {
  swing: {
    tones: [{ wave: 'triangle', from: 320, to: 140, ms: 130, gain: 0.16 }],
    noise: [{ ms: 130, gain: 0.12, cutoff: 1800 }],
    minGapMs: 120,
  },
  mannequin: {
    // Stiff plastic joints: a dry creak and a hollow knock.
    tones: [
      { wave: 'square', from: 180, to: 140, ms: 60, gain: 0.07 },
      { wave: 'triangle', from: 90, to: 70, ms: 90, gain: 0.14, atMs: 50 },
    ],
    noise: [{ ms: 120, gain: 0.1, cutoff: 3200, cutoffTo: 1200 }],
    minGapMs: 350,
  },
  pa_voice: {
    // A garbled PA syllable: a nasal, band-limited blip through a bad speaker.
    tones: [
      { wave: 'square', from: 310, to: 250, ms: 55, gain: 0.035 },
      { wave: 'sawtooth', from: 620, to: 540, ms: 45, gain: 0.018 },
    ],
    noise: [{ ms: 50, gain: 0.02, cutoff: 1800, cutoffTo: 900 }],
    minGapMs: 55,
  },
  bench_pick: {
    // A part dropped on the bench: a short metal tick.
    tones: [
      { wave: 'square', from: 1400, to: 900, ms: 35, gain: 0.05 },
      { wave: 'triangle', from: 420, to: 300, ms: 70, gain: 0.07, atMs: 10 },
    ],
    minGapMs: 60,
  },
  fuse: {
    // Void the warranty: an arc-welder crackle, a rising charge, a heavy clamp.
    tones: [
      { wave: 'sawtooth', from: 110, to: 880, ms: 420, gain: 0.08 },
      { wave: 'square', from: 220, to: 1760, ms: 420, gain: 0.04 },
      { wave: 'sine', from: 160, to: 45, ms: 300, gain: 0.4, atMs: 430 },
      { wave: 'sine', from: 880, to: 1320, ms: 380, gain: 0.07, atMs: 470 },
    ],
    noise: [
      { ms: 420, gain: 0.08, cutoff: 6000, cutoffTo: 9000 },
      { ms: 90, gain: 0.3, cutoff: 5000, atMs: 430 },
    ],
    minGapMs: 900,
  },
  paper: {
    // A sheet of paper sliding off a desk: two soft swishes.
    tones: [],
    noise: [
      { ms: 260, gain: 0.12, cutoff: 3500, cutoffTo: 1200 },
      { ms: 220, gain: 0.08, cutoff: 3000, cutoffTo: 900, atMs: 300 },
    ],
    minGapMs: 800,
  },
  dawn: {
    // Morning: a slow, bright major arpeggio on bells over a warm swell.
    tones: [
      { wave: 'sine', from: 523, to: 523, ms: 900, gain: 0.1 },
      { wave: 'sine', from: 659, to: 659, ms: 900, gain: 0.09, atMs: 260 },
      { wave: 'sine', from: 784, to: 784, ms: 900, gain: 0.09, atMs: 520 },
      { wave: 'sine', from: 1047, to: 1047, ms: 1400, gain: 0.08, atMs: 780 },
      { wave: 'triangle', from: 131, to: 131, ms: 2400, gain: 0.08 },
      { wave: 'triangle', from: 196, to: 196, ms: 2400, gain: 0.05, atMs: 200 },
    ],
    minGapMs: 3000,
  },
  stamp: {
    // A rubber stamp slammed onto a desk: a heavy thud and a paper slap.
    tones: [
      { wave: 'sine', from: 140, to: 40, ms: 260, gain: 0.45 },
      { wave: 'square', from: 90, to: 60, ms: 70, gain: 0.12 },
    ],
    noise: [
      { ms: 50, gain: 0.35, cutoff: 7000 },
      { ms: 200, gain: 0.15, cutoff: 1200, cutoffTo: 300, atMs: 20 },
    ],
    minGapMs: 800,
  },
  escalator: {
    // The escalator starting up: a motor hum winding up under the clack of steps.
    tones: [
      { wave: 'sawtooth', from: 42, to: 58, ms: 1800, gain: 0.1 },
      { wave: 'triangle', from: 84, to: 116, ms: 1800, gain: 0.06 },
      ...[0, 300, 600, 900, 1200, 1500].map((atMs) => ({ wave: 'square' as const, from: 260, to: 200, ms: 40, gain: 0.03, atMs })),
    ],
    noise: [{ ms: 1800, gain: 0.05, cutoff: 500, cutoffTo: 900 }],
    minGapMs: 2000,
  },
  static_lock: {
    // A dying TV warming up: a rising, wavering whine over hiss, as long as the lock-on.
    tones: [
      { wave: 'sawtooth', from: 220, to: 880, ms: 540, gain: 0.05 },
      { wave: 'square', from: 227, to: 905, ms: 540, gain: 0.03 },
    ],
    noise: [{ ms: 540, gain: 0.05, cutoff: 5000, cutoffTo: 9000 }],
    minGapMs: 250,
  },
  static_blink: {
    // The channel snaps: a bright zap and a crackle where it lands.
    tones: [
      { wave: 'square', from: 1800, to: 120, ms: 90, gain: 0.12 },
      { wave: 'sawtooth', from: 60, to: 40, ms: 180, gain: 0.14, atMs: 20 },
    ],
    noise: [{ ms: 200, gain: 0.22, cutoff: 9000, cutoffTo: 1500 }],
    minGapMs: 120,
  },
  shopper_charge: {
    // A runaway cart: rattling wheels under a rushing scrape.
    tones: [
      { wave: 'square', from: 95, to: 70, ms: 260, gain: 0.06 },
      { wave: 'square', from: 190, to: 140, ms: 260, gain: 0.03, atMs: 30 },
    ],
    noise: [{ ms: 280, gain: 0.2, cutoff: 700, cutoffTo: 2600 }],
    minGapMs: 200,
  },
  boss_intro: {
    // The security office door slams: a sub boom, a metal clank, a low sting.
    tones: [
      { wave: 'sine', from: 70, to: 24, ms: 700, gain: 0.45 },
      { wave: 'square', from: 420, to: 180, ms: 90, gain: 0.12, atMs: 40 },
      { wave: 'sawtooth', from: 110, to: 104, ms: 900, gain: 0.14, atMs: 250 },
      { wave: 'sawtooth', from: 116, to: 110, ms: 900, gain: 0.12, atMs: 250 },
    ],
    noise: [
      { ms: 60, gain: 0.3, cutoff: 6000 },
      { ms: 500, gain: 0.25, cutoff: 900, cutoffTo: 80 },
    ],
    minGapMs: 1500,
  },
  combo: {
    // A bright three-note climb: the register changes, and so does the payout.
    tones: [
      { wave: 'square', from: 988, to: 988, ms: 70, gain: 0.08 },
      { wave: 'square', from: 1319, to: 1319, ms: 70, gain: 0.08, atMs: 70 },
      { wave: 'triangle', from: 1976, to: 1976, ms: 200, gain: 0.1, atMs: 140 },
    ],
    minGapMs: 200,
  },
  heartbeat: {
    // Lub-dub, low and dull: played by the scene on a timer at the last heart.
    tones: [
      { wave: 'sine', from: 78, to: 48, ms: 120, gain: 0.34 },
      { wave: 'sine', from: 70, to: 44, ms: 140, gain: 0.26, atMs: 170 },
    ],
    minGapMs: 300,
  },
  dash: {
    // A quick rising whoosh with a scuff of sneaker.
    tones: [{ wave: 'triangle', from: 180, to: 520, ms: 150, gain: 0.08 }],
    noise: [
      { ms: 170, gain: 0.16, cutoff: 900, cutoffTo: 4200 },
      { ms: 40, gain: 0.1, cutoff: 2400 },
    ],
    minGapMs: 120,
  },
  shot: {
    tones: [{ wave: 'square', from: 240, to: 170, ms: 70, gain: 0.14 }],
    minGapMs: 45,
  },
  splash: {
    tones: [{ wave: 'sine', from: 700, to: 300, ms: 150, gain: 0.08 }],
    noise: [{ ms: 160, gain: 0.08, cutoff: 900 }],
    minGapMs: 90,
  },
  hit: {
    // A meaty thwack: a falling square for the crack, a sine sub for weight.
    tones: [
      { wave: 'square', from: 190, to: 55, ms: 90, gain: 0.2 },
      { wave: 'sine', from: 120, to: 40, ms: 130, gain: 0.26 },
    ],
    noise: [{ ms: 60, gain: 0.16, cutoff: 3200, cutoffTo: 700 }],
    minGapMs: 45,
  },
  hit_heavy: {
    tones: [
      { wave: 'sawtooth', from: 230, to: 45, ms: 150, gain: 0.22 },
      { wave: 'sine', from: 95, to: 32, ms: 220, gain: 0.32 },
    ],
    noise: [
      { ms: 35, gain: 0.2, cutoff: 7000 },
      { ms: 110, gain: 0.18, cutoff: 2600, cutoffTo: 400 },
    ],
    minGapMs: 45,
  },
  hurt: {
    // Crunch, then a sick falling whine; the scene muffles the mix right after.
    tones: [
      { wave: 'sawtooth', from: 310, to: 90, ms: 300, gain: 0.22 },
      { wave: 'sine', from: 130, to: 38, ms: 240, gain: 0.32 },
    ],
    noise: [{ ms: 180, gain: 0.24, cutoff: 2600, cutoffTo: 300 }],
    minGapMs: 180,
  },
  heal: {
    tones: [
      { wave: 'sine', from: 420, to: 660, ms: 160, gain: 0.16 },
      { wave: 'sine', from: 660, to: 880, ms: 160, gain: 0.12, atMs: 120 },
    ],
    minGapMs: 200,
  },
  purchase: {
    tones: [
      { wave: 'square', from: 880, to: 880, ms: 70, gain: 0.14 },
      { wave: 'square', from: 1320, to: 1320, ms: 190, gain: 0.12, atMs: 70 },
    ],
    minGapMs: 200,
  },
  theft: {
    tones: [{ wave: 'sine', from: 300, to: 540, ms: 150, gain: 0.12 }],
    minGapMs: 200,
  },
  alarm: {
    // A wailing two-tone siren, hi-lo-hi-lo over about a second.
    tones: [
      { wave: 'square', from: 880, to: 880, ms: 250, gain: 0.12 },
      { wave: 'square', from: 640, to: 640, ms: 250, gain: 0.12, atMs: 250 },
      { wave: 'square', from: 880, to: 880, ms: 250, gain: 0.12, atMs: 500 },
      { wave: 'square', from: 640, to: 640, ms: 250, gain: 0.12, atMs: 750 },
    ],
    minGapMs: 1000,
  },
  shutter: {
    // A heavy metal slam and the rattle that follows it down.
    tones: [
      { wave: 'sine', from: 110, to: 34, ms: 500, gain: 0.4 },
      { wave: 'sawtooth', from: 90, to: 50, ms: 260, gain: 0.16 },
    ],
    noise: [
      { ms: 40, gain: 0.24, cutoff: 6000 },
      { ms: 420, gain: 0.26, cutoff: 3200, cutoffTo: 500, atMs: 30 },
    ],
    minGapMs: 500,
  },
  shutterLift: {
    // The grille rattling upward: a rising chatter of noise and a groan.
    tones: [{ wave: 'sawtooth', from: 70, to: 220, ms: 600, gain: 0.1 }],
    noise: [{ ms: 600, gain: 0.24, cutoff: 500, cutoffTo: 4200 }],
    minGapMs: 700,
  },
  wanted: {
    // A short police-ish blip: two quick alternating notes.
    tones: [
      { wave: 'square', from: 1000, to: 1000, ms: 80, gain: 0.11 },
      { wave: 'square', from: 760, to: 760, ms: 110, gain: 0.11, atMs: 90 },
    ],
    minGapMs: 250,
  },
  launder: {
    // A cash-register ding and a clean bell: the money is nice and dry.
    tones: [
      { wave: 'triangle', from: 1568, to: 1568, ms: 90, gain: 0.14 },
      { wave: 'sine', from: 2093, to: 2093, ms: 420, gain: 0.12, atMs: 80 },
    ],
    noise: [{ ms: 30, gain: 0.08, cutoff: 7000 }],
    minGapMs: 300,
  },
  conduction: {
    tones: [
      { wave: 'square', from: 600, to: 900, ms: 45, gain: 0.13 },
      { wave: 'square', from: 900, to: 1200, ms: 45, gain: 0.12, atMs: 45 },
      { wave: 'square', from: 1200, to: 1600, ms: 60, gain: 0.11, atMs: 90 },
    ],
    minGapMs: 150,
  },
  enemy_down: {
    // Splat and thump, then a quick comic two-note sting.
    tones: [
      { wave: 'sine', from: 150, to: 40, ms: 240, gain: 0.3 },
      { wave: 'square', from: 880, to: 880, ms: 70, gain: 0.07, atMs: 90 },
      { wave: 'square', from: 1320, to: 1320, ms: 120, gain: 0.07, atMs: 160 },
    ],
    noise: [{ ms: 240, gain: 0.24, cutoff: 1500, cutoffTo: 180 }],
    minGapMs: 60,
  },
  boss_down: {
    tones: [
      { wave: 'sawtooth', from: 170, to: 30, ms: 950, gain: 0.26 },
      { wave: 'sine', from: 75, to: 24, ms: 1300, gain: 0.36 },
    ],
    noise: [
      { ms: 900, gain: 0.26, cutoff: 1400, cutoffTo: 120 },
      { ms: 60, gain: 0.2, cutoff: 8000 },
    ],
    minGapMs: 1500,
  },
  spit_charge: {
    // A rising, gargling wind-up that lasts as long as the spitter's telegraph.
    tones: [
      { wave: 'sawtooth', from: 85, to: 260, ms: 580, gain: 0.07 },
      { wave: 'square', from: 170, to: 420, ms: 580, gain: 0.035 },
    ],
    noise: [{ ms: 560, gain: 0.045, cutoff: 400, cutoffTo: 1600 }],
    minGapMs: 200,
  },
  spit: {
    tones: [{ wave: 'sine', from: 460, to: 110, ms: 130, gain: 0.15 }],
    noise: [{ ms: 150, gain: 0.2, cutoff: 2400, cutoffTo: 500 }],
    minGapMs: 80,
  },
  slam: {
    // A floor-shaking boom, whether or not it connects.
    tones: [
      { wave: 'sine', from: 95, to: 26, ms: 650, gain: 0.42 },
      { wave: 'sawtooth', from: 70, to: 30, ms: 360, gain: 0.18 },
    ],
    noise: [
      { ms: 40, gain: 0.22, cutoff: 5000 },
      { ms: 520, gain: 0.3, cutoff: 700, cutoffTo: 90 },
    ],
    minGapMs: 300,
  },
  boss_telegraph: {
    // Rises for the whole 36-tick slam wind-up, so the boom lands at its peak.
    tones: [
      { wave: 'sine', from: 260, to: 880, ms: 600, gain: 0.14 },
      { wave: 'triangle', from: 130, to: 440, ms: 600, gain: 0.08 },
    ],
    minGapMs: 250,
  },
  boss_volley: {
    tones: [{ wave: 'square', from: 1200, to: 380, ms: 190, gain: 0.16 }],
    minGapMs: 250,
  },
  boss_phase: {
    tones: [
      { wave: 'sawtooth', from: 120, to: 90, ms: 420, gain: 0.24 },
      { wave: 'sawtooth', from: 90, to: 60, ms: 380, gain: 0.2, atMs: 180 },
    ],
    minGapMs: 600,
  },
  checkpoint: {
    tones: [
      { wave: 'sine', from: 660, to: 660, ms: 90, gain: 0.12 },
      { wave: 'sine', from: 990, to: 990, ms: 150, gain: 0.1, atMs: 90 },
    ],
    minGapMs: 400,
  },
  room_clear: {
    tones: [
      { wave: 'triangle', from: 520, to: 520, ms: 110, gain: 0.14 },
      { wave: 'triangle', from: 660, to: 660, ms: 110, gain: 0.13, atMs: 100 },
      { wave: 'triangle', from: 784, to: 784, ms: 200, gain: 0.12, atMs: 200 },
    ],
    minGapMs: 400,
  },
  pa_chime: {
    tones: [
      { wave: 'sine', from: 1046, to: 1046, ms: 240, gain: 0.09 },
      { wave: 'sine', from: 784, to: 784, ms: 420, gain: 0.08, atMs: 240 },
    ],
    minGapMs: 800,
  },
  won: {
    tones: [
      { wave: 'triangle', from: 523, to: 523, ms: 130, gain: 0.18 },
      { wave: 'triangle', from: 659, to: 659, ms: 130, gain: 0.17, atMs: 130 },
      { wave: 'triangle', from: 784, to: 784, ms: 130, gain: 0.16, atMs: 260 },
      { wave: 'triangle', from: 1046, to: 1046, ms: 420, gain: 0.15, atMs: 390 },
    ],
    minGapMs: 2000,
  },
  died: {
    tones: [
      { wave: 'sawtooth', from: 400, to: 320, ms: 220, gain: 0.2 },
      { wave: 'sawtooth', from: 300, to: 220, ms: 260, gain: 0.2, atMs: 200 },
      { wave: 'sawtooth', from: 200, to: 120, ms: 520, gain: 0.2, atMs: 440 },
    ],
    minGapMs: 2000,
  },
};

const OPEN_CUTOFF = 18000;
const MUFFLED_CUTOFF = 650;

/** The most voices one frame may start, so a big tick cannot clip the master. */
const MAX_VOICES_PER_FRAME = 6;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidate =
    (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  return candidate ?? null;
}

export class GameAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Always in the chain, wide open; `muffle` closes it for a moment. */
  private tone: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  /** Sound effects run through their own bus so they have their own volume. */
  private sfxBus: GainNode | null = null;
  private appliedVolumes = '';
  private musicOn = true;
  private muted = false;
  private playedCount = 0;
  private readonly lastPlayedAt = new Map<AudioCue, number>();
  private snapshot: AudioSnapshot | null = null;

  /** True once an AudioContext exists at all, for tests and diagnostics. */
  public get created(): boolean {
    return this.context !== null;
  }

  /**
   * How many cues have actually been scheduled as voices.
   *
   * A created context only proves the sound layer exists. This counter proves
   * the engine acted on a cue, which is the difference between "audio did not
   * crash" and "audio did something".
   */
  public get played(): number {
    return this.playedCount;
  }

  /** True once a context exists and is running, for tests and diagnostics. */
  public get running(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  public get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Creates or resumes the context. Browsers start it suspended and only allow
   * a resume from a user gesture, so the scene calls this from real input.
   */
  public resume(): void {
    if (this.context === null) {
      const Ctor = audioContextCtor();
      if (Ctor === null) {
        return;
      }
      try {
        const context = new Ctor();
        const master = context.createGain();
        master.gain.value = this.muted ? 0 : 0.85;
        const tone = context.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = OPEN_CUTOFF;
        master.connect(tone);
        tone.connect(context.destination);
        this.context = context;
        this.master = master;
        this.tone = tone;
        this.noiseBuffer = createNoiseBuffer(context);
        this.sfxBus = context.createGain();
        this.sfxBus.connect(master);
        this.music = new MusicPlayer(context, master, this.noiseBuffer);
      } catch {
        this.context = null;
        this.master = null;
        return;
      }
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.context !== null) {
      this.master.gain.setValueAtTime(muted ? 0 : 0.85, this.context.currentTime);
    }
  }

  /**
   * Muffles the whole mix for about `ms`, like the janitor's ears ringing.
   * The hurt crunch itself plays clean first; the mix closes just after it
   * and opens back up as the hit stop ends.
   */
  public muffle(ms: number): void {
    const context = this.context;
    const tone = this.tone;
    if (context === null || tone === null) {
      return;
    }
    try {
      const now = context.currentTime;
      tone.frequency.cancelScheduledValues(now);
      tone.frequency.setValueAtTime(OPEN_CUTOFF, now);
      tone.frequency.setValueAtTime(OPEN_CUTOFF, now + 0.06);
      tone.frequency.exponentialRampToValueAtTime(MUFFLED_CUTOFF, now + 0.09);
      tone.frequency.setValueAtTime(MUFFLED_CUTOFF, now + 0.09 + ms / 1000);
      tone.frequency.exponentialRampToValueAtTime(OPEN_CUTOFF, now + 0.09 + ms / 1000 + 0.35);
    } catch {
      // Silence on failure, never a broken frame.
    }
  }

  public get musicEnabled(): boolean {
    return this.musicOn;
  }

  /** Music on/off on its own, leaving the sound effects alone. */
  public toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Plays every cue this tick produced, up to the per-frame voice cap.
   *
   * The first call establishes the baseline and is intentionally silent:
   * without a previous snapshot, every field would look like a change and a run
   * would open with a burst of noise.
   */
  /** Applies the player's music and effects volumes when they change. */
  private applyVolumes(): void {
    const { musicVolume, sfxVolume } = gameSettings().get();
    const key = `${musicVolume}:${sfxVolume}`;
    if (key === this.appliedVolumes || this.context === null) return;
    this.appliedVolumes = key;
    this.sfxBus?.gain.setTargetAtTime(sfxVolume, this.context.currentTime, 0.03);
    this.music?.setVolume(musicVolume);
  }

  public syncTo(state: MvpRunState): void {
    this.applyVolumes();
    if (this.music !== null && this.context?.state === 'running') {
      try {
        this.music.update(musicCue(state), this.musicOn);
      } catch {
        // Music is decoration; a failed booking is silence, never a broken frame.
      }
    }
    if (this.snapshot === null) {
      this.snapshot = createAudioSnapshot(state);
      return;
    }
    const previous = this.snapshot;
    this.snapshot = createAudioSnapshot(state);
    for (const cue of deriveAudioCues(previous, state).slice(0, MAX_VOICES_PER_FRAME)) {
      this.play(cue);
    }
  }

  /** Forgets the tick baseline, so the next sync starts silent again. */
  public resetBaseline(): void {
    this.snapshot = null;
  }

  public play(cue: AudioCue): void {
    const context = this.context;
    const master = this.master;
    if (context === null || master === null || context.state !== 'running') {
      return;
    }
    const recipe = RECIPES[cue];
    const now = context.currentTime;
    const out = this.sfxBus ?? master;
    const last = this.lastPlayedAt.get(cue);
    if (last !== undefined && now - last < recipe.minGapMs / 1000) {
      return;
    }
    this.lastPlayedAt.set(cue, now);

    try {
      for (const layer of recipe.noise ?? []) {
        this.playNoise(context, out, now, layer);
      }
      for (const tone of recipe.tones) {
        this.playTone(context, out, now, tone);
      }
      this.playedCount += 1;
    } catch {
      // A failed voice is silence, never a broken frame, and it must not count
      // as a cue that played.
    }
  }

  private playTone(
    context: AudioContext,
    master: GainNode,
    now: number,
    tone: Tone,
  ): void {
    const start = now + (tone.atMs ?? 0) / 1000;
    const duration = tone.ms / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.from, start);
    if (tone.to !== tone.from) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), start + duration);
    }
    // A short attack then an exponential tail reads as an impact rather than a beep.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + Math.min(0.012, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private playNoise(context: AudioContext, master: GainNode, now: number, noise: NoiseLayer): void {
    if (this.noiseBuffer === null) {
      return;
    }
    const start = now + (noise.atMs ?? 0) / 1000;
    const duration = noise.ms / 1000;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(noise.cutoff, start);
    if (noise.cutoffTo !== undefined && noise.cutoffTo !== noise.cutoff) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, noise.cutoffTo), start + duration);
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(noise.gain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration);
  }

  public destroy(): void {
    this.lastPlayedAt.clear();
    this.snapshot = null;
    const context = this.context;
    this.context = null;
    this.music?.stop();
    this.music = null;
    this.sfxBus = null;
    this.appliedVolumes = '';
    this.master = null;
    this.tone = null;
    this.noiseBuffer = null;
    if (context !== null) {
      void context.close().catch(() => undefined);
    }
  }
}

/** One second of white noise, generated locally so nothing is downloaded. */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const frames = Math.max(1, Math.floor(context.sampleRate));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  // A small deterministic LCG keeps the noise identical run to run, which keeps
  // this module free of any dependence on Math.random.
  let state = 0x9e3779b9;
  for (let index = 0; index < frames; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    channel[index] = (state / 0xffffffff) * 2 - 1;
  }
  return buffer;
}
