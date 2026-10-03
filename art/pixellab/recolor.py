"""Map one colour family of a PixelLab sheet onto the walk sheet's ramp (quantile by luminance).

The Developer's PixelLab character is navy; his shipped walk sheet (an older template
render) is cream. v3 animations follow the character, so the attack comes back navy.
    python3 art/pixellab/recolor.py developer-attack
"""
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
# name: (walk sheet, is-source-colour, is-target-colour)
RULES = {
    'developer-attack': ('public/assets/neon/enemies/developer-walk.png',
                         lambda p: p[2] > p[0] + 12 and p[2] >= p[1],                   # navy suit
                         lambda p: p[0] > 90 and p[0] >= p[1] >= p[2] and p[0] - p[2] < 70 and p[0] - p[2] > 12),  # cream suit
}


def cdf(pixels):
    """Distinct colours sorted by luminance, each with the pixel-weighted quantile it ends at."""
    counts = {}
    for p in pixels:
        counts[p] = counts.get(p, 0) + 1
    total, seen, out = sum(counts.values()), 0, []
    for c in sorted(counts, key=lum):
        seen += counts[c]
        out.append((c, (seen - counts[c] / 2) / total))
    return out


def recolor(name):
    """Pixel-weighted quantile mapping, so the suit keeps the walk sheet's balance of light and shade."""
    walk_path, is_src, is_dst = RULES[name]
    sheet = Image.open(HERE / f'{name}.png').convert('RGBA')
    walk = Image.open(ROOT / walk_path).convert('RGBA')
    src = cdf([p[:3] for p in sheet.get_flattened_data() if p[3] > 200 and is_src(p)])
    dst = cdf([p[:3] for p in walk.get_flattened_data() if p[3] > 200 and is_dst(p)])
    mapping = {c: min(dst, key=lambda d: abs(d[1] - q))[0] for c, q in src}
    px = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            p = px[x, y]
            if p[3] and p[:3] in mapping:
                px[x, y] = mapping[p[:3]] + (p[3],)
    sheet.save(HERE / f'{name}.png')
    print(f'{name}: {len(src)} source colours -> {len(dst)} walk colours')


if __name__ == '__main__':
    recolor(sys.argv[1])
