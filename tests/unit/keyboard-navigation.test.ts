import { describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';
import { createPropTestRun } from '../../src/sim/run/propTestRoom';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { walkTo } from '../browser/keyboardNavigation';

/**
 * Offline transport model, not browser evidence. Public input calls take time
 * before delivery (for example Playwright's trace snapshot before keyup).
 * A single press has that delay before keydown, then schedules down/delay/up
 * together. The real simulation, rather than a position stub, owns movement
 * and prop collision throughout. No running browser/game state is modified.
 */
function delayedKeyboardPage(inputLatencyMs: number) {
  const run = createPropTestRun(1);
  const held = new Set<string>();
  let remainderMs = 0;
  const advance = async (durationMs: number): Promise<void> => {
    remainderMs += durationMs;
    while (remainderMs >= 1000 / 60) {
      tickMvpRun(run, {
        moveX: Number(held.has('d')) - Number(held.has('a')),
        moveY: Number(held.has('s')) - Number(held.has('w')),
        aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false,
      });
      remainderMs -= 1000 / 60;
    }
  };
  const page = {
    evaluate: async () => {
      const { x, y } = run.room.combat.player;
      return { x, y };
    },
    keyboard: {
      down: async (key: string) => { await advance(inputLatencyMs); held.add(key); },
      up: async (key: string) => { await advance(inputLatencyMs); held.delete(key); },
      press: async (key: string, options: { delay?: number } = {}) => {
        await advance(inputLatencyMs);
        held.add(key);
        await advance(options.delay ?? 0);
        held.delete(key);
      },
    },
    waitForTimeout: advance,
  } as unknown as Pick<Page, 'evaluate' | 'keyboard' | 'waitForTimeout'>;
  return { page, run, held };
}

describe('browser keyboard navigation transport', () => {
  it.each([0, 300, 1000])('reaches the fixture approach without held-key overshoot at %i ms input latency', async (latency) => {
    const { page, run, held } = delayedKeyboardPage(latency);
    await walkTo(page, 280, 330);
    expect(Math.abs(run.room.combat.player.x - 280)).toBeLessThanOrEqual(20);
    expect(Math.abs(run.room.combat.player.y - 330)).toBeLessThanOrEqual(20);
    expect(held.size).toBe(0);
  });

  it('walks around the actual bakery footprint in both directions with delayed input', async () => {
    const { page, run, held } = delayedKeyboardPage(300);
    for (const [x, y] of [[280, 330], [355, 330], [355, 190], [280, 190], [355, 190], [355, 330]] as const) {
      await walkTo(page, x, y);
      expect(Math.abs(run.room.combat.player.x - x)).toBeLessThanOrEqual(20);
      expect(Math.abs(run.room.combat.player.y - y)).toBeLessThanOrEqual(20);
    }
    expect(held.size).toBe(0);
  });
});
