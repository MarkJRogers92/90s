#!/usr/bin/env python3
"""Recolour the Developer's navy suit to the cream power suit he was meant to wear.

PixelLab drew the suit navy, which vanishes on the night roof. Every
blue-dominant pixel (the suit's navies; outlines, hair, glasses, tie and skin
are not) is mapped by brightness onto a cream ramp, keeping the shading.

  python3 recolor_suit.py SHEET.png [SHEET.png ...]
"""
import sys
from PIL import Image

SHADOW, MID, LIGHT = (112, 96, 78), (196, 178, 150), (236, 224, 198)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def cream(r, g, b):
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    if lum <= 46:
        return lerp(SHADOW, MID, max(0.0, (lum - 12) / 34))
    return lerp(MID, LIGHT, min(1.0, (lum - 46) / 30))


for path in sys.argv[1:]:
    image = Image.open(path).convert('RGBA')
    pixels = image.load()
    changed = 0
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and b > r + 12 and b >= g:
                pixels[x, y] = (*cream(r, g, b), a)
                changed += 1
    image.save(path)
    print(f'{path}: {changed} suit pixels recoloured')
