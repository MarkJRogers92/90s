"""Builds an effect sheet for every weapon that still had none (roadmap V3, round 61).

Drawn in code, pixel by pixel, in five-colour palettes (outline/shadow, dark, body,
light, hot), like build_energy_effects.py. Each sheet is one horizontal strip of
frames with +X the direction of the swing or flight.

Melee sheets are anchored at the weapon's tip (pivot) and rotated to the current
swing angle; the arc is centred on the hand, 40 px back along -X. Swings turn
clockwise on screen, so light the weapon has already passed lies at negative
angles (up, in the sheet), and these trails are never mirrored (`trails`).

Families:
- smear: a blunt crescent of speed lines in the weapon's material, an impact flash
  at the tip;
- glint: a thin steel arc with sparkles (blades);
- notes: a swing that throws music notes and a sound ring (instruments);
- thrust / lash: narrow pokes and whips streak straight out to the tip.
Projectiles each get their own ammunition.

Writes the PNGs (+ a JSON manifest each) to public/assets/neon/weapon-effects/ and
the art table to src/game/view/generatedWeaponEffects.ts.

    python3 art/weapon-effects/derived/build_weapon_families.py
"""
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
EFFECTS = ROOT / 'public/assets/neon/weapon-effects'
TABLE = ROOT / 'src/game/view/generatedWeaponEffects.ts'

# Palettes: outline/shadow, dark, body, light, hot.
P = {
    'metal': [(40, 44, 58), (96, 108, 128), (164, 178, 198), (216, 228, 240), (255, 255, 255)],
    'wood': [(58, 34, 20), (120, 74, 40), (184, 128, 72), (230, 190, 130), (255, 244, 214)],
    'candy': [(90, 10, 24), (200, 30, 50), (255, 80, 90), (255, 220, 220), (255, 255, 255)],
    'rubber': [(110, 70, 10), (210, 150, 20), (255, 210, 50), (255, 240, 150), (255, 255, 230)],
    'card': [(70, 50, 30), (150, 112, 70), (204, 166, 112), (236, 214, 170), (255, 250, 236)],
    'ink': [(70, 10, 30), (170, 30, 60), (230, 60, 90), (250, 170, 180), (255, 240, 240)],
    'pretzel': [(70, 34, 10), (150, 80, 26), (206, 132, 52), (240, 196, 120), (255, 255, 255)],
    'hot': [(90, 20, 10), (200, 70, 20), (255, 140, 40), (255, 210, 120), (255, 250, 220)],
    'foam': [(60, 40, 110), (130, 90, 220), (120, 210, 255), (230, 200, 255), (255, 255, 255)],
    'neon': [(70, 10, 80), (200, 40, 200), (60, 230, 255), (255, 150, 240), (255, 255, 255)],
    'net': [(10, 60, 70), (30, 130, 140), (90, 210, 220), (190, 240, 245), (255, 255, 255)],
    'steel': [(30, 34, 46), (110, 120, 140), (190, 204, 220), (236, 244, 252), (255, 255, 255)],
    'ice': [(30, 60, 110), (80, 150, 220), (160, 220, 255), (220, 246, 255), (255, 255, 255)],
    'shears': [(30, 60, 30), (70, 140, 70), (190, 204, 220), (236, 244, 252), (255, 255, 255)],
    'guitar': [(80, 10, 40), (200, 40, 90), (255, 110, 70), (255, 220, 120), (255, 255, 255)],
    'keytar': [(30, 20, 80), (90, 60, 220), (60, 220, 255), (220, 200, 255), (255, 255, 255)],
    'drum': [(70, 40, 10), (180, 110, 40), (255, 200, 60), (255, 240, 170), (255, 255, 255)],
    'glow': [(10, 70, 30), (40, 170, 70), (110, 255, 120), (210, 255, 200), (255, 255, 255)],
    'leash': [(80, 10, 20), (190, 30, 50), (255, 80, 80), (255, 190, 180), (255, 255, 255)],
    'lace': [(60, 64, 80), (150, 156, 176), (220, 226, 240), (246, 248, 255), (255, 255, 255)],
    'mic': [(30, 34, 46), (110, 120, 140), (200, 210, 225), (255, 110, 200), (255, 255, 255)],
}
NOTE = ['.##', '.#.', '.#.', '##.', '##.']  # a 3x5 quaver


