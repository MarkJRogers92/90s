#!/usr/bin/env python3
"""Pack a PixelLab character's 8 rotations into an idle strip straight from
their public frame URLs (works while the character's zip is locked by a
pending job).

  fetch_rotations.py <character-id> <rotation ?t= token> <out.png>
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

OWNER = '0794a0d2-e895-4ba0-be06-3b7dc64077bc'
ORDER = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']

char_id, token, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
base = f'https://backblaze.pixellab.ai/file/pixellab-characters/{OWNER}/{char_id}/rotations'
with tempfile.TemporaryDirectory() as work:
    frames = []
    for direction in ORDER:
        path = Path(work) / f'{direction}.png'
        subprocess.run(['curl', '-sfL', '-o', str(path), f'{base}/{direction}.png?t={token}'], check=True)
        frames.append(Image.open(path).convert('RGBA'))
    size = frames[0].size
    sheet = Image.new('RGBA', (size[0] * 8, size[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * size[0], 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f'{out}: 8 facings of {size[0]}x{size[1]}')
