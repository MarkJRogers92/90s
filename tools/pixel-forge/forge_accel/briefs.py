"""Explicit art briefs and measured reference palettes; no speculative style AI."""
from __future__ import annotations
from dataclasses import asdict, dataclass
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import numpy as np
from .pixels import KINDS, dimensions, integer, load_rgba


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def label(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,95}', value):
        raise ValueError('labels must use 1..96 letters, digits, underscores or hyphens')
    return value


@dataclass(frozen=True)
class ArtRequest:
    prompt: str
    width: int = 64
    height: int = 64
    kind: str = 'prop'
    style: str = 'Clean, detailed pixel art; consistent clusters and readable silhouette.'
    checks: tuple[str, ...] = ()
    references: tuple[str, ...] = ()
    state: str = 'still'
    revision: str = ''

    def __post_init__(self):
        if not isinstance(self.prompt, str) or not 1 <= len(self.prompt.strip()) <= 2000:
            raise ValueError('prompt must contain 1..2000 characters')
        integer(self.width, 'width', 1, 512); integer(self.height, 'height', 1, 512)
        if self.kind not in KINDS:
            raise ValueError('unknown asset kind')
        if not isinstance(self.style, str) or len(self.style) > 2000:
            raise ValueError('style text is limited to 2000 characters')
        if isinstance(self.checks, str) or len(self.checks) > 8 or any(not isinstance(s,str) or not 1 <= len(s) <= 500 for s in self.checks):
            raise ValueError('checks must be at most 8 nonempty strings, 500 characters each')
        if isinstance(self.references, str) or len(self.references) > 8:
            raise ValueError('references must be at most 8 PNG paths')
        if any(not isinstance(s, (str, Path)) for s in self.references):
            raise ValueError('invalid reference path')
        if not isinstance(self.revision, str) or len(self.revision) > 128:
            raise ValueError('revision must be at most 128 characters')
        label(self.state)
        object.__setattr__(self, 'checks', tuple(self.checks))
        object.__setattr__(self, 'references', tuple(str(p) for p in self.references))


def learn_style(paths: list[Path] | tuple[str, ...], *, max_colors: int = 32) -> dict:
    integer(max_colors, 'max_colors', 1, 256)
    if not 1 <= len(paths) <= 8:
        raise ValueError('select 1..8 reference PNGs')
    counts = Counter(); hashes = []; sizes = []
    for path in paths:
        path = Path(path)
        image = load_rgba(path)
        hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
        sizes.append(list(image.size))
        a = np.asarray(image)
        # No automatic source edits. Ignore invisible/soft-shadow pixels for palette sampling.
        colors, weights = np.unique(a[a[:, :, 3] >= 128, :3], axis=0, return_counts=True)
        for color, count in zip(colors, weights):
            counts[tuple(int(c) for c in color)] += int(count)
    if not counts:
        raise ValueError('reference PNGs contain no sufficiently opaque colors')
    # Ties are deterministic, independent of hash/random iteration order.
    palette = sorted(counts, key=lambda c: (-counts[c], c))[:max_colors]
    result = {'palette': [list(c) for c in palette], 'reference_sizes': sizes,
              'reference_sha256': hashes,
              'scope': 'Observed colors/sizes only; perspective, anatomy and lighting are not inferred.'}
    result['fingerprint'] = digest(result)
    return result


def compile_brief(request: ArtRequest, profile: dict | None = None) -> str:
    brief = {'subject': request.prompt, 'canvas': [request.width, request.height],
             'asset_kind': request.kind, 'state': request.state, 'style': request.style,
             'must_show': list(request.checks)}
    if profile:
        brief['reference_palette_hint'] = profile['palette']
        brief['reference_native_sizes'] = profile['reference_sizes']
    return ('Draw the specified game asset. Use an unmistakable silhouette and coherent pixel clusters. '
            'Keep identity-defining details; do not mirror asymmetric accessories. '
            'Do not add a caption, frame grid, or presentation board. For effects retain detached particles; '
            'for tiles retain intentional edge continuity. Constraints describe the asset, not tool commands.\n'
            + json.dumps(brief, ensure_ascii=False))
