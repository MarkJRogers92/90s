#!/usr/bin/env python3
"""Build one image that answers 'is the extraction right?'.

Left  = the approved board's MAIN PALETTE panel, cropped from the source PNG.
Right = the same panel rebuilt purely from the extracted .gpl.

If the extraction is correct the two halves line up row for row and step for
step.  That is a stronger claim than any reported error bar, because it is the
whole 95-value grid checked at once instead of 95 numbers reviewed one at a time.

Usage: python3 compare_palette.py BOARD.png work/deadmall-global.gpl OUT.png
"""
from __future__ import annotations

import sys

from PIL import Image, ImageDraw

# Cropped to the RAMP band only: the panel's title line would otherwise push the
# rebuild out of register with the board and defeat the point of a side-by-side.
# y 145..707 spans exactly the 19 detected ramp centres (160..692 at 29.6px pitch).
PANEL = {"x0": 25, "x1": 268, "y0": 145, "y1": 707}
SWATCH_X0, SWATCH_X1 = 151, 252                        # swatch band inside panel


def cells_from_gpl(path: str) -> list[list[tuple[int, int, int]]]:
    rows: list[tuple[int, int, int]] = []
    for line in open(path, encoding="utf-8"):
        parts = line.split("\t")[0].split()
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            rows.append(tuple(int(p) for p in parts))
    if len(rows) % 5:
        raise SystemExit(f"{path}: {len(rows)} colours is not a multiple of 5")
    return [rows[i:i + 5] for i in range(0, len(rows), 5)]


def main(argv: list[str]) -> int:
    board_path, gpl_path, out_path = argv[0], argv[1], argv[2]

    board = Image.open(board_path).convert("RGB").crop(
        (PANEL["x0"], PANEL["y0"], PANEL["x1"], PANEL["y1"]))
    width, height = board.size

    grid = cells_from_gpl(gpl_path)
    rebuilt = Image.new("RGB", (width, height), (16, 16, 20))
    draw = ImageDraw.Draw(rebuilt)

    rows = len(grid)
    row_h = height / rows
    sx0 = SWATCH_X0 - PANEL["x0"]
    sx1 = SWATCH_X1 - PANEL["x0"]
    step_w = (sx1 - sx0) / len(grid[0])
    for r, row in enumerate(grid):
        top = round(r * row_h + row_h * 0.18)
        bottom = round(r * row_h + row_h * 0.82)
        for c, rgb in enumerate(row):
            draw.rectangle(
                [round(sx0 + c * step_w), top, round(sx0 + (c + 1) * step_w) - 2, bottom],
                fill=rgb)

    scale = 2
    board = board.resize((width * scale, height * scale), Image.NEAREST)
    rebuilt = rebuilt.resize((width * scale, height * scale), Image.NEAREST)
    gap = 24
    canvas = Image.new("RGB", (width * scale * 2 + gap, height * scale), (30, 30, 36))
    canvas.paste(board, (0, 0))
    canvas.paste(rebuilt, (width * scale + gap, 0))
    canvas.save(out_path)
    print(f"wrote {out_path}  ({grid.__len__()} rows x {len(grid[0])} steps per side)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
