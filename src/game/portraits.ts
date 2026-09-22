/**
 * Character portraits.
 *
 * These are UI art, not world sprites, and that distinction decides how they are
 * loaded. World sprites go through `MvpRunScene.preload()` as Phaser textures
 * because Phaser needs them in its texture manager. The run HUD, by contrast, is
 * plain DOM (`index.html` plus `MvpRunHud`), so a portrait is an `<img src>` and
 * never reaches Phaser at all. Registering these as Phaser textures would upload
 * eight 160x160 images into the GPU for no reason.
 *
 * Two sizes, both from the approved reference board 01I:
 *
 *   - the detailed portrait, 160x160 — `PORTRAIT_DETAIL_SIZE`
 *   - the expression set, 96x96 a frame, six frames per character
 *
 * A character's six expressions are one horizontal sheet rather than six files,
 * for the same reason Alex's walk cycle is one sheet: one request, one decode,
 * and the frame index is arithmetic instead of a lookup that can drift.
 *
 * Every file under `public/assets/portraits/` is checked by
 * `tests/unit/portraits.test.ts` — dimensions, binary alpha and palette
 * membership — so a regenerated PNG that drifts fails the build rather than
 * shipping. If you add a kind here, add its files or that test will fail.
 */

/** Portrait subjects, in the order board 01I lists them. */
import { bossPhaseForHealth } from '../sim/combat/boss';
import type { EnemyState } from '../sim/model';

/** Portrait subjects, in the order board 01I lists them. */
export const PORTRAIT_KINDS = [
  'teenager',
  'employee',
  'security-guard',
  'store-manager',
  'stranger',
  'survivor',
  'vendor',
  'corrupted-human',
] as const;

export type PortraitKind = (typeof PORTRAIT_KINDS)[number];

/** Human-facing labels, kept beside the ids so the two cannot drift apart. */
export const PORTRAIT_LABELS: Record<PortraitKind, string> = {
  teenager: 'Teenager',
  employee: 'Mall employee',
  'security-guard': 'Security guard',
  'store-manager': 'Store manager',
  stranger: 'Stranger',
  survivor: 'Survivor',
  vendor: 'Vendor',
  'corrupted-human': 'Corrupted human',
};

/**
 * Expression order. This is the frame order of the `<kind>-expressions.png`
 * sheet, so it must stay in step with whatever regenerates those PNGs.
 */
export const PORTRAIT_EXPRESSIONS = [
  'neutral',
  'determined',
  'hurt',
  'afraid',
  'angry',
  'surprised',
] as const;

export type PortraitExpression = (typeof PORTRAIT_EXPRESSIONS)[number];

export const PORTRAIT_DETAIL_SIZE = 160;
export const PORTRAIT_EXPRESSION_SIZE = 96;

export type PortraitArt = {
  /** 160x160 detailed bust, transparent. */
  readonly url: string;
  /** Six 96x96 expression frames laid out along X. */
  readonly expressionUrl: string;
};

const DIR = '/assets/portraits';

/**
 * Built from `PORTRAIT_KINDS` rather than written out, so a new kind cannot be
 * added to the list and forgotten here — the compiler makes the record
 * exhaustive, and the URL convention is stated exactly once.
 */
export const PORTRAIT_ART: Record<PortraitKind, PortraitArt> = Object.fromEntries(
  PORTRAIT_KINDS.map((kind) => [
    kind,
    { url: `${DIR}/${kind}.png`, expressionUrl: `${DIR}/${kind}-expressions.png` },
  ]),
) as Record<PortraitKind, PortraitArt>;

/** Frame index for an expression within that character's sheet. */
export function portraitExpressionFrame(expression: PortraitExpression): number {
  return PORTRAIT_EXPRESSIONS.indexOf(expression);
}

/** Width of a character's expression sheet: right for the sheet's `width`. */
export const PORTRAIT_SHEET_WIDTH = PORTRAIT_EXPRESSION_SIZE * PORTRAIT_EXPRESSIONS.length;

/**
 * The Loss Prevention Manager's face.
 *
 * `security-guard` because that is what the boss is: mall security, in a
 * peaked cap with a badge and a radio. It is the one archetype the roster
 * already contains that the boss genuinely is, rather than one being stretched
 * to fit.
 */
export const BOSS_PORTRAIT_KIND: PortraitKind = 'security-guard';

/**
 * Which expression the boss wears, from state the simulation already keeps.
 *
 * Deliberately derived from the same authoritative fields `bossHudParts` reads,
 * including the same `bossPhaseForHealth` fallback, so the face cannot disagree
 * with the text beside it — the HUD's existing comment makes that promise about
 * the phase, and a portrait is a more conspicuous way to break it than a number.
 *
 * Ordered most-specific first, mirroring the text's precedence:
 *
 *   telegraphing  angry        mid-wind-up, about to slam
 *   summoned      determined   has called backup and committed
 *   phase 3       hurt         below 34% health: wounded, not posturing
 *   otherwise     neutral      pursuing, nothing special to say
 *
 * `surprised` and `afraid` are deliberately unused. No existing state means
 * either one, and inventing a flag to justify using them would be writing
 * gameplay to fit the art rather than the reverse. They stay available for a
 * future encounter that actually has those beats.
 */
export function bossPortraitExpression(boss: EnemyState): PortraitExpression {
  if (boss.phase === 'telegraph') return 'angry';
  if (boss.bossSummoned === true) return 'determined';
  if ((boss.bossPhase ?? bossPhaseForHealth(boss.health)) === 3) return 'hurt';
  return 'neutral';
}
