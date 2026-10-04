// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { inflateSync } from 'node:zlib';

export interface Png { width: number; height: number; data: Uint8Array }

/** Decodes a non-interlaced 8-bit RGBA PNG, which is every sprite sheet in public/assets/neon. */
export function decodePng(bytes: Uint8Array): Png {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, offset = 8;
  const parts: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('only non-interlaced 8-bit RGBA PNGs are supported');
    } else if (type === 'IDAT') parts.push(body);
    offset += 12 + length;
  }
  const compressed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { compressed.set(part, at); at += part.length; }
  const raw = inflateSync(compressed) as Uint8Array;
  const stride = width * 4, data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= 4 ? data[y * stride + x - 4]! : 0;
      const b = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0;
      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = a; break;
        case 2: predictor = b; break;
        case 3: predictor = (a + b) >> 1; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      data[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, data };
}

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** The opaque bounding box of one frame cell, or null when the cell is empty. */
export function frameBounds(png: Png, column: number, row: number, frame: number): Bounds | null {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = 0; y < frame; y++) {
    for (let x = 0; x < frame; x++) {
      if (png.data[((row * frame + y) * png.width + column * frame + x) * 4 + 3]! === 0) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}
