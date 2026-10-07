"""Builds the energy-weapon effect sheets (roadmap V3, energy family).

Drawn in code, pixel by pixel, so every sheet is reproducible and keeps a tight
five-colour palette (glow, rim, body, light, white-hot core) like the authored
effects. Each sheet is one horizontal strip of frames, +X is the direction of
travel or swing, as in mop-sweep / soaker-water.

    python3 art/weapon-effects/derived/build_energy_effects.py
"""
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
EFFECTS = ROOT / 'public/assets/neon/weapon-effects'

# Palettes: glow, rim, body, light, core.
RED = [(110, 20, 40), (196, 30, 58), (255, 64, 84), (255, 170, 170), (255, 246, 240)]
GREEN = [(18, 84, 46), (32, 168, 80), (82, 255, 120), (196, 255, 196), (244, 255, 240)]
FLASH = [(70, 110, 160), (140, 196, 232), (210, 236, 255), (255, 248, 210), (255, 255, 255)]
REC = [(120, 20, 30), (220, 40, 50), (255, 120, 110), (255, 230, 220), (255, 255, 255)]
LAVA = [(110, 20, 70), (220, 50, 110), (255, 110, 60), (255, 190, 90), (255, 244, 200)]
SABER = [(18, 70, 120), (40, 150, 230), (90, 230, 255), (190, 250, 255), (255, 255, 255)]
GLOVE = [(80, 40, 120), (170, 60, 200), (255, 90, 200), (255, 220, 110), (255, 255, 240)]


def put(px, w, h, x, y, color):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = (*color, 255)


def strip(frames):
    w, h = frames[0].size
    sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0))
    return sheet


def laser(pal, thick):
    """A beam travelling +X: glow, rim, body, a white-hot core, a bright head; it flickers in length."""
    frames = []
    for f in range(4):
        w, h = 32, 16
        im = Image.new('RGBA', (w, h)); px = im.load()
        tail = [2, 5, 3, 6][f]
        head = 29
        cy = 8
        for x in range(tail, head + 1):
            for dy in range(-(thick + 1), thick + 2):
                d = abs(dy)
                color = pal[0] if d == thick + 1 else pal[1] if d == thick else pal[2] if d > 0 else pal[4]
                if d == thick + 1 and (x + f) % 2:
                    continue
                put(px, w, h, x, cy + dy, color)
        # The head: a hot dot with a cross of light.
        for dx, dy, c in [(0, 0, 4), (1, 0, 4), (2, 0, 3), (0, -1, 3), (0, 1, 3), (-1, -2, 2), (-1, 2, 2), (3, 0, 2)]:
            put(px, w, h, head + dx, cy + dy, pal[c])
        # Sparks peeling off the beam.
        for i, x in enumerate(range(tail + 3 + f, head - 2, 7)):
            put(px, w, h, x, cy - thick - 3 - (i % 2), pal[3])
        frames.append(im)
    return strip(frames)


def burst(pal, ring):
    """A camera flash: white core, four rays turning, an expanding ring."""
    frames = []
    for f in range(4):
        w, h = 24, 24
        im = Image.new('RGBA', (w, h)); px = im.load()
        cx = cy = 11.5
        r = 4 + f * 1.5
        # A dark rim behind the rays, so a white flash still reads on a bright floor.
        for k in range(8):
            t = turn_rim = f * math.pi / 8 + k * math.pi / 4
            for s in range(2, 10 if k % 2 == 0 else 6):
                put(px, w, h, cx + math.cos(t) * s + 1, cy + math.sin(t) * s + 1, pal[0])
        if ring:
            for a in range(0, 360, 8):
                t = math.radians(a)
                put(px, w, h, cx + math.cos(t) * (r + 3), cy + math.sin(t) * (r + 3), pal[1] if a % 16 else pal[0])
        turn = f * math.pi / 8
        for k in range(8):
            t = turn + k * math.pi / 4
            length = 10 if k % 2 == 0 else 6
            for s in range(2, length):
                c = 4 if s < 4 else 3 if s < 7 else 2
                put(px, w, h, cx + math.cos(t) * s, cy + math.sin(t) * s, pal[c])
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if dx * dx + dy * dy <= 5:
                    put(px, w, h, cx + dx, cy + dy, pal[4] if dx * dx + dy * dy <= 2 else pal[3])
        frames.append(im)
    return strip(frames)


