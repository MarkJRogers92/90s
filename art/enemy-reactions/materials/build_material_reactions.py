"""Builds the hurt strips and material impact strips for every remaining enemy (roadmap V1).

Two sources, one contract (4 frames x 8 facings, rows in ACTOR_DIRECTION_ORDER, square frames
on the walk canvas grown evenly; impacts are 6 x 48 px):

- PixelLab strips (walker, elf, spritzer, poodle, goon, mascot, roofer) come from
  art/pixellab/<kind>-hurt.png, already aligned to the walk sheet by animate_characters.py.
  CLEANUP erases the hit flashes, sparks and motion lines PixelLab painted into a few cells,
  because the game draws its own impact.
- Derived strips (shopper, spitter and the bosses, which have no PixelLab hurt animation) are the
  enemy's own first walk frame per facing, re-posed with nearest-neighbour squash and stretch
  anchored at the feet, as the Hanger's are (art/enemy-reactions/hanger). Pixel-exact palette,
  no spend.

Impacts are drawn in each enemy's own material from a fixed palette and a particle style.

    python3 art/enemy-reactions/materials/build_material_reactions.py

Checked by tests/unit/material-reactions.test.ts.
"""
import math
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ENEMIES = ROOT / 'public/assets/neon/enemies'
PIXELLAB = ROOT / 'art/pixellab'

PIXELLAB_KINDS = ['walker', 'elf', 'spritzer', 'poodle', 'goon', 'mascot', 'roofer']
# kind: (walk sheet frames across, use the idle strip instead of the walk sheet)
DERIVED = {
    'shopper': False, 'spitter': True, 'lp-manager': False, 'manager': False, 'owner': False,
    'developer': False, 'santa': False, 'glamour-queen': False, 'whiskers': False, 'zamboni': False,
}

# (row, column) cells with painted-in effects, and how to clean them.
#  'islands': keep only the largest connected figure (drops sparks, lines, falling bottles).
#  ('flash', min, box): erase near-white pixels (all channels >= min) inside box (fractions of
#                  the frame: x0, y0, x1, y1), then patch holes inside the silhouette from the
#                  nearest figure pixel and keep the largest figure.
#  ('repose',):    replace the cell with the row's frame 0 squashed into that column's pose.
#  ('yellow',):    erase saturated yellow spark pixels, then keep the largest figure.
CLEANUP = {
    # The burst covers a light grey helmet of the same values: re-pose frame 0 instead.
    'walker': {(4, 1): ('repose',), (4, 2): ('repose',)},
    'spritzer': {(0, 1): ('flash', 200, (0, .75, 1, 1)), (4, 1): ('islands',), (4, 2): ('islands',), (4, 3): ('islands',),
                 (6, 0): ('flash', 200, (0, 0, .42, .6)), (6, 1): ('flash', 200, (0, 0, .42, .6)),
                 (6, 2): ('flash', 200, (0, 0, .42, .6)), (6, 3): ('flash', 200, (0, 0, .42, .6))},
    'mascot': {(6, 0): ('yellow',), (6, 1): ('yellow',), (6, 2): ('yellow',)},
}

# (scaleX, scaleY, liftY) per frame: the hit lands, recoil, rebound, settle.
POSES = [(1.08, 0.88, 0), (0.94, 0.84, 0), (0.97, 1.06, 2), (1.02, 0.98, 0)]


def neighbours(x, y, w, h):
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h:
                yield x + dx, y + dy


def components(img):
    w, h = img.size
    px, seen, out = img.load(), set(), []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and (x, y) not in seen:
                part, queue = [], deque([(x, y)])
                seen.add((x, y))
                while queue:
                    p = queue.popleft()
                    part.append(p)
                    for q in neighbours(*p, w, h):
                        if q not in seen and px[q][3]:
                            seen.add(q)
                            queue.append(q)
                out.append(part)
    return sorted(out, key=len, reverse=True)


def keep_largest(img):
    px = img.load()
    for part in components(img)[1:]:
        for p in part:
            px[p] = (0, 0, 0, 0)


def erase_flash(img, minimum, box):
    w, h = img.size
    px = img.load()
    x0, y0, x1, y1 = (round(f * n) for f, n in zip(box, (w, h, w, h)))
    flash = {(x, y) for y in range(y0, y1) for x in range(x0, x1)
             if px[x, y][3] and min(px[x, y][:3]) >= minimum}
    for p in flash:
        px[p] = (0, 0, 0, 0)
    # A hole is a cleared pixel with figure on both sides horizontally: patch it from the nearest.
    for _ in range(4):
        for (x, y) in sorted(flash):
            if px[x, y][3]:
                continue
            left = next((px[x - d, y] for d in range(1, 8) if x - d >= 0 and px[x - d, y][3]), None)
            right = next((px[x + d, y] for d in range(1, 8) if x + d < w and px[x + d, y][3]), None)
            if left and right:
                px[x, y] = left
    keep_largest(img)


