import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { STALKER_ARRIVAL_TICKS, type StalkerState } from '../../src/sim/run/stalker';
import { HEAT_PER_STAR } from '../../src/sim/run/wanted';
import { POLICE_WASH_BEAT_TICKS, policeWash, stalkerCue } from '../../src/game/view/stalkerCues';
import { createAudioSnapshot, deriveAudioCues } from '../../src/game/audio/cues';
import { PA_LINES, PaDirector } from '../../src/game/ui/paModel';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import type { MvpInputFrame } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function agent(overrides: Partial<StalkerState> = {}): StalkerState {
  return { phase: 'hunting', phaseTicks: 0, x: 100, y: 200, radius: 14, facingX: 1, facingY: 0, writeUps: 0, ...overrides };
}

describe('stalker cues', () => {
  it('shows nothing without a stalker', () => {
    expect(stalkerCue(null, 0)).toMatchObject({ phase: 'none', body: false, label: null });
  });

  it('warns at the door with a countdown before he is drawn', () => {
    const start = stalkerCue(agent({ phase: 'arriving', phaseTicks: STALKER_ARRIVAL_TICKS }), 0);
    expect(start).toMatchObject({ body: false, doorProgress: 0, label: 'LOSS PREVENTION 3' });
    const late = stalkerCue(agent({ phase: 'arriving', phaseTicks: 20 }), 0);
    expect(late.doorProgress).toBeGreaterThan(0.85);
    expect(late.label).toBe('LOSS PREVENTION 1');
  });

  it('strobes red and blue', () => {
    expect(stalkerCue(agent(), 0).strobeRed).not.toBe(stalkerCue(agent(), 8).strobeRed);
  });

  it('hunts behind a flashlight, stamps write-ups, and staggers when shoved', () => {
    expect(stalkerCue(agent(), 0)).toMatchObject({ body: true, flashlight: true, label: null });
    expect(stalkerCue(agent({ phase: 'writing_up', phaseTicks: 40 }), 0).label).toBe('WRITTEN UP!');
    const shoved = [50, 45, 40, 35].map((ticks) => stalkerCue(agent({ phase: 'shoved', phaseTicks: ticks }), 0).sway);
    expect(shoved.some((sway) => sway !== 0)).toBe(true);
  });
});

describe('police wash', () => {
  it('is off without a stalker, builds at the door, and holds while he hunts', () => {
    expect(policeWash(null, 0, true)).toBeNull();
    expect(policeWash(agent({ phase: 'arriving', phaseTicks: STALKER_ARRIVAL_TICKS }), 0, true)!.strength).toBe(0);
    const late = policeWash(agent({ phase: 'arriving', phaseTicks: 10 }), 0, true)!.strength;
    expect(late).toBeGreaterThan(0.5);
    expect(late).toBeLessThanOrEqual(0.6);
    expect(policeWash(agent(), 0, true)!.strength).toBe(1);
  });

  it('trades red and blue sides each beat, or holds steady under reduced flashes', () => {
    expect(policeWash(agent(), 0, true)!.leftRed).not.toBe(policeWash(agent(), POLICE_WASH_BEAT_TICKS, true)!.leftRed);
    expect(policeWash(agent(), 0, false)!.steady).toBe(true);
  });
});

describe('stalker audio, PA and HUD', () => {
  it('cues the door, a write-up, and a shove', () => {
    const state = createMvpRun(5);
    state.room.combat.enemies = [];
    state.heat = 5 * HEAT_PER_STAR;
    tickMvpRun(state, idle);
    const arriving = createAudioSnapshot(state);
    for (let index = 0; index < STALKER_ARRIVAL_TICKS; index += 1) tickMvpRun(state, idle);
    expect(deriveAudioCues(arriving, state)).toContain('stalker_in');
    const hunting = createAudioSnapshot(state);
    state.stalker!.writeUps = 1;
    state.stalker!.phase = 'writing_up';
    expect(deriveAudioCues(hunting, state)).toContain('write_up');
    state.stalker!.writeUps = 0;
    state.stalker!.phase = 'shoved';
    expect(deriveAudioCues(hunting, state)).toContain('stalker_shove');
  });

  it('announces Loss Prevention at four stars and his break below it', () => {
    const state = createMvpRun(5);
    const director = new PaDirector();
    director.observe(state);
    state.heat = 4 * HEAT_PER_STAR;
    state.tick += 1;
    expect(PA_LINES.stalker).toContain(director.observe(state));
    state.heat = 3 * HEAT_PER_STAR;
    state.tick += 1;
    expect(director.observe(state)).toBe(PA_LINES.stalker_lost[0]);
  });

  it('tells a four-star janitor who is on them', () => {
    const state = createMvpRun(5);
    state.heat = 4 * HEAT_PER_STAR;
    const texts = buildGameHudModel(state).objectives.map((objective) => objective.text);
    expect(texts).toContain('LOSS PREVENTION ON YOU - CLEAR FIGHTS TO LAY LOW');
  });
});
