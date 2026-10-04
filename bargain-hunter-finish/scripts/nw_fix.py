"""NW: the bag hangs from the near (anatomical-left) arm, pulled in toward the hip, as in the
approved frame-3 repair. Lift bag + hand + the sleeve outside the torso, translate it, draw it on top."""
import numpy as np
from PIL import Image
from parts import bag_mask, grow, drop_islands

def pull_in(cell, x_cut, y_arm, shift):
    a = cell.copy()
    op = a[:, :, 3] > 0
    yy, xx = np.mgrid[0:128, 0:128]
    bag = bag_mask(a)
    dark = op & (a[:, :, :3].astype(int).sum(axis=2) < 200)
    if x_cut is None:                                   # derive the cut from the bag itself
        bys, bxs = np.where(bag)
        x_cut, y_arm = int(bxs.min()) - 5, int(bys.min()) + 1
    lifted = (bag | (dark & grow(bag, 2) & (xx >= x_cut)) | (op & (xx >= x_cut) & (yy <= y_arm))) & op
    layer = np.zeros_like(a); layer[lifted] = a[lifted]
    a[lifted] = 0
    dx, dy = shift
    ys, xs = np.where(lifted)
    out = a.copy()
    out[ys + dy, xs + dx] = layer[ys, xs]          # the near arm and bag sit in front
    return drop_islands(out)

if __name__ == "__main__":
    import sys
    from grid import grid
    s = np.array(Image.open('planted.png').convert('RGBA'))
    c, dx, dy = map(int, sys.argv[1:4]); x_cut = y_arm = None
    cell = s[3*128:4*128, c*128:(c+1)*128]
    fixed = pull_in(cell, x_cut, y_arm, (dx, dy))
    Image.fromarray(fixed).save(f'nw{c}-fixed.png')
    both = np.zeros((128, 256, 4), np.uint8); both[:, :128] = cell; both[:, 128:] = fixed
    grid(both, (20, 30, 236, 112), 4, f'nw{c}-fix-compare.png')
