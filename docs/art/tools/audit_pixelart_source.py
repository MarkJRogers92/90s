#!/usr/bin/env python3
"""Audit an image for ACTUAL pixel-art recoverability.

Answers one question per file: is this true pixel art (a recoverable integer
grid, tiny palette), or a smooth render that merely *looks* pixelated?

That distinction is the whole reason this exists. Diffusion output and the
approved reference boards are both smooth renders -- the boards were measured
as having no recoverable pixel grid -- so they can be looked at but never used
as a pixel source. This script decides which side a file falls on, with
numbers, before anyone builds a pipeline around it.

Two independent signals:

  1. UNIQUE COLOUR COUNT (primary). True pixel art at these sizes uses single
     digits to low tens of colours. A smooth render uses hundreds to thousands.
     This is the single cleanest discriminator and needs no calibration.

  2. GRID RECONSTRUCTION (secondary). For each candidate block size k,
     downscale by k with NEAREST then upscale by k with NEAREST and measure
     RMSE against the original. If k is the true pixel grid the round trip is
     lossless (RMSE ~ 0). A smooth render has no such k. On an already-1:1
     image no k>1 wins, which is itself informative: it means the file is
     either native pixel art (small palette) or a smooth render (huge palette).

Usage:
    python3 audit_pixelart_source.py <dir-or-file> [...]
    python3 audit_pixelart_source.py ~/deadmall-art/work/chatgpt-test

Writes nothing. Prints a table.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PALETTE_JSON = Path.home() / "deadmall-art/work/deadmall-global.json"
EXTS = {".png", ".webp", ".jpg", ".jpeg", ".bmp", ".gif"}

# Calibration reference -- measured, not assumed. See the README block below.
TRUE_PIXELART_MAX_COLOURS = 64
SMOOTH_MIN_COLOURS = 200


def load_palette() -> list[tuple[int, int, int]]:
    """Flatten the deadmall global palette JSON into a list of RGB triples."""
    if not PALETTE_JSON.exists():
        return []
    data = json.loads(PALETTE_JSON.read_text())
    out: list[tuple[int, int, int]] = []
    for ramp in data.get("grid", []):
        for sw in ramp.get("swatches", []):
            rgb = sw.get("rgb")
            if isinstance(rgb, list) and len(rgb) == 3:
                out.append(tuple(int(c) for c in rgb))
    return out


def opaque_pixels(img: Image.Image) -> np.ndarray:
    """Return opaque pixels as an (N, 3) uint8 array. Fully opaque -> all pixels."""
    arr = np.asarray(img.convert("RGBA"))
    alpha = arr[..., 3]
    if (alpha == 255).all():
        return arr[..., :3].reshape(-1, 3)
    return arr[alpha > 0][..., :3]


def grid_test(img: Image.Image, kmax: int = 64) -> tuple[int, float, list[tuple[int, float]]]:
    """Find the block size k whose NEAREST down/up round trip is most lossless."""
    rgb = img.convert("RGB")
    base = np.asarray(rgb, dtype=np.float64)
    h, w = base.shape[:2]
    results: list[tuple[int, float]] = []
    for k in range(2, kmax + 1):
        sw, sh = w // k, h // k
        if sw < 4 or sh < 4:
            break
        small = rgb.resize((sw, sh), Image.NEAREST)
        back = np.asarray(small.resize((w, h), Image.NEAREST), dtype=np.float64)
        rmse = float(np.sqrt(np.mean((base - back) ** 2)))
        results.append((k, rmse))
    if not results:
        return 0, float("nan"), []
    k, rmse = min(results, key=lambda t: t[1])
    return k, rmse, results


def palette_distance(pixels: np.ndarray, palette: list[tuple[int, int, int]]) -> float:
    """Mean Euclidean distance from each pixel to its nearest palette colour."""
    if not palette or pixels.size == 0:
        return float("nan")
    pal = np.asarray(palette, dtype=np.float64)
    px = pixels.astype(np.float64)
    # Chunked to keep memory bounded on large images.
    total, count = 0.0, 0
    for i in range(0, len(px), 20000):
        chunk = px[i:i + 20000]
        d = np.sqrt(((chunk[:, None, :] - pal[None, :, :]) ** 2).sum(-1))
        total += float(d.min(axis=1).sum())
        count += len(chunk)
    return total / count if count else float("nan")


def verdict(unique: int, k: int, rmse: float, w: int, h: int) -> str:
    if unique <= TRUE_PIXELART_MAX_COLOURS:
        if k > 1 and rmse < 1.0:
            return f"TRUE pixel art, upscaled x{k} (grid recoverable)"
        if w <= 512 and h <= 512:
            return "TRUE pixel art, native 1:1"
        return "TRUE pixel art, large but small palette"
    if unique >= SMOOTH_MIN_COLOURS:
        return "SMOOTH RENDER -- not a pixel source (reference only)"
    return "AMBIGUOUS -- inspect by eye"


def audit(path: Path, palette: list[tuple[int, int, int]]) -> dict:
    img = Image.open(path)
    w, h = img.size
    px = opaque_pixels(img)
    unique = int(np.unique(px.reshape(-1, 3), axis=0).shape[0]) if px.size else 0
    k, rmse, _ = grid_test(img)
    dist = palette_distance(px, palette)
    return {
        "file": path.name,
        "size": f"{w}x{h}",
        "colours": unique,
        "best_k": k,
        "rmse": rmse,
        "pal_dist": dist,
        "verdict": verdict(unique, k, rmse, w, h),
    }


def collect(targets: list[str]) -> list[Path]:
    files: list[Path] = []
    for t in targets:
        p = Path(t).expanduser()
        if p.is_dir():
            files += sorted(f for f in p.rglob("*") if f.suffix.lower() in EXTS)
        elif p.is_file():
            files.append(p)
        else:
            print(f"!! not found: {p}", file=sys.stderr)
    return files


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2

    palette = load_palette()
    print(f"palette: {len(palette)} entries from {PALETTE_JSON}")
    print(f"thresholds: true pixel art <= {TRUE_PIXELART_MAX_COLOURS} colours; "
          f"smooth render >= {SMOOTH_MIN_COLOURS} colours\n")

    files = collect(argv[1:])
    if not files:
        print("no image files found.")
        return 1

    rows = []
    for f in files:
        try:
            rows.append(audit(f, palette))
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"!! {f}: {exc}", file=sys.stderr)

    hdr = f"{'file':<38} {'size':>10} {'colours':>8} {'grid':>5} {'rmse':>7} {'palΔ':>6}  verdict"
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        k = r["best_k"] or "-"
        rm = f"{r['rmse']:.2f}" if r["rmse"] == r["rmse"] else "-"
        pd = f"{r['pal_dist']:.1f}" if r["pal_dist"] == r["pal_dist"] else "-"
        print(f"{r['file']:<38} {r['size']:>10} {r['colours']:>8} {str(k):>5} "
              f"{rm:>7} {pd:>6}  {r['verdict']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
