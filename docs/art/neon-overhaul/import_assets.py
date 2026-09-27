#!/usr/bin/env python3
"""Promote DEAD MALL neon-overhaul source art into runtime assets.

Sources:
  docs/art/neon-overhaul/pixellab/*.png   PixelLab generations made for this pass
  --legacy DIR                             an extracted `public/assets` tree from
                                           the codex/pixellab-aseprite-proof branch
                                           (enemies, items, portraits, decals, fx)

Every runtime PNG lands under public/assets/neon/ and is recorded in
public/assets/neon/manifest.json with its source and sha256, so the provenance
of each file the game loads can be traced back to its generator.

Props are cropped to their opaque bounding box so that a sprite's bottom edge
is the object's floor contact line. Storefront panels are opaque walls and are
kept at full size.

Run from the repository root:
  python3 docs/art/neon-overhaul/import_assets.py --legacy /path/to/public/assets
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'docs/art/neon-overhaul/pixellab'
OUT = ROOT / 'public/assets/neon'

FACADES = [
    'video-store', 'music-store', 'electronics-store', 'arcade', 'boutique',
    'cinema-concession', 'pizza-counter', 'burger-counter', 'wok-counter', 'security-office',
    'back-hall-wall',
]
PROPS = [
    'globe-fountain', 'bunny-mascot', 'food-table-set', 'planter-long',
    'crate-stack', 'security-desk', 'booth-row', 'concrete-pillar',
    'bench-kiosk', 'planter-straight',
]
LEGACY = {
    'enemies': ['spitter-idle', 'lp-manager-idle', 'hanger-idle'],
    'items': None,  # every item icon
    'portraits': ['teenager', 'security-guard', 'store-manager', 'employee'],
    'decals': ['blood-pool', 'blood-splash', 'blood-drops', 'blood-drag', 'broken-glass', 'organic-residue', 'scorch-mark'],
    'props': ['shopping-cart', 'arcade-cabinet', 'claw-machine', 'vending-machine', 'payphone', 'atm',
              'wet-floor-sign', 'kiddie-ride', 'store-gondola', 'clothing-rack', 'vhs-shelf',
              'checkout-counter', 'potted-palm', 'mall-bench', 'rubbish-bin', 'mall-directory',
              'drinking-fountain', 'food-court-table', 'food-court-chair', 'condiment-stand', 'rc-car'],
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop_to_content(src: Path, dst: Path) -> tuple[int, int]:
    image = Image.open(src).convert('RGBA')
    # Binary alpha keeps the pixel art crisp under the multiply lighting pass.
    alpha = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    image.putalpha(alpha)
    box = image.getbbox()
    if box:
        image = image.crop(box)
    dst.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst)
    return image.size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--legacy', type=Path, help='extracted public/assets from codex/pixellab-aseprite-proof')
    args = parser.parse_args()

    manifest: list[dict] = []

    for name in FACADES:
        src = SOURCE / f'{name}.png'
        dst = OUT / 'facades' / f'{name}.png'
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        w, h = Image.open(dst).size
        manifest.append({'path': str(dst.relative_to(ROOT)), 'source': str(src.relative_to(ROOT)),
                         'generator': 'PixelLab create_map_object (low top-down)', 'size': [w, h], 'sha256': sha256(dst)})

    for name in PROPS:
        src = SOURCE / f'{name}.png'
        dst = OUT / 'props' / f'{name}.png'
        w, h = crop_to_content(src, dst)
        manifest.append({'path': str(dst.relative_to(ROOT)), 'source': str(src.relative_to(ROOT)),
                         'generator': 'PixelLab create_map_object', 'size': [w, h], 'sha256': sha256(dst)})

    # Packed 64px characters: char-player-* -> player/, char-civ-* -> civilians/.
    for src in sorted(SOURCE.glob('char-*.png')):
        stem = src.stem
        folder, name = ('player', stem[len('char-player-'):]) if stem.startswith('char-player-') else ('civilians', stem[len('char-civ-'):])
        dst = OUT / folder / f'{name}.png'
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        w, h = Image.open(dst).size
        manifest.append({'path': str(dst.relative_to(ROOT)), 'source': str(src.relative_to(ROOT)),
                         'generator': 'PixelLab create_character v3 (64px) + template walk, packed by pack_character.py',
                         'size': [w, h], 'sha256': sha256(dst)})

    for name in sorted(p.stem for p in SOURCE.glob('anim-*.png')):
        src = SOURCE / f'{name}.png'
        dst = OUT / 'enemies' / f'{name[len("anim-"):]}.png'
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        w, h = Image.open(dst).size
        manifest.append({'path': str(dst.relative_to(ROOT)), 'source': str(src.relative_to(ROOT)),
                         'generator': 'PixelLab animate_character, packed by pack_character.py', 'size': [w, h], 'sha256': sha256(dst)})

    if args.legacy:
        for folder, names in LEGACY.items():
            source_dir = args.legacy / folder
            files = sorted(source_dir.glob('*.png')) if names is None else [source_dir / f'{n}.png' for n in names]
            for src in files:
                dst = OUT / ('legacy-props' if folder == 'props' else folder) / src.name
                if folder == 'props':
                    w, h = crop_to_content(src, dst)
                else:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dst)
                    w, h = Image.open(dst).size
                manifest.append({'path': str(dst.relative_to(ROOT)),
                                 'source': f'codex/pixellab-aseprite-proof:public/assets/{folder}/{src.name}',
                                 'generator': 'PixelLab (earlier art pass)', 'size': [w, h], 'sha256': sha256(dst)})

    # The RC car only exists as an 8-facing strip; its first facing is the icon.
    strip = args.legacy / 'props' / 'rc-car.png' if args.legacy else None
    if strip and strip.exists():
        car = Image.open(strip).convert('RGBA').crop((0, 0, 24, 22))
        car = car.resize((48, 44), Image.NEAREST)
        icon = OUT / 'items' / 'rc-car.png'
        car.save(icon)
        manifest.append({'path': str(icon.relative_to(ROOT)), 'source': 'codex/pixellab-aseprite-proof:public/assets/props/rc-car.png (frame 0)',
                         'generator': 'PixelLab (earlier art pass), cropped', 'size': [48, 44], 'sha256': sha256(icon)})

    # The HUD portrait for Alex reuses the earlier pass's grunge 'teenager' bust.
    teenager = OUT / 'portraits' / 'teenager.png'
    if teenager.exists():
        alex = OUT / 'portraits' / 'alex.png'
        shutil.copyfile(teenager, alex)
        manifest.append({'path': str(alex.relative_to(ROOT)),
                         'source': 'codex/pixellab-aseprite-proof:public/assets/portraits/teenager.png',
                         'generator': 'PixelLab (earlier art pass), chosen as Alex HUD portrait',
                         'size': [160, 160], 'sha256': sha256(alex)})

    (OUT / 'manifest.json').write_text(json.dumps(sorted(manifest, key=lambda e: e['path']), indent=2) + '\n')
    print(f'{len(manifest)} runtime assets written to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
