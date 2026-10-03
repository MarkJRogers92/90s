import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRun } from '../../src/sim/createRun';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { tickRun } from '../../src/sim/tickRun';

test('fixed-seed gameplay traces remain unchanged by presentation work', () => {
  const summaries: Record<string, string> = {};
  const weapons = ITEM_CATALOG.filter(item => item.base).map(item => item.id);
  expect(weapons).toHaveLength(80);
  for (const weapon of weapons) for (const seed of [1, 7, 42]) {
    const run = createRun(seed, { itemIds: [weapon], selectedItemId: weapon });
    const hash = createHash('sha256');
    for (let t = 0; t < 420; t++) {
      const a = Math.floor(t / 35) * Math.PI / 4;
      tickRun(run, { moveX: t % 90 < 45 ? 1 : -1, moveY: t % 120 < 60 ? 0.3 : -0.3,
        aimX: run.player.x + Math.cos(a) * 300, aimY: run.player.y + Math.sin(a) * 300, fire: t % 3 !== 1 });
      hash.update(JSON.stringify(run));
    }
    summaries[`${weapon}:${seed}`] = hash.digest('hex');
  }
  const file = 'diagnostics/weapon-visuals/gameplay-replay-baseline.json';
  if (process.env.CAPTURE_WEAPON_BASELINE === '1') writeFileSync(file, JSON.stringify(summaries, null, 2));
  else expect(summaries).toEqual(JSON.parse(readFileSync(file, 'utf8')));
});
