/**
 * The sprinklers floor event's rain: thin streaks falling down the room,
 * wrapping back to the top. A pure function of the tick, so every frame of
 * the same tick draws the same rain and nothing needs to be stored.
 * Presentation only; the rules (every enemy Wet) live in sim/run/wingEvents.
 */
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../sim/core/geometry';

export const SPRINKLER_STREAKS = 70;
const FALL_PER_TICK = 7;
const STREAK_LENGTH = 14;

export type Streak = { readonly x: number; readonly y: number; readonly length: number };

/** A cheap fixed scatter: the same column and phase for streak `index` every frame. */
function scatter(index: number, salt: number): number {
  const mixed = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  return ((mixed >>> 0) % 10_000) / 10_000;
}

export function sprinklerStreaks(tick: number): Streak[] {
  return Array.from({ length: SPRINKLER_STREAKS }, (_, index) => {
    // A little slant and speed variety so it reads as spray, not a curtain.
    const speed = FALL_PER_TICK * (0.8 + scatter(index, 3) * 0.4);
    const y = (scatter(index, 2) * PLAYFIELD_HEIGHT + tick * speed) % PLAYFIELD_HEIGHT;
    return { x: scatter(index, 1) * PLAYFIELD_WIDTH, y, length: STREAK_LENGTH };
  });
}
