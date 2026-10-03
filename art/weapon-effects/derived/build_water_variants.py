"""Builds the hose, soda and watering-can water sheets from soaker-water.png.

Derived, not generated: an exact four-colour palette swap of the authored
soaker sheet, so every variant keeps its shape, pivot and 4-frame timing.

    python3 art/weapon-effects/derived/build_water_variants.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
EFFECTS = ROOT / 'public/assets/neon/weapon-effects'
# soaker-water.png's four colours: mid body, dark rim, light, highlight.
SOURCE = [(94, 189, 193), (51, 78, 95), (183, 217, 214), (232, 238, 233)]
VARIANTS = {
    # Garden hose: clear tap water, bluer than the soaker's teal.
    'hose-stream': [(88, 168, 224), (35, 70, 110), (168, 212, 242), (238, 246, 255)],
    # Soda gun: cola brown with cream fizz.
    'soda-jet': [(138, 74, 34), (58, 26, 12), (201, 138, 82), (242, 226, 196)],
    # Watering can: a pale, gentle shower.
    'watering-shower': [(140, 207, 232), (61, 106, 128), (201, 236, 245), (244, 251, 255)],
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
    soaker = Image.open(EFFECTS / 'soaker-water.png').convert('RGBA')
    assert soaker.size == (128, 16), soaker.size
    for name, palette in VARIANTS.items():
        swap(soaker, palette).save(EFFECTS / f'{name}.png')
        print(f'wrote {name}.png')
