import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_ART,
  PORTRAIT_DETAIL_SIZE,
  PORTRAIT_EXPRESSIONS,
  PORTRAIT_EXPRESSION_SIZE,
  PORTRAIT_KINDS,
  PORTRAIT_LABELS,
  PORTRAIT_SHEET_WIDTH,
  portraitExpressionFrame,
} from '../../src/game/portraits';

/**
 * Pure-catalogue checks for the portrait art.
 *
 * These deliberately touch no filesystem. `tsconfig` compiles `tests` with
 * `lib: ["ES2022", "DOM"]` and no Node types, so a test importing `node:fs`
 * typechecks under vitest but *fails* `tsc --noEmit`, which `npm run build`
 * runs first — a broken production build is a much worse outcome than a missing
 * assertion. The file-level checks live where the right tools already are:
 *
 *   - `tests/browser/portraits.spec.ts` — the real browser fetches and decodes
 *     every portrait and sheet, asserting the dimensions it actually gets.
 *     That is the strongest form of "these assets are usable", because it
 *     exercises the exact path the game uses.
 *   - `docs/art/tools/validate_runtime_tree.py` — binary alpha and palette
 *     membership, which need a decoder.
 *
 * What is left here is the part that is pure data: the catalogue's internal
 * consistency, which is what stops a kind being added to the list without its
 * art, or an expression being inserted without the sheet order following.
 */
describe('portrait catalogue', () => {
  it('lists a label for every kind and no extras', () => {
    expect(Object.keys(PORTRAIT_LABELS).sort()).toEqual([...PORTRAIT_KINDS].sort());
  });

  it('has eight distinct kinds, so none is a duplicate of another', () => {
    expect(PORTRAIT_KINDS.length).toBe(8);
    expect(new Set(PORTRAIT_KINDS).size).toBe(PORTRAIT_KINDS.length);
  });

  it('derives every url from the one directory, so the convention is stated once', () => {
    for (const kind of PORTRAIT_KINDS) {
      const art = PORTRAIT_ART[kind];
      expect(art.url).toBe(`/assets/portraits/${kind}.png`);
      expect(art.expressionUrl).toBe(`/assets/portraits/${kind}-expressions.png`);
    }
  });

  it('gives every kind its own files rather than sharing one', () => {
    const urls = PORTRAIT_KINDS.flatMap((k) => [PORTRAIT_ART[k].url, PORTRAIT_ART[k].expressionUrl]);
    expect(new Set(urls).size).toBe(PORTRAIT_KINDS.length * 2);
  });
});

describe('portrait sizes and expression order', () => {
  it('uses the two sizes the approved board specifies', () => {
    // Board 01I: "DETAILED PORTRAIT (160 x 160)" and "PORTRAIT EXPRESSIONS
    // (96 x 96)". Pinned here so a casual change to a constant is a test
    // failure rather than a silent re-scale of every portrait.
    expect(PORTRAIT_DETAIL_SIZE).toBe(160);
    expect(PORTRAIT_EXPRESSION_SIZE).toBe(96);
  });

  it('numbers the expression frames in sheet order', () => {
    expect(PORTRAIT_EXPRESSIONS.map((e) => portraitExpressionFrame(e))).toEqual(
      [...PORTRAIT_EXPRESSIONS.keys()],
    );
  });

  it('has the six expressions the board lists, in its order', () => {
    expect([...PORTRAIT_EXPRESSIONS]).toEqual([
      'neutral',
      'determined',
      'hurt',
      'afraid',
      'angry',
      'surprised',
    ]);
  });

  it('sizes the sheet to exactly its frames, with no slack', () => {
    expect(PORTRAIT_SHEET_WIDTH).toBe(PORTRAIT_EXPRESSION_SIZE * PORTRAIT_EXPRESSIONS.length);
    expect(PORTRAIT_SHEET_WIDTH % PORTRAIT_EXPRESSION_SIZE).toBe(0);
  });
});
