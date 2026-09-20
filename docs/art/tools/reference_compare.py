#!/usr/bin/env python3
"""Compare a sprite against the approved reference art.

Why this exists: every refinement pass this session judged a sprite against my
own PREVIOUS attempt, so "better" meant "different from last time". That is how
a bench drifted from substantial planks to thin bars over four passes, and how a
checkerboard band ended up on a vending machine. An anchor to the canon is what
makes "better" mean something.

What it can and cannot do
-------------------------
The approved boards are 1536x1024 AI RENDERS of pixel art (~250k unique colours).
Their underlying pixel grid is NOT recoverable -- autocorrelation over the player
sprite rows shows no periodic peak horizontally, and only a negative correlation
(-0.11) vertically, i.e. noise. So the boards cannot be used as a source of
pixels, only as a STYLE reference to look at.

Therefore this tool composes a side-by-side for the eye, and prints measurable
properties (value structure, edge density, colour spread) that are meaningfully
comparable between a clean sprite and a render. The judgement stays visual; the
numbers are orientation, not a verdict.

A sprite with no reference is reported as such rather than compared against
something irrelevant.

Usage: python3 reference_compare.py [--outdir work/compare]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.expanduser(
    "~/Downloads/docs/art/reference-sheets/approved-2026-09-13")

# sprite -> reference.  `crop` is (x0, y0, x1, y1) or None for the whole image.
CATALOGUE = {
    "vending-machine": {
        "sprite": "work/sprites/vending-machine.png",
        "reference": "pack/canonical/sheet07-electronics-merchandise/"
                     "sheet07-canonical.webp",
        "crop": (18, 32, 132, 82),   # one row of item cards, not the whole sheet
        "note": "Closest approved language available: sheet 07 is boxy 1990s "
                "consumer electronics (CRT, VCR, boombox), the same family of "
                "object as a vending machine. Only a 384x256 lossy preview "
                "survives in the repo.",
    },
    "mall-bench": {
        "sprite": "work/sprites/mall-bench.png",
        "reference": None,
        "crop": None,
        "note": "NO REFERENCE EXISTS. The approved set covers the player, "
                "palettes, scale, portraits, held equipment and item art. There "
                "is no furniture or environment board, so a bench has no "
                "subject anchor -- only the palette and the written style rules.",
    },
}

CHECKER = (58, 58, 66), (44, 44, 52)


def on_checker(path: str) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    bg = np.zeros_like(a[:, :, :3])
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            bg[y, x] = CHECKER[(x // 4 + y // 4) % 2]
    mask = a[:, :, 3:4] > 0
    return Image.fromarray(np.where(mask, a[:, :, :3], bg).astype(np.uint8))


def stats(image: Image.Image, label: str, drop_packaging: bool = False) -> dict:
    """Value structure and detail density, over the ARTWORK only.

    `drop_packaging` exists because the reference sheets are contact sheets:
    28 items laid out on white cards with label text. Measuring those raw compares
    a sprite against paper -- the first run reported the reference spanning
    luminance 12-244 and I nearly concluded "widen your value range" from a
    measurement of card stock. Dropping near-white card and near-black text is
    removing the packaging, not discarding inconvenient data.
    """
    a_full = np.asarray(image.convert("RGB")).astype(float)
    lum_full = 0.299 * a_full[:, :, 0] + 0.587 * a_full[:, :, 1] + 0.114 * a_full[:, :, 2]
    # Edges are a SPATIAL property, so they must be measured before masking --
    # boolean-masking collapses the array to 1-D and destroys the neighbourhood,
    # which is how the first version of this crashed on np.diff(axis=1).
    gx = float(np.abs(np.diff(lum_full, axis=1)).mean())
    gy = float(np.abs(np.diff(lum_full, axis=0)).mean())
    a, lum = a_full, lum_full
    if drop_packaging:
        keep = (lum_full <= 230) & (lum_full >= 8)
        if keep.sum() < 32:
            keep = np.ones_like(keep, dtype=bool)
        a, lum = a_full[keep], lum_full[keep]
    # Both paths must reduce to a flat (N, 3) list of pixels first: an unmasked
    # image is (H, W, 3) and a masked one is (N, 3), so any fixed axis is wrong
    # for one of them. Reading max(axis=1) on a 3-D image silently measures the
    # HEIGHT axis -- it produced a sprite saturation of 0.741 against a true 0.340.
    flat = a.reshape(-1, 3)
    mx, mn = flat.max(axis=1), flat.min(axis=1)
    saturation = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    distinct = len({tuple(int(v) for v in px) for px in flat})
    return {
        "label": label,
        "pixels_measured": int(lum.size),
        "luminance_mean": round(float(lum.mean()), 1),
        "luminance_std": round(float(lum.std()), 1),
        "luminance_p5_p95": [round(float(np.percentile(lum, 5)), 1),
                             round(float(np.percentile(lum, 95)), 1)],
        "edge_density": round(float((gx + gy) / 2), 2),
        "mean_saturation": round(float(saturation.mean()), 3),
        "distinct_colours": distinct,
    }


def compose(entry: dict, outdir: str, name: str) -> dict:
    sprite = on_checker(os.path.join(WORK, entry["sprite"]))
    lines = []
    panels = [(f"SPRITE 1x ({sprite.width}x{sprite.height})", sprite)]
    for scale in (4, 8):
        panels.append((f"SPRITE {scale}x",
                       sprite.resize((sprite.width * scale, sprite.height * scale),
                                     Image.NEAREST)))

    report = {"sprite": stats(sprite, "sprite")}
    if entry["reference"]:
        ref_path = os.path.join(WORK, entry["reference"])
        ref = Image.open(ref_path).convert("RGB")
        if entry["crop"]:
            ref = ref.crop(entry["crop"])
        report["reference"] = stats(ref, "reference", drop_packaging=True)
        panels.insert(0, (f"REFERENCE ({ref.width}x{ref.height})", ref))
    else:
        report["reference"] = None

    pad, gap = 14, 26
    W = pad + sum(p.width for _, p in panels) + gap * (len(panels) - 1) + pad
    H = pad + max(p.height for _, p in panels) + pad + 22
    sheet = Image.new("RGB", (max(W, 520), H), (24, 24, 30))
    x = pad
    for _, p in panels:
        sheet.paste(p, (x, pad))
        x += p.width + gap
    out = os.path.join(outdir, f"{name}-vs-reference.png")
    sheet.save(out)
    report["image"] = out
    report["note"] = entry["note"]
    return report


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--outdir", default="work/compare")
    parser.add_argument("--only", default=None)
    args = parser.parse_args(argv)
    os.makedirs(os.path.join(WORK, args.outdir), exist_ok=True)

    names = [args.only] if args.only else list(CATALOGUE)
    out = {}
    for name in names:
        entry = CATALOGUE[name]
        if not entry["reference"]:
            print(f"\n### {name}\n   {entry['note']}")
            out[name] = {"reference": None, "note": entry["note"]}
            continue
        report = compose(entry, os.path.join(WORK, args.outdir), name)
        out[name] = report
        print(f"\n### {name}")
        for key in ("sprite", "reference"):
            s = report[key]
            if s:
                print(f"   {s['label']:9s} lum {s['luminance_mean']:5.1f} "
                      f"(sd {s['luminance_std']:4.1f}, p5-p95 {s['luminance_p5_p95']})  "
                      f"edges {s['edge_density']:5.2f}  sat {s['mean_saturation']:.3f}  "
                      f"colours {s['distinct_colours']}")
        print(f"   note    : {report['note']}")
        print(f"   image   : {report['image']}")

    with open(os.path.join(WORK, args.outdir, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
