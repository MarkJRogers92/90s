"""Rebuild the three directly authored laser-family pixel animations.

    python3 art/weapon-effects/laser-pilot/build_laser_effects.py

Uses the repository's Pixel Forge Sprite/DSL renderer, not generated/raster
image conversion. Writes editable per-frame DSL and indexed Sprite JSON plus
the exact local runtime strips and metadata. No resize, filtering or trimming.
"""
from hashlib import sha256
import json
from pathlib import Path
import sys

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'tools/pixel-forge'))
from forge.dsl import render  # noqa: E402
from forge.sprite import Sprite  # noqa: E402

OUT = ROOT / 'public/assets/neon/weapon-effects'
RED = {'d': '#752339', 'm': '#ef4057', 'l': '#ff9696', 'h': '#ffeeea'}
CYAN = {'d': '#184d62', 'm': '#27b5ca', 'l': '#92f3f4', 'h': '#e8ffff'}
SWORD = {'d': '#23556a', 'm': '#53cbd3', 'l': '#b0f2ef', 'h': '#f0fffa'}


def line(points, color):
    return {'op': 'line', 'points': points, 'c': color}


def rect(x, y, width, height, color):
    return {'op': 'rect', 'x': x, 'y': y, 'w': width, 'h': height, 'c': color}


def pointer(frame):
    # Fixed, needle-thin silhouette and constant color counts. Only two small
    # red edge highlights move: there is no white on/off brightness pulse.
    return [
        line([[4, 6], [28, 6]], 'm'),
        line([[7, 5], [26, 5]], 'm'), line([[7, 7], [26, 7]], 'd'),
        line([[11, 6], [27, 6]], 'h'), line([[5, 6], [10, 6]], 'l'),
        line([[12 + frame * 2, 5], [13 + frame * 2, 5]], 'l'),
        line([[8 + frame * 2, 7], [9 + frame * 2, 7]], 'm'),
    ]


def tag_bolt(frame):
    # Each projectile is ONE segmented bolt. The existing +/-3 degree prongs
    # create the twin volley; painting twins here would misleadingly draw four.
    ops = []
    for start, end in [(4, 10), (13, 20), (23, 28)]:
        ops += [
            rect(start + 1, 5, end - start - 1, 7, 'd'),
            rect(start, 7, end - start + 1, 3, 'd'),
            rect(start + 1, 6, end - start - 1, 5, 'm'),
            line([[start + 1, 8], [end - 1, 8]], 'h'),
            line([[start + 1, 9], [end - 1, 9]], 'l'),
        ]
    # One moving pixel glint on each top edge, fixed energy in every frame.
    ops += [line([[5 + frame, 6], [5 + frame, 6]], 'l'),
            line([[14 + frame, 6], [14 + frame, 6]], 'l'),
            line([[24 + frame, 6], [24 + frame, 6]], 'l')]
    return ops


# Each outline ends at the blade tip (48, 24), so rotating the effect with the
# held blade preserves attachment. This is an open ribbon, never a solid wedge.
SWORD_CURVES = [
    [[29, 23], [37, 22], [43, 22], [48, 24]],
    [[17, 16], [27, 14], [36, 16], [43, 19], [48, 24]],
    [[7, 13], [16, 10], [27, 11], [36, 14], [43, 18], [48, 24]],
    [[9, 11], [18, 9], [28, 11], [38, 15], [45, 20], [48, 24]],
    [[18, 15], [27, 14], [36, 16], [43, 19], [48, 24]],
    [[29, 20], [37, 19], [44, 21], [48, 24]],
]


def sword_slash(frame):
    curve = SWORD_CURVES[frame]
    ops = [line([[x, y + 2] for x, y in curve], 'd'),
           line([[x, y + 1] for x, y in curve], 'm'),
           line(curve, 'l'), line(curve[-3:], 'h')]
    if 1 <= frame <= 4:
        # Thin lower afterimage, separated by transparent pixels from the
        # leading filament; its taper meets the same moving blade tip.
        tail = [[curve[0][0] + 3, curve[0][1] + 7], [31, 21], [40, 22], [48, 24]]
        ops += [line([[x, y + 1] for x, y in tail], 'd'), line(tail, 'm')]
        if frame in (2, 3):
            ops += [line([[15 + frame, 24], [24, 25], [31, 25]], 'd')]
    # Keep the visible contact filament attached in every frame.
    ops += [line([[44, 22], [48, 24]], 'h')]
    return ops


SPECS = [
    ('laser-pointer-beam', 32, 12, 4, (16, 6), RED, pointer, True, 'laser-pointer',
     'Needle-thin finite red beam segment with a steady white core; travels with the real projectile.'),
    ('laser-tag-bolt', 32, 16, 4, (16, 8), CYAN, tag_bolt, True, 'laser-tag-rifle',
     'Chunky cyan three-segment bolt with clear gaps; one body for each of the existing twin projectiles.'),
    ('laser-sword-slash', 64, 48, 6, (48, 24), SWORD, sword_slash, False, 'lightsaber-toy',
     'Luminous cyan blade-tip ribbon with open transparent space; follows the current held sword tip.'),
]


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, width, height, count, pivot, palette, author, loop, icon, description in SPECS:
        source = HERE / name / 'forge'
        source.mkdir(parents=True, exist_ok=True)
        sheet = Image.new('RGBA', (width * count, height))
        frames = []
        for frame in range(count):
            program = {'width': width, 'height': height, 'palette': palette, 'base': 'blank',
                       'light': 'self-lit', 'ops': author(frame)}
            result = render(program)
            if result.errors:
                raise RuntimeError(result.errors)
            image = result.sprite.to_image()
            sheet.paste(image, (frame * width, 0))
            write_json(source / f'frame_{frame:02d}.dsl.json', program)
            write_json(source / f'frame_{frame:02d}.sprite.json', result.sprite.to_dict())
            alpha = image.getchannel('A')
            frames.append({'index': frame, 'boundingBoxExclusive': alpha.getbbox(),
                           'opaquePixels': sum(value == 255 for value in alpha.tobytes()),
                           'rgbaSha256': sha256(image.tobytes()).hexdigest(),
                           'alphaValues': sorted(set(alpha.tobytes()))})
        write_json(source / 'sheet.sprite.json', Sprite.from_image(sheet).to_dict())
        sheet.save(OUT / f'{name}.png')
        metadata = {
            'name': name, 'description': description,
            'frameWidth': width, 'frameHeight': height, 'frameCount': count,
            'layout': 'horizontal', 'sheetSize': [width * count, height],
            'pivotPixels': pivot, 'originNormalized': [pivot[0] / width, pivot[1] / height],
            'direction': '+X', 'loop': loop,
            'durationsMs': [50] * count if loop else [50, 50, 33, 50, 50, 34],
            'sourcePalette': palette, 'alpha': 'binary', 'scale': 1, 'filter': 'nearest',
            'trimmed': False, 'blend': 'normal',
            'forgeEngine': 'Pixel Forge direct-authoring Sprite/DSL',
            'source': f'art/weapon-effects/laser-pilot/{name}/forge',
            'rebuild': 'python3 art/weapon-effects/laser-pilot/build_laser_effects.py',
            'iconsInspected': [{'name': icon, 'sha256': sha256((ROOT / f'public/assets/neon/items/{icon}.png').read_bytes()).hexdigest()}],
            'frames': frames,
        }
        write_json(OUT / f'{name}.json', metadata)
        print(f'{name}: {count} frames, {width}x{height}, pivot {pivot}; source and runtime written')


if __name__ == '__main__':
    build()
