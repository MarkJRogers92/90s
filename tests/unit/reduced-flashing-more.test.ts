import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, blink } from '../../src/game/settings/settings';
import { bossIntroFrame } from '../../src/game/ui/bossIntroModel';
import { actorVisualState } from '../../src/game/view/visualState';

const full = DEFAULT_SETTINGS;
const reduced = { ...DEFAULT_SETTINGS, flashes: 'reduced' as const };
const ticks = Array.from({ length: 120 }, (_, tick) => tick);
/** How many times a boolean signal changes over the sampled ticks. */
const changes = (signal: (tick: number) => boolean) => ticks.filter((tick) => tick > 0 && signal(tick) !== signal(tick - 1)).length;

describe('reduced flashing, the rest of the strobes', () => {
  it('blink alternates at full and holds steady on when reduced (HUD alarm banner, wanted stars)', () => {
    expect(changes((tick) => blink(tick, 10, full))).toBeGreaterThan(8);
    expect(changes((tick) => blink(tick, 10, reduced))).toBe(0);
    expect(blink(7, 10, reduced)).toBe(true);
  });

  it('the boss card lights the name without the neon stutter', () => {
    const samples = Array.from({ length: 140 }, (_, i) => i * 10);
    const lit = (flicker: boolean) => samples.map((ms) => bossIntroFrame(ms, flicker).nameLit);
    const switches = (values: boolean[]) => values.filter((value, i) => i > 0 && value !== values[i - 1]).length;
    expect(switches(lit(true))).toBeGreaterThan(2);
    // Reduced: it comes on once and goes off once, at the fade.
    expect(switches(lit(false))).toBeLessThanOrEqual(2);
  });

  it('a hurt actor blinks at full and is steadily see-through when reduced', () => {
    const hurt = (tick: number, flashes?: boolean) =>
      actorVisualState({ moving: false, attackTicks: 0, invulnerableTicks: 30, phase: 'pursue', isHanger: false, tick, ...(flashes === undefined ? {} : { flashes }) }).damageFlicker;
    expect(changes((tick) => hurt(tick))).toBeGreaterThan(8);
    expect(changes((tick) => hurt(tick, false))).toBe(0);
    expect(hurt(0, false)).toBe(true);
  });
});
