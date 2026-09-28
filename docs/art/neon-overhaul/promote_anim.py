#!/usr/bin/env python3
"""Promote packed anim-<name>.png sheets into public/assets/neon/enemies/ and
update manifest.json in place, without re-running the full importer (which
needs the legacy asset tree).

  python3 docs/art/neon-overhaul/promote_anim.py spitter-attack spitter-death
  python3 docs/art/neon-overhaul/promote_anim.py player:alex-death   # char-player-alex-death.png
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'docs/art/neon-overhaul/pixellab'
OUT = ROOT / 'public/assets/neon'
manifest_path = OUT / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
for name in sys.argv[1:]:
    if name.startswith('player:'):
        name = name[len('player:'):]
        src = SOURCE / f'char-player-{name}.png'
        dst = OUT / 'player' / f'{name}.png'
    else:
        src = SOURCE / f'anim-{name}.png'
        dst = OUT / 'enemies' / f'{name}.png'
    shutil.copyfile(src, dst)
    w, h = Image.open(dst).size
    entry = {'path': str(dst.relative_to(ROOT)), 'source': str(src.relative_to(ROOT)),
             'generator': 'PixelLab animate_character, packed by pack_character.py', 'size': [w, h],
             'sha256': hashlib.sha256(dst.read_bytes()).hexdigest()}
    manifest = [item for item in manifest if item['path'] != entry['path']] + [entry]
    print(f'{dst.relative_to(ROOT)} {w}x{h}')
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
