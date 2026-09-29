"""Pixel-draws the New Sneakers and Shop-Vac Attachment Break Room icons.

48x48, transparent, flat colours from the neon palette with a one-pixel dark
outline, matching the procedural locker icon. Writes the source copy under
docs/art/neon-overhaul/pixellab/ and the runtime copy under
public/assets/neon/ui/breakroom/, then prints each file's sha256 for the
manifest.

    python3 docs/art/neon-overhaul/draw_perk_icons.py
"""
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
OUTLINE = (12, 20, 28, 255)
WHITE = (236, 240, 244, 255)
GREY = (150, 164, 176, 255)
MAGENTA = (255, 63, 200, 255)
CYAN = (90, 220, 210, 255)
TEAL = (40, 170, 170, 255)
DEEP_TEAL = (22, 110, 120, 255)
YELLOW = (255, 216, 74, 255)
AMBER = (214, 150, 40, 255)
DARK = (14, 30, 40, 255)


def outline(image: Image.Image) -> None:
    """Adds a one-pixel outline around every filled pixel."""
    pixels = image.load()
    width, height = image.size
    edge = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] != 0 and pixels[nx, ny] != OUTLINE:
                    edge.append((x, y))
                    break
    for point in edge:
        pixels[point] = OUTLINE


def sneakers() -> Image.Image:
    image = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Speed lines behind the heel.
    for y, x0 in ((20, 2), (26, 0), (32, 3)):
        draw.line([(x0, y), (x0 + 7, y)], fill=CYAN)
    # High-top upper: ankle collar, toe box.
    draw.polygon([(14, 10), (26, 10), (27, 22), (40, 26), (44, 31), (44, 35), (12, 35), (12, 14)], fill=WHITE)
    draw.rectangle([14, 10, 26, 12], fill=GREY)  # collar padding
    # Laces up the tongue.
    for y in range(15, 26, 3):
        draw.line([(22, y), (27, y + 1)], fill=GREY)
    # The swoosh-ish magenta stripe.
    draw.polygon([(14, 30), (30, 24), (38, 26), (18, 32)], fill=MAGENTA)
    # Pump button on the tongue, very 1991.
    draw.ellipse([15, 14, 19, 18], fill=MAGENTA)
    # Chunky two-tone sole.
    draw.rectangle([11, 35, 45, 37], fill=CYAN)
    draw.rectangle([11, 38, 45, 39], fill=TEAL)
    for x in range(13, 45, 4):
        image.putpixel((x, 39), DEEP_TEAL)
    outline(image)
    return image


def shopvac() -> Image.Image:
    image = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Canister body and lid.
    draw.rectangle([4, 20, 22, 40], fill=YELLOW)
    draw.rectangle([4, 20, 7, 40], fill=AMBER)
    draw.rectangle([3, 15, 23, 19], fill=DARK)
    draw.rectangle([10, 12, 16, 14], fill=DARK)  # handle
    draw.rectangle([9, 26, 17, 29], fill=DARK)  # label plate
    draw.line([(10, 27), (16, 27)], fill=CYAN)
    # Wheels.
    for x in (6, 18):
        draw.rectangle([x - 1, 41, x + 1, 43], fill=DARK)
    # Hose arcing out of the lid down to a nozzle.
    hose = [(22, 18), (27, 12), (33, 11), (37, 15), (38, 22), (38, 28)]
    draw.line(hose, fill=TEAL, width=3)
    draw.polygon([(35, 28), (41, 28), (43, 34), (33, 34)], fill=DEEP_TEAL)
    # A Mall Token flying up into the nozzle, with motion ticks.
    draw.ellipse([35, 38, 41, 44], fill=YELLOW)
    image.putpixel((38, 41), AMBER)
    for x, y in ((33, 36), (43, 36), (38, 36)):
        image.putpixel((x, y), CYAN)
    outline(image)
    return image


def main() -> None:
    for name, image in (('perk-sneakers', sneakers()), ('perk-shopvac', shopvac())):
        source = ROOT / 'docs/art/neon-overhaul/pixellab' / f'ui-breakroom-{name}.png'
        runtime = ROOT / 'public/assets/neon/ui/breakroom' / f'{name}.png'
        for path in (source, runtime):
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path)
        print(runtime.relative_to(ROOT), hashlib.sha256(runtime.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
