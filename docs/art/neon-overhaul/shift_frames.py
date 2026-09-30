#!/usr/bin/env python3
"""Shift every frame of a packed sheet down by N pixels inside its cell.

PixelLab sometimes grows a character's canvas and leaves the feet well above
the frame's bottom; the game anchors every actor frame at 84% of its height,
so the older sheets (feet at ~96%) and a grown one would stand at different
heights. Shifting the grown sheet's frames down lines their feet up.

  python3 shift_frames.py SHEET.png FRAME_SIZE PIXELS
"""
import sys
from PIL import Image

sheet_path, frame, shift = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
sheet = Image.open(sheet_path).convert('RGBA')
out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
for top in range(0, sheet.height, frame):
    for left in range(0, sheet.width, frame):
        cell = sheet.crop((left, top, left + frame, top + frame - shift))
        out.alpha_composite(cell, (left, top + shift))
out.save(sheet_path)
print(f'{sheet_path}: frames shifted down {shift}px')
