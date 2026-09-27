/**
 * The DEAD MALL soundtrack, synthesized: no files, no downloads.
 *
 * Three looping tracks are written as data (sixteenth-note steps, MIDI notes)
 * and played by a small look-ahead scheduler: every frame it books the notes
 * that start in the next quarter second on the Web Audio clock, which keeps
 * timing tight even when frames stutter. Tracks crossfade on their own gain
 * nodes, so combat music swells in over the muzak instead of cutting.
 *
 *   muzak  — detuned electric-piano mall music with tape wobble (safe rooms)
 *   combat — four-on-the-floor synthwave with an arpeggio (fights)
 *   boss   — broken-beat D minor with alarm stabs (Loss Prevention)
 */
import type { MusicCue, MusicTrackId } from './musicState';

export type MusicNote = {
  readonly step: number;
  readonly midi?: number;
  readonly chord?: readonly number[];
  /** Length in sixteenth steps. */
  readonly len?: number;
  readonly vel?: number;
};

export type MusicVoiceKind = 'epiano' | 'bass' | 'lead' | 'pad' | 'kick' | 'snare' | 'hat';

export type MusicVoice = { readonly kind: MusicVoiceKind; readonly notes: readonly MusicNote[] };

export type MusicTrack = {
  readonly bpm: number;
  readonly bars: number;
  readonly gain: number;
  readonly voices: readonly MusicVoice[];
};

const STEPS_PER_BAR = 16;

/** Hits on the steps marked `x` (loud) or `o` (soft) in a 16-char bar, repeated over `bars`. */
function drums(pattern: string, bars: number, vel = 1): MusicNote[] {
  const notes: MusicNote[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (let i = 0; i < STEPS_PER_BAR; i += 1) {
      const c = pattern[i];
      if (c === 'x' || c === 'o') notes.push({ step: bar * STEPS_PER_BAR + i, vel: (c === 'x' ? 1 : 0.45) * vel });
    }
  }
  return notes;
}

/** One chord per bar, held. */
function chords(progression: ReadonlyArray<readonly number[]>, len = 15, vel = 0.7): MusicNote[] {
  return progression.map((chord, bar) => ({ step: bar * STEPS_PER_BAR, chord, len, vel }));
}

/** A bass line: `pattern` offsets (in semitones from each bar's root, `.` rests) per sixteenth. */
function bassLine(roots: readonly number[], pattern: readonly (number | null)[], len = 1, vel = 0.8): MusicNote[] {
  const notes: MusicNote[] = [];
  roots.forEach((root, bar) => {
    pattern.forEach((offset, i) => {
      if (offset !== null) notes.push({ step: bar * STEPS_PER_BAR + i, midi: root + offset, len, vel });
    });
  });
  return notes;
}

/** Sixteenth arpeggio cycling through each bar's chord tones. */
function arpeggio(progression: ReadonlyArray<readonly number[]>, every = 1, vel = 0.5): MusicNote[] {
  const notes: MusicNote[] = [];
  progression.forEach((chord, bar) => {
    for (let i = 0; i < STEPS_PER_BAR; i += every) {
      const tone = chord[(i / every) % chord.length]!;
      notes.push({ step: bar * STEPS_PER_BAR + i, midi: tone + (Math.floor(i / 8) % 2) * 12, len: every, vel });
    }
  });
  return notes;
}

// C major 7 – A minor 7 – F major 7 – G7, voiced around middle C.
const MUZAK_CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]] as const;
// A minor – F – C – G.
const COMBAT_CHORDS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] as const;
// D minor – D minor – B flat – A.
const BOSS_CHORDS = [[62, 65, 69], [62, 65, 69], [58, 62, 65], [57, 61, 64]] as const;

