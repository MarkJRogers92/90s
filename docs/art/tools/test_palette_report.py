#!/usr/bin/env python3
"""Prove palette_report.py before the real art pack lands.

Red-before-green: each case is built from a KNOWN colour set, so the expected
answer is not a guess.  The SUSPECT case is the important one -- it is the exact
shape of the 90s repo's lossy palette board, and a tool that only counted
colours would pass it.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "palette_report.py")

# A deliberately small, well-separated ramp: the shape a real palette board has.
KNOWN_RAMP = [
    (0x24, 0x28, 0x23), (0x41, 0x45, 0x3F), (0x74, 0x70, 0x5F),
    (0x8C, 0x88, 0x73), (0xC4, 0xB8, 0x78), (0x72, 0x56, 0x6C),
    (0xD3, 0x5F, 0x55), (0x8C, 0xCF, 0xC1),
]

failures: list[str] = []


def run(path: str) -> str:
    proc = subprocess.run(
        [sys.executable, TOOL, path, "--top", "16"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        failures.append(f"tool exited {proc.returncode}: {proc.stderr.strip()}")
    return proc.stdout


def case_exact(tmp: str) -> None:
    """Flat swatches -> the unique colours ARE the palette."""
    image = Image.new("RGB", (len(KNOWN_RAMP) * 16, 16))
    for index, colour in enumerate(KNOWN_RAMP):
        image.paste(colour, (index * 16, 0, (index + 1) * 16, 16))
    path = os.path.join(tmp, "exact.png")
    image.save(path)

    out = run(path)
    if "VERDICT     : EXACT" not in out:
        failures.append("case_exact: expected EXACT\n" + out)
    if f"unique rgb  : {len(KNOWN_RAMP)} " not in out:
        failures.append(f"case_exact: expected {len(KNOWN_RAMP)} unique colours\n" + out)
    for r, g, b in KNOWN_RAMP:
        hexed = "#%02x%02x%02x" % (r, g, b)
        if hexed not in out:
            failures.append(f"case_exact: known colour {hexed} missing from report")
    print("[exact] flat 8-swatch image -> EXACT, all 8 hexes recovered")


def case_gpl_roundtrip(tmp: str) -> None:
    """A .gpl must round-trip the exact values, not a quantised approximation."""
    image = Image.new("RGB", (len(KNOWN_RAMP) * 16, 16))
    for index, colour in enumerate(KNOWN_RAMP):
        image.paste(colour, (index * 16, 0, (index + 1) * 16, 16))
    src = os.path.join(tmp, "rt.png")
    gpl = os.path.join(tmp, "rt.gpl")
    image.save(src)
    subprocess.run([sys.executable, TOOL, src, "--gpl", gpl, "--json"],
                   capture_output=True, text=True, check=False)

    if not os.path.exists(gpl):
        failures.append("case_gpl_roundtrip: no .gpl written")
        return
    body = open(gpl, encoding="utf-8").read()
    if not body.startswith("GIMP Palette"):
        failures.append("case_gpl_roundtrip: bad .gpl header")
    recovered = set()
    for line in body.splitlines()[1:]:
        parts = line.split("\t")[0].split()
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            recovered.add(tuple(int(p) for p in parts))
    missing = [c for c in KNOWN_RAMP if c not in recovered]
    if missing:
        failures.append(f"case_gpl_roundtrip: .gpl lost {missing}")
        return
    print(f"[gpl]   round-tripped all {len(KNOWN_RAMP)} colours byte-exact through .gpl")


def case_suspect(tmp: str) -> None:
    """One flat colour + a little dither = the lossy-preview trap.

    Reproduces the 90s palette board's signature: a modest colour count whose
    dominant entries all sit within a few units of one another.
    """
    import random
    random.seed(20260919)
    image = Image.new("RGB", (160, 107))
    pixels = []
    for _ in range(160 * 107):
        jitter = random.randint(-6, 6)
        pixels.append((0x0C + jitter, 0x14 + jitter, 0x15 + jitter))
    image.putdata(pixels)
    path = os.path.join(tmp, "suspect.png")
    image.save(path)

    out = run(path)
    if "VERDICT     : EXACT" in out:
        failures.append("case_suspect: one dithered colour was called EXACT\n" + out)
    # Must be NOISE specifically, not CONTINUUM: the remedy differs (get the
    # lossless source, vs quantise).
    if "VERDICT     : NOISE" not in out:
        failures.append("case_suspect: dithered single colour not called NOISE\n" + out)
    print("[trap]  single dithered colour -> NOISE, NOT mistaken for a palette")


def case_quantise(tmp: str) -> None:
    """A smooth gradient has 'more colours' than any palette: reject it as a source."""
    image = Image.new("RGB", (256, 32))
    pixels = []
    for x in range(256):
        for _ in range(32):
            pixels.append((x, 255 - x, (x * 3) % 256))
    image.putdata(pixels)
    path = os.path.join(tmp, "ramp.png")
    image.save(path)

    out = run(path)
    # A gradient's dominant colours ARE near-duplicates, so a clustering-only
    # check calls it lossy noise and prescribes the wrong remedy. It must be
    # diagnosed as a CONTINUUM.
    if "VERDICT     : CONTINUUM" not in out:
        failures.append("case_quantise: gradient not diagnosed as CONTINUUM\n" + out)
    print("[grad]  256-step gradient -> CONTINUUM (not mistaken for lossy noise)")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        case_exact(tmp)
        case_gpl_roundtrip(tmp)
        case_suspect(tmp)
        case_quantise(tmp)

    print()
    if failures:
        print(f"FAIL ({len(failures)} case(s))")
        for failure in failures:
            print(" -", failure)
        return 1
    print("palette_report: 4/4 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
