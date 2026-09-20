#!/usr/bin/env python3
"""Extract the DEAD MALL global palette from the approved board's swatch panel.

Board: docs/art/reference-sheets/approved-2026-09-13/originals/01A_player_palette_portraits.png
       1536x1024, a rendered (not vector) board, so swatches are flat-ish but not
       mathematically flat.  Therefore every value is reported WITH the measured
       within-swatch spread, which is the honest error bar rather than 0.

Method: detect the 19 label rows from the label column (every row has text, so
dark swatch rows are not missed the way a swatch-brightness scan misses them),
detect the 5 swatch columns from the brightest row, then take the MEDIAN of each
swatch interior after eroding the edges.

Usage: python3 extract_swatches.py BOARD.png --gpl OUT.gpl --strip OUT.png
"""
from __future__ import annotations

import argparse
import json
import sys

import numpy as np
from PIL import Image

RAMP_NAMES = [
    "SKIN TONES", "HAIR (BROWN)", "HAIR (BLONDE)", "HAIR (BLACK)", "DENIM",
    "COTTON/FABRIC", "LEATHER", "PLASTIC (COLORED)", "PLASTIC (BLACK)",
    "METAL (STEEL)", "BRASS/GOLD", "MALL BEIGE/CREAM", "TILE GRAY", "SHADOWS",
    "BLOOD/GORE", "CORRUPTION (PURPLE)", "CORRUPTION (GREEN)",
    "FLUORESCENT LIGHT", "EMERGENCY RED",
]
PANEL = {"y0": 95, "y1": 725, "label_x0": 25, "label_x1": 150,
         "swatch_x0": 150, "swatch_x1": 275}
LABEL_LUM = 100          # label glyphs are bright text on a dark panel
SWATCH_LUM = 45          # a swatch is brighter than the panel background
ERODE = 4                # px trimmed from each swatch edge before sampling
EXPECTED_COLUMNS = 5     # the board draws five steps per ramp


