"""Builds Alex's HUD portraits at their native 56 px (roadmap V5).

The HUD drew the 128 px painting at 56 px, a 0.4375 scale that nearest-neighbour
rendering cannot do cleanly (it drops uneven rows and columns, so the face came
out crunchy). This crops the head and shoulders to 112 px, halves it exactly
(each 2x2 block becomes its most common colour, ties to the darker, which keeps
outlines), and snaps every pixel to the painting's own palette.

The hurt portrait is the same face mid-wince: eyes squeezed shut, teeth
gritted, brows pulled down, a red flush and a sweat drop. Features are located
from the painting's own darkest pixels, not hard-coded guesses.

    python3 art/portraits/build_alex_portrait.py
"""
from collections import Counter
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PORTRAITS = ROOT / 'public/assets/neon/portraits'
CROP = (8, 4, 120, 116)  # 112 x 112: the head and shoulders
SIZE = 56


def luminance(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def halve(image):
    src = image.load()
    out = Image.new('RGBA', (image.width // 2, image.height // 2))
    dst = out.load()
    for y in range(out.height):
        for x in range(out.width):
            block = [src[2 * x + dx, 2 * y + dy] for dy in (0, 1) for dx in (0, 1)]
            opaque = [p for p in block if p[3] >= 128]
            if len(opaque) < 2:
                continue
            counts = Counter(p[:3] for p in opaque)
            best = max(counts.values())
            dst[x, y] = (*min((c for c, n in counts.items() if n == best), key=luminance), 255)
    return out


def nearest(colour, palette):
    return min(palette, key=lambda p: sum((a - b) ** 2 for a, b in zip(colour, p)))


def build():
    painting = Image.open(PORTRAITS / 'alex.png').convert('RGBA')
    assert painting.size == (128, 128), painting.size
    palette = sorted({p[:3] for p in painting.getdata() if p[3]}, key=luminance)
    small = halve(painting.crop(CROP))
    assert small.size == (SIZE, SIZE)
    small.save(PORTRAITS / 'alex-56.png')

    # The skin tones: warm, light-to-mid colours of the painting.
    skin = [c for c in palette if c[0] > c[1] + 20 and c[1] > c[2] and 90 < luminance(c) < 220]
    dark = palette[0]
    shadow = min((c for c in palette if c[0] > c[2] + 20 and luminance(c) < 90), key=luminance, default=dark)
    flush = max(skin, key=lambda c: c[0] - c[1])
    teeth = max(palette, key=luminance)
    hurt = small.copy()
    px = hurt.load()

    # The features, read off the 56 px face (its darkness map): the eye bands on row 24
    # (x 18-22 and 32-37; the face is turned a little, so it centres near x 25) and the
    # mouth on row 35 (x 21-28).
    eyes = ((18, 22), (32, 37))
    eye_y = 24
    mouth = (21, 28, 35)
    skin_mid = sorted(skin, key=luminance)[len(skin) // 2]
    for left, right in eyes:
        # Squeezed shut: the lids skin-coloured, a creased line bowed toward the nose.
        for x in range(left, right + 1):
            for y in (eye_y, eye_y + 1):
                px[x, y] = (*skin_mid, 255)
        inner = right if left < 25 else left
        for x in range(left, right + 1):
            px[x, eye_y + (0 if abs(x - inner) <= 1 else 1)] = (*dark, 255)
        # The brow pulled down at its inner end.
        px[inner, eye_y - 1] = (*shadow, 255)
        px[inner + (1 if left < 25 else -1), eye_y - 2] = (*shadow, 255)
    # Gritted teeth inside the lips: a bright row broken by dark gaps.
    x0, x1, my = mouth
    for x in range(x0, x1 + 1):
        px[x, my - 1] = (*dark, 255)
        px[x, my] = (*(teeth if (x - x0) % 2 == 0 else shadow), 255)
        px[x, my + 1] = (*dark, 255)
    # A red flush high on the cheeks, under each eye.
    for cx in (19, 35):
        for x in (cx - 1, cx, cx + 1):
            if px[x, 28][:3] in skin:
                px[x, 28] = (*flush, 255)
    # A sweat drop at the temple: outlined, with a light core.
    for x, y, c in ((42, 18, shadow), (41, 19, shadow), (43, 19, shadow), (41, 20, shadow), (43, 20, shadow), (42, 21, shadow), (42, 19, teeth), (42, 20, teeth)):
        px[x, y] = (*c, 255)
    hurt.save(PORTRAITS / 'alex-56-hurt.png')

    for image, name in ((small, 'alex-56'), (hurt, 'alex-56-hurt')):
        used = {p[:3] for p in image.getdata() if p[3]}
        assert used <= set(palette), f'{name} must use only the painting\'s colours'
    preview = Image.new('RGBA', (SIZE * 2 + 8, SIZE), (20, 16, 30, 255))
    preview.alpha_composite(small, (0, 0))
    preview.alpha_composite(hurt, (SIZE + 8, 0))
    preview.resize((preview.width * 5, preview.height * 5), Image.NEAREST).save(Path(__file__).with_name('preview.png'))
    print(f'wrote alex-56.png and alex-56-hurt.png ({len(palette)} colours)')


if __name__ == '__main__':
    build()