def lava():
    """A molten lava-lamp blob, wobbling: rim, body, a glowing inner swirl and a highlight."""
    frames = []
    for f in range(4):
        w, h = 24, 24
        im = Image.new('RGBA', (w, h)); px = im.load()
        cx, cy = 11.5, 11.5
        for y in range(h):
            for x in range(w):
                dx, dy = x - cx, y - cy
                angle = math.atan2(dy, dx)
                radius = 7.5 + 1.2 * math.sin(angle * 3 + f * math.pi / 2) + 0.6 * math.cos(angle * 2 - f)
                d = math.hypot(dx, dy)
                if d <= radius:
                    swirl = math.sin(angle * 2 + d * 0.6 + f) > 0.4
                    c = 1 if d > radius - 1.2 else 3 if swirl else 2
                    put(px, w, h, x, y, LAVA[c])
                elif d <= radius + 1 and (x + y + f) % 2 == 0:
                    put(px, w, h, x, y, LAVA[0])
        for dx, dy in [(-3, -4), (-2, -4), (-3, -3)]:
            put(px, w, h, cx + dx, cy + dy, LAVA[4])
        frames.append(im)
    return strip(frames)


def saber():
    """A light-sword swing: a solid crescent of light swept behind a white-hot blade, fading as it closes.

    The sheet is anchored at the weapon's tip (pivot) and rotated to the current
    swing angle, so the arc is centred on the hand, `HAND` pixels back along -X.
    The swing turns clockwise on screen, so light the blade has already passed
    lies at negative angles (up, in the sheet).
    """
    frames = []
    pivot = (6, 32)  # the hand: the arc's centre
    for f in range(6):
        w, h = 64, 64
        im = Image.new('RGBA', (w, h)); px = im.load()
        reach = 46 * [0.6, 0.85, 1.0, 1.0, 0.95, 0.85][f]
        sweep = [0.35, 0.8, 1.15, 1.2, 1.0, 0.6][f]      # how far back the light trails (radians)
        blade = f <= 3                                     # the blade itself shows until the swing ends
        for y in range(h):
            for x in range(w):
                dx, dy = x - pivot[0], y - pivot[1]
                d = math.hypot(dx, dy)
                if d < 10 or d > reach:
                    continue
                a = math.atan2(dy, dx)                     # 0 = the blade; negative = behind it
                if a > 0.06 or a < -sweep:
                    continue
                t = -a / sweep                              # 0 at the blade, 1 at the oldest light
                edge = d > reach - 2
                if blade and a > -0.06:
                    c = 4
                elif t < 0.18:
                    c = 3
                elif t < 0.45:
                    c = 2
                elif t < 0.75:
                    c = 1 if (x + y) % 2 == 0 or edge else None
                else:
                    c = 0 if (x + y) % 2 == 0 and not (f >= 4) else None
                if edge and c is not None and c < 4:
                    c = min(4, c + 1)
                if c is not None:
                    put(px, w, h, x, y, SABER[c])
        if blade:
            for dx, dy, c in [(0, 0, 4), (1, 0, 3), (0, -1, 3), (0, 1, 3)]:
                put(px, w, h, pivot[0] + reach + dx, pivot[1] + dy, SABER[c])
        frames.append(im)
    return strip(frames)


