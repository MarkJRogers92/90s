"""Builds the hairspray, flea spray, ketchup and whoopee-cushion sheets from
extinguisher-foam.png by an exact five-colour palette swap (same shape, pivot
and 6-frame timing as the authored foam).

    python3 art/weapon-effects/derived/build_spray_variants.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
EFFECTS = ROOT / 'public/assets/neon/weapon-effects'
# extinguisher-foam.png: mid, highlight, shade, accent fleck, dark rim.
SOURCE = [(192, 189, 184), (232, 238, 233), (145, 152, 165), (234, 205, 183), (105, 114, 129)]
VARIANTS = {
    # Salon lilac mist with gold glitter flecks.
    'hairspray-mist': [(214, 180, 214), (246, 232, 246), (170, 140, 180), (255, 214, 120), (120, 96, 138)],
    # Pet-aisle green mist.
    'flea-mist': [(170, 214, 170), (232, 248, 228), (120, 170, 130), (214, 232, 140), (70, 110, 84)],
    # A red squirt with mustard flecks.
    'ketchup-squirt': [(200, 40, 36), (255, 140, 120), (150, 24, 28), (255, 214, 74), (90, 12, 16)],
    # A sickly yellow-green puff with pink cushion flecks.
    'whoopee-puff': [(180, 200, 110), (232, 240, 190), (140, 160, 80), (255, 140, 170), (90, 104, 60)],
}


def swap(sheet: Image.Image, palette: list) -> Image.Image:
    out = sheet.copy()
    px = out.load()
    lookup = dict(zip(SOURCE, palette))
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                if (r, g, b) not in lookup:
                    raise SystemExit(f'unexpected source colour {(r, g, b)} at {(x, y)}: update SOURCE')
                px[x, y] = (*lookup[(r, g, b)], a)
    return out


if __name__ == '__main__':
    foam = Image.open(EFFECTS / 'extinguisher-foam.png').convert('RGBA')
    assert foam.size == (192, 24), foam.size
    for name, palette in VARIANTS.items():
        swap(foam, palette).save(EFFECTS / f'{name}.png')
        print(f'wrote {name}.png')