export const TRACKS: Readonly<Record<MusicTrackId, MusicTrack>> = {
  muzak: {
    bpm: 84,
    bars: 4,
    // Measured quieter than the other loops (offline RMS 0.014 vs 0.04), so
    // it gets a higher bus gain to sit at a similar background level.
    gain: 0.95,
    voices: [
      { kind: 'epiano', notes: chords(MUZAK_CHORDS, 14, 0.5) },
      {
        kind: 'lead',
        // A lazy, slightly-wrong mall melody.
        notes: [
          { step: 0, midi: 76, len: 6, vel: 0.35 }, { step: 6, midi: 74, len: 2, vel: 0.3 }, { step: 8, midi: 72, len: 8, vel: 0.35 },
          { step: 16, midi: 72, len: 6, vel: 0.35 }, { step: 22, midi: 71, len: 2, vel: 0.3 }, { step: 24, midi: 69, len: 8, vel: 0.35 },
          { step: 32, midi: 69, len: 4, vel: 0.35 }, { step: 36, midi: 72, len: 4, vel: 0.3 }, { step: 40, midi: 76, len: 8, vel: 0.35 },
          { step: 48, midi: 74, len: 6, vel: 0.35 }, { step: 54, midi: 71, len: 2, vel: 0.3 }, { step: 56, midi: 67, len: 8, vel: 0.3 },
        ],
      },
      { kind: 'bass', notes: bassLine([36, 33, 29, 31], [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, 12, null], 4, 0.55) },
      { kind: 'hat', notes: drums('..o...o...o...o.', 4, 0.5) },
    ],
  },
  combat: {
    bpm: 128,
    bars: 4,
    gain: 0.42,
    voices: [
      { kind: 'kick', notes: drums('x...x...x...x...', 4) },
      { kind: 'snare', notes: drums('....x.......x...', 4, 0.8) },
      { kind: 'hat', notes: drums('o.x.o.x.o.x.o.xo', 4, 0.7) },
      { kind: 'bass', notes: bassLine([33, 29, 36, 31], [0, null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 0, null, 7, 12], 1, 0.75) },
      { kind: 'lead', notes: arpeggio(COMBAT_CHORDS, 1, 0.28) },
      { kind: 'pad', notes: chords(COMBAT_CHORDS, 16, 0.35) },
    ],
  },
  boss: {
    bpm: 140,
    bars: 4,
    gain: 0.45,
    voices: [
      { kind: 'kick', notes: drums('x..x..x.x..x..x.', 4) },
      { kind: 'snare', notes: drums('....x.......x..o', 4, 0.9) },
      { kind: 'hat', notes: drums('xoxoxoxoxoxoxoxo', 4, 0.5) },
      { kind: 'bass', notes: bassLine([38, 38, 34, 33], [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 3, 12, 0], 1, 0.7) },
      {
        kind: 'lead',
        // Alarm stabs, and a siren wail on the last bar.
        notes: [
          ...[0, 16, 32].flatMap((bar) => [
            { step: bar, midi: 74, len: 2, vel: 0.4 }, { step: bar + 6, midi: 74, len: 2, vel: 0.35 }, { step: bar + 12, midi: 77, len: 3, vel: 0.4 },
          ]),
          { step: 48, midi: 81, len: 8, vel: 0.4 }, { step: 56, midi: 80, len: 8, vel: 0.4 },
        ],
      },
      { kind: 'pad', notes: chords(BOSS_CHORDS, 16, 0.3) },
    ],
  },
};

/** Pure: the loop steps whose start time falls in [from, to). */
export function stepTimes(origin: number, bpm: number, loopSteps: number, from: number, to: number): Array<{ step: number; time: number }> {
  const dur = 60 / bpm / 4;
  const first = Math.max(0, Math.ceil((from - origin) / dur - 1e-9));
  const out: Array<{ step: number; time: number }> = [];
  for (let n = first; origin + n * dur < to; n += 1) out.push({ step: n % loopSteps, time: origin + n * dur });
  return out;
}

const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

type Playing = { gain: GainNode; origin: number; tempoScale: number; bookedUntil: number; active: boolean };

const LOOKAHEAD = 0.25;

export class MusicPlayer {
  private readonly context: AudioContext;
  private readonly bus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly playing = new Map<MusicTrackId, Playing>();
  private readonly byStep = new Map<MusicTrackId, Map<number, Array<{ kind: MusicVoiceKind; note: MusicNote }>>>();

  public constructor(context: AudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.context = context;
    this.noise = noise;
    this.bus = context.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(destination);
    for (const [id, track] of Object.entries(TRACKS) as Array<[MusicTrackId, MusicTrack]>) {
      const index = new Map<number, Array<{ kind: MusicVoiceKind; note: MusicNote }>>();
      for (const voice of track.voices) {
        for (const note of voice.notes) {
          const list = index.get(note.step) ?? [];
          list.push({ kind: voice.kind, note });
          index.set(note.step, list);
        }
      }
      this.byStep.set(id, index);
    }
  }

