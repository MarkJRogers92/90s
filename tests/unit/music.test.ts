import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { EnemyState } from '../../src/sim/model';
import { musicCue } from '../../src/game/audio/musicState';
import { TRACKS, stepTimes } from '../../src/game/audio/music';
import { roomEventFor } from '../../src/sim/run/roomEvents';
import { ascend, ascendToFloorTwo } from '../../src/sim/run/floors';
import { wingEventFor } from '../../src/sim/run/wingEvents';

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

describe('reactive music', () => {
  const hanger = (id: number): EnemyState => ({ ...boss(), id, kind: 'hanger', health: 12 } as EnemyState);

  it('builds combat intensity with the enemies alive and at the last heart', () => {
    const state = createMvpRun(7);
    state.room.combat.enemies = [hanger(1)];
    const one = musicCue(state).intensity;
    state.room.combat.enemies = [hanger(1), hanger(2), hanger(3), hanger(4)];
    const four = musicCue(state).intensity;
    expect(four).toBeGreaterThan(one);
    state.room.combat.player.health = 2;
    expect(musicCue(state).intensity).toBeGreaterThanOrEqual(four);
    expect(musicCue(state).intensity).toBeLessThanOrEqual(1);
  });

  it('plays Lights Out in a blacked-out fight', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = createMvpRun(seed);
      const index = state.wing.rooms.findIndex((_, i) => roomEventFor(state, i) === 'blackout');
      if (index < 0) continue;
      state.roomIndex = index;
      state.room.combat.enemies = [hanger(1)];
      expect(musicCue(state).track).toBe('blackout');
      return;
    }
    throw new Error('no blackout seed');
  });

  it('raises the tension layer while an unwatched mannequin moves', () => {
    const state = createMvpRun(7);
    state.room.combat.enemies = [{ ...hanger(1), kind: 'mannequin', phase: 'recover' } as EnemyState];
    expect(musicCue(state).tension).toBe(false);
    state.room.combat.enemies[0]!.phase = 'pursue';
    expect(musicCue(state).tension).toBe(true);
  });

  it('turns the boss up with his phase', () => {
    const state = createMvpRun(7);
    state.room.combat.enemies = [boss({ bossPhase: 1 })];
    const calm = musicCue(state).intensity;
    state.room.combat.enemies = [boss({ bossPhase: 3 })];
    expect(musicCue(state).intensity).toBeGreaterThan(calm);
  });
});

describe('upstairs music', () => {
  const upstairs = () => ascendToFloorTwo(Object.assign(createMvpRun(7), { status: 'won' as const }));

  it('plays its own fight track on Floor 2, but the same muzak between fights', () => {
    const state = upstairs();
    state.room.combat.enemies = [];
    expect(musicCue(state).track).toBe('muzak');
    state.room.combat.enemies = [{ ...boss(), kind: 'shopper', health: 18 } as EnemyState];
    expect(musicCue(state).track).toBe('upstairs');
  });

  it('gives the Mall Manager his own theme, still speeding up by phase', () => {
    const state = upstairs();
    state.room.combat.enemies = [boss({ kind: 'manager', health: 150, bossPhase: 1 })];
    const one = musicCue(state);
    state.room.combat.enemies = [boss({ kind: 'manager', health: 40, bossPhase: 3 })];
    const three = musicCue(state);
    expect(one.track).toBe('manager');
    expect(three.track).toBe('manager');
    expect(three.tempoScale).toBeGreaterThan(one.tempoScale);
  });
});

describe('tracks', () => {
  it('has a full sixteen-bar arrangement for every track, including Lights Out', () => {
    for (const id of ['muzak', 'combat', 'boss', 'blackout', 'upstairs', 'manager', 'topfloor', 'owner'] as const) {
      expect(TRACKS[id].bars).toBeGreaterThanOrEqual(16);
    }
  });

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

describe('district music (round 50)', () => {
  it('a district plays its own track in fights, and pushes it harder for its mini-boss', () => {
    let state = createMvpRun(1, { part: 1, floor: 2 });
    // A district night without a power outage (that plays Lights Out instead).
    for (let seed = 2; !state.wing.district || wingEventFor(state.wing) === 'outage'; seed += 1) state = createMvpRun(seed, { part: 1, floor: 2 });
    state.room.combat.enemies = [{ id: 1, kind: 'spritzer', x: 600, y: 300, health: 16, radius: 13, phase: 'recover', phaseTicks: 10, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 }];
    expect(musicCue(state).track).toBe('glamour');
    state.room.combat.enemies = [{ id: 2, kind: 'glamour_queen', x: 600, y: 300, health: 100, radius: 24, phase: 'pursue', phaseTicks: 10, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, bossPhase: 1 }];
    expect(musicCue(state)).toMatchObject({ track: 'glamour' });
    expect(musicCue(state).tempoScale).toBeGreaterThan(1);
  });
});

describe('top floor music', () => {
  const topFloor = () => {
    const two = ascendToFloorTwo(Object.assign(createMvpRun(7), { status: 'won' as const }));
    const first = ascend(Object.assign(two, { status: 'won' as const }));
    // On to Floor 3's boss wing: a first wing may be a district with its own music (round 50).
    return ascend(Object.assign(first, { status: 'won' as const }));
  };

  it('plays Arcade After Dark in Floor 3 fights, muzak between them', () => {
    const state = topFloor();
    state.room.combat.enemies = [];
    expect(musicCue(state).track).toBe('muzak');
    state.room.combat.enemies = [{ ...boss(), kind: 'mascot', health: 34 } as EnemyState];
    expect(musicCue(state).track).toBe('topfloor');
  });

  it('gives the Mall Owner Hostile Takeover, faster by phase', () => {
    const state = topFloor();
    state.room.combat.enemies = [boss({ kind: 'owner', health: 240, bossPhase: 1 })];
    const one = musicCue(state);
    state.room.combat.enemies = [boss({ kind: 'owner', health: 40, bossPhase: 3 })];
    const three = musicCue(state);
    expect(one.track).toBe('owner');
    expect(three.tempoScale).toBeGreaterThan(one.tempoScale);
  });
});
