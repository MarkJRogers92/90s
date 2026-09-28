/**
 * Which mall a shift clocks into. A seed in the address bar (`?seed=4242`) is
 * pinned: every shift uses it, so a mall can be shared and the browser tests
 * stay deterministic. Otherwise each fresh shift rolls a new mall; a retry
 * after dying replays the same one, and a new shift after a win rolls again.
 *
 * Choosing the seed is a launcher decision, not a gameplay rule: once chosen,
 * the simulation generates everything from it as before.
 */
export type ShiftSeed = { readonly seed: number; readonly pinned: boolean };

/** Rolled seeds stay short enough to read off the HUD and type back in. */
const MAX_ROLLED_SEED = 999_999;

function roll(random: () => number, avoid?: number): number {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = 1 + Math.floor(random() * MAX_ROLLED_SEED);
    if (seed !== avoid) return seed;
  }
  return ((avoid ?? 0) % MAX_ROLLED_SEED) + 1;
}

export function firstShiftSeed(raw: string | null, random: () => number = Math.random): ShiftSeed {
  if (raw !== null && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return { seed: Math.trunc(parsed), pinned: true };
  }
  return { seed: roll(random), pinned: false };
}

export function nextShiftSeed(shift: ShiftSeed, won: boolean, random: () => number = Math.random): number {
  return shift.pinned || !won ? shift.seed : roll(random, shift.seed);
}