def blank(w, h):
    im = Image.new('RGBA', (w, h))
    return im, im.load()


def put(px, w, h, x, y, color):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = (*color, 255)


def strip(frames):
    w, h = frames[0].size
    sheet = Image.new('RGBA', (w * len(frames), h))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0))
    return sheet


def star(px, w, h, x, y, size, pal):
    for k in range(8):
        t = k * math.pi / 4
        length = size if k % 2 == 0 else size * 0.55
        for s in range(0, int(length) + 1):
            put(px, w, h, x + math.cos(t) * s, y + math.sin(t) * s, pal[4] if s <= 1 else pal[3] if s < length * 0.6 else pal[2])


HAND = (6, 32)
REACH = 40
GROW = [0.55, 0.85, 1.0, 1.0, 0.95, 0.85]
SWEEP = [0.3, 0.75, 1.1, 1.15, 0.95, 0.55]


def swing(pal, style, accent=None, band=5):
    """A crescent swing (smear, glint or notes) on 64x64, 6 frames, anchored at the tip (46, 32)."""
    frames = []
    for f in range(6):
        w, h = 64, 64
        im, px = blank(w, h)
        reach = REACH * GROW[f]
        sweep = SWEEP[f]
        for y in range(h):
            for x in range(w):
                dx, dy = x - HAND[0], y - HAND[1]
                d = math.hypot(dx, dy)
                a = math.atan2(dy, dx)
                if d < 10 or d > reach + 1 or a > 0.05 or a < -sweep:
                    continue
                t = -a / sweep
                if style == 'glint':
                    # A thin arc at the edge only.
                    if d < reach - 2 - (1 if t < 0.3 else 0):
                        continue
                    c = 4 if t < 0.15 else 3 if t < 0.45 else 2 if t < 0.75 else 1
                else:
                    # A solid band of motion along the striking edge, `band` px thick,
                    # with two thinner speed lines inside it, each shorter than the last.
                    inner = reach - band
                    if d >= inner:
                        if t > 0.95:
                            continue
                        c = 4 if t < 0.08 else 3 if t < 0.3 else 2 if t < 0.6 else 1
                        if t >= 0.6 and (x + y) % 2:
                            continue
                        if d > reach - 1 and c < 4:
                            c = min(4, c + 1)
                    elif abs(d - (inner - 3)) < 0.6 and t < 0.6:
                        c = 2 if t < 0.3 else 1
                    elif abs(d - (inner - 7)) < 0.6 and t < 0.32:
                        c = 1
                    else:
                        continue
                    if accent == 'stripes' and c in (2, 3) and int(a * 14) % 2 == 0:
                        c = 4
                    if accent == 'flecks' and c in (2, 3) and (x * 7 + y * 13) % 11 == 0:
                        c = 4
                    if accent == 'mesh' and d >= inner and (x + y) % 3 and (x - y) % 3:
                        continue
                if f >= 4 and c >= 2:
                    c -= 1
                put(px, w, h, x, y, pal[c])
        tip = (HAND[0] + reach, HAND[1])
        if style in ('smear', 'notes') and f in (2, 3):
            star(px, w, h, tip[0], tip[1], 4 + (f - 2) * 2, pal)
        if style == 'glint' and f in (1, 2, 3):
            for (gx, gy) in [(tip[0] - 2, tip[1] - 6 - f), (tip[0] - 10, tip[1] - 14 - f * 2)]:
                for dx, dy, c in [(0, 0, 4), (1, 0, 3), (-1, 0, 3), (0, 1, 3), (0, -1, 3)]:
                    put(px, w, h, gx + dx, gy + dy, pal[c])
        if style == 'notes' and f >= 1:
            for i, (ang, rad) in enumerate([(-0.4, 30), (-0.8, 36), (-0.2, 22)]):
                if i > f - 1:
                    continue
                nx = HAND[0] + math.cos(ang) * rad + f * 1.5
                ny = HAND[1] + math.sin(ang) * rad - f * 2
                for ry, row in enumerate(NOTE):
                    for rx, cell in enumerate(row):
                        if cell == '#':
                            put(px, w, h, nx + rx, ny + ry, pal[3 if i % 2 else 4])
            if f in (2, 3, 4):
                r = 3 + (f - 2) * 3
                for k in range(0, 360, 20):
                    tk = math.radians(k)
                    put(px, w, h, tip[0] + math.cos(tk) * r, tip[1] + math.sin(tk) * r, pal[2 if f < 4 else 1])
        frames.append(im)
    return strip(frames), (64, 64, 6, (46, 32))


