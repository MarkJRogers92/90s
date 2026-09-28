#!/usr/bin/env python3
"""Validate runtime PNGs for binary alpha and shared-palette membership.

Usage:
    validate_runtime_tree.py DIR --palette JSON [--allow FILE]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def load_palette(path: Path) -> set[tuple[int, int, int]]:
    data = json.loads(path.read_text())
    return {
        (int(swatch["rgb"][0]), int(swatch["rgb"][1]), int(swatch["rgb"][2]))
        for ramp in data["grid"]
        for swatch in ramp["swatches"]
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dir", type=Path)
    parser.add_argument("--palette", type=Path, required=True)
    parser.add_argument("--allow", action="append", default=[],
                        help="filename to tolerate being off-palette; repeatable")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    palette = load_palette(args.palette)
    print(f"palette: {len(palette)} swatches from {args.palette.name}")
    files = sorted(path for path in args.dir.rglob("*") if path.suffix.lower() == ".png")
    failures: list[tuple[str, list[str]]] = []
    allowed_off: list[str] = []

    for path in files:
        rel = path.relative_to(args.dir).as_posix()
        errors: list[str] = []
        image = Image.open(path).convert("RGBA")
        pixels = np.asarray(image)
        alpha = pixels[:, :, 3]
        soft = int(((alpha != 0) & (alpha != 255)).sum())
        if soft:
            errors.append(f"{soft} semi-transparent pixels (alpha must be 0 or 255)")
        opaque = pixels[alpha == 255][:, :3]
        extras = {tuple(int(value) for value in colour) for colour in np.unique(opaque, axis=0)} - palette
        if extras:
            if rel in args.allow or path.name in args.allow:
                allowed_off.append(rel)
            else:
                errors.append(f"{len(extras)} colours outside the palette")
        if errors:
            failures.append((rel, errors))
        elif not args.quiet:
            print(f"  PASS  {rel}  {image.width}x{image.height}")

    print()
    if allowed_off:
        print(f"{len(allowed_off)} file(s) tolerated as known off-palette debt:")
        for rel in allowed_off:
            print(f"  ALLOW {rel}")
    if failures:
        print(f"FAIL — {len(failures)} of {len(files)} files:")
        for rel, errors in failures:
            for error in errors:
                print(f"  {rel}: {error}")
        return 1
    print(f"PASS — {len(files)} files, binary alpha and on-palette")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
