#!/usr/bin/env python3
"""A drawing surface for authoring DEAD MALL pixel art.

Why this exists
---------------
The earlier pipeline *generated* tiles procedurally and then handed the PNG to
Aseprite, which meant Aseprite was a container rather than a drawing tool, and
the art came out flat: two or three tone bands, no texture, no dithering. That
approach can build a repeatable tile. It cannot author a sprite.

This is the other half: a canvas you place pixels on deliberately, with the
operations pixel art actually needs (bevel, outline, dither, mirror), and with
the palette enforced by construction -- every colour is addressed as a RAMP STEP
of the extracted DEAD MALL palette, so an off-palette pixel is not possible.

The loop it enables is draw -> render -> LOOK -> fix. The looking is the part
that matters: the automated checks in the tile pipeline can catch an off-palette
pixel, but they measurably cannot tell a seamless organic texture from a broken
one, and no metric replaced looking at it.

Conventions: see PROJECTION.md. Sprites are anchored at their FEET -- the bottom
row is what sits on the floor line -- and exported RGBA with a transparent
surround so they stand on any floor.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

PALETTE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "work", "deadmall-global.gpl")

# Board order, verified by reading the swatch panel of 01A. Each is 5 steps,
# light to dark, as drawn on the approved board.
RAMP_ALIASES = [
    "skin", "hair_brown", "hair_blonde", "hair_black", "denim", "fabric",
    "leather", "plastic", "plastic_black", "steel", "brass", "beige",
    "tile", "shadow", "blood", "purple", "green", "fluoro", "red",
    # Authored 2026-09-21, NOT sampled from 01A. The board has no vivid cyan or
    # magenta, so arcade/CRT neon had no expressible colour at all — a cyan screen
    # sat 101 units from anything approved. Order must stay in step with the .gpl,
    # because ramp() addresses these positionally.
    "neon_cyan", "neon_magenta",
]


@dataclass
class Palette:
    ramps: list[list[tuple[int, int, int]]]

    @classmethod
    def load(cls, path: str = PALETTE_PATH) -> "Palette":
        flat: list[tuple[int, int, int]] = []
        for line in open(path, encoding="utf-8"):
            parts = line.split("\t")[0].split()
            if len(parts) == 3 and all(p.isdigit() for p in parts):
                flat.append(tuple(int(p) for p in parts))
        if len(flat) % 5 != 0:
            raise SystemExit(f"{path}: {len(flat)} colours is not a multiple of 5")
        return cls([flat[i:i + 5] for i in range(0, len(flat), 5)])

    def ramp(self, name: str) -> list[tuple[int, int, int]]:
        if name in RAMP_ALIASES:
            return self.ramps[RAMP_ALIASES.index(name)]
        raise KeyError(f"unknown ramp '{name}'; known: {', '.join(RAMP_ALIASES)}")

    def colour(self, name: str, step: int) -> tuple[int, int, int]:
        ramp = self.ramp(name)
        return ramp[max(0, min(len(ramp) - 1, step))]


@dataclass
class Sprite:
    """An indexed canvas. Colour comes from the palette or not at all."""

    width: int
    height: int
    palette: Palette = field(default_factory=Palette.load)
    # Applied to every y at draw time. Lets a sprite be authored in the
    # coordinates that read best and then dropped onto the floor line, instead
    # of hand-shifting every literal -- which is how a base-anchoring bug gets
    # introduced in the first place.
    y_offset: int = 0
    pixels: np.ndarray = field(init=False)
    # True where nothing has been drawn. Kept explicit rather than using a
    # sentinel colour, so a sprite may legitimately use the darkest palette step.
    empty: np.ndarray = field(init=False)

    def __post_init__(self) -> None:
        self.pixels = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        self.empty = np.ones((self.height, self.width), dtype=bool)

    # ---- colour -----------------------------------------------------------
    def c(self, ramp: str, step: int) -> tuple[int, int, int]:
        """A palette colour, addressed as (ramp, step). Never a raw hex."""
        return self.palette.colour(ramp, step)

    # ---- primitives -------------------------------------------------------
    def px(self, x: int, y: int, colour) -> None:
        y += self.y_offset
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[y, x] = colour
            self.empty[y, x] = False

    def row(self, x0: int, x1: int, y: int, colour) -> None:
        step = 1 if x1 >= x0 else -1
        for x in range(x0, x1 + step, step):
            self.px(x, y, colour)

    def col(self, x: int, y0: int, y1: int, colour) -> None:
        step = 1 if y1 >= y0 else -1
        for y in range(y0, y1 + step, step):
            self.px(x, y, colour)

    def fill(self, x0: int, y0: int, x1: int, y1: int, colour) -> None:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.row(min(x0, x1), max(x0, x1), y, colour)

    def disc(self, cx: int, cy: int, radius: int, colour) -> None:
        for y in range(cy - radius, cy + radius + 1):
            for x in range(cx - radius, cx + radius + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                    self.px(x, y, colour)

    def ring(self, cx: int, cy: int, radius: int, colour) -> None:
        """A one-pixel circular outline -- Bresenham, so it stays pixel-true."""
        x, y, d = radius, 0, 1 - radius
        while x >= y:
            for sx, sy in ((x, y), (y, x), (-x, y), (-y, x),
                           (-x, -y), (-y, -x), (x, -y), (y, -x)):
                self.px(cx + sx, cy + sy, colour)
            y += 1
            if d < 0:
                d += 2 * y + 1
            else:
                x -= 1
                d += 2 * (y - x) + 1

    def line(self, x0: int, y0: int, x1: int, y1: int, colour) -> None:
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx - dy
        while True:
            self.px(x0, y0, colour)
            if x0 == x1 and y0 == y1:
                break
            err2 = err * 2
            if err2 > -dy:
                err -= dy
                x0 += sx
            if err2 < dx:
                err += dx
                y0 += sy

    # ---- pixel-art operations --------------------------------------------
    def outline(self, ramp: str = "shadow", step: int = 1, sides: str = "all") -> None:
        """Wrap the drawn shape in an outline, optionally on selected sides.

        Selective outlines only: the brief puts "overusing black outlines" under
        Avoid, so the caller names the sides it actually wants shadowed.
        """
        colour = self.c(ramp, step)
        target = np.zeros_like(self.empty)
        rows, cols = self.height, self.width
        offsets = {
            "top": (-1, 0), "bottom": (1, 0), "left": (0, -1), "right": (0, 1),
        }
        for side, (dy, dx) in offsets.items():
            if sides not in ("all", side):
                continue
            shifted = np.zeros_like(self.empty)
            ys = slice(max(0, dy), rows + min(0, dy))
            xs = slice(max(0, dx), cols + min(0, dx))
            ys_src = slice(max(0, -dy), rows + min(0, -dy))
            xs_src = slice(max(0, -dx), cols + min(0, -dx))
            shifted[ys, xs] = ~self.empty[ys_src, xs_src]
            target |= shifted
        target &= self.empty
        for y, x in zip(*np.nonzero(target)):
            self.pixels[y, x] = colour
            self.empty[y, x] = False

    def dither(self, x0: int, y0: int, x1: int, y1: int, a, b) -> None:
        """A 50% checkerboard between two colours -- the classic ramp blend."""
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.px(x, y, a if (x + y) % 2 == 0 else b)

    def mirror_x(self) -> None:
        """Mirror the left half onto the right -- symmetry by construction."""
        half = self.width // 2
        for y in range(self.height):
            for x in range(half):
                self.px(self.width - 1 - x, y, self.pixels[y, x])
                self.empty[y, self.width - 1 - x] = self.empty[y, x]

    # ---- output -----------------------------------------------------------
    def to_rgba(self) -> np.ndarray:
        rgba = np.zeros((self.height, self.width, 4), dtype=np.uint8)
        rgba[:, :, :3] = self.pixels
        rgba[:, :, 3] = np.where(self.empty, 0, 255)
        return rgba

    def save(self, path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        Image.fromarray(self.to_rgba(), "RGBA").save(path)
        return path

    def audit(self) -> dict:
        """Self-check: any pixel that is not a palette colour is a bug."""
        allowed = {c for ramp in self.palette.ramps for c in ramp}
        drawn = self.pixels[~self.empty]
        off = [tuple(int(v) for v in px) for px in drawn
               if tuple(int(v) for v in px) not in allowed]
        return {"drawn_pixels": int((~self.empty).sum()),
                "off_palette_pixels": len(off),
                "off_palette_examples": sorted({"#%02x%02x%02x" % c for c in off})[:6]}

    def preview(self, scale: int = 8, path: str | None = None) -> str:
        """Render on a checkerboard so transparency is visible, and upscale."""
        path = path or "/tmp/pixeldraw-preview.png"
        h, w = self.height, self.width
        board = np.zeros((h, w, 3), dtype=np.uint8)
        for y in range(h):
            for x in range(w):
                board[y, x] = (58, 58, 66) if (x // 4 + y // 4) % 2 else (44, 44, 52)
        rgba = self.to_rgba()
        mask = rgba[:, :, 3:4] > 0
        board = np.where(mask, rgba[:, :, :3], board).astype(np.uint8)
        image = Image.fromarray(board).resize((w * scale, h * scale), Image.NEAREST)
        image.save(path)
        return path


def main(argv: list[str]) -> int:
    palette = Palette.load()
    print(f"palette: {len(palette.ramps)} ramps x 5 steps = "
          f"{len(palette.ramps) * 5} colours")
    print(f"ramps  : {', '.join(RAMP_ALIASES)}")
    probe = Sprite(4, 4, palette)
    probe.fill(0, 0, 3, 3, probe.c("beige", 2))
    print(f"self-test: {probe.audit()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
