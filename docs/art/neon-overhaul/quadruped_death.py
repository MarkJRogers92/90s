"""Build a death sheet for a PixelLab quadruped from its packed idle strip.

PixelLab has no death template for animals, so the round 50 Rabid Poodle and
Mr. Whiskers keel over procedurally: each facing's idle frame squashes down
onto its feet line, tips a little and fades over seven frames, laid out like
the other death sheets (one row per facing, in the idle strip's order).

    python3 docs/art/neon-overhaul/quadruped_death.py <anim-name-idle.png> <out-death.png>
"""
import sys

from PIL import Image

FRAMES = 7
FEET = 0.84  # the game anchors every frame at 84% of its height

source = Image.open(sys.argv[1]).convert('RGBA')
size = source.height
facings = source.width // size
sheet = Image.new('RGBA', (size * FRAMES, size * facings), (0, 0, 0, 0))
for row in range(facings):
    frame = source.crop((row * size, 0, (row + 1) * size, size))
    for k in range(FRAMES):
        t = k / (FRAMES - 1)
        squash = max(0.25, 1 - 0.7 * t)
        height = max(1, round(size * squash))
        squashed = frame.resize((size, height), Image.NEAREST)
        tipped = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        # Keep the feet where they were: the squash shrinks toward the feet line.
        top = round(size * FEET - height * FEET)
        tipped.alpha_composite(squashed, (0, max(0, top)))
        tipped = tipped.rotate(-12 * t, resample=Image.NEAREST, center=(size / 2, size * FEET))
        alpha = tipped.getchannel('A').point(lambda a, f=1 - 0.65 * t: round(a * f) if a else 0)
        tipped.putalpha(alpha)
        sheet.alpha_composite(tipped, (k * size, row * size))
sheet.save(sys.argv[2])
print(f'{sys.argv[2]}: {FRAMES} frames x {facings} facings of {size}x{size}')
