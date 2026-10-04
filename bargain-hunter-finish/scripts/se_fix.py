"""SE charge frames: put the trailing bag arm BEHIND the torso so it reads as the far
(anatomical-left) arm, and close the torso outline where the near shoulder was attached."""
import numpy as np
from PIL import Image
from parts import comps, to_mask, grow
INK = np.array((5, 6, 5, 255), np.uint8)

def behind(cell, region, shift, seal_box):
    a = cell.copy()
    op = a[:, :, 3] > 0
    arm = op & region
    layer = np.zeros_like(a); layer[arm] = a[arm]
    a[arm] = 0                                         # lift the arm + bag off the body
    dx, dy = shift
    moved = np.zeros_like(a)
    ys, xs = np.where(layer[:, :, 3] > 0)
    moved[ys + dy, xs + dx] = layer[ys, xs]
    body = a[:, :, 3] > 0
    # seal the torso where the arm used to attach: body pixels that now touch the arm or air
    x0, y0, x1, y1 = seal_box
    box = np.zeros_like(body); box[y0:y1, x0:x1] = True
    edge = body & box & grow(~body, 1)
    a[edge] = INK
    out = moved.copy()
    keep = a[:, :, 3] > 0
    out[keep] = a[keep]                                # torso drawn over the arm: the arm is behind
    return out

if __name__ == "__main__":
    import sys
    s = np.array(Image.open('planted.png').convert('RGBA'))
    c = int(sys.argv[1]); x_max, y_max, dx, dy = map(int, sys.argv[2:6])
    cell = s[7*128:8*128, c*128:(c+1)*128]
    region = np.zeros(cell.shape[:2], bool); region[:y_max, :x_max] = True
    fixed = behind(cell, region, (dx, dy), (x_max - 3, 40, x_max + 4, y_max + 2))
    Image.fromarray(fixed).save(f'se{c}-fixed.png')
    from grid import grid
    both = np.zeros((128, 256, 4), np.uint8); both[:, :128] = cell; both[:, 128:] = fixed
    grid(both, (20, 30, 236, 110), 5, f'se{c}-fix-compare.png')