def glove_punch():
    """A Power Glove punch: speed lines trailing back, an impact star blooming at the fist."""
    frames = []
    for f in range(6):
        w, h = 48, 48
        im = Image.new('RGBA', (w, h)); px = im.load()
        cx, cy = 36, 24
        bloom = [2, 5, 8, 9, 7, 4][f]
        # Speed lines behind the fist.
        if f < 4:
            for i, y in enumerate([cy - 6, cy - 2, cy + 2, cy + 6]):
                start = 4 + (i % 2) * 4 + f * 3
                for x in range(start, cx - bloom - 2):
                    if (x + i) % 5 != 0:
                        put(px, w, h, x, y, GLOVE[2 if (x - start) < 6 else 3])
        # The impact star: eight points, alternating long and short.
        for k in range(8):
            t = k * math.pi / 4 + (math.pi / 8 if f % 2 else 0)
            length = bloom if k % 2 == 0 else bloom * 0.6
            for s in range(1, int(length) + 1):
                c = 4 if s <= 2 else 3 if s <= length * 0.6 else 2
                put(px, w, h, cx + math.cos(t) * s, cy + math.sin(t) * s, GLOVE[c])
        if f >= 4:
            for k in range(0, 360, 30):
                t = math.radians(k)
                put(px, w, h, cx + math.cos(t) * (bloom + 2), cy + math.sin(t) * (bloom + 2), GLOVE[0])
        put(px, w, h, cx, cy, GLOVE[4])
        frames.append(im)
    return strip(frames)


SHEETS = {
    # name: (image, frame w, h, frames, pivot, description)
    'laser-red': (laser(RED, 2), 32, 16, 4, (16, 8), 'Thin red laser-pointer beam with a white-hot core, a bright head and peeling sparks; flickers in length.'),
    'laser-green': (laser(GREEN, 3), 32, 16, 4, (16, 8), 'The laser-tag rifle beam: the red beam\'s shape, thicker, in green.'),
    'camera-flash': (burst(FLASH, False), 24, 24, 4, (12, 12), 'A studio flash: white core and eight turning rays, cool white and pale yellow.'),
    'rec-flash': (burst(REC, True), 24, 24, 4, (12, 12), 'The camcorder flash: the studio burst inside a red REC ring.'),
    'lava-blob': (lava(), 24, 24, 4, (12, 12), 'A wobbling lava-lamp blob, magenta rim and orange body with a glowing swirl.'),
    'saber-swing': (saber(), 64, 64, 6, (46, 32), 'A light-up laser sword swing: a white-hot blade with a solid cyan crescent of light swept behind it, fading as the swing closes.'),
    'glove-punch': (glove_punch(), 48, 48, 6, (14, 24), 'A Power Glove punch: magenta speed lines and an impact star blooming at the fist.'),
}

if __name__ == '__main__':
    for name, (image, fw, fh, frames, pivot, description) in SHEETS.items():
        assert image.size == (fw * frames, fh), (name, image.size)
        colours = {p[:3] for p in image.getdata() if p[3]}
        assert len(colours) <= 5, (name, len(colours))
        image.save(EFFECTS / f'{name}.png')
        (EFFECTS / f'{name}.json').write_text(json.dumps({
            'name': name, 'description': description, 'frameWidth': fw, 'frameHeight': fh, 'frameCount': frames,
            'layout': 'horizontal', 'sheetSize': [fw * frames, fh], 'pivotPixels': list(pivot),
            'originNormalized': [pivot[0] / fw, pivot[1] / fh], 'direction': '+X',
            'source': 'art/weapon-effects/derived/build_energy_effects.py',
        }, indent=2) + '\n')
        print(f'wrote {name}.png ({len(colours)} colours)')
    preview = Image.new('RGBA', (400, 64 * len(SHEETS)), (20, 16, 30, 255))
    for row, (name, (image, *_rest)) in enumerate(SHEETS.items()):
        preview.alpha_composite(image.crop((0, 0, min(400, image.width), image.height)), (0, row * 64))
    preview.resize((preview.width * 2, preview.height * 2), Image.NEAREST).save(Path(__file__).with_name('energy-preview.png'))
