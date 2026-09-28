/**
 * The DEAD MALL soundtrack, synthesized: no files, no downloads.
 *
 * Four sixteen-bar tracks and a tension layer, written as data (sixteenth
 * steps, MIDI notes) and played by a look-ahead scheduler that books the next
 * quarter second of notes on the Web Audio clock, so timing stays tight when
 * frames stutter. Tracks crossfade on their own gains.
 *
 *   muzak     "Attention Shoppers" — swung vibraphone-and-Rhodes mall jazz
 *   combat    "Food Court Frenzy"  — A-minor darksynth that builds in layers
 *   boss      "Loss Prevention"    — D-minor drive bass, alarms and choir
 *   blackout  "Lights Out"         — heartbeat, drone and distant bells
 *   tension   (layer)              — tremolo strings while a mannequin moves
 *
 * Every voice has a `minIntensity`: the game's 0..1 intensity decides how
 * many layers play, so a room with one Hanger is a groove and a full room at
 * your last heart is the whole band. A shared reverb (generated impulse), a
 * tempo-synced echo, kick-driven sidechain ducking and a limiter give it the
 * 80s sheen.
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

export type MusicVoiceKind =
  | 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'crash' | 'tom'
  | 'bass' | 'drivebass' | 'sub' | 'pad' | 'choir' | 'supersaw' | 'lead'
  | 'pluck' | 'bell' | 'epiano' | 'drone' | 'strings';

export type MusicVoice = {
  readonly kind: MusicVoiceKind;
  readonly notes: readonly MusicNote[];
  /** The voice plays only when the game's intensity reaches this. */
  readonly minIntensity?: number;
  /** Reverb and echo send levels, 0..1. */
  readonly reverb?: number;
  readonly echo?: number;
  /** Ducks under the kick (sidechain pump). */
  readonly duck?: boolean;
};

export type MusicTrack = {
  readonly bpm: number;
  readonly bars: number;
  readonly gain: number;
  /** Delays every odd sixteenth by this fraction of a step (shuffle). */
  readonly swing?: number;
  readonly voices: readonly MusicVoice[];
};

type LayerId = MusicTrackId | 'tension';

const STEPS_PER_BAR = 16;

/* ------------------------------------------------------------------------ */
/* Pattern builders                                                          */
/* ------------------------------------------------------------------------ */

/** Hits on `x` (loud) / `o` (soft) in a 16-char bar, on the listed bars. */
function drums(pattern: string, bars: readonly number[], vel = 1): MusicNote[] {
  const notes: MusicNote[] = [];
  for (const bar of bars) {
    for (let i = 0; i < STEPS_PER_BAR; i += 1) {
      const c = pattern[i];
      if (c === 'x' || c === 'o') notes.push({ step: bar * STEPS_PER_BAR + i, vel: (c === 'x' ? 1 : 0.45) * vel });
    }
  }
  return notes;
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, i) => from + i);

/** Chords from a per-bar progression, struck on the given steps of each bar. */
function chordsPerBar(progression: ReadonlyArray<readonly number[]>, len = 16, vel = 0.7, steps: readonly number[] = [0]): MusicNote[] {
  return progression.flatMap((chord, bar) => steps.map((step, i) => ({
    step: bar * STEPS_PER_BAR + step,
    chord,
    len: i + 1 < steps.length ? steps[i + 1]! - step : len - step,
    vel,
  })));
}

/** A bass line: offsets from each bar's root on sixteenths (null rests). */
function bassLine(roots: readonly number[], pattern: readonly (number | null)[], len = 1, vel = 0.8): MusicNote[] {
  return roots.flatMap((root, bar) => pattern.flatMap((offset, i) => (offset === null ? [] : [{ step: bar * STEPS_PER_BAR + i, midi: root + offset, len, vel }])));
}