def bands(profile: np.ndarray, min_len: int = 5) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start: int | None = None
    for index, value in enumerate(profile):
        if value and start is None:
            start = index
        elif not value and start is not None:
            if index - start >= min_len:
                out.append((start, index - 1))
            start = None
    if start is not None:
        out.append((start, len(profile) - 1))
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("board")
    parser.add_argument("--gpl")
    parser.add_argument("--strip")
    parser.add_argument("--json")
    args = parser.parse_args(argv)

    image = Image.open(args.board).convert("RGB")
    full = np.asarray(image).astype(int)
    lum = 0.299 * full[:, :, 0] + 0.587 * full[:, :, 1] + 0.114 * full[:, :, 2]

    panel = lum[PANEL["y0"]:PANEL["y1"], :]
    offset = PANEL["y0"]

    # --- rows: from the LABEL column, so near-black swatch rows still register
    label = panel[:, PANEL["label_x0"]:PANEL["label_x1"]]
    row_profile = (label > LABEL_LUM).sum(axis=1) > 2
    row_bands = bands(row_profile, min_len=8)

    # The panel also contains a title line and a bottom border, so there are more
    # bands than ramps.  The ramps are the ones in even arithmetic progression;
    # pick them by geometry rather than by position, so an off-by-one cannot
    # silently shift every ramp name onto the wrong row.
    centres = [(a + b) // 2 + offset for a, b in row_bands]
    heights = [b - a + 1 for a, b in row_bands]
    diffs = [centres[i + 1] - centres[i] for i in range(len(centres) - 1)]
    pitch = int(np.median(diffs)) if diffs else 0
    wanted = len(RAMP_NAMES)
    # A ramp band is a line of label text (~8-11px).  Panel rules are thin lines
    # (1-4px).  Rejecting sub-half-height bands breaks the pitch tie between the
    # window that starts at the first ramp and the one that ends on the rule.
    min_height = max(4, int(0.4 * float(np.median(heights))))
    candidates = [
        s for s in range(len(centres) - wanted + 1)
        if all(abs(centres[s + i + 1] - centres[s + i] - pitch) <= 4 for i in range(wanted - 1))
        and all(heights[s + i] >= min_height for i in range(wanted))
    ]
    print(f"row bands detected: {len(row_bands)} (expected {wanted} ramps + "
          f"{len(row_bands) - wanted} panel furniture); pitch ~{pitch}px")
    print("   band heights: " + " ".join(str(h) for h in heights))
    if len(candidates) != 1:
        print(f"!! {len(candidates)} candidate progressions {candidates} -- refusing to guess",
              file=sys.stderr)
        return 2
    start = candidates[0]
    row_bands = row_bands[start:start + wanted]
    row_centres = centres[start:start + wanted]
    print(f"   selected bands {start}..{start + wanted - 1} as the 19 ramps "
          f"(y {row_centres[0]}..{row_centres[-1]})")
    for name, centre in zip(RAMP_NAMES, row_centres):
        print(f"   y={centre:4d}  {name}")

    # --- columns: vote across the brightest rows.  A single test row is not
    # enough: a ramp whose 5th swatch is dark in that row silently loses the
    # column and every value then reads one swatch too dark.
    swatch = panel[:, PANEL["swatch_x0"]:PANEL["swatch_x1"]]
    brightness = [(swatch[a:b] > SWATCH_LUM).sum() for a, b in row_bands]
    brightest = sorted(range(len(row_bands)), key=lambda i: -brightness[i])[:6]
    col_mask = np.zeros(swatch.shape[1], dtype=bool)
    for i in brightest:
        col_mask |= (swatch[row_bands[i][0]:row_bands[i][1]] > SWATCH_LUM).sum(axis=0) > 2
    col_bands = bands(col_mask, min_len=6)
    col_centres = [(a + b) // 2 + PANEL["swatch_x0"] for a, b in col_bands]
    print(f"column bands detected by brightness: {len(col_centres)} "
          f"at {col_centres}, voting over rows "
          f"{[RAMP_NAMES[i] for i in brightest]}")
    if len(col_centres) > EXPECTED_COLUMNS:
        print("!! more columns than expected -- refusing to sample a merged grid", file=sys.stderr)
        return 2
    # The LAST step of every ramp is the darkest, so it can fall below any
    # brightness threshold in every row at once and the column is lost.  That is
    # structural, not a tuning problem: recover it from the regular pitch
    # instead.  A mis-placed centre would straddle two swatches, which the
    # spread check after sampling then catches.
    if len(col_centres) < EXPECTED_COLUMNS:
        if len(col_centres) < 2:
            print("!! too few columns to infer a pitch", file=sys.stderr)
            return 2
        col_pitch = int(round(float(np.median(
            [col_centres[i + 1] - col_centres[i] for i in range(len(col_centres) - 1)]))))
        while len(col_centres) < EXPECTED_COLUMNS:
            col_centres.append(col_centres[-1] + col_pitch)
        print(f"   the darkest step is invisible to any threshold; extrapolated to "
              f"{EXPECTED_COLUMNS} columns at pitch {col_pitch}: {col_centres}")
    if max(col_centres) >= PANEL["swatch_x1"]:
        print(f"!! extrapolated column {max(col_centres)} leaves the swatch band "
              f"(<{PANEL['swatch_x1']}) -- refusing", file=sys.stderr)
        return 2

    # --- sample each swatch interior
    half_h = max(2, min((b - a) for a, b in row_bands) // 2 - ERODE)
    grid: list[list[dict]] = []
    for index, (name, row_y) in enumerate(zip(RAMP_NAMES, row_centres)):
        entry = []
        for col_x in col_centres:
            patch = full[row_y - half_h:row_y + half_h + 1, col_x - half_h:col_x + half_h + 1]
            flat = patch.reshape(-1, 3)
            median = np.median(flat, axis=0).astype(int)
            spread = int(np.abs(flat - median).max())
            entry.append({
                "rgb": [int(v) for v in median],
                "hex": "#%02x%02x%02x" % tuple(int(v) for v in median),
                "spread": spread,
            })
        grid.append({"ramp": name, "swatches": entry})

    worst = max(s["spread"] for row in grid for s in row["swatches"])
    mean_spread = np.mean([s["spread"] for row in grid for s in row["swatches"]])
    print(f"sampled {len(grid) * len(col_centres)} swatches; "
          f"within-swatch spread mean {mean_spread:.1f}, worst {worst} "
          f"(0 = perfectly flat render)")
    # Self-check on the grid: a centre sitting on a swatch boundary straddles two
    # colours and its spread jumps.  Per-column means should be comparable.
    per_column = [np.mean([row["swatches"][c]["spread"] for row in grid])
                  for c in range(len(col_centres))]
    print("   mean spread per column: "
          + " ".join(f"{value:.1f}" for value in per_column))
    if max(per_column) > 3 * min(per_column) + 2:
        print("!! one column is far noisier than the rest -- a centre is probably "
              "off the swatch; check the strip before trusting these values",
              file=sys.stderr)

    if args.gpl:
        lines = ["GIMP Palette", "Name: DEAD MALL global (sampled from 01A)", f"Columns: {len(col_centres)}", "#"]
        for row in grid:
            for swatch in row["swatches"]:
                r, g, b = swatch["rgb"]
                lines.append(f"{r:3d} {g:3d} {b:3d}\t{swatch['hex']}")
        with open(args.gpl, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
        print(f"wrote {args.gpl}")

    if args.strip:
        cell, pad = 26, 2
        strip = Image.new("RGB", (len(col_centres) * (cell + pad) + pad,
                                  len(grid) * (cell + pad) + pad), (18, 18, 22))
        for ri, row in enumerate(grid):
            for ci, swatch in enumerate(row["swatches"]):
                x = pad + ci * (cell + pad)
                y = pad + ri * (cell + pad)
                block = Image.new("RGB", (cell, cell), tuple(swatch["rgb"]))
                strip.paste(block, (x, y))
        strip = strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST)
        strip.save(args.strip)
        print(f"wrote {args.strip}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump({"source": args.board, "grid": grid,
                       "mean_spread": float(mean_spread), "worst_spread": int(worst)},
                      handle, indent=2)
        print(f"wrote {args.json}")

    for row in grid:
        print(f"{row['ramp']:<20} " + " ".join(f"{s['hex']}(±{s['spread']})" for s in row["swatches"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
