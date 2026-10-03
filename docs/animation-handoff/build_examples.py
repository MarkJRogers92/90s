"""Rebuild the example images in this folder from the shipped sheets: python3 docs/animation-handoff/build_examples.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
E = ROOT / 'public/assets/neon/enemies'
P = ROOT / 'public/assets/neon/player'
BG, INK, DIM, HOT, COOL = (28, 26, 38, 255), (240, 236, 220), (150, 146, 170), (255, 90, 150), (90, 200, 255)
font = lambda n: ImageFont.load_default(size=n)
ORDER = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']


def frames(path, row):
    im = Image.open(path).convert('RGBA')
    s = im.height // 8
    return [im.crop((c * s, row * s, (c + 1) * s, (row + 1) * s)) for c in range(im.width // s)]


def strip(cells, h, gap=6):
    """Cells scaled by one shared factor so relative sizes stay true; the tallest is h px."""
    k = h / max(c.height for c in cells)
    cells = [c.resize((round(c.width * k), round(c.height * k)), Image.NEAREST) for c in cells]
    out = Image.new('RGBA', (sum(c.width for c in cells) + gap * (len(cells) - 1), h), (0, 0, 0, 0))
    x = 0
    for c in cells:
        out.alpha_composite(c, (x, h - c.height))
        x += c.width + gap
    return out


def board(rows, title, path, h=150):
    """rows: (label, walk_path, action_path, facing_row, note)."""
    pad, label_w = 18, 250
    built = []
    for label, walk, action, row, note in rows:
        a = frames(action, row)
        if walk is None:  # Alex's walk sheet is drawn at another pixel scale; no reference cell
            built.append((label, note, strip(a, h), False))
            continue
        w = frames(walk, row)[0]
        # The action canvas is the walk canvas grown evenly, so centre the walk frame in it.
        canvas = Image.new('RGBA', a[0].size, (0, 0, 0, 0))
        canvas.alpha_composite(w, ((a[0].width - w.width) // 2, (a[0].height - w.height) // 2))
        built.append((label, note, strip([canvas] + a, h), True))
    width = label_w + max(b[2].width for b in built) + pad * 2
    img = Image.new('RGBA', (width, 70 + len(built) * (h + 34)), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 18), title, fill=INK, font=font(24))
    y = 70
    for label, note, s, ref in built:
        d.text((pad, y + 10), label, fill=INK, font=font(18))
        d.text((pad, y + 36), note, fill=DIM, font=font(14))
        img.alpha_composite(s, (label_w, y))
        d.text((label_w, y + h + 4), 'walk frame (reference)        then the action frames 0, 1, 2 ...' if ref else 'action frames 0, 1, 2, 3', fill=DIM, font=font(13))
        y += h + 34
    img.convert('RGB').save(path, optimize=True)
    print(path.name, img.size)


board([
    ('Mascot Brute', E / 'mascot-walk.png', E / 'mascot-attack.png', 0, 'charge: crouch, then lunge'),
    ('Mascot Brute', E / 'mascot-walk.png', E / 'mascot-attack.png', 6, 'same, facing east'),
    ('Perfume Spritzer', E / 'spritzer-walk.png', E / 'spritzer-attack.png', 0, 'lob: draw back, spray'),
    ('Roofer', E / 'roofer-walk.png', E / 'roofer-attack.png', 6, 'lob: bucket back, throw'),
    ('Mall Owner (boss)', E / 'owner-walk.png', E / 'owner-attack.png', 0, 'slam: arms up, crash down'),
    ('Glamour Queen (boss)', E / 'glamour-queen-walk.png', E / 'glamour-queen-attack.png', 1, 'slam: camera up, flash, strike'),
    ('Zamboni Driver (boss)', E / 'zamboni-walk.png', E / 'zamboni-attack.png', 6, 'slam: scraper overhead, smash'),
], 'PixelLab attack wind-ups (shipped) - the look we want', OUT / 'examples-attacks.png')

board([
    ('Alex - dash', None, P / 'alex-dash.png', 6, '4 frames, low sprint'),
    ('Alex - aim', None, P / 'alex-aim.png', 6, '4 frames, arms raised, hands empty'),
    ('Hanger - hurt', E / 'hanger-walk.png', E / 'hanger-hurt.png', 0, '4 frames: recoil, wobble, recover'),
    ('Mannequin - hurt', E / 'mannequin-walk.png', E / 'mannequin-hurt.png', 0, '4 frames: plastic jolt'),
], 'Shorter actions: dash, aim, hurt reactions', OUT / 'examples-short.png', h=130)

# The sheet layout, drawn on a real sheet.
sheet = Image.open(E / 'mascot-attack.png').convert('RGBA')
s = sheet.height // 8
k = 0.75
small = sheet.resize((round(sheet.width * k), round(sheet.height * k)), Image.NEAREST)
fs = round(s * k)
left, top = 170, 110
img = Image.new('RGBA', (left + small.width + 40, top + small.height + 90), BG)
d = ImageDraw.Draw(img)
d.text((20, 18), 'Sheet layout: one row per facing, one column per frame', fill=INK, font=font(24))
d.text((20, 52), 'mascot-attack.png: 6 frames x 8 facings, 132 px square frames (walk is 96 px, grown 18 px each side)', fill=DIM, font=font(15))
for c in range(6):
    d.rectangle([left + c * fs, top - 34, left + (c + 1) * fs - 2, top - 6], fill=HOT if c < 4 else COOL)
    d.text((left + c * fs + 8, top - 30), f'frame {c}', fill=(20, 20, 20), font=font(15))
d.text((left, top + small.height + 12), 'pink = wind-up (frames 0-3, plays over the warning)    blue = release (frames 4-5, the hit)', fill=INK, font=font(16))
d.text((left, top + small.height + 40), 'Wind-up/release split is automatic: the last third of the frames is the release.', fill=DIM, font=font(14))
for r, name in enumerate(ORDER):
    d.text((20, top + r * fs + fs // 2 - 10), f'row {r}: {name}', fill=INK, font=font(16))
img.alpha_composite(small, (left, top))
for c in range(7):
    d.line([left + c * fs, top, left + c * fs, top + small.height], fill=(70, 66, 90), width=1)
for r in range(9):
    d.line([left, top + r * fs, left + small.width, top + r * fs], fill=(70, 66, 90), width=1)
img.convert('RGB').save(OUT / 'sheet-layout.png', optimize=True)
print('sheet-layout.png', img.size)

# The characters still waiting for animations: their 8 idle facings.
cast = [('Animatronic Elf', 'elf'), ('Rabid Poodle', 'poodle'), ('Hockey Goon', 'goon'), ('Bargain Hunter', 'shopper'), ('Mall Walker', 'walker')]
h = 120
rows = []
for name, kind in cast:
    idle = Image.open(E / f'{kind}-idle.png').convert('RGBA')
    n = idle.height
    rows.append((name, kind, strip([idle.crop((i * n, 0, (i + 1) * n, n)) for i in range(8)], h)))
img = Image.new('RGBA', (230 + max(r[2].width for r in rows) + 30, 70 + len(rows) * (h + 22)), BG)
d = ImageDraw.Draw(img)
d.text((20, 18), 'Characters to animate (their idle facings: S, SW, W, NW, N, NE, E, SE)', fill=INK, font=font(22))
y = 70
for name, kind, s in rows:
    d.text((20, y + 30), name, fill=INK, font=font(18))
    d.text((20, y + 56), f'{kind}-walk.png', fill=DIM, font=font(14))
    img.alpha_composite(s, (230, y))
    y += h + 22
img.convert('RGB').save(OUT / 'characters-to-animate.png', optimize=True)
print('characters-to-animate.png', img.size)
