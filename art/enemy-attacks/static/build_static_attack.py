"""Builds static-attack.png: the Static's blink (roadmap V2).

Derived from its own walk sheet (frame 0 of each facing), so the palette is the
sheet's own and the figure never drifts. Six frames per facing, at the walk's
96 px canvas, rows in the walk's facing order:

  wind-up (the 34-tick lock-on):
    0  the screen flares: its teal glass goes to the sheet's lightest cyan;
    1  the picture tears: rows of the body slip sideways, specks of static;
    2  breaking up: wider tears, a third of the body turned to static snow;
    3  gone to noise: two thirds dissolved, the rest snow on scanlines;
  release (it lands on the mark):
    4  re-forms in a flash: whole again, outlined in light, sparks around it;
    5  settling: the screen still bright, a last few specks.

    python3 art/enemy-attacks/static/build_static_attack.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ENEMIES = ROOT / 'public/assets/neon/enemies'
SIZE = 96
FACINGS = 8
FRAMES = 6


def noise(x, y, seed):
    """A stable 0..1 per pixel and frame."""
    h = (x * 374761393 + y * 668265263 + seed * 982451653) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535


def luminance(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def build():
    walk = Image.open(ENEMIES / 'static-walk.png').convert('RGBA')
    assert walk.size == (SIZE * 8, SIZE * FACINGS), walk.size
    colours = sorted({p[:3] for p in walk.getdata() if p[3]}, key=luminance)
    # The screen's teal glass, and the sheet's own lightest cyan and lightest overall for the flare.
    teal = [c for c in colours if c[2] > c[0] + 30 and c[1] > c[0] + 20]
    flare = max(teal, key=luminance)
    white = colours[-1]
    snow = [c for c in colours if luminance(c) > 150] or [white]
    sheet = Image.new('RGBA', (SIZE * FRAMES, SIZE * FACINGS))
    for row in range(FACINGS):
        base = walk.crop((0, row * SIZE, SIZE, (row + 1) * SIZE))
        src = base.load()
        for f in range(FRAMES):
            frame = Image.new('RGBA', (SIZE, SIZE))
            out = frame.load()
            tear = [0, 2, 4, 3, 0, 0][f]
            dissolve = [0, 0, 0.33, 0.66, 0, 0][f]
            specks = [0, 0.05, 0.12, 0.2, 0.08, 0.03][f]
            for y in range(SIZE):
                band = (y // 3 + f + row) % 5
                shift = 0 if tear == 0 or band > 1 else (tear if band == 0 else -tear)
                for x in range(SIZE):
                    sx = x - shift
                    if not 0 <= sx < SIZE:
                        continue
                    p = src[sx, y]
                    if not p[3]:
                        continue
                    colour = p[:3]
                    n = noise(x, y, f * 31 + row)
                    if f in (0, 1, 4, 5) and colour in teal:
                        colour = flare
                    if dissolve and n < dissolve:
                        # Dissolving: gone, or a fleck of snow on a scanline.
                        if y % 2 == 0 and noise(x, y, f * 17 + row + 5) < 0.35:
                            colour = snow[int(n * 97) % len(snow)]
                        else:
                            continue
                    elif n > 1 - specks:
                        colour = snow[int(n * 53) % len(snow)]
                    out[x, y] = (*colour, 255)
            if f == 4:
                # Re-forming in a flash: a one-pixel rim of light, and sparks thrown off.
                alpha = frame.copy().load()
                for y in range(1, SIZE - 1):
                    for x in range(1, SIZE - 1):
                        if alpha[x, y][3]:
                            continue
                        if any(alpha[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                            out[x, y] = (*flare, 255)
                for k in range(10):
                    sx = int(18 + noise(k, row, 7) * 60)
                    sy = int(14 + noise(row, k, 9) * 70)
                    if not out[sx, sy][3]:
                        for dx, dy in ((0, 0), (1, 0), (0, 1)):
                            out[sx + dx, sy + dy] = (*white, 255)
            sheet.paste(frame, (f * SIZE, row * SIZE))
    sheet.save(ENEMIES / 'static-attack.png')
    used = {p[:3] for p in sheet.getdata() if p[3]}
    assert used <= set(colours), 'the attack sheet must use only the walk sheet\'s colours'
    preview = Image.new('RGBA', (SIZE * FRAMES, SIZE * 2), (20, 16, 30, 255))
    preview.alpha_composite(sheet.crop((0, 0, SIZE * FRAMES, SIZE * 2)))
    preview.resize((preview.width * 2, preview.height * 2), Image.NEAREST).save(Path(__file__).with_name('preview.png'))
    print(f'wrote static-attack.png ({sheet.size[0]}x{sheet.size[1]}, {len(used)} of the walk\'s {len(colours)} colours)')


if __name__ == '__main__':
    build()
