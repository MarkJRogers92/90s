import { describe, expect, it } from 'vitest';
import { ELITE_GLYPHS, eliteRingSegments } from '../../src/game/view/eliteMarks';

const key = (pixels: ReadonlyArray<readonly [number, number]>) => pixels.map(([x, y]) => `${x},${y}`).sort().join(' ');

describe('elite traits read by shape, not only colour (roadmap V10)', () => {
  it('gives every trait its own small pixel glyph', () => {
    const traits = ['plain', 'swift', 'volatile'] as const;
    for (const trait of traits) {
      const glyph = ELITE_GLYPHS[trait];
      expect(glyph.length).toBeGreaterThan(6);
      for (const [x, y] of glyph) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(7); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(7); }
    }
    expect(new Set(traits.map((t) => key(ELITE_GLYPHS[t]))).size).toBe(3);
  });
  it('swift draws a dashed ring that turns; volatile a double ring; plain one solid ring', () => {
    const swiftA = eliteRingSegments('swift', 0), swiftB = eliteRingSegments('swift', 10);
    expect(swiftA.rings).toBe(1);
    expect(swiftA.dashes).toBeGreaterThanOrEqual(6);
    expect(swiftB.offset).not.toBe(swiftA.offset);
    expect(eliteRingSegments('volatile', 0)).toMatchObject({ rings: 2, dashes: 0 });
    expect(eliteRingSegments('plain', 0)).toMatchObject({ rings: 1, dashes: 0 });
  });
  it('holds the swift ring still when motion is reduced', () => {
    expect(eliteRingSegments('swift', 10, true).offset).toBe(eliteRingSegments('swift', 0, true).offset);
  });
});

describe('MvpRunView draws the elite mark', () => {
  async function draw(trait: 'plain' | 'swift' | 'volatile') {
    const { vi } = await import('vitest');
    vi.doMock('phaser', () => ({ default: { Math: { Vector2: class {} } } }));
    const { MvpRunView } = await import('../../src/game/view/MvpRunView');
    const drawEliteMark = Reflect.get(MvpRunView.prototype, 'drawEliteMark') as (...args: unknown[]) => void;
    const calls: string[] = [];
    const g: Record<string, (...a: unknown[]) => unknown> = {};
    for (const m of ['lineStyle', 'strokeEllipse', 'lineBetween', 'fillStyle', 'fillRect']) g[m] = () => { calls.push(m); return g; };
    drawEliteMark.call({}, g, { x: 300, y: 200 }, trait, 12, 0.8, 40);
    return calls;
  }
  it('swift: dashes, no full ellipse; volatile: two rings; plain: one ring; every glyph pixel is outlined', async () => {
    const swift = await draw('swift');
    expect(swift.filter((c) => c === 'strokeEllipse')).toHaveLength(0);
    expect(swift.filter((c) => c === 'lineBetween').length).toBeGreaterThanOrEqual(8);
    expect((await draw('volatile')).filter((c) => c === 'strokeEllipse')).toHaveLength(2);
    const plain = await draw('plain');
    expect(plain.filter((c) => c === 'strokeEllipse')).toHaveLength(1);
    expect(plain.filter((c) => c === 'fillRect')).toHaveLength(ELITE_GLYPHS.plain.length * 2);
  });
});
