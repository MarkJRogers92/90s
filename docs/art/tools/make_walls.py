#!/usr/bin/env python3
"""Sheet 04 wall kit, authored to the 3/4 convention in ~/deadmall-art/PROJECTION.md.

In the 3/4 model a wall is NOT a flat tile that replaces a floor cell.  It is an
upright sprite whose bottom edge sits on the floor line, so:

  * a wall's FACE is 32 wide x 64 tall, with the baseboard and floor-contact
    shadow at the BOTTOM because the base is what touches the floor;
  * a wall's TOP is a separate 32x32 surface, seen from above, which is what you
    look at when a wall runs away from the camera;
  * height is what makes it read.  An earlier one-tile-tall version passed every
    automated check and still read as panelling, because nothing about it said
    "this has vertical extent".

Checks: every opaque pixel must be in the extracted palette, and every piece that
is built to repeat must join no worse than its own worst interior transition.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_tiles import SIZE, load_palette, ramp  # noqa: E402

WALL_H = 64                 # wall face height; see PROJECTION.md
NEUTRAL = (120, 120, 128)   # backdrop used to grade RGBA pieces


def rgba(h: int, w: int, rgb, alpha: int = 255) -> np.ndarray:
    img = np.zeros((h, w, 4), dtype=np.uint8)
    img[:, :] = (rgb[0], rgb[1], rgb[2], alpha)
    return img


def band(img, r0, r1, c0, c1, rgb, alpha=255) -> None:
    img[r0:r1, c0:c1] = (rgb[0], rgb[1], rgb[2], alpha)


def wall_face(colours) -> np.ndarray:
    """South-facing wall face: 32 wide x 64 tall, base on the floor line."""
    beige, shadow = ramp(colours, 11), ramp(colours, 13)
    img = rgba(WALL_H, SIZE, beige[1])
    band(img, 0, 8, 0, SIZE, beige[0])          # top surface, seen from above
    band(img, 8, 9, 0, SIZE, beige[3])          # its front edge
    band(img, 9, 10, 0, SIZE, beige[2])         # soft shadow beneath the edge
    for x in range(0, SIZE, 8):                 # panel seams; 8 divides 32
        band(img, 10, 53, x, x + 1, beige[2])
    band(img, 53, 58, 0, SIZE, beige[3])        # baseboard
    band(img, 58, 61, 0, SIZE, beige[4])
    band(img, 61, 64, 0, SIZE, shadow[1])       # floor contact
    return img


def wall_top(colours) -> np.ndarray:
    """Wall top surface seen from above.  Repeats in BOTH axes.

    Deliberately borderless: an outline would repeat on every tile and draw a
    grid across the middle of a wall run.  Outlining the outside of a run needs
    separate edge pieces, which do not exist yet.
    """
    beige = ramp(colours, 11)
    img = rgba(SIZE, SIZE, beige[0])
    for x in range(0, SIZE, 8):
        band(img, 0, SIZE, x, x + 1, beige[1])  # slab joints
    for y in range(0, SIZE, 8):
        band(img, y, y + 1, 0, SIZE, beige[1])
    return img


def wall_corner(colours) -> np.ndarray:
    """Outside corner: lit top AND lit west flank, so it meets face and top alike."""
    beige, shadow = ramp(colours, 11), ramp(colours, 13)
    img = rgba(WALL_H, SIZE, beige[1])
    band(img, 0, 8, 0, SIZE, beige[0])
    band(img, 8, 9, 0, SIZE, beige[3])
    band(img, 0, WALL_H, 0, 5, beige[0])        # lit flank
    band(img, 0, WALL_H, 5, 6, beige[3])
    for x in range(8, SIZE, 8):
        band(img, 10, 53, x, x + 1, beige[2])
    band(img, 53, 58, 0, SIZE, beige[3])
    band(img, 58, 61, 0, SIZE, beige[4])
    band(img, 61, 64, 0, SIZE, shadow[1])
    band(img, 0, WALL_H, 30, 31, beige[3])
    band(img, 0, WALL_H, 31, 32, beige[4])
    return img


def column(colours) -> np.ndarray:
    """A mall pillar, RGBA so it stands on any floor.  Built outside-in."""
    steel, shadow = ramp(colours, 9), ramp(colours, 13)
    img = rgba(SIZE, SIZE, steel[1], alpha=0)
    band(img, 5, 26, 5, 26, steel[3])               # dark silhouette
    band(img, 6, 25, 6, 25, steel[2])               # side reveal
    band(img, 6, 19, 6, 25, steel[0])               # lit top face
    band(img, 17, 19, 6, 25, steel[1])              # face-to-side transition
    band(img, 7, 8, 7, 24, steel[1])
    band(img, 26, 29, 9, 26, shadow[1], alpha=150)  # contact shadow, down-right
    return img


def railing_glass(colours) -> np.ndarray:
    """Glass balustrade; posts on an 8px grid so it repeats."""
    steel, denim = ramp(colours, 9), ramp(colours, 4)
    img = rgba(SIZE, SIZE, steel[1], alpha=0)
    band(img, 4, 6, 0, SIZE, steel[0])
    band(img, 6, 16, 0, SIZE, denim[0], alpha=110)
    band(img, 16, 18, 0, SIZE, steel[2])
    for x in range(0, SIZE, 8):
        band(img, 4, 18, x, x + 2, steel[1])
    return img


def security_gate(colours) -> np.ndarray:
    """Rolling shutter: horizontal slats, uniform along its length."""
    steel = ramp(colours, 9)
    img = rgba(SIZE, SIZE, steel[2])
    for y in range(0, SIZE, 4):
        band(img, y, y + 2, 0, SIZE, steel[1])
        band(img, y + 2, y + 3, 0, SIZE, steel[3])
    band(img, 30, 32, 0, SIZE, steel[3])
    return img


def flatten(img: np.ndarray, bg=NEUTRAL) -> np.ndarray:
    alpha = img[:, :, 3:4].astype(float) / 255.0
    rgb = img[:, :, :3].astype(float)
    return (rgb * alpha + np.array(bg, dtype=float) * (1 - alpha)).astype(np.uint8)


def profile(grid: np.ndarray, axis: int) -> np.ndarray:
    diff = np.abs(np.diff(grid.astype(int), axis=axis))
    diff = np.moveaxis(diff, axis, 0)
    return diff.reshape(diff.shape[0], -1).mean(axis=1)


def seam(grid: np.ndarray, period: int, axis: int) -> dict:
    """Judge the join against the interior -- carefully.

    A wall's difference profile is BIMODAL: most adjacent columns are flat face
    and differ by ~0, while panel seams differ by a lot.  That inflates the sd,
    so a three-sigma test would wave through a join worse than every interior
    column.  The criterion that bites is: the join must not exceed the WORST
    interior transition.  A join that looks like one more panel seam is exactly
    what repeat-safety means.
    """
    values = profile(grid, axis)
    seams = [period * k - 1 for k in range(1, grid.shape[axis] // period)]
    interior = [v for i, v in enumerate(values) if i not in seams]
    mean_i, sd_i, max_i = float(np.mean(interior)), float(np.std(interior)), float(np.max(interior))
    picked = [float(values[i]) for i in seams]
    worst = max(picked)
    return {
        "axis": "horizontal" if axis == 1 else "vertical",
        "interior_mean": round(mean_i, 3), "interior_sd": round(sd_i, 3),
        "interior_max": round(max_i, 3),
        "seam_values": [round(v, 3) for v in picked],
        "is_outlier": bool(worst > max_i + 1e-9),
    }


def palette_check(img: np.ndarray, colours) -> dict:
    allowed = {tuple(int(v) for v in c[:3]) for c in colours}
    rgb, alpha = img[:, :, :3], img[:, :, 3]
    opaque = rgb[alpha > 0].reshape(-1, 3)
    off = [tuple(int(v) for v in px) for px in opaque
           if tuple(int(v) for v in px) not in allowed]
    return {
        "opaque_pixels": int(len(opaque)),
        "transparent_pixels": int((alpha == 0).sum()),
        "off_palette_pixels": len(off),
        "off_palette_examples": sorted({"#%02x%02x%02x" % c for c in off})[:6],
    }


# name, builder, axes it is built to repeat along (None = placed, not tiled), overlay
PIECES = [
    ("wall-face-32x64", wall_face, (1,), False),
    ("wall-top-32", wall_top, (1, 0), False),
    ("wall-corner-32x64", wall_corner, None, False),
    ("column-32", column, None, True),
    ("railing-glass-32", railing_glass, (1,), True),
    ("security-gate-32", security_gate, (1,), False),
]


def build_scene(colours) -> Image.Image:
    """A mock room that exercises the convention: wall top, wall face, floor, props.

    Laid out in draw order and in the 3/4 geometry: the wall's TOP surface is the
    far strip, its FACE hangs below it, and the floor line is where the base sits.
    Nothing here is wired into the game -- it exists so the convention can be
    judged before more assets are authored against it.
    """
    face, top = wall_face(colours), wall_top(colours)
    width, height = 320, 240
    wall_rows, base_y = 1, 96            # 1 tile of wall depth, base on the floor line
    scene = Image.new("RGB", (width, height))
    terrazzo = Image.open("work/tiles/floor-terrazzo-32.png").convert("RGB")
    for x in range(0, width, SIZE):
        for y in range(base_y, height, SIZE):
            scene.paste(terrazzo, (x, y))
    top_img = Image.fromarray(top[:, :, :3])
    for x in range(0, width, SIZE):      # wall top, the far strip
        for r in range(wall_rows):
            scene.paste(top_img, (x, r * SIZE))
    face_img = Image.fromarray(face[:, :, :3])
    for x in range(0, width, SIZE):      # wall face, base sitting on the floor line
        scene.paste(face_img, (x, base_y - WALL_H))
    rail = Image.open("work/walls/railing-glass-32.png").convert("RGBA")
    col = Image.open("work/walls/column-32.png").convert("RGBA")

    # Sort the props by BASE Y and paste back-to-front -- the rule in
    # PROJECTION.md.  The first version of this scene pasted the railing before
    # the columns regardless of depth, which drew the nearer thing underneath:
    # document the rule, then break it, in the very demo meant to prove it.
    # The column at x=176 deliberately OVERLAPS the railing so the order shows.
    props = []
    for k in range(5):
        props.append((140, rail, 40 + k * SIZE))
    props.append((118, col, 232))    # behind the railing
    props.append((170, col, 152))    # in front of it
    for base_y, sprite, x in sorted(props, key=lambda p: p[0]):
        scene.paste(sprite, (x, base_y - sprite.height // 2), sprite)
    return scene


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpl", default="work/deadmall-global.gpl")
    parser.add_argument("--outdir", default="work/walls")
    args = parser.parse_args(argv)

    colours = load_palette(args.gpl)
    os.makedirs(args.outdir, exist_ok=True)

    report, failures = {}, []
    for name, build, axes, overlay in PIECES:
        img = build(colours)
        h, w = img.shape[:2]
        Image.fromarray(img).save(os.path.join(args.outdir, f"{name}.png"))
        shown = flatten(img) if overlay else img[:, :, :3]
        Image.fromarray(shown).resize((w * 6, h * 6), Image.NEAREST).save(
            os.path.join(args.outdir, f"{name}-x6.png"))

        pal = palette_check(img, colours)
        entry = {"size": f"{w}x{h}", "overlay": overlay, "palette": pal}
        print(f"\n### {name}  ({w}x{h}, {'RGBA overlay' if overlay else 'opaque'})")
        print(f"   palette : {pal['opaque_pixels']} opaque, "
              f"{pal['transparent_pixels']} transparent, "
              f"{pal['off_palette_pixels']} OFF-palette")
        if pal["off_palette_pixels"]:
            print(f"             e.g. {pal['off_palette_examples']}")
            failures.append(f"{name}: off-palette")

        if axes:
            for axis in axes:
                reps = 4
                tiled = np.tile(img, tuple(reps if i == axis else 1 for i in range(3)))
                graded = flatten(tiled) if overlay else tiled[:, :, :3]
                result = seam(graded, SIZE, axis)
                entry[f"repeat_{result['axis']}"] = result
                verdict = ("<-- WORSE THAN ANY INTERIOR JOIN" if result["is_outlier"]
                           else "(no worse than the worst interior join)")
                print(f"   repeat  : {result['axis']:10s} seam {result['seam_values'][0]:8.3f}"
                      f" vs interior max {result['interior_max']:8.3f}  {verdict}")
                if result["is_outlier"]:
                    failures.append(f"{name}: {result['axis']} seam worse than interior")
        else:
            print("   repeat  : n/a (a corner/column is placed, not tiled)")
        report[name] = entry

    with open(os.path.join(args.outdir, "report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    Image.fromarray(np.asarray(build_scene(colours))).resize(
        (640, 480), Image.NEAREST).save(os.path.join(args.outdir, "scene-3quarter.png"))

    print()
    if failures:
        print("FAIL: " + "; ".join(failures))
        return 1
    print(f"make_walls: {len(PIECES)} pieces, all in palette, every repeating piece "
          f"joins no worse than its worst interior transition")
    print(f"mock scene -> {args.outdir}/scene-3quarter.png")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
