#!/usr/bin/env python3
"""Fit a PixelLab rotation set or animation set onto the DEAD MALL contract.

PixelLab returns art on a padded square canvas (e.g. 32x48 -> 48x48). This
strips that padding, re-anchors every image, and snaps colours onto the
approved palette so the validator's exact-membership rule can pass.

Anchoring is deliberately asymmetric, because the two axes have different jobs:

  horizontal -- ONE shared offset for the whole set, taken from the union of
                every image. A per-image offset would make the character slide
                sideways between frames, or when turning.

  vertical   -- PER IMAGE, each aligned by its own "sole" (the lowest row wide
                enough to be a foot rather than a 1px toe tip). For a walk
                cycle the planted foot *is* the ground contact, so this is both
                correct animation and what the bottom-anchor rule demands.
                Aligning all images to the union's bottom instead leaves most
                frames with an empty bottom row, which the validator rejects.

Usage:
  fit_rotation_set.py --src DIR --out DIR --palette P.json
  fit_rotation_set.py --src DIR --out DIR --palette P.json \
      --pattern '{d}/frame_*.png' --out-pattern '{d}/frame_{n:03d}.png'
"""
from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

from PIL import Image

DIRECTIONS = [
    "south", "south-west", "west", "north-west",
    "north", "north-east", "east", "south-east",
]


def load_palette(path: Path) -> list[tuple[int, int, int]]:
    data = json.loads(path.read_text())
    return [tuple(s["rgb"]) for ramp in data["grid"] for s in ramp["swatches"]]


def bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    xs, ys = [], []
    for y in range(img.height):
        for x in range(img.width):
            if img.getpixel((x, y))[3] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def nearest(rgb, palette, cache):
    if rgb not in cache:
        cache[rgb] = min(
            palette,
            key=lambda p: (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2,
        )
    return cache[rgb]


def snapshot(img: Image.Image, dx: int, dy: int, w: int, h: int,
             palette, cache) -> tuple[Image.Image, int]:
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(img, (dx, dy))
    px = out.load()
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
                continue
            snap = nearest((r, g, b), palette, cache)
            if snap != (r, g, b):
                changed += 1
            px[x, y] = (snap[0], snap[1], snap[2], 255)
    return out, changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--palette", type=Path, required=True)
    ap.add_argument("--width", type=int, default=32)
    ap.add_argument("--height", type=int, default=48)
    ap.add_argument("--pattern", default="{d}.png",
                    help="per-direction glob; {d} is the direction id")
    ap.add_argument("--out-pattern", default="{d}.png",
                    help="output name; {d} direction, {n} frame index")
    ap.add_argument("--sole-width", type=int, default=6,
                    help="min row width counting as the sole, not a toe tip")
    ap.add_argument("--anchor", choices=["sole", "preserve"], default="sole",
                    help="sole: upright sprite, align each image by its sole row. "
                         "preserve: top-down sprite centred on its own origin "
                         "(e.g. a vehicle on a circular collision radius) — keep "
                         "the delivered placement and only recolour.")
    args = ap.parse_args()

    palette = load_palette(args.palette)
    args.out.mkdir(parents=True, exist_ok=True)

    # ---- load the whole set
    sets: dict[str, list[tuple[Path, Image.Image]]] = {}
    every: list[Image.Image] = []
    for d in DIRECTIONS:
        files = sorted((args.src).glob(args.pattern.format(d=d)))
        if not files:
            continue
        ims = [(f, Image.open(f).convert("RGBA")) for f in files]
        sets[d] = ims
        every.extend(im for _, im in ims)

    if not every:
        print(f"no images matched {args.pattern} under {args.src}")
        return 1

    boxes = [bbox(im) for im in every]
    boxes = [b for b in boxes if b]
    ux0, ux1 = min(b[0] for b in boxes), max(b[2] for b in boxes)
    uy0, uy1 = min(b[1] for b in boxes), max(b[3] for b in boxes)
    uw, uh = ux1 - ux0 + 1, uy1 - uy0 + 1
    n_img = len(every)
    print(f"set: {len(sets)} directions, {n_img} images total")
    print(f"union bbox: ({ux0},{uy0})-({ux1},{uy1})  {uw}x{uh}")
    if uw > args.width or uh > args.height:
        print(f"FAIL: union {uw}x{uh} does not fit {args.width}x{args.height}")
        return 1

    dx = (args.width - uw) // 2 - ux0      # shared across the whole set
    if args.anchor == "sole":
        print(f"shared horizontal dx={dx}; vertical aligned per image by sole")
    else:
        dx = 0
        print("anchor=preserve: keeping the delivered placement, recolouring only")

    def sole_row(im: Image.Image) -> int:
        for y in range(im.height - 1, -1, -1):
            if sum(1 for x in range(im.width) if im.getpixel((x, y))[3]) >= args.sole_width:
                return y
        return im.height - 1

    cache: dict = {}
    total_changed = 0
    for d, ims in sets.items():
        for n, (path, im) in enumerate(ims):
            if args.anchor == "preserve":
                # The delivered canvas IS the target and pixel art must not be
                # rescaled, so a size mismatch here is a hard error. Under
                # `sole` the source is deliberately larger and gets cropped by
                # the translation instead, so the check must not apply there.
                if im.size != (args.width, args.height):
                    print(f"FAIL: {path} is {im.size}, expected "
                          f"{args.width}x{args.height} — anchor=preserve cannot rescale")
                    return 1
                dy = 0
            else:
                dy = args.height - 1 - sole_row(im)
            out, changed = snapshot(im, dx, dy, args.width, args.height, palette, cache)
            total_changed += changed
            target = args.out / args.out_pattern.format(d=d, n=n)
            target.parent.mkdir(parents=True, exist_ok=True)
            out.save(target)
            if args.anchor == "sole":
                anchor = any(out.getpixel((x, out.height - 1))[3] == 255
                             for x in range(out.width))
                if not anchor:
                    print(f"  !! {target} has no bottom anchor")
        print(f"  {d:<11} {len(ims)} frame(s) written")

    print(f"colours snapped: {total_changed} pixels moved onto a palette entry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
