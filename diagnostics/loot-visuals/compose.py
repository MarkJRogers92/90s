#!/usr/bin/env python3
"""Render recorded runtime calls offline. No browser, gameplay screenshot, or new game art."""
import json
import math
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'preview'
OUT.mkdir(exist_ok=True)
DATA = json.loads((HERE / 'recording.json').read_text())
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(size=16, bold=False):
    return ImageFont.truetype(BOLD_PATH if bold else FONT_PATH, size)
BG = '#11151f'
FG = '#eee9db'
MUTED = '#afb9cb'
ACCENT = '#8be9df'
def text(im, xy, value, size=16, color=FG, bold=False):
    ImageDraw.Draw(im).text(xy, value, font=font(size, bold), fill=color)
def rgba(value, alpha=1):
    if isinstance(value, int): return (value >> 16, value >> 8 & 255, value & 255, round(alpha * 255))
    if value.startswith('rgba'):
        numbers = [float(n) for n in re.findall(r'[\d.]+', value)]
        return (*map(int, numbers[:3]), round(numbers[3] * alpha * 255))
    return (*tuple(bytes.fromhex(value.lstrip('#'))), round(alpha * 255))
def paint_commands(im, commands, offset=(0, 0)):
    ox, oy = offset
    for c in commands:
        layer = Image.new('RGBA', im.size)
        draw = ImageDraw.Draw(layer)
        p = c['points']; fill = rgba(c['color'], c['alpha'])
        if c['kind'] == 'rect':
            x, y, w, h = p
            draw.rectangle((x - ox, y - oy, x + w - 1 - ox, y + h - 1 - oy), fill=fill)
        elif c['kind'] == 'triangle':
            draw.polygon([(p[i] - ox, p[i+1] - oy) for i in (0, 2, 4)], fill=fill)
        im.alpha_composite(layer)
    return im
TEXTURES = {}
def texture(key):
    if key not in TEXTURES:
        if key in DATA['generated']:
            t = DATA['generated'][key]
            TEXTURES[key] = paint_commands(Image.new('RGBA', (t['width'], t['height'])), t['commands'])
        elif key.startswith('neon:item:'):
            TEXTURES[key] = Image.open(ROOT / 'public/assets/neon/items' / (key.split(':')[-1] + '.png')).convert('RGBA')
        else: raise ValueError(key)
    return TEXTURES[key]
def crop(record, floor='terrazzo', box=(408, 210, 552, 298)):
    left, top, right, bottom = box
    im = Image.new('RGBA', (right-left, bottom-top))
    tile = texture('floor:' + floor)
    for y in range(-(top % 64), im.height, 64):
        for x in range(-(left % 64), im.width, 64): im.alpha_composite(tile, (x, y))
    for obj in record['objects']:
        if obj['kind'] == 'graphics': paint_commands(im, obj['commands'], (left, top))
        elif obj['kind'] == 'image':
            t = texture(obj['texture']['key'])
            sx, sy = obj['scaleX'], obj['scaleY']
            x = obj['x'] - obj['originX'] * t.width * sx
            y = obj['y'] - obj['originY'] * t.height * sy
            # Exact recorded transform coefficients; nearest-neighbor software sampling.
            layer = t.transform(im.size, Image.Transform.AFFINE,
                (1/sx, 0, (left-x)/sx, 0, 1/sy, (top-y)/sy), Image.Resampling.NEAREST)
            if obj['alpha'] != 1:
                layer.putalpha(layer.getchannel('A').point(lambda a: round(a * obj['alpha'])))
            im.alpha_composite(layer)
    return im
def enlarge(im, n=2): return im.resize((im.width*n, im.height*n), Image.Resampling.NEAREST)
def board(size, title, subtitle):
    im = Image.new('RGBA', size, BG)
    text(im, (24, 18), title, 27, bold=True)
    text(im, (24, 56), 'OFFLINE EXACT-TRANSFORM COMPOSITE, NOT GAMEPLAY SCREENSHOT', 16, ACCENT, True)
    text(im, (24, 82), subtitle, 15, MUTED)
    return im
def footer(im, lines):
    y = im.height - 25 * len(lines) - 10
    for line in lines:
        text(im, (24, y), line, 14, MUTED); y += 25
def save(im, name):
    im.convert('RGB').save(OUT / name)
    print(OUT / name)

names = {'cash': 'Mall Tokens', 'snack': 'Pretzel', 'common': 'Pump-Action Soaker', 'rare': 'Golden Mop (rare)'}
for floor, descriptor, number in [('terrazzo', 'LIGHT TERRAZZO', '01'), ('carpet', 'DARK CARPET', '02')]:
    im = board((1328, 906), 'Ground loot / ' + descriptor,
        f"Same authored pixels and world position (480,260), t={DATA['edgeTick']}; no new item art.")
    for i, key in enumerate(names):
        x = 24 + i * 326
        text(im, (x, 120), names[key], 20, bold=True)
        b = crop(DATA['stills'][key]['before'], floor)
        a = crop(DATA['stills'][key]['after'], floor)
        text(im, (x, 154), 'BEFORE / native 1x', 15, '#ffc28b')
        im.alpha_composite(b, (x + 72, 182))
        text(im, (x, 281), 'BEFORE / nearest 2x', 15, '#ffc28b')
        im.alpha_composite(enlarge(b), (x, 308))
        text(im, (x, 508), 'AFTER / native 1x', 15, ACCENT)
        im.alpha_composite(a, (x + 72, 535))
        text(im, (x, 634), 'AFTER / nearest 2x', 15, ACCENT)
        im.alpha_composite(enlarge(a), (x, 661))
    footer(im, ['Transforms, marker commands, floor pixels and item pixels come from source. Native 1x means one game pixel per image pixel.',
        'Room lighting, bloom, contact shadows, actors and occluders are omitted from BOTH sides. This is a readability diagnostic.'])
    save(im, number + '-floor-' + floor + '.png')

