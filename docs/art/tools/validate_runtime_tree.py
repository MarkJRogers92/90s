#!/usr/bin/env python3
"""Validate a tree of runtime PNGs against the pixel-art contract.

This is the half of asset validation that needs a real decoder: binary alpha and
palette membership. The TypeScript test `tests/unit/portraits.test.ts` covers the
other half (file presence and declared dimensions) inside `npm test`, by reading
the PNG header alone — the game package has no image dependency and adding one to
assert two integers would not be worth the supply chain.

So the two are deliberately split:

    npm test                                  file present, size as declared
    python3 tools/validate_runtime_tree.py    alpha binary, colours on palette

Usage:
    validate_runtime_tree.py DIR [--palette JSON] [--allow FILE]

Exit status is 1 if any file fails, so it can gate a build step.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

DEFAULT_PALETTE = os.path.expanduser("~/deadmall-art/work/deadmall-portrait-union.json")


def load_palette(path: str) -> set[tuple[int, int, int]]:
    data = json.loads(open(path).read())
    return {
        (int(s["rgb"][0]), int(s["rgb"][1]), int(s["rgb"][2]))
        for ramp in data["grid"]
        for s in ramp["swatches"]
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dir")
    parser.add_argument("--palette", default=DEFAULT_PALETTE)
    parser.add_argument("--allow", action="append", default=[],
                        help="filename to tolerate being off-palette (existing debt); repeatable")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    palette = load_palette(args.palette)
    print(f"palette: {len(palette)} swatches from {os.path.basename(args.palette)}")

    files = []
    for dirpath, _, filenames in os.walk(args.dir):
        for fn in sorted(filenames):
            if fn.lower().endswith(".png"):
                files.append(os.path.join(dirpath, fn))
    files.sort()

    failures: list[tuple[str, list[str]]] = []
    allowed_off: list[str] = []

    for path in files:
        rel = os.path.relpath(path, args.dir)
        errors: list[str] = []
        im = Image.open(path).convert("RGBA")
        a = np.asarray(im)
        alpha = a[:, :, 3]

        soft = int(((alpha != 0) & (alpha != 255)).sum())
        if soft:
            errors.append(f"{soft} semi-transparent pixels (alpha must be 0 or 255)")

        opaque = a[alpha == 255][:, :3]
        extras = {tuple(int(v) for v in c) for c in np.unique(opaque, axis=0)} - palette
        if extras:
            if rel in args.allow or os.path.basename(rel) in args.allow:
                allowed_off.append(rel)
            else:
                errors.append(f"{len(extras)} colours outside the palette")

        if errors:
            failures.append((rel, errors))
        elif not args.quiet:
            print(f"  PASS  {rel}  {im.width}x{im.height}")

    print()
    if allowed_off:
        print(f"{len(allowed_off)} file(s) tolerated as known off-palette debt:")
        for r in allowed_off:
            print(f"  ALLOW {r}")
    if failures:
        print(f"FAIL — {len(failures)} of {len(files)} files:")
        for rel, errors in failures:
            for e in errors:
                print(f"  {rel}: {e}")
        return 1
    print(f"PASS — {len(files)} files, binary alpha and on-palette")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
