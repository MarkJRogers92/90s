"""Converts the GPT hurt sheet for the Bargain Hunter into the game's exact sprite grid.

GPT draws a 4 x 8 sheet (4 frames x the 8 facings, rows in ACTOR_DIRECTION_ORDER) but at a
non-integer scale: 887 x 1774 px, 2.31 x the game's 384 x 768. This script, with no new
generation spend:

 1. area-averages the premultiplied sheet down to 384 x 768 (no dark fringe at the edges);
 2. makes alpha hard (opaque or clear), so there is no soft edge in the runtime sheet;
 3. registers each facing row as one block, the way art/pixellab/check_sheet.py does: frame 0's
    bounding-box centre and floor row land where the walk sheet's rest frame has them. A frame
    is nudged further only as far as needed to stay inside its 96 px cell (the flung arm of the
    peak recoil is wide);
 4. recolours the one cream bag GPT copied from the old walk art (southeast frame 0) to the tan of
    the same row's other frames, by luminance rank, so every frame carries the shipped tan bag.

    python3 art/enemy-reactions/shopper-hurt/convert_gpt_hurt.py

Reads gpt-sheet-raw.png, writes shopper-hurt.png next to this file. Checked by
tests/unit/shopper-hurt-art.test.ts and `python3 art/pixellab/check_sheet.py <sheet>
public/assets/neon/enemies/shopper-hurt.png --frames 4`.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW = HERE / 'gpt-sheet-raw.png'
OUT = HERE / 'shopper-hurt.png'
WALK = np.array(Image.open(ROOT / 'public/assets/neon/enemies/shopper-walk.png').convert('RGBA'))
FRAMES, ROWS, F = 4, 8, 96
SOUTHEAST = 7
# x0, x1, y0, y1 of the cream bag in southeast frame 0, in frame pixels.
CREAM_BAG_BOX = (20, 41, 66, 86)


def walk_bbox(row):
    ys, xs = np.where(WALK[row * F:(row + 1) * F, 0:F, 3] > 0)
    return xs.min(), xs.max(), ys.min(), ys.max()


def area_resize(arr, size):
    """Box-filter a float HxWxC array to size (w, h), channel by channel."""
    chans = [np.array(Image.fromarray(arr[:, :, c].astype(np.float32), 'F').resize(size, Image.BOX)) for c in range(arr.shape[2])]
    return np.stack(chans, axis=2)


def downscale(raw):
    alpha = raw[:, :, 3:4] / 255.0
    small = area_resize(np.concatenate([raw[:, :, :3] * alpha, alpha], axis=2), (FRAMES * F, ROWS * F))
    a = small[:, :, 3:4]
    rgb = np.where(a > 1e-4, small[:, :, :3] / np.maximum(a, 1e-4), 0)
    hard = a[:, :, 0] >= 0.5
    img = np.zeros((ROWS * F, FRAMES * F, 4), np.uint8)
    img[:, :, :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
    img[:, :, 3] = hard * 255
    img[~hard, :3] = 0
    return img


def register(img):
    out = np.zeros_like(img)
    for row in range(ROWS):
        wx0, wx1, _, wy1 = walk_bbox(row)
        rest = img[row * F:(row + 1) * F, 0:F]
        ys0, xs0 = np.where(rest[:, :, 3] > 0)
        row_dx = int(round((wx0 + wx1) / 2 - (xs0.min() + xs0.max()) / 2))
        row_dy = int(wy1 - ys0.max())
        for frame in range(FRAMES):
            cell = img[row * F:(row + 1) * F, frame * F:(frame + 1) * F]
            ys, xs = np.where(cell[:, :, 3] > 0)
            if not len(ys):
                raise SystemExit(f'row {row} frame {frame} is empty')
            dx, dy = row_dx, row_dy
            # never sink below the floor row or leave the cell
            dy = min(dy, F - 1 - ys.max()) if ys.max() + dy > F - 1 else dy
            dy = -ys.min() if ys.min() + dy < 0 else dy
            dx = -xs.min() if xs.min() + dx < 0 else dx
            dx = F - 1 - xs.max() if xs.max() + dx > F - 1 else dx
            placed = np.zeros_like(cell)
            placed[ys + dy, xs + dx] = cell[ys, xs]
            out[row * F:(row + 1) * F, frame * F:(frame + 1) * F] = placed
    return out


def luminance(c):
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


def tan_bag_pixels(out, row):
    """The tan bag colours of a row's frames 1-3, darkest to lightest."""
    ref = np.concatenate([out[row * F:(row + 1) * F, f * F:(f + 1) * F].reshape(-1, 4) for f in range(1, FRAMES)])
    r, g, b = (ref[:, i].astype(float) for i in range(3))
    tans = ref[(ref[:, 3] > 200) & (r > g + 15) & (g > b + 25) & (r > 150)][:, :3]
    return tans[np.argsort(luminance(tans))]


def recolour_cream_bag(out):
    x0, x1, y0, y1 = CREAM_BAG_BOX
    cell = out[SOUTHEAST * F:(SOUTHEAST + 1) * F, 0:F]
    sub = cell[y0:y1, x0:x1]
    tans = tan_bag_pixels(out, SOUTHEAST)
    spread = (sub[..., :3].max(-1).astype(float) - sub[..., :3].min(-1)) / np.maximum(sub[..., :3].max(-1), 1)
    ys, xs = np.where((sub[..., 3] > 200) & (luminance(sub[..., :3].astype(float)) > 110) & (spread < 0.4))
    light = luminance(sub[ys, xs, :3].astype(float))
    rank = (np.argsort(np.argsort(light)) + 0.5) / len(light)
    sub[ys, xs, :3] = tans[(rank * (len(tans) - 1)).astype(int)]
    return len(ys)


if __name__ == '__main__':
    sheet = register(downscale(np.array(Image.open(RAW).convert('RGBA')).astype(np.float32)))
    print('recoloured', recolour_cream_bag(sheet), 'cream bag pixels in southeast frame 0')
    Image.fromarray(sheet, 'RGBA').save(OUT, optimize=True)
    print('wrote', OUT.relative_to(ROOT))
