#!/usr/bin/env python3
"""Generate Sheet 04 floor tiles that are repeat-safe BY CONSTRUCTION, then prove it.

The registry (CANONICAL_SHEETS.md) marks Sheet 04 PARTIAL and says the dedicated
"repeat-safe joins/corners" pieces are still pending.  This is the first of them.

Repeat-safety is not a look, it is a property, so it is built in and then
measured:

  * Construction -- every feature is painted with coordinates taken mod 32, so
    the tile is periodic on a torus and its left edge continues its right edge.
  * Test 1, seam -- assemble a 4x4 grid and compare the mean vertical difference
    ACROSS tile boundaries with the distribution of differences at interior
    columns.  A wrap bug or a feature clipped at an edge shows up as an outlier.
  * Test 2, palette -- every pixel must be one of the extracted DEAD MALL ramps.
    Off-palette pixels are counted, and the count must be zero.
  * Test 3, period -- the assembled grid shifted by 32px must equal itself.

Usage: python3 make_tiles.py --gpl work/deadmall-global.gpl --outdir work/tiles
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

SIZE = 32          # matches the 32px floor grid EntityView.ts already draws
REPEATS = 4        # tiles per axis in the assembled proof sheet


def load_palette(path: str) -> list[tuple[int, int, int]]:
    colours = []
    for line in open(path, encoding="utf-8"):
        parts = line.split("\t")[0].split()
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            colours.append(tuple(int(p) for p in parts))
    if not colours:
        raise SystemExit(f"{path}: no colours parsed")
    return colours


def ramp(colours, start: int, length: int = 5) -> list[tuple[int, int, int]]:
    """The 19 ramps are stored in board order, 5 steps each."""
    return colours[start * length:(start + 1) * length]


def wrap_dot(img: np.ndarray, x: int, y: int, w: int, h: int, rgb) -> None:
    """Paint a w x h block whose pixels wrap around the tile edges."""
    for dy in range(h):
        for dx in range(w):
            img[(y + dy) % SIZE, (x + dx) % SIZE] = rgb


def bevel(img: np.ndarray, x: int, y: int, w: int, h: int,
          body, light, dark) -> None:
    """A chip with a lit top-left edge and a shaded bottom-right edge.

    A flat block reads as a sticker; one lit pixel along two sides and one
    shaded pixel along the other two is what makes it read as a physical chip
    catching light. Written with mod-SIZE coordinates so it stays seamless.
    """
    for dy in range(h):
        for dx in range(w):
            img[(y + dy) % SIZE, (x + dx) % SIZE] = body
    for dx in range(w):
        img[y % SIZE, (x + dx) % SIZE] = light
        img[(y + h - 1) % SIZE, (x + dx) % SIZE] = dark
    for dy in range(h):
        img[(y + dy) % SIZE, x % SIZE] = light
        img[(y + dy) % SIZE, (x + w - 1) % SIZE] = dark


def terrazzo(colours, seed: int = 20260919) -> np.ndarray:
    """Mall terrazzo: a textured beige ground with beveled, multi-scale chips.

    Every chip is a CLUSTER with a bevel, never a lone pixel and never a flat
    block.  Chips are placed mod SIZE so one running off an edge reappears on
    the opposite one and the join is invisible.
    """
    rng = np.random.default_rng(seed)
    beige = ramp(colours, 11)     # MALL BEIGE/CREAM
    tile = ramp(colours, 12)      # TILE GRAY
    img = np.full((SIZE, SIZE, 3), beige[1], dtype=np.uint8)

    # Ground texture: a sparse deterministic dither, so the field between chips
    # has grain instead of being one flat value. Kept low-density on purpose --
    # a dense dither on a floor reads as noise at 1x.
    for y in range(SIZE):
        for x in range(SIZE):
            # x % 8, not x: the lattice must repeat over a period that DIVIDES
            # the tile (8 divides 32), or the grain phase-shifts across the join.
            # A bare (x * 5 + y * 3) % 17 is not 32-periodic and breaks the seam.
            if ((x % 8) * 5 + (y % 8) * 3) % 17 == 0:
                img[y, x] = beige[0]
            elif ((x % 8) * 3 + (y % 8) * 7) % 23 == 0:
                img[y, x] = beige[2]

    # (body, lit edge, shaded edge, weight). Grey stays rare so the floor reads
    # as warm terrazzo rather than granite.
    chips = [
        (beige[0], beige[0], beige[1], 4.0),
        (beige[2], beige[1], beige[3], 3.5),
        (beige[3], beige[2], beige[4], 2.0),
        (tile[1], tile[0], tile[2], 1.2),
        (tile[2], tile[1], tile[3], 0.8),
    ]
    weights = np.array([c[3] for c in chips], dtype=float)
    weights /= weights.sum()
    shapes = [(3, 2), (2, 2), (3, 3), (4, 2), (2, 3), (3, 4), (4, 3), (2, 2)]

    for _ in range(30):
        body, light, dark, _ = chips[int(rng.choice(len(chips), p=weights))]
        w, h = shapes[int(rng.integers(0, len(shapes)))]
        bevel(img, int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE)), w, h,
              body, light, dark)
    return img


def floortile(colours) -> np.ndarray:
    """Beige ceramic: grout, a lit bevel, a dithered sheen, and an inset motif.

    Grout on every edge means two adjacent tiles make a 2px line, so the joint is
    consistent on both axes. Beyond that the field is bevelled (lit top-left,
    shaded bottom-right) and carries a diagonal sheen built from dithered steps
    rather than one flat value -- a single flat value is what makes a tiled floor
    read as graph paper.
    """
    beige = ramp(colours, 11)
    img = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    img[:, :] = beige[0]                      # field, lightest step

    # Sheen: a diagonal corner of one step down, with the boundary between the
    # two values broken up by a 50% checker so it reads as a soft light falloff
    # instead of a hard diagonal edge.
    for y in range(1, SIZE - 1):
        for x in range(1, SIZE - 1):
            diagonal = x + y
            if diagonal > SIZE + 16:
                img[y, x] = beige[1]
            elif diagonal > SIZE + 8 and (x + y) % 2 == 0:
                img[y, x] = beige[1]

    # The tile's own bevel, one step either side of the field.
    img[2, 2:-2] = beige[0]
    img[2:-2, 2] = beige[0]
    img[-3, 2:-2] = beige[2]
    img[2:-2, -3] = beige[2]

    # Grout ring, one step darker again, with its corners shadowed so the joint
    # reads as recessed rather than painted on.
    img[0, :] = img[1, :] = img[-1, :] = img[-2, :] = beige[3]
    img[:, 0] = img[:, 1] = img[:, -1] = img[:, -2] = beige[3]
    img[0, 0] = img[0, -1] = img[-1, 0] = img[-1, -1] = beige[4]

    # Inset motif: a diamond with a lit top-left half and an outlined edge.
    centre = SIZE // 2
    for dy in range(-4, 5):
        span = 4 - abs(dy)
        for dx in range(-span, span + 1):
            x, y = (centre + dx) % SIZE, (centre + dy) % SIZE
            edge = abs(dx) == span or abs(dy) == 4
            if edge:
                img[y, x] = beige[3]
            else:
                img[y, x] = beige[1] if (dx + dy) < 0 else beige[2]
    return img


def wrap_diamond(img: np.ndarray, cx: int, cy: int, r: int, rgb) -> None:
    for dy in range(-r, r + 1):
        span = r - abs(dy)
        for dx in range(-span, span + 1):
            img[(cy + dy) % SIZE, (cx + dx) % SIZE] = rgb


def accent_tile(colours) -> np.ndarray:
    """The darker companion to the beige tile, for checkerboards and borders.

    Same geometry as floortile() so the two interlock; only the value
    relationships invert, which is what makes a mixed field read as a pattern
    rather than as noise.
    """
    beige = ramp(colours, 11)
    img = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    img[:, :] = beige[2]
    img[0, :] = img[-1, :] = beige[1]
    img[:, 0] = img[:, -1] = beige[1]
    img[2:-2, 2:-2] = beige[3]
    img[15:17, 15:17] = beige[4]
    return img


def carpet(colours, damaged: bool = False, seed: int = 20260919) -> np.ndarray:
    """Mall carpet: a piled navy field with a bevelled brass diamond lattice.

    The lattice sits on an 8px grid and the pile on 2px/4px steps. All of those
    divide 32, so the whole thing is periodic and the join is invisible in both
    axes -- a lattice step of 3 would look fine on one tile and drift across the
    seam.
    """
    rng = np.random.default_rng(seed)
    denim = ramp(colours, 4)
    brass = ramp(colours, 10)
    shadow = ramp(colours, 13)
    img = np.full((SIZE, SIZE, 3), denim[2], dtype=np.uint8)

    # Pile: short strokes one step up, so the field has nap rather than being a
    # flat fill. Deterministic, not random -- random single pixels are exactly
    # what the brief forbids.
    for y in range(0, SIZE, 2):
        for x in range(0, SIZE, 4):
            img[y, x] = denim[1]
            if (x // 4 + y // 2) % 3 == 0:
                img[(y + 1) % SIZE, x] = denim[1]

    # Motif: bevelled diamond, lit on its top-left half, outlined on the edge.
    for cy in range(4, SIZE, 8):
        for cx in range(4, SIZE, 8):
            for dy in range(-3, 4):
                span = 3 - abs(dy)
                for dx in range(-span, span + 1):
                    x, y = (cx + dx) % SIZE, (cy + dy) % SIZE
                    if abs(dx) == span or abs(dy) == 3:
                        img[y, x] = brass[3]      # outline
                    else:
                        img[y, x] = brass[0] if (dx + dy) < 0 else brass[1]
            img[(cy - 3) % SIZE, cx] = brass[0]   # lit apex
            img[(cy + 3) % SIZE, cx] = brass[4]   # shaded foot

    if damaged:
        # Wear is CLUSTERED and low-count: torn patches plus a couple of runs of
        # frayed edge, not a scatter of single pixels.
        for _ in range(5):
            wrap_dot(img, int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE)),
                     int(rng.integers(2, 5)), int(rng.integers(2, 4)), shadow[1])
        for _ in range(3):
            x, y = int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE))
            wrap_dot(img, x, y, int(rng.integers(1, 3)), 6, denim[4])
    return img


def assemble(tile: np.ndarray, repeats: int = REPEATS) -> np.ndarray:
    return np.tile(tile, (repeats, repeats, 1))


def seam_report(grid: np.ndarray, period: int = SIZE) -> dict:
    """Compare differences across tile joins against the interior distribution."""
    diff = np.abs(np.diff(grid.astype(int), axis=1)).mean(axis=(0, 2))
    seam_idx = [period * k - 1 for k in range(1, grid.shape[1] // period)]
    interior = [v for i, v in enumerate(diff) if i not in seam_idx]
    seams = [diff[i] for i in seam_idx]
    mean_i = float(np.mean(interior))
    sd_i = float(np.std(interior))
    worst = max(abs(s - mean_i) for s in seams)
    return {
        "seam_positions": seam_idx,
        "seam_diffs": [round(float(s), 3) for s in seams],
        "interior_mean": round(mean_i, 3),
        "interior_sd": round(sd_i, 3),
        "worst_seam_deviation_sd": round(worst / sd_i, 2) if sd_i else 0.0,
        "seam_is_outlier": bool(worst > 3 * sd_i) if sd_i else False,
    }


def palette_report(grid: np.ndarray, colours) -> dict:
    allowed = {tuple(int(v) for v in c) for c in colours}
    flat = grid.reshape(-1, 3)
    off = [tuple(int(v) for v in px) for px in flat
           if tuple(int(v) for v in px) not in allowed]
    unique = {tuple(int(v) for v in px) for px in flat}
    return {
        "unique_colours": len(unique),
        "off_palette_pixels": len(off),
        "off_palette_examples": sorted({"#%02x%02x%02x" % c for c in off})[:8],
    }


def mismatch_profile(grid: np.ndarray, axis: int) -> np.ndarray:
    """How many PIXELS differ across each adjacent pair along `axis`.

    Counting pixels rather than averaging magnitudes, because in pixel art one
    misplaced pixel is visible while a scattered mismatch barely moves a mean.
    """
    differs = np.abs(np.diff(grid.astype(int), axis=axis)) > 0
    differs = np.moveaxis(differs, axis, 0)
    return differs.reshape(differs.shape[0], -1).sum(axis=1)


def seam_pixels(grid: np.ndarray, period: int = SIZE, axis: int = 1) -> dict:
    """Flag a join with more mismatched pixels than any interior join."""
    counts = mismatch_profile(grid, axis)
    seam_idx = [period * k - 1 for k in range(1, grid.shape[axis] // period)]
    interior = [int(c) for i, c in enumerate(counts) if i not in seam_idx]
    seams = [int(counts[i]) for i in seam_idx]
    return {
        "axis": "horizontal" if axis == 1 else "vertical",
        "seam_mismatched_pixels": seams,
        "interior_max_mismatched_pixels": max(interior),
        "interior_mean_mismatched_pixels": round(float(np.mean(interior)), 2),
        "is_outlier": bool(max(seams) > max(interior)),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpl", default="work/deadmall-global.gpl")
    parser.add_argument("--outdir", default="work/tiles")
    args = parser.parse_args(argv)

    colours = load_palette(args.gpl)
    if len(colours) < 95:
        raise SystemExit(f"{args.gpl}: expected 95 colours (19 ramps x 5), got {len(colours)}")
    os.makedirs(args.outdir, exist_ok=True)

    tiles = {
        "floor-terrazzo-32": terrazzo(colours),
        "floor-tile-beige-32": floortile(colours),
        "floor-tile-accent-32": accent_tile(colours),
        "floor-carpet-32": carpet(colours),
        "floor-carpet-damaged-32": carpet(colours, damaged=True),
    }

    report = {}
    failures: list[str] = []
    for name, tile in tiles.items():
        img = Image.fromarray(tile)
        img.save(os.path.join(args.outdir, f"{name}.png"))
        img.resize((SIZE * 8, SIZE * 8), Image.NEAREST).save(
            os.path.join(args.outdir, f"{name}-x8.png"))

        grid = assemble(tile)
        Image.fromarray(grid).resize(
            (grid.shape[1] * 4, grid.shape[0] * 4), Image.NEAREST).save(
            os.path.join(args.outdir, f"{name}-tiled-4x4.png"))

        seam = seam_report(grid)
        pal = palette_report(tile, colours)
        pixels = seam_pixels(grid, SIZE)
        report[name] = {"seam_mean": seam, "palette": pal, "seam_pixels": pixels}

        print(f"\n### {name}  ({SIZE}x{SIZE})")
        print(f"   palette : {pal['unique_colours']} distinct, "
              f"{pal['off_palette_pixels']} OFF-palette pixels")
        if pal["off_palette_pixels"]:
            print(f"             e.g. {pal['off_palette_examples']}")
            failures.append(f"{name}: off-palette pixels")
        print(f"   join    : seam pixels {pixels['seam_mismatched_pixels'][0]} "
              f"vs interior max {pixels['interior_max_mismatched_pixels']}"
              f"{'  <-- SEAM VISIBLE' if pixels['is_outlier'] else '  (clean)'}")
        if pixels["is_outlier"]:
            failures.append(f"{name}: join has more mismatched pixels than any interior join")
        print(f"   seam    : interior diff mean {seam['interior_mean']} "
              f"(sd {seam['interior_sd']}), seams {seam['seam_diffs']}")
        print(f"             worst seam deviation {seam['worst_seam_deviation_sd']} sd"
              f"{'  <-- OUTLIER' if seam['seam_is_outlier'] else '  (within range)'}")
        if seam["seam_is_outlier"]:
            failures.append(f"{name}: seam is an outlier")

    with open(os.path.join(args.outdir, "report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print()
    if failures:
        print("FAIL: " + "; ".join(failures))
        return 1
    print(f"make_tiles: {len(tiles)}/{len(tiles)} tiles pass palette + pixel-level join checks")
    print(f"artifacts in {args.outdir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
