/**
 * Round 58: pixel art for an extruded block, fitted to its collision exactly.
 *
 * A bar of collision that runs away from the camera cannot be dressed with
 * sprites (they all face the camera, and stacking them reads as a ladder), so
 * it is drawn as a 3/4 box instead: a top face lifted `lift` units above the
 * floor and the near end's front face below it, in one of a few materials.
 * Pure data, so the look is deterministic and testable; MallRoomView paints it.
 */
import type { Rect } from '../../../sim/model';
import type { BlockMaterial } from './roomDressing';

export type PixelRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: number };
export type BlockArt = { readonly top: readonly PixelRect[]; readonly front: readonly PixelRect[] };

const OUTLINE = 0x0c0a12;

/** A stable 0..1 value per cell, so the same block always gets the same leaves and specks. */
function cellNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Painter = (top: Rect, front: Rect, out: { top: PixelRect[]; front: PixelRect[] }, seed: number) => void;

const fill = (list: PixelRect[], x: number, y: number, width: number, height: number, color: number) => {
  if (width > 0 && height > 0) list.push({ x, y, width, height, color });
};

const PAINTERS: Readonly<Record<BlockMaterial, Painter>> = {
  // A mall's raised planter: a terracotta rim round a bed of leaves, a brick face.
  planterBed: (top, front, out, seed) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0xa8583a);
    fill(out.top, top.x, top.y, top.width, 1, 0xd08a5c);
    fill(out.top, top.x, top.y, 1, top.height, 0xc87a50);
    fill(out.top, top.x + 3, top.y + 3, top.width - 6, top.height - 6, 0x1d3f22);
    const leaves = [0x2f6a35, 0x46924a, 0x6cc062];
    for (let y = top.y + 3; y < top.y + top.height - 4; y += 2) {
      for (let x = top.x + 3; x < top.x + top.width - 4; x += 2) {
        const n = cellNoise(x, y, seed);
        if (n < 0.55) fill(out.top, x, y, 2, 2, leaves[Math.floor(n * 5.4) % 3]!);
      }
    }
    fill(out.front, front.x, front.y, front.width, front.height, 0x7a3a26);
    for (let row = 0, y = front.y + 4; y < front.y + front.height - 1; row += 1, y += 5) {
      fill(out.front, front.x, y, front.width, 1, 0x5a2a1c);
      for (let x = front.x + (row % 2 === 0 ? 4 : 9); x < front.x + front.width; x += 10) fill(out.front, x, y - 4, 1, 4, 0x5a2a1c);
    }
    fill(out.front, front.x, front.y, front.width, 1, 0xc87a50);
  },
  // Poured concrete with a scuffed top and hazard paint along the foot.
  concrete: (top, front, out, seed) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0x6b6b78);
    for (let y = top.y + 1; y < top.y + top.height - 1; y += 3) {
      for (let x = top.x + 1; x < top.x + top.width - 1; x += 3) {
        const n = cellNoise(x, y, seed);
        if (n < 0.18) fill(out.top, x, y, 1, 1, 0x5d5d69);
        else if (n > 0.9) fill(out.top, x, y, 1, 1, 0x80808e);
      }
    }
    fill(out.top, top.x, top.y, top.width, 1, 0x9a9aa8);
    fill(out.top, top.x, top.y, 1, top.height, 0x8a8a98);
    fill(out.front, front.x, front.y, front.width, front.height, 0x4a4a56);
    fill(out.front, front.x, front.y, front.width, 1, 0x7a7a88);
    const stripeTop = front.y + front.height - 7;
    for (let x = front.x; x < front.x + front.width; x += 4) {
      fill(out.front, x, stripeTop, Math.min(4, front.x + front.width - x), 6, ((x - front.x) / 4) % 2 === 0 ? 0xd8b030 : 0x1a1a1e);
    }
  },
  // A run of galvanised ductwork: seams and rivets every couple of feet.
  duct: (top, front, out) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0x7d8a9a);
    fill(out.top, top.x, top.y, top.width, 1, 0xb4c0ce);
    fill(out.top, top.x + top.width - 2, top.y, 2, top.height, 0x667282);
    for (let y = top.y + 12; y < top.y + top.height - 2; y += 22) {
      fill(out.top, top.x, y, top.width, 1, 0x5b6878);
      fill(out.top, top.x + 2, y + 2, 1, 1, 0xa8b4c2);
      fill(out.top, top.x + top.width - 4, y + 2, 1, 1, 0xa8b4c2);
    }
    fill(out.front, front.x, front.y, front.width, front.height, 0x58626f);
    fill(out.front, front.x, front.y, front.width, 1, 0x95a2b2);
    fill(out.front, front.x, front.y + front.height - 2, front.width, 2, 0x2e343c);
    for (let x = front.x + 3; x < front.x + front.width - 2; x += 8) fill(out.front, x, front.y + 4, 1, 1, 0xa8b4c2);
  },
  // The Upper Level's atrium: a chrome-railed opening, the floor below dim through it, glass at the front.
  balustrade: (top, front, out, seed) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0xc8d4e0);
    fill(out.top, top.x + 2, top.y + 2, top.width - 4, top.height - 4, 0x0e0b16);
    // The level below: a few lit tiles and a shopper's-eye glimmer of neon.
    for (let y = top.y + 6; y < top.y + top.height - 6; y += 6) {
      for (let x = top.x + 6; x < top.x + top.width - 6; x += 6) {
        const n = cellNoise(x, y, seed);
        fill(out.top, x, y, 5, 5, n < 0.12 ? 0x2a2440 : n > 0.94 ? 0x3a2a5a : 0x17121f);
      }
    }
    fill(out.top, top.x + 2, top.y + 2, top.width - 4, 2, 0x3ff0ff);
    fill(out.top, top.x, top.y, top.width, 1, 0xf0f6ff);
    fill(out.front, front.x, front.y, front.width, front.height, 0x2e4a66);
    fill(out.front, front.x, front.y, front.width, 2, 0xe0e8f0);
    for (let x = front.x + 6; x < front.x + front.width - 4; x += 18) {
      fill(out.front, x, front.y + 3, 1, front.height - 4, 0x8ab0d0);
      fill(out.front, x + 2, front.y + 5, 1, Math.max(1, front.height - 9), 0x5a7a98);
    }
    fill(out.front, front.x, front.y + front.height - 2, front.width, 2, 0x8a96a4);
  },
  // A concession stand's counter: cream laminate top, a red front with chrome trim.
  counter: (top, front, out) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0xe8dcc0);
    fill(out.top, top.x, top.y, top.width, 2, 0xfff4dc);
    fill(out.top, top.x, top.y + top.height - 3, top.width, 3, 0xc8b898);
    fill(out.front, front.x, front.y, front.width, front.height, 0xa82830);
    fill(out.front, front.x, front.y, front.width, 2, 0xd8dee6);
    fill(out.front, front.x, front.y + Math.floor(front.height / 2), front.width, 2, 0xf0c040);
    for (let x = front.x + 30; x < front.x + front.width - 10; x += 60) fill(out.front, x, front.y + 3, 2, front.height - 4, 0x7a1820);
    fill(out.front, front.x, front.y + front.height - 3, front.width, 3, 0x3a1014);
  },
  // The water tower's legs: riveted steel girder, weathered red.
  steel: (top, front, out) => {
    fill(out.top, top.x, top.y, top.width, top.height, 0xc05a40);
    fill(out.top, top.x + 3, top.y + 3, top.width - 6, top.height - 6, 0x7a3020);
    fill(out.top, top.x, top.y, top.width, 1, 0xe88a68);
    fill(out.front, front.x, front.y, front.width, front.height, 0xa8462e);
    fill(out.front, front.x, front.y, 2, front.height, 0xd0684a);
    fill(out.front, front.x + front.width - 3, front.y, 3, front.height, 0x5a2214);
    for (let y = front.y + 6; y < front.y + front.height - 3; y += 10) {
      fill(out.front, front.x + 4, y, front.width - 8, 1, 0x5a2214);
      fill(out.front, front.x + 5, y + 3, 1, 1, 0xd08a6a);
      fill(out.front, front.x + front.width - 7, y + 3, 1, 1, 0xd08a6a);
    }
  },
};

/** The pixels of one block: its top face and the near end's face, outlined. */
export function blockArt(material: BlockMaterial, covers: Rect, lift: number, seed = 0): BlockArt {
  const x = Math.round(covers.x);
  const width = Math.round(covers.width);
  const base = Math.round(covers.y + covers.height);
  const top: Rect = { x, y: Math.round(covers.y) - lift, width, height: Math.round(covers.height) };
  const front: Rect = { x, y: base - lift, width, height: lift };
  const out = { top: [] as PixelRect[], front: [] as PixelRect[] };
  // The outline goes down first so every face paints over its inner edge.
  fill(out.top, x - 1, top.y - 1, width + 2, top.height + 1, OUTLINE);
  fill(out.front, x - 1, front.y, width + 2, lift + 1, OUTLINE);
  PAINTERS[material](top, front, out, seed);
  return out;
}