def erase_yellow(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > 220 and g > 190 and b < 110:
                px[x, y] = (0, 0, 0, 0)
    keep_largest(img)


def pixellab_hurt(kind):
    sheet = Image.open(PIXELLAB / f'{kind}-hurt.png').convert('RGBA')
    frame = sheet.height // 8
    assert sheet.size == (4 * frame, 8 * frame), (kind, sheet.size)
    for (row, column), rule in CLEANUP.get(kind, {}).items():
        box = (column * frame, row * frame, (column + 1) * frame, (row + 1) * frame)
        cell = sheet.crop(box)
        if rule[0] == 'islands':
            keep_largest(cell)
        elif rule[0] == 'repose':
            idle_frame = Image.open(ENEMIES / f'{kind}-idle.png').height
            sx, sy, lift = POSES[column]
            first = sheet.crop((0, row * frame, frame, (row + 1) * frame))
            cell = squash(first, frame, (frame - idle_frame) / 2 + idle_frame * 0.84, sx, sy, round(lift * frame / 92))
        elif rule[0] == 'flash':
            erase_flash(cell, rule[1], rule[2])
        else:
            erase_yellow(cell)
        sheet.paste(cell, box[:2])
    return sheet


def squash(src, frame, feet_y, sx, sy, lift):
    out = Image.new('RGBA', (frame, frame), (0, 0, 0, 0))
    s, o = src.load(), out.load()
    cx = frame / 2
    for y in range(frame):
        for x in range(frame):
            u = round(cx + (x + 0.5 - cx) / sx - 0.5)
            v = round(feet_y + (y + lift + 0.5 - feet_y) / sy - 0.5)
            if 0 <= u < frame and 0 <= v < frame:
                o[x, y] = s[u, v]
    return out


def derived_hurt(kind, from_idle):
    idle = Image.open(ENEMIES / f'{kind}-idle.png').convert('RGBA')
    idle_frame = idle.height
    if from_idle:
        source, frame = idle, idle_frame
        cell = lambda row: source.crop((row * frame, 0, (row + 1) * frame, frame))
    else:
        source = Image.open(ENEMIES / f'{kind}-walk.png').convert('RGBA')
        frame = source.height // 8
        cell = lambda row: source.crop((0, row * frame, frame, (row + 1) * frame))
    feet_y = (frame - idle_frame) / 2 + idle_frame * 0.84
    sheet = Image.new('RGBA', (4 * frame, 8 * frame), (0, 0, 0, 0))
    for row in range(8):
        base = cell(row)
        for column, (sx, sy, lift) in enumerate(POSES):
            sheet.paste(squash(base, frame, feet_y, sx, sy, round(lift * frame / 92)), (column * frame, row * frame))
    return sheet


# ---- impacts -------------------------------------------------------------------------------
OUTLINE = (0x10, 0x10, 0x1a)
MATERIALS = {
    # kind: (style, palette lightest -> darkest)
    'walker': ('drop', [(0xd8, 0xf0, 0xff), (0x90, 0xd0, 0xf0), (0x20, 0xa0, 0xa0)]),        # sweat, tracksuit
    'shopper': ('paper', [(0xf4, 0xf0, 0xe0), (0xd8, 0xc8, 0x90), (0x40, 0x60, 0x70)]),       # coupons, coat
    'mascot': ('puff', [(0xff, 0xf4, 0xd8), (0xf0, 0xc0, 0x70), (0xd0, 0x30, 0x10)]),         # foam stuffing, suit
    'roofer': ('drop', [(0x70, 0x68, 0x78), (0x30, 0x28, 0x30), (0x14, 0x10, 0x14)]),         # tar
    'spitter': ('drop', [(0xc8, 0xff, 0xa0), (0x9a, 0xff, 0x6a), (0x40, 0x90, 0x30)]),        # goo
    'elf': ('sparkle', [(0xff, 0xf0, 0x90), (0xf0, 0xc0, 0x30), (0x00, 0x90, 0x30)]),         # glitter
    'spritzer': ('puff', [(0xff, 0xd8, 0xf8), (0xe0, 0x90, 0xe0), (0xa0, 0x00, 0x90)]),       # perfume mist
    'poodle': ('tuft', [(0xff, 0xc8, 0xe0), (0xf0, 0x90, 0xb0), (0xc0, 0x50, 0x80)]),         # fur
    'goon': ('shard', [(0xf0, 0xff, 0xff), (0xa8, 0xe8, 0xf0), (0x40, 0xa8, 0xc0)]),          # ice
    'lp-manager': ('paper', [(0xf4, 0xf0, 0xe0), (0xc0, 0xc8, 0xd8), (0x30, 0x38, 0x50)]),    # citations, uniform
    'manager': ('paper', [(0xf8, 0xf8, 0xf0), (0xd0, 0xd0, 0xc8), (0x50, 0x40, 0x60)]),       # memos, suit
    'owner': ('paper', [(0xe8, 0xf8, 0xd8), (0x90, 0xc8, 0x80), (0x30, 0x60, 0x30)]),         # banknotes
    'developer': ('paper', [(0xd8, 0xe8, 0xff), (0x70, 0x98, 0xe0), (0x20, 0x38, 0x80)]),     # blueprints
    'santa': ('sparkle', [(0xff, 0xff, 0xff), (0xf0, 0x30, 0x30), (0xf0, 0xc0, 0x30)]),       # tinsel
    'glamour-queen': ('puff', [(0xff, 0xe0, 0xf4), (0xf0, 0x80, 0xc8), (0xb0, 0x20, 0x90)]),  # powder
    'whiskers': ('tuft', [(0xf8, 0xe0, 0xc0), (0xe0, 0x98, 0x50), (0x90, 0x50, 0x20)]),       # fur
    'zamboni': ('shard', [(0xf0, 0xff, 0xff), (0xa8, 0xe8, 0xf0), (0x40, 0xa8, 0xc0)]),       # ice
}


def impact(style, palette):
    size, frames = 48, 6
    sheet = Image.new('RGBA', (size * frames, size), (0, 0, 0, 0))
    px = sheet.load()

    def put(f, x, y, color, alpha=255):
        if 0 <= x < size and 0 <= y < size:
            px[f * size + x, y] = (*color, alpha)

    def blob(f, x, y, w, h, color, alpha, rim=True):
        if rim:
            for dx in range(-1, w + 1):
                for dy in range(-1, h + 1):
                    put(f, x + dx, y + dy, OUTLINE, alpha)
        for dx in range(w):
            for dy in range(h):
                put(f, x + dx, y + dy, color, alpha)

    count = {'shard': 7, 'drop': 7, 'puff': 5, 'sparkle': 8, 'tuft': 6, 'paper': 5}[style]
    gravity = {'shard': 0.35, 'drop': 0.6, 'puff': -0.05, 'sparkle': 0.12, 'tuft': 0.1, 'paper': 0.18}[style]
    for f in range(frames):
        alpha = 255 if f < 4 else (170 if f == 4 else 90)
        for i in range(count):
            angle = i * 2 * math.pi / count + (0.4 if i % 2 else 0)
            speed = 1.4 + (i % 3) * 0.5
            d = 4 + speed * f * (2.0 if style in ('puff', 'paper') else 2.6)
            x = round(24 + math.cos(angle) * d)
            y = round(24 + math.sin(angle) * d * 0.8 + gravity * f * f)
            color = palette[i % 3]
            if style == 'shard':
                blob(f, x, y, *((3, 2) if i % 2 else (2, 3)), color, alpha)
            elif style == 'drop':
                blob(f, x, y, 2, 3 if f > 1 else 2, color, alpha)
                put(f, x, y, palette[0], alpha)                      # a glossy highlight
            elif style == 'puff':
                r = 2 + min(f, 3)
                for dx in range(-r, r + 1):
                    for dy in range(-r, r + 1):
                        if dx * dx + dy * dy <= r * r and (f < 3 or (dx + dy + f) % 2 == 0):   # thins out
                            put(f, x + dx, y + dy, palette[0] if dy < 0 else palette[1], alpha)
            elif style == 'sparkle':
                arm = 2 if (f + i) % 2 == 0 else 1                   # twinkle
                for k in range(-arm, arm + 1):
                    put(f, x + k, y, color, alpha)
                    put(f, x, y + k, color, alpha)
            elif style == 'tuft':
                for k in range(4):                                   # a short curl of fur
                    put(f, x + k, y + ((k + f) % 2), color, alpha)
                    put(f, x + k, y + 1 + ((k + f) % 2), OUTLINE, alpha)
            else:  # paper: a slip that flips as it flutters
                w, h = ((4, 3) if (f + i) % 2 == 0 else (2, 4))
                blob(f, x, y, w, h, palette[0], alpha)
                put(f, x + 1, y + 1, palette[2], alpha)
        if f < 2:                                                    # the hit point: a short star
            for k in range(-3 + f, 4 - f):
                put(f, 24 + k, 24, palette[0])
                put(f, 24, 24 + k, palette[0])
    return sheet


if __name__ == '__main__':
    for kind in PIXELLAB_KINDS:
        pixellab_hurt(kind).save(ENEMIES / f'{kind}-hurt.png')
    for kind, from_idle in DERIVED.items():
        derived_hurt(kind, from_idle).save(ENEMIES / f'{kind}-hurt.png')
    for kind, (style, palette) in MATERIALS.items():
        impact(style, palette).save(ENEMIES / f'{kind}-impact.png')
    print(f'wrote {len(PIXELLAB_KINDS) + len(DERIVED)} hurt strips and {len(MATERIALS)} impact strips')