  /** Crossfades toward the cue's track and books the next quarter second of notes. */
  public update(cue: MusicCue, enabled: boolean, lookahead = LOOKAHEAD): void {
    const now = this.context.currentTime;
    for (const id of Object.keys(TRACKS) as MusicTrackId[]) {
      const track = TRACKS[id];
      const wanted = enabled && cue.track === id;
      let playing = this.playing.get(id);
      if (wanted && (!playing || !playing.active)) {
        // A track starting from silence starts at its top, on the next beat.
        const gain = playing?.gain ?? this.context.createGain();
        if (!playing) {
          gain.gain.value = 0;
          gain.connect(this.bus);
        }
        playing = { gain, origin: now + 0.05, tempoScale: cue.tempoScale, bookedUntil: now + 0.05, active: true };
        this.playing.set(id, playing);
      }
      if (!playing) continue;
      if (wanted && playing.tempoScale !== cue.tempoScale) {
        // Keep the groove's position when the boss speeds up.
        const oldDur = 60 / (track.bpm * playing.tempoScale) / 4;
        const newDur = 60 / (track.bpm * cue.tempoScale) / 4;
        const position = (playing.bookedUntil - playing.origin) / oldDur;
        playing.origin = playing.bookedUntil - position * newDur;
        playing.tempoScale = cue.tempoScale;
      }
      const target = wanted ? track.gain * cue.volume : 0;
      playing.gain.gain.setTargetAtTime(target, now, wanted ? 0.35 : 0.5);
      if (!wanted && playing.gain.gain.value < 0.004) {
        playing.active = false;
        continue;
      }
      if (!playing.active) continue;
      const until = now + lookahead;
      const from = Math.max(playing.bookedUntil, now);
      const stepDur = 60 / (track.bpm * playing.tempoScale) / 4;
      for (const { step, time } of stepTimes(playing.origin, track.bpm * playing.tempoScale, track.bars * STEPS_PER_BAR, from, until)) {
        for (const { kind, note } of this.byStep.get(id)?.get(step) ?? []) this.voice(kind, note, time, stepDur, playing.gain);
      }
      playing.bookedUntil = until;
    }
  }

  private voice(kind: MusicVoiceKind, note: MusicNote, time: number, stepDur: number, out: GainNode): void {
    const vel = note.vel ?? 1;
    const length = (note.len ?? 1) * stepDur;
    const ctx = this.context;
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
      g.gain.setValueAtTime(0.9 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      osc.connect(g).connect(out);
      osc.start(time);
      osc.stop(time + 0.25);
      return;
    }
    if (kind === 'snare' || kind === 'hat') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
      filter.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      const dur = kind === 'hat' ? 0.04 : 0.16;
      g.gain.setValueAtTime((kind === 'hat' ? 0.16 : 0.42) * vel, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(filter).connect(g).connect(out);
      // Different slices of the noise buffer keep hits from sounding identical.
      src.start(time, (note.step * 0.037) % 0.9, dur + 0.02);
      return;
    }
    const pitches = note.chord ?? (note.midi !== undefined ? [note.midi] : []);
    for (const midi of pitches) {
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const peak = (kind === 'bass' ? 0.32 : kind === 'pad' ? 0.07 : kind === 'epiano' ? 0.09 : 0.1) * vel;
      const attack = kind === 'pad' ? 0.25 : 0.008;
      const release = kind === 'epiano' ? length * 0.9 : length * 0.85;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.02, release));
      filter.frequency.value = kind === 'bass' ? 700 : kind === 'lead' ? 2600 : kind === 'pad' ? 1400 : 3200;
      const waves: OscillatorType[] = kind === 'bass' ? ['sawtooth'] : kind === 'lead' ? ['square'] : kind === 'pad' ? ['sawtooth', 'sawtooth'] : ['triangle', 'sine'];
      waves.forEach((wave, index) => {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.setValueAtTime(midiHz(midi), time);
        // Pads are detuned pairs; the muzak piano gets a slow tape wobble.
        osc.detune.value = kind === 'pad' ? (index === 0 ? -9 : 9) : kind === 'epiano' ? (index === 0 ? -6 : 5) : 0;
        if (kind === 'epiano' || (kind === 'lead' && note.len !== undefined && note.len >= 4)) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = kind === 'epiano' ? 0.7 : 5;
          depth.gain.value = kind === 'epiano' ? 7 : 9;
          lfo.connect(depth).connect(osc.detune);
          lfo.start(time);
          lfo.stop(time + release + 0.05);
        }
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + release + 0.05);
      });
      filter.connect(g).connect(out);
    }
  }

  public stop(): void {
    const now = this.context.currentTime;
    for (const playing of this.playing.values()) {
      playing.gain.gain.cancelScheduledValues(now);
      playing.gain.gain.setValueAtTime(0, now);
      playing.active = false;
    }
  }
}
