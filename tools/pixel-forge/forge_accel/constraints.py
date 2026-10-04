"""Exact, inspectable repair contracts. Never silently clamp a bad repair."""
from __future__ import annotations
import re
import numpy as np
from PIL import Image
from .pixels import dimensions, integer, pixel_hash


def binary_mask(mask: Image.Image, size: tuple[int,int]) -> np.ndarray:
    if mask.mode not in ('L', '1') or mask.size != size:
        raise ValueError('edit mask must be same-sized L/1 image, white editable and black locked')
    data = np.array(mask.convert('L'))
    if not np.isin(data, [0,255]).all():
        raise ValueError('edit mask must be binary 0/255')
    return data > 0


def check_revision(source: Image.Image, candidate: Image.Image, edit_mask: Image.Image,
                   *, max_changed_pixels: int, expected_source_sha256: str | None = None) -> dict:
    dimensions(source.size)
    if candidate.size != source.size:
        raise ValueError('source and candidate dimensions must match')
    integer(max_changed_pixels, 'max_changed_pixels', 0, source.width * source.height)
    source_hash = pixel_hash(source)
    if expected_source_sha256 is not None:
        if not re.fullmatch('[0-9a-f]{64}', expected_source_sha256) or source_hash != expected_source_sha256:
            raise ValueError('source pixel hash mismatch: the source changed')
    allowed = binary_mask(edit_mask, source.size)
    diff = np.any(np.array(source.convert('RGBA')) != np.array(candidate.convert('RGBA')), axis=2)
    count = int(diff.sum()); outside = int((diff & ~allowed).sum())
    errors = []
    if outside: errors.append('outside_edit_mask')
    if count > max_changed_pixels: errors.append('pixel_budget_exceeded')
    ys,xs = np.where(diff)
    bbox = [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if count else None
    return {'accepted': not errors, 'status': 'REVIEW_ONLY', 'changed_pixels': count,
            'outside_mask_pixels': outside, 'changed_bbox': bbox, 'errors': errors,
            'source_pixel_sha256': source_hash, 'candidate_pixel_sha256': pixel_hash(candidate),
            'note': 'Accepted means the pixel contract passed, not that the repair looks better.'}