def thrust(pal, lash):
    """A narrow poke (straight streaks) or a lash (a wavy line ending in a knot), 64x32, 6 frames, tip at (46, 16)."""
    frames = []
    for f in range(6):
        w, h = 64, 32
        im, px = blank(w, h)
        reach = [0.5, 0.85, 1.0, 1.0, 0.9, 0.75][f]
        tipx = 6 + 40 * reach
        if lash:
            wave = [3, 2.5, 1.5, 1, 1.5, 2][f]
            for x in range(6, int(tipx) + 1):
                y = 16 + math.sin((x - 6) / 6 + f) * wave * (1 - (x - 6) / 46)
                c = 3 if x > tipx - 10 else 2
                if f >= 4:
                    c -= 1
                put(px, w, h, x, y, pal[c])
                put(px, w, h, x, y + 1, pal[1])
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    if dx * dx + dy * dy <= 4:
                        put(px, w, h, tipx + dx, 16 + dy, pal[4] if dx * dx + dy * dy <= 1 else pal[3])
            if f in (2, 3):
                for k in range(0, 360, 45):
                    tk = math.radians(k)
                    put(px, w, h, tipx + math.cos(tk) * 5, 16 + math.sin(tk) * 5, pal[2])
        else:
            for i, dy in enumerate([-4, -2, 0, 2, 4]):
                start = 6 + abs(dy) * 3 + f * 2
                for x in range(start, int(tipx) + 1):
                    if dy and (x + i) % 4 == 0:
                        continue
                    c = 4 if dy == 0 and x > tipx - 6 else 3 if dy == 0 else 2 if abs(dy) == 2 else 1
                    if f >= 4 and c >= 2:
                        c -= 1
                    put(px, w, h, x, 16 + dy, pal[c])
            if f in (2, 3):
                star(px, w, h, tipx, 16, 4 + (f - 2) * 2, pal)
        frames.append(im)
    return strip(frames), (64, 32, 6, (46, 16))


