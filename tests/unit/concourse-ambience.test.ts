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

describe('concourse civilians stroll like shoppers', () => {
  const walls = [{ x: 425, y: 316, width: 110, height: 52 }, { x: 260, y: 70, width: 140, height: 30 }];
  const busy = (ambience: ConcourseAmbience, tick: number) =>
    ambience.sync({ playerX: 0, roomX: 0, roomWidth: 960, inOpeningRoom: true, tick });

  it('wanders to new spots instead of pacing on one line, facing the way it walks', () => {
    const ambience = new ConcourseAmbience(99, walls);
    busy(ambience, 0);
    const spots = new Map<string, Set<string>>();
    let checkedFacing = 0;
    let last = ambience.civilianPoses();
    for (let tick = 1; tick <= 1800; tick += 1) {
      busy(ambience, tick);
      const poses = ambience.civilianPoses();
      poses.forEach((pose, index) => {
        const before = last[index]!;
        const seen = spots.get(pose.id) ?? new Set<string>();
        seen.add(`${Math.round(pose.x / 20)},${Math.round(pose.y / 20)}`);
        spots.set(pose.id, seen);
        const dx = pose.x - before.x;
        if (pose.walking && Math.abs(dx) > 0.3 && Math.abs(pose.y - before.y) < 0.05) {
          // Walking straight east or west faces east (6) or west (2).
          expect(pose.facing).toBe(dx > 0 ? 6 : 2);
          checkedFacing += 1;
        }
      });
      last = poses;
    }
    // Each shopper covers ground in both axes, not a single horizontal line.
    for (const seen of spots.values()) expect(seen.size).toBeGreaterThan(3);
    expect(checkedFacing).toBeGreaterThan(0);
  });

  it('stops to browse now and then', () => {
    const ambience = new ConcourseAmbience(42, walls);
    busy(ambience, 0);
    const paused = new Set<string>();
    for (let tick = 1; tick <= 1800; tick += 1) {
      busy(ambience, tick);
      for (const pose of ambience.civilianPoses()) if (!pose.walking) paused.add(pose.id);
    }
    expect(paused.size).toBe(ambience.civilianPoses().length);
  });

  it('never walks into a wall, the fountain or out of the room', () => {
    const ambience = new ConcourseAmbience(7, walls);
    busy(ambience, 0);
    for (let tick = 1; tick <= 3000; tick += 1) {
      busy(ambience, tick);
      for (const pose of ambience.civilianPoses()) {
        expect(pose.x).toBeGreaterThanOrEqual(48);
        expect(pose.x).toBeLessThanOrEqual(912);
        expect(pose.y).toBeGreaterThanOrEqual(72);
        expect(pose.y).toBeLessThanOrEqual(440);
        for (const wall of walls) {
          const inside = pose.x > wall.x - 6 && pose.x < wall.x + wall.width + 6 && pose.y > wall.y - 4 && pose.y < wall.y + wall.height + 4;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('hurries for its exit when the evacuation starts, then is gone', () => {
    const ambience = new ConcourseAmbience(99, walls);
    busy(ambience, 0);
    for (let tick = 1; tick <= 300; tick += 1) busy(ambience, tick);
    ambience.sync({ playerX: 900, roomX: 0, roomWidth: 960, inOpeningRoom: true, tick: 301 });
    const start = ambience.civilianPoses();
    for (let tick = 302; tick <= 340; tick += 1) ambience.sync({ playerX: 900, roomX: 0, roomWidth: 960, inOpeningRoom: true, tick });
    const lanes = ambience.debugLanes();
    ambience.civilianPoses().forEach((pose, index) => {
      const lane = lanes[index]!;
      const toward = Math.sign(lane.exitX - start[index]!.x);
      expect(Math.sign(pose.x - start[index]!.x)).toBe(toward);
      expect(pose.walking).toBe(true);
    });
    for (let tick = 341; tick <= 1500; tick += 1) ambience.sync({ playerX: 900, roomX: 0, roomWidth: 960, inOpeningRoom: true, tick });
    expect(ambience.civilianPoses().every((pose) => !pose.visible)).toBe(true);
  });

  it('strolls the same way for the same mall', () => {
    const run = (seed: number) => {
      const ambience = new ConcourseAmbience(seed, walls);
      for (let tick = 0; tick <= 600; tick += 1) busy(ambience, tick);
      return ambience.civilianPoses();
    };
    expect(run(5)).toEqual(run(5));
  });
});