/** Sixteenth arpeggio up the chord and its octave. */
function arpeggio(progression: ReadonlyArray<readonly number[]>, vel = 0.5, bars: readonly number[] = range(0, progression.length)): MusicNote[] {
  const notes: MusicNote[] = [];
  for (const bar of bars) {
    const chord = progression[bar]!;
    const tones = [...chord, ...chord.map((n) => n + 12)];
    for (let i = 0; i < STEPS_PER_BAR; i += 1) notes.push({ step: bar * STEPS_PER_BAR + i, midi: tones[i % tones.length]!, len: 1, vel: vel * (i % 4 === 0 ? 1 : 0.7) });
  }
  return notes;
}

/** A melody written as [bar, step, midi, len] tuples. */
function melody(tuples: ReadonlyArray<readonly [number, number, number, number]>, vel = 0.6): MusicNote[] {
  return tuples.map(([bar, step, midi, len]) => ({ step: bar * STEPS_PER_BAR + step, midi, len, vel }));
}

/** A walking bass: root, third, fifth, then a chromatic approach to the next bar. */
function walkingBass(roots: readonly number[], thirds: readonly number[], vel = 0.7): MusicNote[] {
  return roots.flatMap((root, bar) => {
    const next = roots[(bar + 1) % roots.length]!;
    const approach = next > root ? next - 1 : next + 1;
    return [root, root + thirds[bar]!, root + 7, approach].map((midi, beat) => ({ step: bar * STEPS_PER_BAR + beat * 4, midi, len: 4, vel }));
  });
}

/* ------------------------------------------------------------------------ */
/* Harmony                                                                   */
/* ------------------------------------------------------------------------ */

// Muzak: C major jazz changes, 16 bars.
const Cmaj7 = [60, 64, 67, 71], Am7 = [57, 60, 64, 67], Dm7 = [57, 60, 62, 65], G7 = [55, 59, 62, 65];
const Fmaj7 = [53, 57, 60, 64], Fm6 = [53, 56, 60, 62], Em7 = [55, 59, 62, 64], A7 = [55, 57, 61, 64];
const MUZAK_CHANGES = [Cmaj7, Am7, Dm7, G7, Cmaj7, Am7, Dm7, G7, Fmaj7, Fm6, Em7, A7, Dm7, G7, Cmaj7, G7];
const MUZAK_ROOTS = [36, 33, 38, 31, 36, 33, 38, 31, 29, 29, 28, 33, 38, 31, 36, 31];
const MUZAK_THIRDS = [4, 3, 3, 4, 4, 3, 3, 4, 4, 3, 3, 4, 3, 4, 4, 4];

// Combat: A minor, i–VI–III–VII then i–VI–iv–V.
const Am = [57, 60, 64], F = [53, 57, 60], C = [55, 60, 64], G = [55, 59, 62], Dm = [57, 62, 65], E = [56, 59, 64];
const COMBAT_CHANGES = [Am, Am, F, F, C, C, G, G, Am, Am, F, F, Dm, Dm, E, E];
const COMBAT_ROOTS = [33, 33, 29, 29, 36, 36, 31, 31, 33, 33, 29, 29, 38, 38, 28, 28];

// Boss: D minor with the Phrygian E flat.
const BDm = [62, 65, 69], BEb = [63, 67, 70], BBb = [58, 62, 65], BA = [57, 61, 64], BGm = [55, 58, 62];
const BOSS_CHANGES = [BDm, BDm, BEb, BEb, BDm, BDm, BBb, BA, BDm, BDm, BEb, BEb, BGm, BGm, BA, BA];
const BOSS_ROOTS = [26, 26, 27, 27, 26, 26, 34, 33, 26, 26, 27, 27, 31, 31, 33, 33];

// Lights Out: E minor, slow and hollow.
const Em = [52, 55, 59], Cm7 = [48, 52, 55, 59], Ams = [45, 52, 57], B7 = [47, 51, 54, 57];
const DARK_CHANGES = [Em, Em, Em, Em, Cm7, Cm7, Cm7, Cm7, Ams, Ams, Ams, Ams, B7, B7, B7, B7];

const ALL16 = range(0, 16);