def ball(pal, kind):
    """Round ammunition seen from above, spinning: a seam, stripes or spots turn with each frame."""
    frames = []
    for f in range(4):
        w, h = 16, 16
        im, px = blank(w, h)
        cx = cy = 7.5
        r = {'tennis': 5, 'gum': 5.5, 'pebble': 4, 'pepperoni': 5.5, 'marsh': 4.5}[kind]
        turn = f * math.pi / 4
        for y in range(h):
            for x in range(w):
                dx, dy = x - cx, y - cy
                if kind == 'marsh':
                    # A marshmallow: a rounded square, turning a quarter each frame.
                    rx = dx * math.cos(turn) + dy * math.sin(turn)
                    ry = -dx * math.sin(turn) + dy * math.cos(turn)
                    if max(abs(rx), abs(ry)) > r or (abs(rx) > r - 1 and abs(ry) > r - 1):
                        continue
                    edge = max(abs(rx), abs(ry)) > r - 1.2
                    c = 1 if edge else 3 if rx + ry < 0 else 2
                else:
                    d = math.hypot(dx, dy)
                    if kind == 'pebble':
                        d *= 1 + 0.08 * math.sin(math.atan2(dy, dx) * 2 + 1 + turn) + 0.05 * math.cos(math.atan2(dy, dx) * 5)
                    if d > r:
                        continue
                    edge = d > r - 1
                    c = 0 if edge else 2
                    if not edge and dx + dy < -2:
                        c = 3
                    a = math.atan2(dy, dx) - turn
                    if kind == 'tennis' and not edge and abs(math.sin(a * 2) * 2.5 - math.hypot(dx, dy) * 0.0 - (dx * math.cos(turn) + dy * math.sin(turn)) * 0.6) < 0.7:
                        c = 4
                    if kind == 'pepperoni' and not edge and (int((dx * math.cos(turn) - dy * math.sin(turn) + 8) / 3) + int((dx * math.sin(turn) + dy * math.cos(turn) + 8) / 3)) % 3 == 0:
                        c = 1
                put(px, w, h, x, y, pal[c])
        put(px, w, h, cx - r * 0.45, cy - r * 0.45, pal[4])
        frames.append(im)
    return strip(frames), (16, 16, 4, (8, 8))


def glob(pal, steam=False):
    """A wet glob flying +X with drips trailing behind; paint, slush or cocoa."""
    frames = []
    for f in range(4):
        w, h = 24, 16
        im, px = blank(w, h)
        cx, cy = 15, 8
        for y in range(h):
            for x in range(w):
                dx, dy = x - cx, y - cy
                # A teardrop: round at the front, drawn out into a tail behind (-X), wobbling.
                sx = dx * (0.6 if dx < 0 else 1)
                a = math.atan2(dy, sx)
                r = 4.5 + 0.35 * math.sin(a * 2 + f * 1.6)
                d = math.hypot(sx, dy)
                if d <= r:
                    c = 1 if d > r - 1 else 3 if dx + dy < -1 else 2
                    put(px, w, h, x, y, pal[c])
        put(px, w, h, cx - 1, cy - 2, pal[4])
        for i, (tx, ty) in enumerate([(8, 8), (5, 7), (3, 9)]):
            off = (f + i) % 3
            put(px, w, h, tx - off, ty + (1 if i == 2 and f % 2 else 0), pal[2 if i == 0 else 1])
            if i == 0:
                put(px, w, h, tx - off + 1, ty, pal[2])
        if steam:
            for i in range(3):
                put(px, w, h, cx - 2 + i * 2, cy - 7 + ((f + i) % 2), pal[4])
        frames.append(im)
    return strip(frames), (24, 16, 4, (15, 8))


def staple(pal):
    """A staple flying point-first, with two speed lines behind it."""
    frames = []
    for f in range(4):
        w, h = 16, 8
        im, px = blank(w, h)
        for x in range(10, 15):
            put(px, w, h, x, 2, pal[3])
            put(px, w, h, x, 5, pal[3])
        for y in range(2, 6):
            put(px, w, h, 14, y, pal[4])
        put(px, w, h, 10, 2, pal[1]); put(px, w, h, 10, 5, pal[1])
        for x in range(2 + f % 2, 8, 2):
            put(px, w, h, x, 3 if x % 4 else 4, pal[2])
        frames.append(im)
    return strip(frames), (16, 8, 4, (12, 4))