im = board((1512, 1180), 'Settled motion / identity stays readable',
    'Six real ticks after the drop hop. Source transforms are recorded, not manually restyled. All crops enlarged 3x nearest-neighbor.')
for i, tick in enumerate(DATA['ticks']): text(im, (235 + i*207, 122), 'tick ' + str(tick), 17, bold=True)
for row, (kind, era) in enumerate([('cash','before'), ('cash','after'), ('rare','before'), ('rare','after')]):
    y = 155 + row*230
    text(im, (24, y+55), names[kind], 19, bold=True)
    text(im, (24, y+85), era.upper(), 18, ACCENT if era == 'after' else '#ffc28b', True)
    for i, frame in enumerate(DATA['motion'][kind]):
        picture = crop(frame[era], 'carpet', (448, 215, 512, 278))
        im.alpha_composite(enlarge(picture, 3), (220+i*207, y))
        obj = next(o for o in frame[era]['objects'] if o['kind']=='image')
        text(im, (220+i*207, y+192), f"scale {obj['scaleX']:.3f} x {obj['scaleY']:.3f}", 13)
        text(im, (220+i*207, y+211), f"world y {obj['y']}", 12, MUTED)
footer(im, ['Before: the token repeatedly narrows, and the rare grows/shrinks. After: settled scales stay fixed at 2x / 1x.',
    'The new one-time hop is at most 7px for 16 ticks; reduced motion suppresses it. Full-room glow/shadows are omitted.'])
save(im, '03-settled-motion.png')

label_names = [('fullHealth','Full health'), ('hurt','Missing health'), ('common','Ordinary item'),
    ('rare','Rare item'), ('stepAway','Player-dropped item'), ('cash','Cash value')]
im = board((1340, 1380), 'Nearby inspection / exact in-game wording',
    'Actual LootView labels, at source font size 1. One nearest pickup; 50px from the player in a safe, clear room.')
for row, (key, title) in enumerate(label_names):
    y = 122 + row*195
    text(im, (24, y+22), title, 18, bold=True)
    pic = crop(DATA['labels'][key], 'carpet', (320, 216, 640, 308))
    text(im, (255, y), 'NATIVE 1x', 13, MUTED)
    im.alpha_composite(pic, (255, y+28))
    text(im, (630, y), 'NEAREST 2x', 13, MUTED)
    im.alpha_composite(enlarge(pic), (630, y+22))
footer(im, ['Labels are suppressed during combat, projectile danger, contextual interactions, menus and collection acknowledgements.',
    'No player is drawn in this diagnostic. Name, health-full and step-away text is from the actual renderer.'])
save(im, '04-nearby-labels.png')

im = board((1328, 886), 'Collected / receipts require actual success',
    'Each receipt follows collectTokens or collectItemDrops, using the real simulation log. Nothing is inferred from disappearance.')
for row, key in enumerate(names):
    y = 126 + row*162
    entry = DATA['receipts'][key]
    live = entry['visible']; gone = entry['expired']
    text(im, (24, y+15), names[key], 19, bold=True)
    text(im, (24, y+46), f"t={live['tick']}: collected", 15, ACCENT)
    text(im, (24, y+71), f"t={gone['tick']}: expired", 15, MUTED)
    a = crop(live, 'terrazzo', (320, 266, 640, 310))
    b = crop(gone, 'terrazzo', (320, 266, 640, 310))
    text(im, (275, y), 'ACTUAL RECEIPT / nearest 2x', 13, ACCENT)
    im.alpha_composite(enlarge(a), (275, y+26))
    text(im, (961, y), 'AFTER EXPIRY / native 1x', 13, MUTED)
    im.alpha_composite(b, (961, y+42))
    text(im, (275, y+119), next(s for s in reversed(live['trace']) if any(v in s for v in ['Mall Tokens', 'Food court pretzel', 'Found:', 'RARE FIND:'])), 13, MUTED)
footer(im, ['A receipt lasts 78 simulation ticks (about 1.3s at 60Hz). Ordinary pause freezes that countdown.',
    'Native text and exact drawing commands are verified offline; this does not prove live framing, occlusion or gameplay feel.'])
save(im, '05-collection-receipts.png')

# Lossless source-pixel assets make it easy to inspect and reproduce the crop inputs.
for key in [FX for FX in DATA['generated'] if not FX.startswith('label:')]:
    texture(key).save(OUT / (key.replace(':', '-') + '.png'))
