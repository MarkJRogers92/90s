#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

from PIL import Image


def load_palette(path: Path) -> set[tuple[int, int, int]]:
    data = json.loads(path.read_text())
    return {
        tuple(swatch["rgb"])
        for ramp in data["grid"]
        for swatch in ramp["swatches"]
    }


def validate(path: Path, palette_path: Path, width: int, height: int,
             anchor: str = "bottom") -> list[str]:
    image = Image.open(path).convert("RGBA")
    errors: list[str] = []
    if image.size != (width, height):
        errors.append(f"expected {width}x{height}, got {image.width}x{image.height}")
    pixels = list(image.getdata())
    if any(alpha not in (0, 255) for _, _, _, alpha in pixels):
        errors.append("alpha must be 0 or 255")
    palette = load_palette(palette_path)
    extras = sorted(
        {
            tuple(rgb)
            for *rgb, alpha in pixels
            if alpha == 255 and tuple(rgb) not in palette
        }
    )
    if extras:
        errors.append(f"{len(extras)} opaque colors outside approved palette")
    # The feet-anchor rule only applies to upright, base-anchored sprites. A
    # top-down object centred on its own circular collision radius (a vehicle,
    # for instance) has no feet, so requiring an opaque bottom row would be a
    # category error rather than a stricter check.
    if anchor == "bottom" and image.height and not any(
        image.getpixel((x, image.height - 1))[3] == 255
        for x in range(image.width)
    ):
        errors.append("bottom row has no opaque anchor pixel")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a DEAD MALL runtime PNG against its pixel-art contract."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--palette", type=Path, required=True)
    parser.add_argument("--width", type=int, default=64)
    parser.add_argument("--height", type=int, default=64)
    parser.add_argument("--anchor", choices=["bottom", "none"], default="bottom",
                        help="bottom: upright sprite must touch the last row. "
                             "none: top-down object centred on its own origin.")
    args = parser.parse_args()

    errors = validate(args.image, args.palette, args.width, args.height, args.anchor)
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {args.image} is {args.width}x{args.height}, palette-safe, and runtime-ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