def seeds(pal):
    """Three seeds tumbling around one another."""
    frames = []
    for f in range(4):
        w, h = 16, 16
        im, px = blank(w, h)
        for k in range(3):
            t = f * math.pi / 6 + k * 2 * math.pi / 3
            sx, sy = 7.5 + math.cos(t) * 3.5, 7.5 + math.sin(t) * 3.5
            for dx, dy, c in [(0, 0, 2), (1, 0, 3), (-1, 0, 1), (0, 1, 1), (0, -1, 3)]:
                put(px, w, h, sx + dx, sy + dy, pal[c])
        frames.append(im)
    return strip(frames), (16, 16, 4, (8, 8))


def sound(pal):
    """A boombox blast: three arcs of sound rolling out +X, the front one brightest."""
    frames = []
    for f in range(4):
        w, h = 24, 24
        im, px = blank(w, h)
        for i in range(3):
            r = 4 + i * 4 + f
            for k in range(-50, 51, 5):
                t = math.radians(k)
                put(px, w, h, 2 + math.cos(t) * r, 12 + math.sin(t) * r, pal[4 if i == 2 else 3 if i == 1 else 2])
                if i == 2:
                    put(px, w, h, 1 + math.cos(t) * r, 12 + math.sin(t) * r, pal[1])
        frames.append(im)
    return strip(frames), (24, 24, 4, (14, 12))


def bolt(pal):
    """The Tesla Remote's arc of lightning: a zigzag that re-strikes every frame."""
    frames = []
    zigs = [[0, -3, 2, -2, 3, -1, 2, 0], [0, 2, -3, 1, -2, 3, -1, 0], [0, -2, 3, -3, 1, -1, 3, 0], [0, 3, -1, 2, -3, 2, -2, 0]]
    for f in range(4):
        w, h = 32, 16
        im, px = blank(w, h)
        pts = [(2 + i * 4, 8 + z) for i, z in enumerate(zigs[f])]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for s in range(9):
                x = x0 + (x1 - x0) * s / 8
                y = y0 + (y1 - y0) * s / 8
                put(px, w, h, x, y - 1, pal[2])
                put(px, w, h, x, y + 1, pal[1])
                put(px, w, h, x, y, pal[4])
        for dx, dy, c in [(0, 0, 4), (1, 0, 3), (0, -1, 3), (0, 1, 3), (2, 0, 2)]:
            put(px, w, h, 30 + dx, 8 + dy, pal[c])
        frames.append(im)
    return strip(frames), (32, 16, 4, (16, 8))


TENNIS = [(60, 80, 10), (150, 180, 30), (210, 240, 60), (240, 255, 140), (255, 255, 255)]
GUM = [(90, 10, 60), (200, 40, 120), (255, 90, 170), (255, 190, 220), (255, 255, 255)]
PEBBLE = [(50, 46, 44), (100, 96, 90), (150, 144, 136), (196, 190, 180), (240, 236, 228)]
PEPPERONI = [(80, 14, 10), (150, 30, 20), (210, 60, 40), (240, 120, 90), (255, 220, 200)]
MARSH = [(150, 140, 150), (200, 190, 200), (240, 236, 240), (255, 250, 255), (255, 255, 255)]
PAINT = [(60, 0, 50), (160, 20, 140), (240, 60, 200), (255, 170, 240), (255, 255, 255)]
SLUSH = [(20, 50, 110), (60, 120, 220), (110, 190, 255), (200, 240, 255), (255, 255, 255)]
COCOA = [(40, 20, 10), (100, 54, 28), (150, 90, 50), (200, 150, 110), (255, 250, 240)]
SEED = [(40, 30, 10), (90, 70, 30), (150, 120, 60), (200, 170, 100), (255, 250, 220)]
SOUND = [(40, 20, 80), (110, 60, 200), (190, 120, 255), (255, 200, 255), (255, 255, 255)]
TESLA = [(20, 20, 80), (80, 60, 220), (150, 200, 255), (220, 240, 255), (255, 255, 255)]

