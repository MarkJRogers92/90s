"""Conservative pixel processing: opt-in operations, never an aesthetic judge."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import hashlib
import warnings

import numpy as np
from PIL import Image, ImageDraw

MAX_PIXELS = 4_194_304
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_SEQUENCE_PIXELS = 16_777_216
KINDS = {"prop", "character", "effect", "tile", "ui"}


def integer(value: object, label: str, low: int, high: int) -> int:
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label} must be an integer in [{low}, {high}]")
    return value


def dimensions(size: tuple[int, int] | list[int]) -> tuple[int, int]:
    if not isinstance(size, (tuple, list)) or len(size) != 2:
        raise ValueError("size must contain width and height")
    w, h = (integer(n, "dimension", 1, 8192) for n in size)
    if w * h > MAX_PIXELS:
        raise ValueError("image pixel limit exceeded")
    return w, h


def rgb(color: object) -> tuple[int, int, int]:
    if not isinstance(color, (tuple, list)) or len(color) != 3:
        raise ValueError("RGB colors must contain three integers")
    return tuple(integer(n, "color channel", 0, 255) for n in color)


@dataclass(frozen=True)
class FinishOptions:
    palette: tuple[tuple[int, int, int], ...] | None = None
    target_size: tuple[int, int] | None = None
    alpha_threshold: int | None = None

    def __post_init__(self) -> None:
        if self.palette is not None:
            if not 1 <= len(self.palette) <= 256:
                raise ValueError("palette requires 1..256 RGB colors; leave unset to preserve richer art")
            object.__setattr__(self, "palette", tuple(rgb(c) for c in self.palette))
        if self.target_size is not None:
            object.__setattr__(self, "target_size", dimensions(self.target_size))
        if self.alpha_threshold is not None:
            integer(self.alpha_threshold, "alpha threshold", 0, 255)


def load_rgba(path: str | Path, *, max_pixels: int = MAX_PIXELS) -> Image.Image:
    """Read one bounded static PNG. Refuse animation rather than lose its frames."""
    integer(max_pixels, "max_pixels", 1, MAX_PIXELS)
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("file byte limit exceeded")
    return decode_rgba(path.read_bytes(), max_pixels=max_pixels)


def load_rgba_many(paths: list[str | Path], *, max_total_pixels: int = MAX_SEQUENCE_PIXELS) -> list[Image.Image]:
    """Bound decoded batch memory before accumulating arbitrary frame/layer lists."""
    integer(max_total_pixels, "max_total_pixels", 1, MAX_SEQUENCE_PIXELS)
    if not 1 <= len(paths) <= 256:
        raise ValueError("batch requires 1..256 PNG paths")
    images=[];total=0
    for path in paths:
        image=load_rgba(path)
        total += image.width * image.height
        if total > max_total_pixels:
            raise ValueError("aggregate decoded pixel limit exceeded")
        images.append(image)
    return images


def decode_rgba(data: bytes, *, max_pixels: int = MAX_PIXELS) -> Image.Image:
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("file byte limit exceeded")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(BytesIO(data)) as im:
            if im.format != "PNG":
                raise ValueError("only static PNG input is supported")
            dimensions(im.size)
            if im.width * im.height > max_pixels:
                raise ValueError("image pixel limit exceeded")
            if getattr(im, "n_frames", 1) != 1:
                raise ValueError("animated PNG input requires explicit frame extraction")
            return im.convert("RGBA")


def pixel_hash(image: Image.Image) -> str:
    image = image.convert("RGBA")
    header = f"RGBA:{image.width}x{image.height}:".encode()
    return hashlib.sha256(header + image.tobytes()).hexdigest()


def oklab(colors: np.ndarray) -> np.ndarray:
    """sRGB bytes -> Oklab, using Björn Ottosson's public-domain coefficients.

    Formula source: https://bottosson.github.io/posts/oklab/ (2021 matrices).
    Input is assumed sRGB; this is not an ICC color-management system.
    """
    c = np.asarray(colors, dtype=np.float32) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m1 = np.array([[.4122214708, .5363325363, .0514459929],
                   [.2119034982, .6806995451, .1073969566],
                   [.0883024619, .2817188376, .6299787005]], dtype=np.float32)
    m2 = np.array([[.2104542553, .7936177850, -.0040720468],
                   [1.9779984951, -2.4285922050, .4505937099],
                   [.0259040371, .7827717662, -.8086757660]], dtype=np.float32)
    return np.cbrt(c @ m1.T) @ m2.T


def _palette_map(a: np.ndarray, palette: tuple[tuple[int, int, int], ...]) -> None:
    visible = a[:, :, 3] > 0
    if not visible.any():
        return
    # Map each unique RGB once, not once per pixel. Bound the distance matrix.
    colors, inv = np.unique(a[visible, :3], axis=0, return_inverse=True)
    p = np.array(palette, dtype=np.uint8)
    lab_p = oklab(p)
    mapped = np.empty_like(colors)
    for start in range(0, len(colors), 1024):
        lab = oklab(colors[start:start + 1024])
        distance = ((lab[:, None, :] - lab_p[None, :, :]) ** 2).sum(axis=2)
        mapped[start:start + 1024] = p[distance.argmin(axis=1)]
    a[visible, :3] = mapped[inv]


def _integer_grid(a: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Block mode retains actual RGBA colors; no averaging or invented shades."""
    h, w = a.shape[:2]
    tw, th = size
    if tw > w or th > h or w % tw or h % th:
        raise ValueError("grid recovery requires exact integer downsampling, not upscaling")
    fx, fy = w // tw, h // th
    if (fx, fy) == (1, 1):
        return a.copy()
    packed = (a[:, :, 0].astype(np.uint32) << 24 | a[:, :, 1].astype(np.uint32) << 16
              | a[:, :, 2].astype(np.uint32) << 8 | a[:, :, 3].astype(np.uint32))
    blocks = packed.reshape(th, fy, tw, fx).transpose(0, 2, 1, 3).reshape(th * tw, fx * fy)
    # Already pixel-exact enlarged images take the fast path.
    if np.all(blocks == blocks[:, :1]):
        return a[::fy, ::fx].copy()
    ordered = np.sort(blocks, axis=1)
    best = ordered[:, 0].copy()
    run = np.ones(len(best), dtype=np.int32)
    best_count = run.copy()
    for col in range(1, ordered.shape[1]):
        run = np.where(ordered[:, col] == ordered[:, col - 1], run + 1, 1)
        improve = run > best_count
        best[improve] = ordered[improve, col]
        best_count[improve] = run[improve]
    return np.stack([(best >> shift) & 255 for shift in (24, 16, 8, 0)], axis=1).astype(np.uint8).reshape(th, tw, 4)


