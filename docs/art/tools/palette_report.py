#!/usr/bin/env python3
"""Diagnose whether an image can yield an EXACT palette, before anyone trusts it.

Why this exists: the art bible's "approved" palette board in the 90s repo is a
lossy 160x107 VP8 webp that decodes to 7,907 unique colours across 17,120
pixels.  Naively reading hexes off it would have produced plausible, subtly
wrong values.  So the rule here is diagnose first, extract second: an image is
only treated as a palette source when its colour count says it can be one.

Three outcomes:
  EXACT      - a few flat colours; unique colours ARE the palette.  Safe.
  QUANTISE   - anti-aliased or lossy; unique colours exceed a palette.  The
               colour set is an artefact of encoding, not a design decision.
  SUSPECT    - colour count is plausible but the colours cluster within a few
               units of each other, the signature of chroma noise.  This is the
               trap that a count alone will not catch.

Usage:  python3 palette_report.py IMAGE [--top N] [--gpl OUT.gpl] [--strip OUT.png]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

from PIL import Image

MAX_EXACT = 256
# Colours this close together are almost certainly one colour plus encoding noise.
NEAR_DUPLICATE_DISTANCE = 12
# How far apart the dominant colours reach.  A lossy smear of ONE colour stays
# tight; a gradient or a photograph spans most of the range.
CONTINUUM_SPREAD = 64


def _distance(a: tuple[int, ...], b: tuple[int, ...]) -> int:
    return max(abs(a[i] - b[i]) for i in range(3))


def report(path: str, top: int = 24) -> dict:
    image = Image.open(path)
    original_mode = image.mode
    rgba = image.convert("RGBA")

    counts: Counter[tuple[int, int, int, int]] = Counter(rgba.getdata())
    opaque = {c: n for c, n in counts.items() if c[3] > 0}
    total_pixels = sum(counts.values())
    unique = len(opaque)

    ordered = sorted(opaque.items(), key=lambda kv: (-kv[1], kv[0]))

    # Are the dominant colours distinguishable from one another, and how far
    # apart do they reach?
    leaders = [c[:3] for c, _ in ordered[: min(32, len(ordered))]]
    near_pairs = 0
    spread = 0
    for i in range(len(leaders)):
        for j in range(i + 1, len(leaders)):
            distance = _distance(leaders[i], leaders[j])
            spread = max(spread, distance)
            if distance <= NEAR_DUPLICATE_DISTANCE:
                near_pairs += 1
    clustered = len(leaders) > 1 and near_pairs >= len(leaders) // 2

    # Clustering ALONE cannot tell a smeared flat colour from a gradient: both
    # have near-identical neighbours.  How far the dominant colours reach does.
    # (Found by the gradient case in test_palette_report.py, which this tool
    # originally misreported as lossy noise -- the wrong remedy entirely.)
    if unique == 0:
        verdict = "EMPTY"
    elif clustered and spread > CONTINUUM_SPREAD:
        verdict = "CONTINUUM"
    elif unique > MAX_EXACT:
        verdict = "QUANTISE"
    elif clustered:
        verdict = "NOISE"
    else:
        verdict = "EXACT"

    result = {
        "path": path,
        "size": list(rgba.size),
        "mode": original_mode,
        "total_pixels": total_pixels,
        "unique_opaque_colours": unique,
        "unique_pct_of_pixels": round(100.0 * unique / total_pixels, 2) if total_pixels else 0.0,
        "near_duplicate_pairs_among_top32": near_pairs,
        "spread_among_top32": spread,
        "verdict": verdict,
        "palette": ["#%02x%02x%02x" % c[:3] for c, _ in ordered[:top]],
        "top_by_pixel_count": [
            {"hex": "#%02x%02x%02x" % c[:3], "pixels": n} for c, n in ordered[:top]
        ],
    }
    return result, ordered


def write_gpl(path: str, ordered, name: str) -> int:
    entries = [c[:3] for c, _ in ordered]
    lines = ["GIMP Palette", f"Name: {name}", f"Columns: {min(16, max(1, len(entries)))}", "#"]
    for r, g, b in entries:
        lines.append(f"{r:3d} {g:3d} {b:3d}\t#{r:02x}{g:02x}{b:02x}")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    return len(entries)


def write_strip(path: str, ordered, swatch: int = 16) -> None:
    """A strip preview so the extracted palette can be LOOKED AT, not just read."""
    colours = [c[:3] for c, _ in ordered]
    if not colours:
        return
    image = Image.new("RGB", (swatch * len(colours), swatch))
    for index, colour in enumerate(colours):
        image.paste(colour, (index * swatch, 0, (index + 1) * swatch, swatch))
    image.save(path)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--top", type=int, default=24)
    parser.add_argument("--gpl")
    parser.add_argument("--strip")
    parser.add_argument("--json", action="store_true", help="emit machine-readable result only")
    args = parser.parse_args(argv)

    result, ordered = report(args.image, top=args.top)

    if args.gpl:
        written = write_gpl(args.gpl, ordered, f"from {args.image}")
        result["gpl_written"] = {"path": args.gpl, "colours": written}
    if args.strip:
        write_strip(args.strip, ordered[: min(64, len(ordered))])
        result["strip_written"] = args.strip

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print(f"file        : {result['path']}")
    print(f"size / mode : {result['size'][0]}x{result['size'][1]} {result['mode']}")
    print(f"unique rgb  : {result['unique_opaque_colours']} "
          f"({result['unique_pct_of_pixels']}% of {result['total_pixels']} px)")
    print(f"near-dup    : {result['near_duplicate_pairs_among_top32']} "
          f"pairs within {NEAR_DUPLICATE_DISTANCE} units among the top 32 "
          f"(spread {result['spread_among_top32']})")
    print(f"VERDICT     : {result['verdict']}")
    if result["verdict"] == "EXACT":
        print("  -> safe to use these values as the palette")
    elif result["verdict"] == "CONTINUUM":
        print("  -> DO NOT use directly: dominant colours reach too far apart, so")
        print("     this is a gradient/photo, not a swatch board. Quantise, or")
        print("     select swatch regions, before reading any value.")
    elif result["verdict"] == "NOISE":
        print("  -> DO NOT use directly: dominant colours cluster in a TIGHT band,")
        print("     the signature of one flat colour smeared by lossy encoding.")
        print("     Go get the lossless source rather than quantising.")
    elif result["verdict"] == "QUANTISE":
        print("  -> needs quantisation or swatch-region selection, not a direct read")
    print(f"top {len(result['palette'])} colours:")
    for entry in result["top_by_pixel_count"]:
        print(f"  {entry['hex']}  {entry['pixels']:7d} px")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