# weapon id -> (sheet name, (image, geometry), kind, flightAligned, baseRadius, baseScale, coreRadius)
MELEE = {
    'aluminum_bat': ('smear-bat', swing(P['metal'], 'smear', band=7)),
    'hockey_stick': ('smear-hockey', swing(P['wood'], 'smear')),
    'golf_club': ('smear-golf', swing(P['steel'], 'smear', band=3)),
    'lacrosse_stick': ('smear-lacrosse', swing(P['wood'], 'smear', 'mesh')),
    'pipe_wrench': ('smear-wrench', swing(P['metal'], 'smear', 'flecks', band=7)),
    'claw_hammer': ('smear-hammer', swing(P['steel'], 'smear', 'flecks', band=7)),
    'foam_sword': ('smear-foam', swing(P['foam'], 'smear', band=4)),
    'pizza_peel': ('smear-peel', swing(P['wood'], 'smear', 'flecks')),
    'dough_roller': ('smear-roller', swing(P['pretzel'], 'smear', band=7)),
    'cardboard_standee': ('smear-standee', swing(P['card'], 'smear')),
    'late_fee_stamp': ('smear-stamp', swing(P['ink'], 'smear', 'flecks')),
    'candy_cane': ('smear-candy', swing(P['candy'], 'smear', 'stripes')),
    'rubber_chicken': ('smear-chicken', swing(P['rubber'], 'smear', band=4)),
    'photo_backdrop': ('smear-backdrop', swing(P['neon'], 'smear', 'stripes')),
    'curling_iron': ('smear-curling', swing(P['hot'], 'smear')),
    'fish_net': ('smear-net', swing(P['net'], 'smear', 'mesh')),
    'pretzel_rod': ('smear-pretzel', swing(P['pretzel'], 'smear', 'flecks', band=4)),
    'pizza_cutter': ('glint-cutter', swing(P['steel'], 'glint')),
    'salon_scissors': ('glint-scissors', swing(P['metal'], 'glint')),
    'hedge_trimmer': ('glint-trimmer', swing(P['shears'], 'glint')),
    'figure_skate': ('glint-skate', swing(P['ice'], 'glint')),
    'electric_guitar': ('notes-guitar', swing(P['guitar'], 'notes')),
    'keytar': ('notes-keytar', swing(P['keytar'], 'notes')),
    'drumsticks': ('notes-drums', swing(P['drum'], 'notes', band=3)),
    'yo_yo': ('thrust-yoyo', thrust(P['glow'], True)),
    'dog_leash': ('thrust-leash', thrust(P['leash'], True)),
    'skate_lace': ('thrust-lace', thrust(P['lace'], True)),
    'tripod': ('thrust-tripod', thrust(P['metal'], False)),
    'mic_stand': ('thrust-mic', thrust(P['mic'], False)),
}
PROJECTILES = {
    'tennis_ball_launcher': ('ammo-tennis', ball(TENNIS, 'tennis'), False, 5, 1.2),
    'gumball_launcher': ('ammo-gumball', ball(GUM, 'gum'), False, 5, 1.2),
    'slingshot': ('ammo-pebble', ball(PEBBLE, 'pebble'), False, 4, 1.2),
    'pepperoni_launcher': ('ammo-pepperoni', ball(PEPPERONI, 'pepperoni'), False, 5, 1.2),
    'marshmallow_shooter': ('ammo-marshmallow', ball(MARSH, 'marsh'), False, 5, 1.2),
    'paint_marker': ('ammo-paint', glob(PAINT), True, 5, 1.1),
    'slushie_cup': ('ammo-slush', glob(SLUSH), True, 6, 1.2),
    'cocoa_thermos': ('ammo-cocoa', glob(COCOA, steam=True), True, 6, 1.2),
    'staple_gun': ('ammo-staple', staple(P['metal']), True, 3, 1.2),
    'seed_spreader': ('ammo-seeds', seeds(SEED), False, 4, 1.3),
    'boombox': ('ammo-sound', sound(SOUND), True, 8, 1.2),
    'rc_blimp_remote': ('ammo-tesla', bolt(TESLA), True, 4, 1.2),
}


