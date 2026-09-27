import { describe, expect, it } from 'vitest';
import { serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ConcourseAmbience } from '../../src/game/view/ConcourseAmbience';

describe('ConcourseAmbience', () => {
  it('selects four to six deterministic civilians on authored nonoverlapping lanes', () => {
    const first = new ConcourseAmbience(17);
    const second = new ConcourseAmbience(17);

    expect(first.snapshot().visibleCount).toBeGreaterThanOrEqual(4);
    expect(first.snapshot().visibleCount).toBeLessThanOrEqual(6);
    expect(first.debugLanes()).toEqual(second.debugLanes());
    expect(new Set(first.debugLanes().map((lane) => lane.y)).size).toBe(first.debugLanes().length);
  });

  it('keeps every possible opening civilian clearly inside the initial camera view', () => {
    const lanes = new ConcourseAmbience(99).debugLanes();
    expect(lanes).toHaveLength(6);
    // Night Shift frames the whole 960x480 room, so every shopper must stand
    // on open floor: clear of the side walls, the storefront kerb (y 40) and
    // the balcony railing along the bottom (y 450+).
    for (const lane of lanes) {
      expect(lane.x).toBeGreaterThanOrEqual(48);
      expect(lane.x).toBeLessThanOrEqual(912);
      expect(lane.y).toBeGreaterThanOrEqual(72);
      expect(lane.y).toBeLessThanOrEqual(440);
    }
  });

  it('advances through the evacuation phases without rewinding', () => {
    const ambience = new ConcourseAmbience(7);

    expect(ambience.sync({ playerX: 54, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 1 })).toEqual({ phase: 'busy', visibleCount: expect.any(Number) });
    expect(ambience.sync({ playerX: 55, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 2 }).phase).toBe('warning');
    expect(ambience.sync({ playerX: 72, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 3 }).phase).toBe('evacuating');
    expect(ambience.debugPhaseAnimationTick()).toBe(0);
    expect(ambience.sync({ playerX: 1, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 4 }).phase).toBe('evacuating');
    expect(ambience.sync({ playerX: 1, roomX: 0, roomWidth: 100, inOpeningRoom: false, tick: 5 })).toEqual({ phase: 'empty', visibleCount: 0 });
  });

  it('does not advance its cosmetic clock while the active scene tick is unchanged and reset restores busy', () => {
    const ambience = new ConcourseAmbience(9);
    ambience.sync({ playerX: 72, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 20 });
    const beforePause = ambience.debugAnimationTick();
    ambience.sync({ playerX: 72, roomX: 0, roomWidth: 100, inOpeningRoom: true, tick: 20 });
    expect(ambience.debugAnimationTick()).toBe(beforePause);

    ambience.resetForRun();
    expect(ambience.snapshot().phase).toBe('busy');
    expect(ambience.snapshot().visibleCount).toBeGreaterThanOrEqual(4);
  });

  it('has no collider or body and cannot add fields to a simulation checkpoint', () => {
    const ambience = new ConcourseAmbience(11);
    expect('body' in ambience).toBe(false);
    expect('collider' in ambience).toBe(false);
    expect(Object.keys(ambience.snapshot()).sort()).toEqual(['phase', 'visibleCount']);
    expect(JSON.stringify(serializeCheckpoint(createMvpRun(11)))).not.toContain('civilian');
  });
});
