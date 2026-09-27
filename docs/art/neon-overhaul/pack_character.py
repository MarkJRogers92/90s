#!/usr/bin/env python3
"""Pack a PixelLab character export into a DEAD MALL walk sheet.

The game's actor sheets are rows of 48px (or 32x48) frames, one row per
facing in ACTOR_DIRECTION_ORDER (south, south-west, west, north-west, north,
north-east, east, south-east). A direction the export lacks borrows its
nearest available neighbour so the sheet is always complete.

  python3 pack_character.py EXPORT_DIR ANIMATION_NAME OUT.png
  python3 pack_character.py EXPORT_DIR --rotations OUT.png   # 1-row idle strip
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ORDER = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']


def nearest(direction: str, available: set[str]) -> str:
    index = ORDER.index(direction)
    for offset in (0, 1, -1, 2, -2, 3, -3, 4):
        candidate = ORDER[(index + offset) % 8]
        if candidate in available:
            return candidate
    raise SystemExit('export has no frames for this animation')


def pack_rotations(export: Path, out: Path) -> None:
    meta = json.loads((export / 'metadata.json').read_text())
    rotations = meta['states'][0]['frames']['rotations']
    first = Image.open(export / next(iter(rotations.values())))
    width, height = first.size
    sheet = Image.new('RGBA', (width * 8, height), (0, 0, 0, 0))
    for column, direction in enumerate(ORDER):
        frame = Image.open(export / rotations[nearest(direction, set(rotations))]).convert('RGBA')
        sheet.alpha_composite(frame, (column * width, 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f'{out}: 8 facings of {width}x{height}')


def main() -> None:
    export, animation, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    if animation == '--rotations':
        pack_rotations(export, out)
        return
    meta = json.loads((export / 'metadata.json').read_text())
    frames = meta['states'][0]['frames']['animations'][animation]
    available = set(frames)
    columns = max(len(paths) for paths in frames.values())
    first = Image.open(export / next(iter(frames.values()))[0])
    width, height = first.size
    sheet = Image.new('RGBA', (width * columns, height * 8), (0, 0, 0, 0))
    for row, direction in enumerate(ORDER):
        paths = frames[nearest(direction, available)]
        for column in range(columns):
            frame = Image.open(export / paths[column % len(paths)]).convert('RGBA')
            sheet.alpha_composite(frame, (column * width, row * height))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f'{out}: {columns} frames x 8 facings of {width}x{height}')


if __name__ == '__main__':
    main()