def camel(name):
    head, *rest = name.split('-')
    return head + ''.join(part.title() for part in rest)


def write(name, image, geometry):
    fw, fh, frames, pivot = geometry
    assert image.size == (fw * frames, fh), (name, image.size)
    colours = len({p[:3] for p in image.getdata() if p[3]})
    assert colours <= 6, (name, colours)
    image.save(EFFECTS / f'{name}.png')
    (EFFECTS / f'{name}.json').write_text(json.dumps({
        'name': name, 'frameWidth': fw, 'frameHeight': fh, 'frameCount': frames, 'layout': 'horizontal',
        'sheetSize': [fw * frames, fh], 'pivotPixels': list(pivot), 'originNormalized': [pivot[0] / fw, pivot[1] / fh],
        'direction': '+X', 'colours': colours, 'source': 'art/weapon-effects/derived/build_weapon_families.py',
    }, indent=2) + '\n')
    return colours


if __name__ == '__main__':
    art = []
    for weapon, (name, (image, geometry)) in MELEE.items():
        write(name, image, geometry)
        fw, fh, frames, (px, py) = geometry
        # Swings reach past the weapon's head (1.05); a thrust's streak is already long (0.9).
        scale = 0.9 if name.startswith('thrust-') else 1.05
        art.append(f"  {camel(name)}: {{ ...art('{name}', {fw}, {fh}, {frames}, {px}, {py}, true, 1, {scale}, 12), trails: true }},")
    for weapon, (name, (image, geometry), aligned, radius, scale) in PROJECTILES.items():
        write(name, image, geometry)
        fw, fh, frames, (px, py) = geometry
        core = max(4, round(max(fw, fh) * 0.3))
        art.append(f"  {camel(name)}: art('{name}', {fw}, {fh}, {frames}, {px}, {py}, {'true' if aligned else 'false'}, {radius}, {scale}, {core}),")
    TABLE.write_text('\n'.join([
        '/** Generated by art/weapon-effects/derived/build_weapon_families.py: do not edit by hand. */',
        "import type { WeaponEffectArt } from './weaponEffects';",
        '',
        'type Art = (name: string, width: number, height: number, frames: number, pivotX: number, pivotY: number,',
        '  flightAligned: boolean, baseRadius: number, baseScale: number, coreRadius: number) => WeaponEffectArt;',
        '',
        '/** Built from the shared constructor, so key and file naming match the authored sheets. */',
        'export function generatedEffectArt(art: Art) {',
        '  return {',
        *['  ' + line for line in art],
        '  } as const;',
        '}',
        '',
        '/** Weapon id to sheet name (camelCase key in the generated table). */',
        'export const GENERATED_MELEE: Readonly<Record<string, string>> = {',
        *[f"  {w}: '{camel(n)}'," for w, (n, _img) in MELEE.items()],
        '};',
        'export const GENERATED_PROJECTILES: Readonly<Record<string, string>> = {',
        *[f"  {w}: '{camel(n)}'," for w, (n, *_rest) in PROJECTILES.items()],
        '};',
        '',
    ]))
    preview_rows = [image for _n, (image, _g) in MELEE.values()] + [p[1][0] for p in PROJECTILES.values()]
    width = max(i.width for i in preview_rows)
    sheet = Image.new('RGBA', (width, sum(i.height + 4 for i in preview_rows)), (20, 16, 30, 255))
    y = 0
    for image in preview_rows:
        sheet.alpha_composite(image, (0, y))
        y += image.height + 4
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(Path(__file__).with_name('families-preview.png'))
    print(f'wrote {len(MELEE)} melee and {len(PROJECTILES)} projectile sheets and {TABLE.relative_to(ROOT)}')
