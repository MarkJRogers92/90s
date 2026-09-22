#!/usr/bin/env python3
"""Snap a generated sprite onto the approved palette, ramp-aware.

Plain nearest-neighbour in RGB is wrong for this palette. The approved ramps
are split by HUE, and a warm off-white sits numerically closer to the cool
fluorescent white than to any neutral grey -- so a single shading gradient gets
scattered across three unrelated ramps and the art reads as confetti. Snapping
a jacket red to a blood red is the same failure.

So a pixel is classified first, and only then matched:

  near-neutral + warm      -> the warm neutral ramps
  near-neutral + cool      -> the neutral grey ramps
  chromatic                -> the ramps whose hue matches

Within the chosen ramp, the nearest step still wins, which is what keeps a
shading gradient inside ONE ramp and therefore smooth.

Usage:
  snap_palette.py in.png out.png [--palette P.gpl] [--limit neutral]
"""
from __future__ import annotations

import argparse
import colorsys
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixeldraw import Palette  # noqa: E402

# Near-neutral sources: pick a ramp by warmth before matching a step. `skin`
# and the hair ramps are deliberately absent -- they are for the character, and
# letting a mop head snap through the skin ramp turns it pink.
WARM_NEUTRAL = ("beige", "fabric", "leather")
COOL_NEUTRAL = ("steel", "tile", "shadow", "plastic_black")

# Chromatic sources: pick a ramp by hue family. The hair and fabric ramps belong
# in these families -- leaving them out sent brown hair to the brass ramp and an
# olive vest to the tan one, which is worse than the naive snap it replaced.
HUE_RAMPS = {
    "red": ("red", "blood", "plastic", "leather"),
    "orange": ("brass", "beige", "leather", "hair_brown", "blood"),
    "yellow": ("brass", "beige", "hair_blonde", "hair_brown"),
    "green": ("green", "fluoro", "fabric", "tile"),
    "cyan": ("neon_cyan", "tile", "fluoro", "steel", "denim"),
    "blue": ("denim", "tile", "plastic"),
    "purple": ("neon_magenta", "purple", "denim", "plastic"),
}

NEUTRAL_SATURATION = 0.18


def hue_family(r: int, g: int, b: int) -> str:
    hue = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0] * 360
    if hue < 15 or hue >= 345:
        return "red"
    if hue < 45:
        return "orange"
    if hue < 70:
        return "yellow"
    if hue < 165:
        return "green"
    if hue < 200:
        return "cyan"
    if hue < 260:
        return "blue"
    return "purple"


def build(palette: Palette, limit: str = "any"):
    def candidates(rgb):
        r, g, b = rgb
        if limit == "neutral":
            # Skip hue routing entirely: a wholly neutral object whose charcoal
            # is faintly blue must not be captured by the denim ramp.
            names = WARM_NEUTRAL + COOL_NEUTRAL
        else:
            mx, mn = max(rgb), min(rgb)
            saturation = 0 if mx == 0 else (mx - mn) / mx
            if saturation < NEUTRAL_SATURATION:
                names = WARM_NEUTRAL if (r - b) > 10 else COOL_NEUTRAL
            else:
                names = HUE_RAMPS[hue_family(r, g, b)]
        steps = []
        for name in names:
            try:
                steps.extend(palette.ramp(name))
            except KeyError:
                continue
        # A hue family with no ramp in this palette falls back to everything,
        # so an unusual colour is matched rather than dropped.
        return steps or [c for ramp in palette.ramps for c in ramp]

    return candidates


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("dst")
    parser.add_argument("--palette", default=None)
    parser.add_argument(
        "--limit",
        choices=("any", "neutral"),
        default="any",
        help="Restrict candidate ramps. 'neutral' keeps only the warm and cool "
             "neutral ramps, so a faintly blue charcoal snaps to grey rather "
             "than to the denim ramp.",
    )
    args = parser.parse_args()

    palette = Palette.load(args.palette) if args.palette else Palette.load()
    candidates = build(palette, args.limit)

    image = Image.open(args.src).convert("RGBA")
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    px, op = image.load(), out.load()
    cache: dict = {}
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if (r, g, b) not in cache:
                options = candidates((r, g, b))
                cache[(r, g, b)] = min(
                    options,
                    key=lambda p: (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2,
                )
            snap = cache[(r, g, b)]
            op[x, y] = (snap[0], snap[1], snap[2], 255)
    out.save(args.dst)

    used = {tuple(p[:3]) for p in out.getdata() if p[3] > 0}
    print(f"{args.src} -> {args.dst}: {len(used)} palette colours used")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
