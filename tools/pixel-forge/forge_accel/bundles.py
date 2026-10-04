"""New-directory-only offline review bundles. Existing art is never replaced."""
from pathlib import Path
import hashlib
import json
from PIL import Image
from .pixels import inspect, review_sheet, pixel_hash


def save_bundle(image: Image.Image, destination: str | Path, *, source: Image.Image | None=None,
                kind: str='prop', details: dict | None=None) -> dict:
    report=inspect(image,kind=kind);preview=review_sheet(image)
    dest=Path(destination);dest.parent.mkdir(parents=True,exist_ok=True);dest.mkdir()
    with (dest/'sprite.png').open('xb') as file:image.save(file,format='PNG')
    if source is not None:
        with (dest/'source.png').open('xb') as file:source.save(file,format='PNG')
    with (dest/'review.png').open('xb') as file:preview.save(file,format='PNG')
    meta={'status':'REVIEW_ONLY','qa':report,'details':details or {},
          'artifacts':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dest.iterdir()) if p.is_file()}}
    (dest/'review.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    return meta
