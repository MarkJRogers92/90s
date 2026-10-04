"""Cheap authored variants: exact palette swaps and ordered pixel-layer reuse."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping, Sequence
import numpy as np
from PIL import Image
from .briefs import label
from .constraints import binary_mask
from .pixels import dimensions, integer, rgb


def recolor_exact(image: Image.Image, mapping: Mapping[tuple[int,int,int],tuple[int,int,int]],
                  *, mask: Image.Image | None = None) -> Image.Image:
    dimensions(image.size)
    if len(mapping) > 256:
        raise ValueError('recolor mapping limit is 256 pairs')
    mapping = {rgb(old): rgb(new) for old,new in mapping.items()}
    source = np.array(image.convert('RGBA')); result = source.copy()
    allowed = source[:,:,3] > 0
    if mask is not None:
        allowed &= binary_mask(mask, image.size)
    for old,new in mapping.items():
        selected = allowed & np.all(source[:,:,:3] == old, axis=2)
        result[selected,:3] = new
    return Image.fromarray(result)


@dataclass(frozen=True)
class Layer:
    name: str
    image: Image.Image
    x: int = 0
    y: int = 0

    def __post_init__(self):
        label(self.name); dimensions(self.image.size)
        integer(self.x,'layer x',-8192,8192); integer(self.y,'layer y',-8192,8192)


def compose_layers(size: tuple[int,int], layers: Sequence[Layer]) -> Image.Image:
    """Order is back to front. No resizing, mirroring, inferred anatomy or warps.

    A detached part retains its exact pixels before normal alpha compositing.
    Only transparent padding may extend outside the output canvas.
    """
    w,h = dimensions(size)
    if not 1 <= len(layers) <= 64 or len({l.name for l in layers}) != len(layers):
        raise ValueError('provide 1..64 uniquely named layers')
    if sum(l.image.width*l.image.height for l in layers) > 16_777_216:
        raise ValueError('total layer pixel limit exceeded')
    result = Image.new('RGBA',(w,h))
    for layer in layers:
        im = layer.image.convert('RGBA')
        box = im.getchannel('A').getbbox()
        if box:
            x0,y0,x1,y1 = box
            if x0+layer.x < 0 or y0+layer.y < 0 or x1+layer.x > w or y1+layer.y > h:
                raise ValueError(f'visible pixels would clip in layer {layer.name}')
        # Crop only transparent out-of-canvas padding; preserve all visible pixels.
        x0,y0 = max(0,-layer.x),max(0,-layer.y)
        x1,y1 = min(im.width,w-layer.x),min(im.height,h-layer.y)
        if x1 > x0 and y1 > y0:
            result.alpha_composite(im.crop((x0,y0,x1,y1)),dest=(x0+layer.x,y0+layer.y))
    return result
