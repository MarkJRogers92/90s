import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { EnemyState } from '../../src/sim/model';
import { musicCue } from '../../src/game/audio/musicState';
import { TRACKS, stepTimes } from '../../src/game/audio/music';

function boss(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 99, kind: 'lp_manager', x: 400, y: 240, health: 60, radius: 22, phase: 'pursue', phaseTicks: 0,
    cooldownTicks: 0, telegraphAimX: 1, telegraphAimY: 0, bossPhase: 1, ...overrides,
  } as EnemyState;
}

describe('which music plays', () => {
  it('plays muzak in a quiet room and combat once enemies are alive', () => {
    const state = createMvpRun(7);
    state.room.combat.enemies = [];
    expect(musicCue(state).track).toBe('muzak');
    state.room.combat.enemies = [{ ...boss(), kind: 'hanger', health: 8 } as EnemyState];
    expect(musicCue(state).track).toBe('combat');
  });

  it('gives the boss its own theme that speeds up with its phase', () => {
    const state = createMvpRun(7);
    state.room.combat.enemies = [boss({ bossPhase: 1 })];
    const one = musicCue(state);
    state.room.combat.enemies = [boss({ bossPhase: 3 })];
    const three = musicCue(state);
    expect(one.track).toBe('boss');
    expect(three.tempoScale).toBeGreaterThan(one.tempoScale);
  });

  it('goes quiet at the end of a shift and ducks while paused', () => {
    const state = createMvpRun(7);
    state.paused = true;
    expect(musicCue(state).volume).toBeLessThan(1);
    state.paused = false;
    state.status = 'dead';
    expect(musicCue(state).track).toBe('silent');
  });
});

describe('tracks', () => {
  it('keeps every note inside its bar and in a playable range', () => {
    for (const track of Object.values(TRACKS)) {
      for (const voice of track.voices) {
        for (const note of voice.notes) {
          expect(note.step).toBeGreaterThanOrEqual(0);
          expect(note.step).toBeLessThan(track.bars * 16);
          if (note.midi !== undefined) {
            expect(note.midi).toBeGreaterThanOrEqual(24);
            expect(note.midi).toBeLessThanOrEqual(96);
          }
        }
      }
    }
  });
});

describe('step scheduling', () => {
  it('lists the sixteenth-note steps that start inside a time window, looping the pattern', () => {
    // 120 BPM: a sixteenth is 0.125 s. 64 steps per loop here.
    const steps = stepTimes(0, 120, 64, 0.2, 0.55);
    expect(steps.map((s) => s.step)).toEqual([2, 3, 4]);
    expect(steps[0]!.time).toBeCloseTo(0.25);
    const wrapped = stepTimes(0, 120, 64, 7.95, 8.1);
    expect(wrapped.map((s) => s.step)).toEqual([0]);
  });
});
