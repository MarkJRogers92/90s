/**
 * Deterministic seeded draws for the M5 wing generator.
 *
 * The generator consumes this helper in one fixed order:
 *
 * 1. one room-variant index per combat room, in `WING_ROOM_ORDER`;
 * 2. one Fisher-Yates shuffle of the authored store-template list;
 * 3. one four-offer window start per storefront, in room order;
 * 4. for each regular combat room, one enemy-count draw, one Fisher-Yates
 *    shuffle of its authored slots, then one kind draw per selected slot with
 *    more than one authored kind, in authored slot order.
 *
 * No runtime randomness is used. The unsigned 32-bit seed and Mulberry32-style
 * integer mixing make the sequence identical on every platform.
 */

export type WingRng = {
  state: number;
};

const UINT32_RANGE = 0x1_0000_0000;

export function createWingRng(seed: number): WingRng {
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error(`Wing seed must be a finite integer; received ${seed}`);
  }
  return { state: seed >>> 0 };
}

export function nextUint32(rng: WingRng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

export function nextUnitFloat(rng: WingRng): number {
  return nextUint32(rng) / UINT32_RANGE;
}

export function nextInt(
  rng: WingRng,
  minimumInclusive: number,
  maximumInclusive: number,
): number {
  if (
    !Number.isInteger(minimumInclusive) ||
    !Number.isInteger(maximumInclusive) ||
    maximumInclusive < minimumInclusive
  ) {
    throw new Error(
      `Wing draw range must be ascending integers; received ${minimumInclusive}..${maximumInclusive}`,
    );
  }
  const span = maximumInclusive - minimumInclusive + 1;
  return minimumInclusive + Math.floor(nextUnitFloat(rng) * span);
}

/**
 * Returns a shuffled index list without mutating the source. Fisher-Yates
 * walks from the last index down to index 1, drawing one value per step.
 */
export function shuffleIndices(rng: WingRng, length: number): number[] {
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`Wing shuffle length must be a non-negative integer; received ${length}`);
  }
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, 0, index);
    const current = indices[index]!;
    indices[index] = indices[swapIndex]!;
    indices[swapIndex] = current;
  }
  return indices;
}
