"""Builds the Hanger's native hurt strip and chitin-shell impact strip.

Derived, not generated: every hurt frame is the Hanger's own first walk frame
for that facing, re-posed with nearest-neighbour squash/stretch anchored at the
feet, so the spider stays pixel-identical in palette and silhouette. The impact
strip is drawn from the Hanger's own shell blues and leg-tip orange.

    python3 art/enemy-reactions/hanger/build_hanger_reactions.py

Outputs (runtime contracts checked by tests/unit/hanger-*.test.ts):
  public/assets/neon/enemies/hanger-hurt.png          368x736  (4 frames x 8 facings, 92 px)
  public/assets/neon/enemies/hanger-shell-impact.png  288x48   (6 frames, 48 px)
"""
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ENEMIES = ROOT / 'public/assets/neon/enemies'
FRAME = 92
FEET_Y = 67.76            # (92 - 64) / 2 + 64 * 0.84, as the renderer computes it
CENTER_X = FRAME / 2
# (scaleX, scaleY, liftY, shellGlint) per frame; playback is 3/3/4/4 ticks.
POSES = [
    (1.10, 0.86, 0, 1.18),   # the hit lands: shell flattens, legs splay, chitin glints
    (0.92, 0.80, 0, 1.06),   # legs snap inward, body tucks
    (0.96, 1.07, 2, 1.0),    # rebound up off the floor
    (1.02, 0.98, 0, 1.0),    # settle back toward the walk pose
]


def pose(src: Image.Image, sx: float, sy: float, lift: int, glint: float) -> Image.Image:
    out = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
    s, o = src.load(), out.load()
    for y in range(FRAME):
        for x in range(FRAME):
            u = round(CENTER_X + (x + 0.5 - CENTER_X) / sx - 0.5)
            v = round(FEET_Y + (y + lift + 0.5 - FEET_Y) / sy - 0.5)
            if 0 <= u < FRAME and 0 <= v < FRAME:
                r, g, b, a = s[u, v]
                if a and glint != 1.0 and b > r and b > 120:   # lit shell only, never the dark outline
                    r, g, b = (min(255, round(c * glint)) for c in (r, g, b))
                o[x, y] = (r, g, b, a)
    return out


def hurt_sheet() -> Image.Image:
    walk = Image.open(ENEMIES / 'hanger-walk.png').convert('RGBA')
    assert walk.size == (6 * FRAME, 8 * FRAME), walk.size
    sheet = Image.new('RGBA', (4 * FRAME, 8 * FRAME), (0, 0, 0, 0))
    for row in range(8):
        base = walk.crop((0, row * FRAME, FRAME, (row + 1) * FRAME))
        for column, (sx, sy, lift, glint) in enumerate(POSES):
            sheet.paste(pose(base, sx, sy, lift, glint), (column * FRAME, row * FRAME))
    return sheet


SHELL = [(0x9c, 0xc4, 0xe0), (0x6a, 0x96, 0xb8), (0x3a, 0x5a, 0x7a)]
OUTLINE = (0x10, 0x14, 0x22)
TIP = (0xf0, 0x7a, 0x2a)


def impact_sheet() -> Image.Image:
    size, frames = 48, 6
    sheet = Image.new('RGBA', (size * frames, size), (0, 0, 0, 0))
    px = sheet.load()
    shards = [(i * 2 * math.pi / 7 + (0.35 if i % 2 else 0), 1.6 + (i % 3) * 0.45, i) for i in range(7)]

    def put(fx: int, x: int, y: int, color, alpha: int) -> None:
        if 0 <= x < size and 0 <= y < size:
            px[fx * size + x, y] = (*color, alpha)

    for f in range(frames):
        alpha = 255 if f < 4 else (170 if f == 4 else 90)
        for angle, speed, i in shards:
            d = 4 + speed * f * 2.6
            x = round(24 + math.cos(angle) * d)
            y = round(24 + math.sin(angle) * d * 0.8 + 0.35 * f * f)    # a little gravity
            color = TIP if i == 3 else SHELL[i % 3]
            w, h = (3, 2) if i % 2 else (2, 3)
            for dx in range(-1, w + 1):            # dark rim so shards read on lit floors
                for dy in range(-1, h + 1):
                    put(f, x + dx, y + dy, OUTLINE, alpha)
            for dx in range(w):
                for dy in range(h):
                    put(f, x + dx, y + dy, color, alpha)
        if f < 2:                                   # the crack itself: a short pale star, no flash
            for k in range(-3 + f, 4 - f):
                put(f, 24 + k, 24, SHELL[0], 255)
                put(f, 24, 24 + k, SHELL[0], 255)
    return sheet


if __name__ == '__main__':
    hurt_sheet().save(ENEMIES / 'hanger-hurt.png')
    impact_sheet().save(ENEMIES / 'hanger-shell-impact.png')
    print('wrote hanger-hurt.png and hanger-shell-impact.png')
