import { describe, expect, it } from 'vitest';
import {
  BOSS_INTRO_MS,
  BOSS_INTRO_ZOOM,
  bossIntroCopy,
  bossIntroFrame,
  portraitCrop,
} from '../../src/game/ui/bossIntroModel';

describe('boss title card', () => {
  it('names each floor boss on its own directory line', () => {
    expect(bossIntroCopy('lp_manager')).toMatchObject({ name: 'LOSS PREVENTION', directory: 'LEVEL 1 - SECURITY OFFICE' });
    expect(bossIntroCopy('manager')).toMatchObject({ name: 'THE MALL MANAGER', directory: 'LEVEL 2 - MANAGEMENT OFFICES' });
    expect(bossIntroCopy('owner')).toMatchObject({ name: 'THE MALL OWNER', directory: "LEVEL 3 - OWNER'S SUITE" });
  });

  it('starts neutral, closes in, and returns the camera before it ends', () => {
    const start = bossIntroFrame(0);
    expect(start).toMatchObject({ zoom: 1, bars: 0, plate: 0, nameLit: false, done: false });
    const middle = bossIntroFrame(BOSS_INTRO_MS / 2);
    expect(middle.zoom).toBeCloseTo(BOSS_INTRO_ZOOM);
    expect(middle.bars).toBeGreaterThan(0);
    expect(middle.plate).toBe(1);
    expect(middle.nameLit).toBe(true);
    const end = bossIntroFrame(BOSS_INTRO_MS);
    expect(end).toMatchObject({ zoom: 1, bars: 0, done: true });
    expect(end.plateAlpha).toBe(0);
  });

  it('stutters the neon name on before it holds', () => {
    const lit = Array.from({ length: 30 }, (_, index) => bossIntroFrame(360 + index * 12).nameLit);
    expect(lit.includes(true)).toBe(true);
    // At least one off-beat after first lighting: a flicker, not a switch.
    const first = lit.indexOf(true);
    expect(lit.slice(first).includes(false)).toBe(true);
    // Held on through the middle of the (round 35, 1.4 s) card.
    expect(bossIntroFrame(900).nameLit).toBe(true);
  });

  it('only ever moves toward done', () => {
    let wasDone = false;
    for (let ms = 0; ms <= BOSS_INTRO_MS + 100; ms += 50) {
      const frame = bossIntroFrame(ms);
      if (wasDone) expect(frame.done).toBe(true);
      wasDone = frame.done;
      expect(frame.zoom).toBeGreaterThanOrEqual(1);
      expect(frame.zoom).toBeLessThanOrEqual(BOSS_INTRO_ZOOM + 1e-9);
    }
  });

  it('crops a square head-and-shoulders mugshot inside every boss frame', () => {
    for (const frame of [64, 96, 128]) {
      const crop = portraitCrop(frame);
      expect(crop.size).toBeGreaterThan(frame / 2);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.size).toBeLessThanOrEqual(frame);
      expect(crop.y + crop.size).toBeLessThanOrEqual(frame * 0.6);
      // Centred: the head is in the middle of every sheet.
      expect(Math.abs(crop.x + crop.size / 2 - frame / 2)).toBeLessThanOrEqual(1);
    }
  });
});
