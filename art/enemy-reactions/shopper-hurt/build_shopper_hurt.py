"""Rebuild the focused WEST-row review derivative; no provider or network calls.

The retained generation is four equally spaced rectangular cells, not Forge's
required square-cell grid. This explicit local derivative crops only transparent
margins, uses ONE uniform nearest-neighbour scale for all poses, hardens alpha,
registers the shoes to the source walk baseline, and replaces row 2 only.
Resampling is lossy. This does not certify identity, facing, hand or motion.
"""
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FRAME = 96
WEST = 2

def _bounds(a):
    y, x = np.where(a[:, :, 3] > 0)
    if not len(x):
        raise ValueError("empty pose or walking reference")
    return int(x.min()), int(y.min()), int(x.max()), int(y.max())

def _feet_centre(a):
    _, _, _, floor = _bounds(a)
    y, x = np.where(a[:, :, 3] > 0)
    shoes = x[y >= floor - 2]
    return (int(shoes.min()) + int(shoes.max())) / 2

def build(raw, original, walk):
    if original.size != (384, 768):
        raise ValueError("original candidate must be 384x768")
    if walk.size != (576, 768):
        raise ValueError("walking reference must be 576x768")
    if raw.width % 4:
        raise ValueError("raw row must divide into four equal columns")
    a = np.array(raw.convert("RGBA"))
    a[:, :, 3] = np.where(a[:, :, 3] >= 128, 255, 0)
    a[a[:, :, 3] == 0, :3] = 0
    source = np.array(walk.convert("RGBA"))[192:288, :96]
    _, top, _, floor = _bounds(source)
    target_height = floor - top + 1
    target_centre = _feet_centre(source)
    cw = raw.width // 4
    cells = []
    for column in range(4):
        cell = a[:, column * cw:(column + 1) * cw]
        x0, y0, x1, y1 = _bounds(cell)
        if x0 == 0 or x1 == cw - 1:
            raise ValueError("pose touches a cell boundary; do not guess cropping")
        cells.append(cell[y0:y1 + 1, x0:x1 + 1])
    scale = target_height / max(cell.shape[0] for cell in cells)
    out = np.array(original.convert("RGBA"))
    out[192:288] = 0
    for column, cell in enumerate(cells):
        size = (max(1, round(cell.shape[1] * scale)), max(1, round(cell.shape[0] * scale)))
        small = np.array(Image.fromarray(cell).resize(size, Image.Resampling.NEAREST))
        _, _, _, bottom = _bounds(small)
        dx = round(target_centre - _feet_centre(small))
        dy = floor - bottom
        ys, xs = np.where(small[:, :, 3] > 0)
        if xs.min() + dx < 0 or xs.max() + dx >= FRAME or ys.min() + dy < 0 or ys.max() + dy >= FRAME:
            raise ValueError("registered pose would leave the native cell")
        out[WEST * FRAME + ys + dy, column * FRAME + xs + dx] = small[ys, xs]
    # Match check_sheet.py's frame-0 centre with one translation for the entire row.
    # Moving every cell equally preserves the shared shoe anchor through the recoil.
    sx0, _, sx1, _ = _bounds(source)
    rx0, _, rx1, _ = _bounds(out[192:288, :96])
    shift = round((sx0 + sx1 - rx0 - rx1) / 2)
    if shift:
        before = out[192:288].copy()
        out[192:288] = 0
        for column in range(4):
            cell = before[:, column * FRAME:(column + 1) * FRAME]
            ys, xs = np.where(cell[:, :, 3] > 0)
            if xs.min() + shift < 0 or xs.max() + shift >= FRAME:
                raise ValueError("centre registration would leave the native cell")
            out[192 + ys, column * FRAME + xs + shift] = cell[ys, xs]
    return Image.fromarray(out)

if __name__ == "__main__":
    result = build(Image.open(HERE / "west-row-raw.png"),
                   Image.open(HERE / "original-candidate.png"),
                   Image.open(ROOT / "public/assets/neon/enemies/shopper-walk.png"))
    result.save(HERE / "shopper-hurt.png", optimize=True)
    print("Wrote review-only shopper-hurt.png; run tests and inspect native motion.")
