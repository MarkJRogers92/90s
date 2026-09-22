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

type Tone = {
  readonly wave: OscillatorType;
  readonly from: number;
  readonly to: number;
  readonly ms: number;
  readonly gain: number;
  /** Delay before this tone starts, for arpeggios and chimes. */
  readonly atMs?: number;
};

type Recipe = {
  readonly tones: readonly Tone[];
  /** Optional noise burst layered under the tones, for whooshes and impacts. */
  readonly noise?: { readonly ms: number; readonly gain: number; readonly cutoff: number };
  /** Minimum ms between two plays of this cue, so cues cannot machine-gun. */
  readonly minGapMs: number;
};

const RECIPES: Record<AudioCue, Recipe> = {
  swing: {
    tones: [{ wave: 'triangle', from: 320, to: 140, ms: 130, gain: 0.16 }],
    noise: { ms: 130, gain: 0.12, cutoff: 1800 },
    minGapMs: 120,
  },
  shot: {
    tones: [{ wave: 'square', from: 240, to: 170, ms: 70, gain: 0.14 }],
    minGapMs: 45,
  },
  splash: {
    tones: [{ wave: 'sine', from: 700, to: 300, ms: 150, gain: 0.08 }],
    noise: { ms: 160, gain: 0.08, cutoff: 900 },
    minGapMs: 90,
  },
  hit: {
    tones: [{ wave: 'square', from: 170, to: 60, ms: 95, gain: 0.2 }],
    noise: { ms: 70, gain: 0.1, cutoff: 1200 },
    minGapMs: 45,
  },
  hurt: {
    tones: [{ wave: 'sawtooth', from: 310, to: 90, ms: 280, gain: 0.24 }],
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
  secured: {
    tones: [
      { wave: 'triangle', from: 660, to: 660, ms: 90, gain: 0.14 },
      { wave: 'triangle', from: 990, to: 990, ms: 220, gain: 0.13, atMs: 80 },
    ],
    minGapMs: 300,
  },
  fusion: {
    tones: [
      { wave: 'sawtooth', from: 180, to: 720, ms: 220, gain: 0.1 },
      { wave: 'square', from: 720, to: 1440, ms: 160, gain: 0.1, atMs: 200 },
    ],
    noise: { ms: 200, gain: 0.07, cutoff: 2400 },
    minGapMs: 400,
  },
  confiscation: {
    tones: [
      { wave: 'sawtooth', from: 200, to: 70, ms: 400, gain: 0.26 },
      { wave: 'square', from: 140, to: 60, ms: 300, gain: 0.14, atMs: 60 },
    ],
    noise: { ms: 260, gain: 0.12, cutoff: 700 },
    minGapMs: 400,
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
    tones: [{ wave: 'square', from: 300, to: 110, ms: 170, gain: 0.16 }],
    minGapMs: 60,
  },
  boss_telegraph: {
    tones: [{ wave: 'sine', from: 500, to: 780, ms: 300, gain: 0.16 }],
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
  private noiseBuffer: AudioBuffer | null = null;
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
        master.connect(context.destination);
        this.context = context;
        this.master = master;
        this.noiseBuffer = createNoiseBuffer(context);
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
  public syncTo(state: MvpRunState): void {
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
    const last = this.lastPlayedAt.get(cue);
    if (last !== undefined && now - last < recipe.minGapMs / 1000) {
      return;
    }
    this.lastPlayedAt.set(cue, now);

    try {
      if (recipe.noise) {
        this.playNoise(context, master, now, recipe.noise);
      }
      for (const tone of recipe.tones) {
        this.playTone(context, master, now, tone);
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

  private playNoise(
    context: AudioContext,
    master: GainNode,
    now: number,
    noise: { readonly ms: number; readonly gain: number; readonly cutoff: number },
  ): void {
    if (this.noiseBuffer === null) {
      return;
    }
    const duration = noise.ms / 1000;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = noise.cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(noise.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  public destroy(): void {
    this.lastPlayedAt.clear();
    this.snapshot = null;
    const context = this.context;
    this.context = null;
    this.master = null;
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
