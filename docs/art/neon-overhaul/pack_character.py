#!/usr/bin/env python3
"""Pack a PixelLab character export into a DEAD MALL walk sheet.

The game's actor sheets are rows of 48px (or 32x48) frames, one row per
facing in ACTOR_DIRECTION_ORDER (south, south-west, west, north-west, north,
north-east, east, south-east). A direction the export lacks is mirrored from
its left/right twin when that exists (east from west, north-east from
north-west, south-east from south-west), else borrows its nearest available
neighbour, so the sheet is always complete.

  python3 pack_character.py EXPORT_DIR ANIMATION_NAME OUT.png
  python3 pack_character.py EXPORT_DIR --rotations OUT.png   # 1-row idle strip
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ORDER = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']


MIRROR = {'east': 'west', 'west': 'east', 'north-east': 'north-west', 'north-west': 'north-east',
          'south-east': 'south-west', 'south-west': 'south-east'}


def source_for(direction: str, available: set[str]) -> tuple[str, bool]:
    """The export direction to draw `direction` from, and whether to flip it."""
    if direction in available:
        return direction, False
    twin = MIRROR.get(direction)
    if twin in available:
        return twin, True
    return nearest(direction, available), False


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
    # PixelLab grows the canvas per direction as limbs spread, so frames can
    # differ in size. Every cell is the largest frame, each frame centred in
    # it (PixelLab frames are pivot-centred), so the creature never jumps.
    loaded = {d: [Image.open(export / p).convert('RGBA') for p in paths] for d, paths in frames.items()}
    width = max(frame.width for frames_ in loaded.values() for frame in frames_)
    height = max(frame.height for frames_ in loaded.values() for frame in frames_)
    width = height = max(width, height)
    sheet = Image.new('RGBA', (width * columns, height * 8), (0, 0, 0, 0))
    for row, direction in enumerate(ORDER):
        source, flip = source_for(direction, available)
        cells = loaded[source]
        for column in range(columns):
            frame = cells[column % len(cells)]
            if flip:
                frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            ox = column * width + (width - frame.width) // 2
            oy = row * height + (height - frame.height) // 2
            sheet.alpha_composite(frame, (ox, oy))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f'{out}: {columns} frames x 8 facings of {width}x{height}')


if __name__ == '__main__':
    main()
