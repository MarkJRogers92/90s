/** A measured palm/wrist attachment point in the displayed source frame.
 *
 * Coordinates are local source pixels, before actor origin, scale or rotation.
 * `behind` follows the BODY DRAWN IN THE PNG, never the weapon aim or row name.
 * See art/weapon-grips/README.md for source reuse and hidden-hand limitations.
 */
export type HandAnchor = {
  readonly x: number;
  readonly y: number;
  readonly behind: boolean;
  /** A tiny original-pixel crop that may be redrawn above the held item. */
  readonly handPatch?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Palm is covered by the body; the attachment is inferred inside that cover. */
  readonly occluded?: boolean;
};

function hand(x: number, y: number, behind = false, patch = false, occluded = false): HandAnchor {
  return { x, y, behind,
    ...(patch ? { handPatch: { x: x - 1, y: y - 1, width: 3, height: 3 } } : {}),
    ...(occluded ? { occluded: true } : {}),
  };
}

/** Exact texture frame layout: idle [row 0][facing], animations [facing][column]. */
export const ALEX_HAND_ANCHORS: Readonly<Record<string, readonly (readonly HandAnchor[])[]>> = {
  'neon:player:alex-idle': [
    [hand(18, 40, false, true), hand(40, 40, false, true), hand(31, 40, false, true), hand(21, 40, true, true), hand(19, 39, true, true), hand(41, 40, true, true), hand(30, 40, false, true), hand(22, 40, false, true)],
  ],
  'neon:player:alex-walk': [
    [hand(26, 41, false, true), hand(27, 41, false, false), hand(25, 41, false, true), hand(25, 41, false, true), hand(24, 38, false, true), hand(25, 38, false, true)],
    [hand(37, 43, false, true), hand(40, 41, false, true), hand(40, 41, false, true), hand(38, 43, false, true), hand(33, 42, false, true), hand(34, 42, false, true)],
    [hand(31, 44, false, true), hand(36, 43, false, false), hand(36, 42, false, false), hand(30, 43, false, true), hand(24, 41, false, true), hand(26, 41, false, false)],
    [hand(26, 42, true, true), hand(31, 44, true, true), hand(31, 44, true, true), hand(26, 43, true, true), hand(22, 39, true, true), hand(22, 40, true, true)],
    [hand(25, 41, true, true), hand(26, 42, true, false), hand(26, 42, true, true), hand(24, 40, true, true), hand(24, 38, true, true), hand(24, 38, true, true)],
    [hand(37, 42, true, true), hand(40, 41, true, true), hand(39, 41, true, true), hand(36, 44, true, true), hand(32, 42, true, true), hand(32, 43, true, true)],
    [hand(33, 44, false, true), hand(37, 43, false, true), hand(34, 42, false, true), hand(30, 43, false, true), hand(26, 42, false, true), hand(26, 42, false, true)],
    [hand(29, 43, false, true), hand(32, 42, false, false), hand(30, 44, false, false), hand(26, 43, false, true), hand(22, 41, false, true), hand(23, 42, false, true)],
  ],
  'neon:player:alex-swing': [
    [hand(32, 54, false, true), hand(34, 54, false, true), hand(41, 52, false, true), hand(47, 46, false, true), hand(47, 44, false, true), hand(46, 47, false, true), hand(46, 50, false, true)],
    [hand(45, 54, false, true), hand(41, 53, false, true), hand(33, 51, false, true), hand(31, 43, false, true), hand(33, 45, false, true), hand(46, 49, false, true), hand(50, 49, false, true)],
    [hand(45, 54, false, true), hand(41, 53, false, true), hand(33, 51, false, true), hand(31, 43, false, true), hand(33, 45, false, true), hand(46, 49, false, true), hand(50, 49, false, true)],
    [hand(32, 53, true, true), hand(32, 52, true, true), hand(33, 49, true, true), hand(37, 42, true, false, true), hand(25, 43, true, true), hand(29, 38, true, true), hand(27, 44, true, true)],
    [hand(32, 53, true, true), hand(32, 52, true, true), hand(33, 49, true, true), hand(37, 42, true, false, true), hand(25, 43, true, true), hand(29, 38, true, true), hand(27, 44, true, true)],
    [hand(32, 53, true, true), hand(32, 52, true, true), hand(33, 49, true, true), hand(37, 42, true, false, true), hand(25, 43, true, true), hand(29, 38, true, true), hand(27, 44, true, true)],
    [hand(46, 54, false, true), hand(50, 53, false, true), hand(58, 51, false, true), hand(60, 43, false, true), hand(58, 45, false, true), hand(45, 49, false, true), hand(41, 49, false, true)],
    [hand(32, 54, false, true), hand(34, 54, false, true), hand(41, 52, false, true), hand(47, 46, false, true), hand(47, 44, false, true), hand(46, 47, false, true), hand(46, 50, false, true)],
  ],
  'neon:player:alex-aim': [
    [hand(33, 48, false, true), hand(33, 39, false, true), hand(35, 26, false, false), hand(35, 29, false, false)],
    [hand(53, 48, false, true), hand(44, 45, false, true), hand(36, 26, false, true), hand(37, 28, false, true)],
    [hand(35, 41, false, false), hand(24, 29, false, true), hand(23, 26, false, true), hand(24, 27, false, true)],
    [hand(33, 46, true, true), hand(26, 37, true, true), hand(22, 27, true, true), hand(22, 29, true, true)],
    [hand(33, 43, true, true), hand(35, 34, true, false, true), hand(37, 22, true, true), hand(38, 22, true, true)],
    [hand(58, 45, true, true), hand(63, 37, true, true), hand(61, 28, true, true), hand(62, 29, true, true)],
    [hand(47, 47, false, false), hand(57, 40, false, true), hand(59, 33, false, true), hand(59, 35, false, true)],
    [hand(37, 48, false, true), hand(44, 39, false, true), hand(50, 32, false, true), hand(51, 33, false, true)],
  ],
  'neon:player:alex-dash': [
    [hand(30, 47, false, true), hand(35, 44, false, true), hand(41, 34, false, false), hand(43, 41, false, true)],
    [hand(52, 46, false, true), hand(58, 46, false, true), hand(67, 33, false, true), hand(65, 31, false, true)],
    [hand(44, 47, false, true), hand(49, 47, false, true), hand(57, 36, false, true), hand(60, 34, false, true)],
    [hand(37, 48, true, true), hand(30, 46, true, true), hand(24, 32, true, true), hand(28, 27, true, true)],
    [hand(33, 46, true, true), hand(33, 44, true, true), hand(33, 42, true, true), hand(34, 44, true, true)],
    [hand(57, 49, true, true), hand(60, 47, true, true), hand(62, 36, true, false), hand(59, 36, true, false, true)],
    [hand(45, 49, false, true), hand(40, 48, false, true), hand(29, 44, false, false), hand(27, 43, false, true)],
    [hand(35, 50, false, true), hand(32, 49, false, true), hand(26, 42, false, true), hand(22, 41, false, true)],
  ],
  'neon:player:alex-hurt': [
    [hand(32, 54, false, true), hand(31, 54, false, true), hand(26, 51, false, true), hand(24, 46, false, true), hand(25, 43, false, true), hand(24, 47, false, true)],
    [hand(33, 47, false, true), hand(34, 45, false, true), hand(41, 35, false, true), hand(41, 35, false, true), hand(35, 40, false, true), hand(33, 49, false, true)],
    [hand(33, 47, false, true), hand(34, 45, false, true), hand(41, 35, false, true), hand(41, 35, false, true), hand(35, 40, false, true), hand(33, 49, false, true)],
    [hand(33, 47, false, true), hand(34, 45, false, true), hand(41, 35, false, true), hand(41, 35, false, true), hand(35, 40, false, true), hand(33, 49, false, true)],
    [hand(33, 47, false, true), hand(34, 45, false, true), hand(41, 35, false, true), hand(41, 35, false, true), hand(35, 40, false, true), hand(33, 49, false, true)],
    [hand(32, 54, false, true), hand(31, 54, false, true), hand(26, 51, false, true), hand(24, 46, false, true), hand(25, 43, false, true), hand(24, 47, false, true)],
    [hand(58, 47, false, true), hand(57, 45, false, true), hand(50, 35, false, true), hand(50, 35, false, true), hand(56, 40, false, true), hand(58, 49, false, true)],
    [hand(32, 54, false, true), hand(31, 54, false, true), hand(26, 51, false, true), hand(24, 46, false, true), hand(25, 43, false, true), hand(24, 47, false, true)],
  ],
  'presentation:actor:alex-idle': [
    [hand(7, 34, false, false), hand(22, 36, false, false), hand(19, 36, false, false), hand(9, 35, true, false), hand(7, 35, true, false), hand(22, 35, true, false), hand(11, 36, false, true), hand(9, 35, false, true)],
  ],
  'presentation:actor:alex-walk': [
    [hand(9, 35, false, true), hand(10, 35, false, false), hand(10, 34, false, false), hand(10, 35, false, true), hand(8, 34, false, false), hand(9, 33, false, false)],
    [hand(21, 37, false, false), hand(22, 36, false, false), hand(21, 36, false, true), hand(20, 37, false, false), hand(19, 36, false, true), hand(19, 37, false, true)],
    [hand(15, 39, false, false), hand(20, 37, false, false), hand(20, 36, false, false), hand(13, 38, false, false), hand(12, 36, false, false), hand(12, 38, false, false)],
    [hand(10, 38, true, true), hand(14, 39, true, true), hand(14, 38, true, true), hand(10, 38, true, false), hand(7, 37, true, false), hand(8, 36, true, false)],
    [hand(8, 36, true, false), hand(10, 37, true, false), hand(10, 37, true, false), hand(8, 36, true, false), hand(9, 35, true, false), hand(9, 33, true, false)],
    [hand(21, 37, true, false), hand(22, 37, true, false), hand(21, 37, true, false), hand(20, 36, true, false), hand(19, 38, true, false), hand(20, 38, true, false)],
    [hand(18, 37, false, true), hand(19, 37, false, false), hand(18, 38, false, true), hand(15, 39, false, false), hand(12, 38, false, true), hand(13, 38, false, false)],
    [hand(11, 36, false, false), hand(13, 37, false, false), hand(13, 38, false, true), hand(10, 36, false, false), hand(8, 35, false, true), hand(9, 36, false, true)],
  ],
};

/** Unknown/death sheets and invalid frames deliberately have no held-item anchor. */
export function alexHandAnchor(textureKey: string, frame: { row: number; column: number }): HandAnchor | null {
  if (!Number.isInteger(frame.row) || !Number.isInteger(frame.column)) return null;
  return ALEX_HAND_ANCHORS[textureKey]?.[frame.row]?.[frame.column] ?? null;
}