def finish(image: Image.Image, options: FinishOptions | None = None) -> Image.Image:
    dimensions(image.size)
    options = options or FinishOptions()
    a = np.array(image.convert("RGBA"), dtype=np.uint8)
    if options.target_size is not None:
        a = _integer_grid(a, options.target_size)
    if options.palette is not None:
        _palette_map(a, options.palette)
    if options.alpha_threshold is not None:
        # A threshold of zero must NOT make existing transparent pixels opaque.
        a[:, :, 3] = np.where((a[:, :, 3] > 0) & (a[:, :, 3] >= options.alpha_threshold), 255, 0)
    return Image.fromarray(a)


def inspect(image: Image.Image, *, kind: str = "prop") -> dict:
    dimensions(image.size)
    if kind not in KINDS:
        raise ValueError(f"unknown asset kind: {kind}")
    a = np.array(image.convert("RGBA"))
    visible = a[:, :, 3] > 0
    p = np.pad(visible, 1)
    neighbors = np.zeros_like(visible, dtype=np.uint8)
    for dy in range(3):
        for dx in range(3):
            if (dy, dx) != (1, 1):
                neighbors += p[dy:dy + image.height, dx:dx + image.width]
    isolated = int(np.count_nonzero(visible & (neighbors == 0)))
    soft = int(np.count_nonzero((a[:, :, 3] > 0) & (a[:, :, 3] < 255)))
    border = bool(visible[0].any() or visible[-1].any() or visible[:, 0].any() or visible[:, -1].any())
    warnings_ = []
    if isolated:
        warnings_.append("isolated_pixels_may_be_intentional")
    if soft:
        warnings_.append("partial_alpha_may_be_shadow_or_antialiasing")
    if border and kind != "tile":
        warnings_.append("touches_canvas_edge")
    return {"status": "REVIEW_ONLY", "width": image.width, "height": image.height,
            "visible_pixels": int(visible.sum()), "isolated_pixels": isolated,
            "partial_alpha_pixels": soft, "visible_rgb_colors": len(np.unique(a[visible, :3], axis=0)),
            "errors": [] if visible.any() else ["empty_image"], "warnings": warnings_,
            "pixel_sha256": pixel_hash(image),
            "limitations": "Mechanical measurements do not verify identity, anatomy, motion, or visual quality."}


def review_sheet(image: Image.Image) -> Image.Image:
    """Lossless native and 2x panels against light and dark backgrounds."""
    dimensions(image.size)
    image = image.convert("RGBA")
    w = max(320, image.width * 3 + 48)
    row_h = image.height * 2 + 42
    if w * row_h * 2 > MAX_PIXELS * 12:
        raise ValueError("review sheet pixel limit exceeded")
    canvas = Image.new("RGB", (w, row_h * 2), (30, 30, 36))
    draw = ImageDraw.Draw(canvas)
    for row, bg in enumerate(((28, 28, 36), (232, 232, 232))):
        y = row * row_h
        canvas.paste(bg, (0, y, w, y + row_h))
        color = (240, 240, 240) if row == 0 else (20, 20, 20)
        draw.text((12, y + 8), "REVIEW ONLY   native 1x                    nearest 2x", fill=color)
        canvas.paste(image, (12, y + 30), image)
        large = image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST)
        canvas.paste(large, (image.width + 30, y + 30), large)
    return canvas
