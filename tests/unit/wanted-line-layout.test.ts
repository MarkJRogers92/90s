import { describe, it, expect } from 'vitest';
import { wantedRows, wantedPanel } from '../../src/game/ui/gameHudLayout';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import { createMvpRun } from '../../src/sim/run/createMvpRun';

const WORST = [
  'SHELVES +$8  4 EXTRA GUARDS  LOSS PREVENTION FOLLOWS  NEXT * IN 12',
  'SHELVES +$10  5 EXTRA GUARDS  LOSS PREVENTION FOLLOWS  2 HOT ITEMS HOLD YOUR STARS',
  'SHELVES +$2  1 EXTRA GUARD  NEXT * IN 5',
];

describe('wanted strip layout', () => {
  it('keeps every clause whole, in order, and never truncates', () => {
    for (const line of WORST) {
      const clauses = line.split('  ');
      const rows = wantedRows(line);
      expect(rows.join(' / ').split(' / ')).toEqual(clauses);
      expect(rows.join('')).not.toContain('...');
      for (const row of rows) expect(row.length).toBeLessThanOrEqual(32);
    }
  });

  it('never needs more rows than the panel is sized for, and the panel ends at the same baseline', () => {
    for (const line of WORST) {
      const rows = wantedRows(line);
      expect(rows.length).toBeLessThanOrEqual(3);
      const panel = wantedPanel(rows.length);
      expect(panel.y + panel.h).toBe(498);
      expect(panel.h).toBeGreaterThanOrEqual(rows.length * 11 + 10);
    }
  });

  it('keeps the real model lines intact at the extremes', () => {
    const run = createMvpRun(7);
    run.heat = 99;
    const line = buildGameHudModel(run).wantedLine!;
    expect(wantedRows(line).join(' / ').split(' / ')).toEqual(line.split('  '));
  });
});