export const TRACKS: Readonly<Record<LayerId, MusicTrack>> = {
  /* "Attention Shoppers" ------------------------------------------------- */
  muzak: {
    bpm: 92,
    bars: 16,
    gain: 0.62,
    swing: 0.22,
    voices: [
      { kind: 'epiano', notes: chordsPerBar(MUZAK_CHANGES, 16, 0.5, [0, 6]), reverb: 0.3 },
      { kind: 'sub', notes: walkingBass(MUZAK_ROOTS, MUZAK_THIRDS, 0.55) },
      {
        kind: 'bell',
        reverb: 0.45,
        echo: 0.25,
        notes: melody([
          [0, 0, 76, 4], [0, 4, 79, 2], [0, 6, 81, 2], [0, 8, 79, 8],
          [1, 0, 76, 4], [1, 4, 72, 4], [1, 8, 74, 8],
          [2, 0, 77, 4], [2, 4, 76, 2], [2, 6, 74, 2], [2, 8, 72, 4], [2, 12, 69, 4],
          [3, 0, 71, 8], [3, 8, 74, 4], [3, 12, 77, 4],
          [4, 0, 76, 6], [4, 6, 79, 2], [4, 8, 84, 8],
          [5, 0, 83, 4], [5, 4, 81, 4], [5, 8, 79, 8],
          [6, 0, 77, 4], [6, 4, 81, 4], [6, 8, 79, 2], [6, 10, 77, 2], [6, 12, 76, 4],
          [7, 0, 74, 12],
          [8, 0, 81, 6], [8, 6, 79, 2], [8, 8, 77, 8],
          [9, 0, 80, 6], [9, 6, 77, 2], [9, 8, 74, 8],
          [10, 0, 79, 4], [10, 4, 76, 4], [10, 8, 74, 4], [10, 12, 71, 4],
          [11, 0, 73, 8], [11, 8, 76, 4], [11, 12, 79, 4],
          [12, 0, 77, 6], [12, 6, 76, 2], [12, 8, 74, 8],
          [13, 0, 71, 4], [13, 4, 74, 4], [13, 8, 77, 4], [13, 12, 79, 4],
          [14, 0, 76, 16],
          [15, 0, 74, 4], [15, 4, 71, 4], [15, 8, 67, 8],
        ], 0.55),
      },
      { kind: 'hat', notes: drums('x.ox..o.x.ox..o.', ALL16, 0.35) },
      { kind: 'snare', notes: drums('....o.......o...', ALL16, 0.25), reverb: 0.2 },
    ],
  },

  /* "Food Court Frenzy" -------------------------------------------------- */
  combat: {
    bpm: 124,
    bars: 16,
    gain: 0.5,
    voices: [
      { kind: 'kick', notes: drums('x...x...x...x...', ALL16) },
      { kind: 'bass', duck: true, notes: bassLine(COMBAT_ROOTS, [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, null, 0, 7, 12], 1, 0.8) },
      { kind: 'hat', minIntensity: 0.2, notes: drums('..x...x...x...x.', ALL16, 0.8) },
      { kind: 'clap', minIntensity: 0.3, reverb: 0.55, notes: drums('....x.......x...', ALL16, 0.9) },
      { kind: 'pluck', minIntensity: 0.35, echo: 0.4, duck: true, notes: arpeggio(COMBAT_CHANGES, 0.42) },
      { kind: 'pad', minIntensity: 0.45, reverb: 0.5, duck: true, notes: chordsPerBar(COMBAT_CHANGES, 16, 0.4) },
      {
        kind: 'supersaw',
        minIntensity: 0.6,
        echo: 0.35,
        reverb: 0.3,
        notes: melody([
          [8, 0, 76, 4], [8, 4, 74, 2], [8, 6, 72, 2], [8, 8, 74, 4], [8, 12, 76, 4],
          [9, 0, 79, 6], [9, 6, 76, 2], [9, 8, 74, 8],
          [10, 0, 72, 4], [10, 4, 74, 2], [10, 6, 76, 2], [10, 8, 77, 4], [10, 12, 76, 4],
          [11, 0, 74, 8], [11, 8, 72, 4], [11, 12, 69, 4],
          [12, 0, 74, 4], [12, 4, 77, 4], [12, 8, 81, 6], [12, 14, 79, 2],
          [13, 0, 77, 8], [13, 8, 76, 4], [13, 12, 74, 4],
          [14, 0, 76, 4], [14, 4, 80, 4], [14, 8, 83, 6], [14, 14, 81, 2],
          [15, 0, 80, 12], [15, 12, 76, 4],
        ], 0.6),
      },
      { kind: 'hat', minIntensity: 0.85, notes: drums('oooooooooooooooo', ALL16, 0.35) },
      { kind: 'openhat', minIntensity: 0.7, notes: drums('..............x.', ALL16.filter((b) => b % 2 === 1), 0.7) },
      { kind: 'crash', minIntensity: 0.3, reverb: 0.4, notes: drums('x...............', [0, 8]) },
      { kind: 'tom', minIntensity: 0.5, reverb: 0.3, notes: [12, 13, 14, 15].map((s, i) => ({ step: 15 * 16 + s, midi: 50 - i * 4, vel: 0.9 })) },
    ],
  },

  /* "Loss Prevention" ---------------------------------------------------- */
  boss: {
    bpm: 138,
    bars: 16,
    gain: 0.5,
    voices: [
      { kind: 'kick', notes: drums('x..x..x.x..x..x.', ALL16) },
      { kind: 'drivebass', duck: true, notes: bassLine(BOSS_ROOTS, [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 1, 12, 0], 1, 0.75) },
      { kind: 'snare', reverb: 0.5, notes: drums('....x.......x..o', ALL16, 0.95) },
      { kind: 'hat', minIntensity: 0.5, notes: drums('xoxoxoxoxoxoxoxo', ALL16, 0.45) },
      { kind: 'choir', minIntensity: 0.3, reverb: 0.6, notes: chordsPerBar(BOSS_CHANGES, 16, 0.45) },
      {
        kind: 'lead',
        echo: 0.3,
        // Alarm stabs, then a siren on the turnaround.
        notes: [
          ...[0, 1, 2, 3, 4, 5].flatMap((bar) => [
            { step: bar * 16, midi: 74, len: 2, vel: 0.45 },
            { step: bar * 16 + 3, midi: 74, len: 2, vel: 0.35 },
            { step: bar * 16 + 6, midi: bar % 2 ? 75 : 77, len: 2, vel: 0.4 },
          ]),
          ...range(0, 8).map((i) => ({ step: 6 * 16 + i * 4, midi: i % 2 ? 81 : 80, len: 4, vel: 0.4 })),
        ],
      },
      {
        kind: 'supersaw',
        minIntensity: 0.65,
        echo: 0.3,
        reverb: 0.3,
        notes: melody([
          [8, 0, 74, 4], [8, 4, 77, 4], [8, 8, 76, 4], [8, 12, 74, 4],
          [9, 0, 81, 8], [9, 8, 77, 8],
          [10, 0, 75, 4], [10, 4, 74, 4], [10, 8, 72, 4], [10, 12, 70, 4],
          [11, 0, 75, 16],
          [12, 0, 74, 4], [12, 4, 81, 4], [12, 8, 79, 4], [12, 12, 77, 4],
          [13, 0, 79, 8], [13, 8, 82, 8],
          [14, 0, 81, 6], [14, 6, 79, 2], [14, 8, 76, 8],
          [15, 0, 73, 16],
        ], 0.65),
      },
      { kind: 'crash', minIntensity: 0.3, reverb: 0.5, notes: drums('x...............', [0, 8]) },
      { kind: 'tom', minIntensity: 0.6, reverb: 0.3, notes: [8, 10, 12, 13, 14, 15].map((s, i) => ({ step: 7 * 16 + s, midi: 52 - i * 3, vel: 0.9 })) },
    ],
  },

  /* "Lights Out" --------------------------------------------------------- */
  blackout: {
    bpm: 76,
    bars: 16,
    gain: 0.6,
    voices: [
      { kind: 'kick', notes: drums('x..o............', ALL16, 0.7) },
      { kind: 'drone', reverb: 0.5, notes: [0, 4, 8, 12].map((bar) => ({ step: bar * 16, chord: [28, 35], len: 64, vel: 0.6 })) },
      { kind: 'pad', reverb: 0.7, notes: chordsPerBar(DARK_CHANGES, 16, 0.3) },
      {
        kind: 'bell',
        reverb: 0.8,
        echo: 0.5,
        notes: melody([[0, 8, 76, 8], [2, 0, 79, 8], [3, 8, 71, 8], [5, 4, 74, 8], [7, 0, 72, 16], [9, 8, 76, 8], [11, 0, 83, 8], [12, 8, 81, 8], [14, 0, 78, 16]], 0.4),
      },
      { kind: 'hat', minIntensity: 0.4, notes: drums('..o...o...o...o.', ALL16, 0.3) },
      { kind: 'pluck', minIntensity: 0.55, echo: 0.6, notes: melody(ALL16.flatMap((bar) => [[bar, 0, 64, 2], [bar, 6, 67, 2], [bar, 10, 71, 2]] as Array<[number, number, number, number]>), 0.3) },
      { kind: 'snare', minIntensity: 0.7, reverb: 0.8, notes: drums('........x.......', ALL16, 0.5) },
    ],
  },

  /* Tension layer: a mannequin you stopped watching is moving. ------------ */
  tension: {
    bpm: 120,
    bars: 1,
    gain: 0.45,
    voices: [
      { kind: 'strings', reverb: 0.4, notes: [{ step: 0, chord: [76, 77, 83], len: 16, vel: 0.5 }] },
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

type Playing = {
  gain: GainNode;
  duck: GainNode;
  origin: number;
  tempoScale: number;
  bookedUntil: number;
  active: boolean;
};

const LOOKAHEAD = 0.25;

/** A decaying two-channel noise impulse for the shared reverb (generated, not loaded). */
function makeImpulse(context: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let state = 0x2545f491;
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const t = i / length;
      data[i] = ((state / 0xffffffff) * 2 - 1) * (1 - t) ** 2.6;
    }
  }
  return buffer;
}

/** Soft-clip curve for the boss's drive bass. */
function driveCurve(amount = 18): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  for (let i = 0; i < 1024; i += 1) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export class MusicPlayer {
  private readonly context: BaseAudioContext;
  private readonly bus: GainNode;
  private readonly reverbIn: GainNode;
  private readonly echo: DelayNode;
  private readonly echoIn: GainNode;
  private readonly noise: AudioBuffer;
  private readonly drive: Float32Array<ArrayBuffer>;
  private readonly playing = new Map<LayerId, Playing>();
  private readonly byStep = new Map<LayerId, Map<number, Array<{ voice: MusicVoice; note: MusicNote }>>>();

  public constructor(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.context = context;
    this.noise = noise;
    this.drive = driveCurve();
    // Everything ends in a limiter so a full band never clips the master.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(destination);
    this.bus = context.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(limiter);
    // Shared reverb.
    const reverb = context.createConvolver();
    reverb.buffer = makeImpulse(context);
    this.reverbIn = context.createGain();
    const reverbOut = context.createGain();
    reverbOut.gain.value = 0.55;
    this.reverbIn.connect(reverb).connect(reverbOut).connect(this.bus);
    // Tempo-synced echo with a darkening feedback loop.
    this.echo = context.createDelay(2);
    this.echo.delayTime.value = 0.36;
    this.echoIn = context.createGain();
    const feedback = context.createGain();
    feedback.gain.value = 0.38;
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const echoOut = context.createGain();
    echoOut.gain.value = 0.5;
    this.echoIn.connect(this.echo);
    this.echo.connect(tone).connect(feedback).connect(this.echo);
    tone.connect(echoOut).connect(this.bus);

    for (const [id, track] of Object.entries(TRACKS) as Array<[LayerId, MusicTrack]>) {
      const index = new Map<number, Array<{ voice: MusicVoice; note: MusicNote }>>();
      for (const voice of track.voices) {
        for (const note of voice.notes) {
          const list = index.get(note.step) ?? [];
          list.push({ voice, note });
          index.set(note.step, list);
        }
      }
      this.byStep.set(id, index);
    }
  }

  /** Music bus level, 0..1, from the player's settings. */
  public setVolume(volume: number): void {
    this.bus.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime, 0.05);
  }

  /** Crossfades toward the cue's track (and the tension layer) and books ahead. */
  public update(cue: MusicCue, enabled: boolean, lookahead = LOOKAHEAD): void {
    const now = this.context.currentTime;
    const intensity = cue.intensity ?? 1;
    for (const id of Object.keys(TRACKS) as LayerId[]) {
      const track = TRACKS[id];
      const wanted = enabled && (id === 'tension' ? cue.tension === true && cue.track !== 'silent' : cue.track === id);
      let playing = this.playing.get(id);
      if (wanted && (!playing || !playing.active)) {
        // A track starting from silence starts at its top, on the next beat.
        let gain = playing?.gain;
        let duck = playing?.duck;
        if (!gain || !duck) {
          gain = this.context.createGain();
          gain.gain.value = 0;
          gain.connect(this.bus);
          duck = this.context.createGain();
          duck.connect(gain);
        }
        playing = { gain, duck, origin: now + 0.05, tempoScale: cue.tempoScale, bookedUntil: now + 0.05, active: true };
        this.playing.set(id, playing);
      }
      if (!playing) continue;
      if (wanted && id !== 'tension' && playing.tempoScale !== cue.tempoScale) {
        // Keep the groove's position when the boss speeds up.
        const oldDur = 60 / (track.bpm * playing.tempoScale) / 4;
        const newDur = 60 / (track.bpm * cue.tempoScale) / 4;
        const position = (playing.bookedUntil - playing.origin) / oldDur;
        playing.origin = playing.bookedUntil - position * newDur;
        playing.tempoScale = cue.tempoScale;
      }
      const target = wanted ? track.gain * cue.volume : 0;
      playing.gain.gain.setTargetAtTime(target, now, wanted ? 0.35 : 0.6);
      if (!wanted && playing.gain.gain.value < 0.004) {
        playing.active = false;
        continue;
      }
      if (!playing.active) continue;
      const tempo = track.bpm * (id === 'tension' ? 1 : playing.tempoScale);
      const stepDur = 60 / tempo / 4;
      if (id !== 'tension' && wanted) this.echo.delayTime.setTargetAtTime(stepDur * 3, now, 0.1);
      const until = now + lookahead;
      const from = Math.max(playing.bookedUntil, now);
      for (const { step, time } of stepTimes(playing.origin, tempo, track.bars * STEPS_PER_BAR, from, until)) {
        const shuffled = track.swing && step % 2 === 1 ? time + track.swing * stepDur : time;
        for (const { voice, note } of this.byStep.get(id)?.get(step) ?? []) {
          if ((voice.minIntensity ?? 0) > intensity) continue;
          this.play(voice, note, shuffled, stepDur, playing);
        }
      }
      playing.bookedUntil = until;
    }
  }

  /** Routes one voice: dry to its track (or its ducked bus), plus sends. */
  private route(voice: MusicVoice, playing: Playing): AudioNode {
    const out = this.context.createGain();
    out.connect(voice.duck ? playing.duck : playing.gain);
    if (voice.reverb) {
      const send = this.context.createGain();
      send.gain.value = voice.reverb;
      out.connect(send).connect(this.reverbIn);
    }
    if (voice.echo) {
      const send = this.context.createGain();
      send.gain.value = voice.echo;
      out.connect(send).connect(this.echoIn);
    }
    return out;
  }

  private play(voice: MusicVoice, note: MusicNote, time: number, stepDur: number, playing: Playing): void {
    const vel = note.vel ?? 1;
    const length = (note.len ?? 1) * stepDur;
    const ctx = this.context;
    const kind = voice.kind;
    const out = this.route(voice, playing);

    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);
      g.gain.setValueAtTime(0.95 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
      osc.connect(g).connect(out);
      osc.start(time);
      osc.stop(time + 0.32);
      this.noiseHit(out, time, 0.012, 0.3 * vel, 'highpass', 3000);
      // Sidechain: everything marked `duck` pumps under the kick.
      playing.duck.gain.cancelScheduledValues(time);
      playing.duck.gain.setValueAtTime(0.25, time);
      playing.duck.gain.linearRampToValueAtTime(1, time + Math.min(0.28, stepDur * 3.5));
      return;
    }
    if (kind === 'snare') {
      this.noiseHit(out, time, 0.18, 0.5 * vel, 'bandpass', 1900);
      this.tone(out, 'triangle', 200, 140, time, 0.09, 0.3 * vel);
      return;
    }
    if (kind === 'clap') {
      // Three quick bursts smeared together: the 80s drum-machine clap.
      for (const offset of [0, 0.011, 0.022]) this.noiseHit(out, time + offset, offset === 0.022 ? 0.16 : 0.02, 0.45 * vel, 'bandpass', 1400);
      return;
    }
    if (kind === 'hat' || kind === 'openhat') {
      this.noiseHit(out, time, kind === 'hat' ? 0.035 : 0.22, (kind === 'hat' ? 0.17 : 0.2) * vel, 'highpass', 7500);
      return;
    }
    if (kind === 'crash') {
      this.noiseHit(out, time, 1.6, 0.22 * vel, 'highpass', 5000);
      return;
    }
    if (kind === 'tom') {
      this.tone(out, 'sine', midiHz(note.midi ?? 45) * 1.5, midiHz(note.midi ?? 45), time, 0.28, 0.55 * vel);
      return;
    }

    const pitches = note.chord ?? (note.midi !== undefined ? [note.midi] : []);
    for (const midi of pitches) {
      const hz = midiHz(midi);
      if (kind === 'sub') {
        this.tone(out, 'sine', hz, hz, time, length * 0.9, 0.4 * vel, 0.01);
      } else if (kind === 'bass' || kind === 'drivebass') {
        // Filter-enveloped saw with a sine sub; the boss's is driven hard.
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 6;
        filter.frequency.setValueAtTime(kind === 'drivebass' ? 2400 : 1800, time);
        filter.frequency.exponentialRampToValueAtTime(kind === 'drivebass' ? 500 : 260, time + Math.max(0.05, length * 0.9));
        this.envelope(g, time, 0.005, length * 0.95, 0.26 * vel);
        const saw = ctx.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = hz;
        if (kind === 'drivebass') {
          const shaper = ctx.createWaveShaper();
          shaper.curve = this.drive;
          saw.connect(shaper).connect(filter);
        } else {
          saw.connect(filter);
        }
        filter.connect(g).connect(out);
        saw.start(time);
        saw.stop(time + length + 0.05);
        this.tone(out, 'sine', hz / 2, hz / 2, time, length * 0.9, 0.2 * vel, 0.005);
      } else if (kind === 'pad' || kind === 'choir' || kind === 'strings' || kind === 'drone') {
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const attack = kind === 'strings' ? 0.08 : kind === 'drone' ? 1.2 : 0.35;
        filter.type = kind === 'choir' ? 'bandpass' : 'lowpass';
        filter.frequency.value = kind === 'choir' ? 900 : kind === 'drone' ? 420 : kind === 'strings' ? 3000 : 1500;
        filter.Q.value = kind === 'choir' ? 1.4 : 0.7;
        this.envelope(g, time, attack, length, (kind === 'drone' ? 0.12 : kind === 'strings' ? 0.07 : 0.06) * vel);
        const detunes = kind === 'drone' ? [-7, 7] : [-12, 0, 12];
        for (const detune of detunes) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = hz;
          osc.detune.value = detune;
          osc.connect(filter);
          osc.start(time);
          osc.stop(time + length + 0.6);
        }
        if (kind === 'strings') {
          // Tremolo: the bow scraping fast.
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          const trem = ctx.createGain();
          lfo.frequency.value = 9;
          depth.gain.value = 0.5;
          trem.gain.value = 0.5;
          lfo.connect(depth).connect(trem.gain);
          filter.connect(trem).connect(g);
          lfo.start(time);
          lfo.stop(time + length + 0.6);
        } else if (kind === 'drone') {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 0.08;
          depth.gain.value = 180;
          lfo.connect(depth).connect(filter.frequency);
          lfo.start(time);
          lfo.stop(time + length + 0.6);
          filter.connect(g);
        } else {
          filter.connect(g);
        }
        g.connect(out);
      } else if (kind === 'supersaw') {
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3800;
        this.envelope(g, time, 0.012, length * 0.95, 0.05 * vel);
        for (const detune of [-24, -11, 0, 11, 24]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = hz;
          osc.detune.value = detune;
          osc.connect(filter);
          osc.start(time);
          osc.stop(time + length + 0.1);
        }
        filter.connect(g).connect(out);
      } else if (kind === 'lead') {
        const g = ctx.createGain();
        this.envelope(g, time, 0.006, length * 0.9, 0.09 * vel);
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = hz;
        osc.connect(g).connect(out);
        osc.start(time);
        osc.stop(time + length + 0.05);
      } else if (kind === 'pluck') {
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, time);
        filter.frequency.exponentialRampToValueAtTime(380, time + 0.2);
        this.envelope(g, time, 0.003, Math.min(0.28, length + 0.1), 0.12 * vel);
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz;
        osc.connect(filter).connect(g).connect(out);
        osc.start(time);
        osc.stop(time + 0.35);
      } else if (kind === 'bell') {
        // FM bell / vibraphone: a sine carrier bent by a 3.5x modulator.
        const g = ctx.createGain();
        const ring = Math.max(0.6, length * 1.3);
        this.envelope(g, time, 0.004, ring, 0.14 * vel);
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const index = ctx.createGain();
        carrier.frequency.value = hz;
        modulator.frequency.value = hz * 3.5;
        index.gain.setValueAtTime(hz * 2.2, time);
        index.gain.exponentialRampToValueAtTime(hz * 0.1, time + 0.6);
        modulator.connect(index).connect(carrier.frequency);
        carrier.connect(g).connect(out);
        carrier.start(time);
        modulator.start(time);
        carrier.stop(time + ring + 0.1);
        modulator.stop(time + ring + 0.1);
      } else {
        // epiano: triangle + sine with a slow tape wobble.
        const g = ctx.createGain();
        this.envelope(g, time, 0.008, length * 0.95, 0.07 * vel);
        [-6, 5].forEach((detune, i) => {
          const osc = ctx.createOscillator();
          osc.type = i === 0 ? 'triangle' : 'sine';
          osc.frequency.value = hz;
          osc.detune.value = detune;
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 0.7;
          depth.gain.value = 7;
          lfo.connect(depth).connect(osc.detune);
          osc.connect(g);
          lfo.start(time);
          osc.start(time);
          osc.stop(time + length + 0.05);
          lfo.stop(time + length + 0.05);
        });
        g.connect(out);
      }
    }
  }

  private envelope(g: GainNode, time: number, attack: number, length: number, peak: number): void {
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), time + Math.max(attack, length * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.03, length));
  }

  private tone(out: AudioNode, wave: OscillatorType, from: number, to: number, time: number, length: number, peak: number, attack = 0.002): void {
    const osc = this.context.createOscillator();
    const g = this.context.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, time);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + length);
    this.envelope(g, time, attack, length, peak);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  private noiseHit(out: AudioNode, time: number, length: number, peak: number, type: BiquadFilterType, frequency: number): void {
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const g = this.context.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + length);
    src.connect(filter).connect(g).connect(out);
    // Different slices of the noise buffer keep hits from sounding identical.
    src.start(time, (time * 7.13) % 0.8, length + 0.02);
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
