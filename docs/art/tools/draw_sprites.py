#!/usr/bin/env python3
"""Sprite catalogue, drawn with pixeldraw.

Every sprite here is authored by placing pixels, not generated. The point is to
be able to draw something, LOOK at it, and change it -- which is the loop the
procedural tile pipeline could not provide.

Convention (PROJECTION.md): base-anchored, RGBA, transparent surround.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixeldraw import Palette, Sprite  # noqa: E402


def bench(palette: Palette) -> Sprite:
    """A mall bench: three slat backrest, a slab seat, two metal legs.

    Read as 3/4 front-on, so the backrest sits above the seat and the legs run
    down to the floor line at the bottom row.
    """
    s = Sprite(32, 24, palette)
    wood, wood_lit, wood_dark = s.c("beige", 2), s.c("beige", 1), s.c("beige", 3)
    metal, metal_lit, metal_dark = s.c("steel", 1), s.c("steel", 0), s.c("steel", 3)
    shadow = s.c("shadow", 1)

    # Backrest: three slats with WIDE gaps and a lit top edge on each.
    #
    # This is the ORIGINAL version, restored because the user preferred it to
    # three later attempts. Those attempts each tightened the slats or reshaped
    # the back (tighter gaps, then a full-height back, then a dominant seat) on
    # my judgement that the open version "read as a shelf". That was my taste,
    # not a defect -- the open, airy read is the point, and the user has the eyes
    # for their own game. Left as-is deliberately.
    for top in (1, 5, 9):
        s.fill(4, top, 27, top + 2, wood)
        s.row(4, 27, top, wood_lit)
        s.row(4, 27, top + 2, wood_dark)

    # Seat: one slab, one pixel wider each side so the silhouette steps out.
    s.fill(2, 13, 29, 15, wood)
    s.row(2, 29, 13, wood_lit)
    s.row(2, 29, 15, wood_dark)

    # Legs, with a lit left edge and a shaded right edge so they read as round.
    for x0 in (5, 23):
        s.fill(x0, 16, x0 + 3, 21, metal)
        s.col(x0, 16, 21, metal_lit)
        s.col(x0 + 3, 16, 21, metal_dark)
        s.px(x0 + 1, 18, metal_lit)      # bolt
        s.px(x0 + 2, 18, metal_dark)

    # Ground contact: two rows of shadow under the feet, not an outline.
    s.row(3, 29, 22, shadow)
    s.row(5, 27, 23, shadow)
    return s


def vending_machine(palette: Palette) -> Sprite:
    """A 1990s vending machine: glass front, product rows, coin panel.

    Sheet 05 prop. Vertical, base-anchored, with the glass drawn as a lit pane
    rather than a flat rectangle so it reads as glass and not as a hole.

    y_offset=1 is the base anchor. The shape is authored from y=1 because that
    reads best, but the cabinet then ended on row 38 of a 40-row canvas, leaving
    the bottom row empty -- so the unit floated one pixel above the floor while
    the bench, whose shape happens to end on the last row, did not. Shifting the
    whole drawing down one row puts the cast shadow on row 39 and makes the
    anchor true for both props.
    """
    s = Sprite(24, 40, palette, y_offset=1)
    body, body_lit, body_dark = s.c("plastic", 2), s.c("plastic", 1), s.c("plastic", 3)
    glass, glass_lit, glass_dark = s.c("tile", 1), s.c("tile", 0), s.c("tile", 2)
    steel, steel_lit, steel_dark = s.c("steel", 1), s.c("steel", 0), s.c("steel", 3)
    dark = s.c("plastic_black", 2)
    shadow = s.c("shadow", 1)
    # (lit, body, dark) per product, so every can has a highlight and a shade
    # instead of being one flat rectangle.
    pops = [
        (s.c("red", 0), s.c("red", 1), s.c("red", 2)),
        (s.c("brass", 0), s.c("brass", 1), s.c("brass", 2)),
        (s.c("green", 0), s.c("green", 1), s.c("green", 2)),
        (s.c("denim", 0), s.c("denim", 1), s.c("denim", 2)),
        (s.c("purple", 0), s.c("purple", 1), s.c("purple", 2)),
        (s.c("fluoro", 0), s.c("fluoro", 1), s.c("fluoro", 2)),
    ]

    # Cabinet
    s.fill(1, 1, 22, 36, body)
    s.row(1, 22, 1, body_lit)
    s.col(1, 1, 36, body_lit)
    s.row(1, 22, 36, body_dark)
    s.col(22, 1, 36, body_dark)
    # REMOVED: a checkerboard band down the cabinet's right side, added to break
    # up what I judged to be "one large flat red field". It rendered as a regular
    # light/dark grid -- perforations or rivets, not shading. The user picked it
    # out as the one thing wrong with this version. Left as a flat field on
    # purpose: the cabinet already has a lit left edge and a dark right edge, and
    # a flat interior is not a defect. Same mistake as the bench's wood grain --
    # see [[deadmall-art-detail-restraint]].

    # Canopy: lit band with a brass stripe.
    s.fill(2, 2, 21, 4, body_lit)
    s.row(2, 21, 2, s.c("brass", 0))
    s.row(2, 21, 3, s.c("brass", 1))
    s.row(2, 21, 4, body_dark)

    # Window: steel frame, light glass, and a diagonal reflection.
    s.fill(2, 7, 15, 26, steel)
    s.col(2, 7, 26, steel_lit)
    s.col(15, 7, 26, steel_dark)
    s.fill(3, 8, 14, 25, glass)

    # Product rows. Each can is 2x3 with a lit pixel top-left, a dark column on
    # its right, and a shadowed shelf line underneath -- which is what makes a
    # row of cans read as stock rather than as coloured swatches.
    for r in range(3):
        y = 9 + r * 5
        s.row(3, 14, y + 3, glass_dark)
        for i in range(4):
            x = 3 + i * 3
            lit, mid, drk = pops[(r + i) % len(pops)]
            s.fill(x, y, x + 1, y + 2, mid)
            s.px(x, y, lit)
            s.col(x + 1, y, y + 2, drk)

    for i in range(14):                       # diagonal glass reflection
        s.px(3 + i, 8 + i // 2, glass_lit)

    # Coin panel, NARROWED from five columns to three: at five it took a third of
    # the frontage and read as a grey slab.
    s.fill(17, 7, 20, 24, steel)
    s.col(17, 7, 24, steel_lit)
    s.col(20, 7, 24, steel_dark)
    for i in range(4):
        s.fill(18, 9 + i * 4, 19, 10 + i * 4, steel_lit)
        s.row(18, 19, 11 + i * 4, steel_dark)
    s.fill(18, 22, 19, 23, dark)              # coin slot
    s.fill(17, 25, 20, 26, steel_dark)        # card reader lip

    # Dispenser: a recessed dark mouth with a lit lip above it.
    s.fill(3, 28, 15, 33, dark)
    s.row(3, 15, 27, steel_lit)
    s.row(3, 15, 28, steel)
    s.row(3, 15, 34, steel_dark)

    # Cast shadow spreading outward.
    s.row(3, 20, 37, shadow)
    s.row(1, 22, 38, shadow)
    return s


def store_gondola(palette: Palette) -> Sprite:
    """A 1990s store gondola: two uprights, a solid back panel, two shelves.

    Front-on and flat, matching the bench and vending machine. The back panel is
    left a FLAT field on purpose: a generated version of this prop put a regular
    dotted pegboard across it and read as perforations rather than shading, which
    is the same mistake the vending machine's checkerboard band already made. The
    lit left edge and dark right edge are what give it form. See
    [[deadmall-art-detail-restraint]].
    """
    s = Sprite(32, 40, palette)
    wood, wood_lit, wood_dark = s.c("beige", 2), s.c("beige", 1), s.c("beige", 3)
    metal, metal_lit, metal_dark = s.c("steel", 1), s.c("steel", 0), s.c("steel", 3)
    shadow = s.c("shadow", 1)

    # Back panel: flat laminate, lit down the left and shaded down the right.
    s.fill(6, 4, 25, 32, wood)
    s.col(6, 4, 32, wood_lit)
    s.col(25, 4, 32, wood_dark)

    # Uprights, standing proud of the back panel so the silhouette reads as a
    # frame rather than as one slab.
    for x0 in (3, 26):
        s.fill(x0, 3, x0 + 2, 32, metal)
        s.col(x0, 3, 32, metal_lit)
        s.col(x0 + 2, 3, 32, metal_dark)

    # Top cap, tying the two uprights together.
    s.row(3, 28, 2, metal_lit)
    s.row(3, 28, 3, metal_dark)

    # Two shelves. Each overhangs the uprights by one pixel each side, with a lit
    # top edge and a shaded front lip, which is what makes a slab read as a shelf.
    for top in (15, 25):
        s.fill(2, top, 29, top + 2, wood)
        s.row(2, 29, top, wood_lit)
        s.row(2, 29, top + 2, wood_dark)

    # Base deck, then two feet, so the unit stands rather than floats.
    s.fill(2, 33, 29, 35, wood)
    s.row(2, 29, 33, wood_lit)
    s.row(2, 29, 35, wood_dark)
    for x0 in (5, 23):
        s.fill(x0, 36, x0 + 3, 37, metal)
        s.col(x0, 36, 37, metal_lit)
        s.col(x0 + 3, 36, 37, metal_dark)

    # Ground contact: the last row is opaque, so the sprite is base-anchored.
    s.row(4, 27, 38, shadow)
    s.row(2, 29, 39, shadow)
    return s


CATALOGUE = {
    "mall-bench": bench,
    "vending-machine": vending_machine,
    "store-gondola": store_gondola,
}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--outdir", default="work/sprites")
    parser.add_argument("--only", default=None)
    args = parser.parse_args(argv)

    palette = Palette.load()
    names = [args.only] if args.only else list(CATALOGUE)
    sheet_rows = []
    report = {}
    for name in names:
        sprite = CATALOGUE[name](palette)
        path = sprite.save(os.path.join(args.outdir, f"{name}.png"))
        audit = sprite.audit()
        report[name] = {"size": f"{sprite.width}x{sprite.height}", **audit}
        print(f"### {name}  ({sprite.width}x{sprite.height})")
        print(f"   drawn {audit['drawn_pixels']} px, "
              f"off-palette {audit['off_palette_pixels']}")
        if audit["off_palette_pixels"]:
            print(f"   !! {audit['off_palette_examples']}")
        sheet_rows.append(sprite)

    # One image with every sprite scaled up, so it can be looked at in one go.
    scale, pad = 6, 6
    width = sum(s.width for s in sheet_rows) * scale + pad * (len(sheet_rows) + 1)
    height = max(s.height for s in sheet_rows) * scale + pad * 2
    sheet = Image.new("RGB", (width, height), (28, 28, 34))
    x = pad
    for s in sheet_rows:
        board = np.zeros((s.height, s.width, 3), dtype=np.uint8)
        for y in range(s.height):
            for px in range(s.width):
                board[y, px] = (58, 58, 66) if (px // 4 + y // 4) % 2 else (44, 44, 52)
        rgba = s.to_rgba()
        mask = rgba[:, :, 3:4] > 0
        board = np.where(mask, rgba[:, :, :3], board).astype(np.uint8)
        img = Image.fromarray(board).resize((s.width * scale, s.height * scale),
                                            Image.NEAREST)
        sheet.paste(img, (x, pad))
        x += s.width * scale + pad
    sheet_path = os.path.join(args.outdir, "sheet.png")
    sheet.save(sheet_path)
    with open(os.path.join(args.outdir, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nsheet -> {sheet_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
