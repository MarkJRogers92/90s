"""Optional, review-only recovery of a generated image's apparent pixel grid.

Native input is authoritative and bypasses the optional engine. Analysis never
alters pixels. Reconstruction requires explicit loss acknowledgement, produces a
new image, and cannot satisfy exact preservation or protected-region contracts.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
from typing import Sequence

import numpy as np
from PIL import Image

from forge.bounded_io import read_bounded
from forge_accel.pixels import MAX_FILE_BYTES, decode_rgba, dimensions, pixel_hash

UPSTREAM_COMMIT = "ef376e57e1c272633ca2dbf5f29ec3fcf6596465"
UPSTREAM_URL = "https://github.com/Retro-Diffusion/pixel-art-fixer"
MAX_DETECTION_PIXELS = 4_000_000
LOSS_WARNINGS = (
    "Reconstruction changes canvas dimensions and can change colors and silhouettes.",
    "Upstream reconstruction thresholds alpha to 0/255; soft shadows are not preserved.",
    "No guarantee of identity, held props, foot contact, frame origins, or animation consistency.",
    "Grid estimates are heuristic. Inspect the proposed native size before reconstruction.",
    "Upstream OpenCV clustering can vary between runs; retain the candidate and its pixel hash.",
)


@dataclass(frozen=True)
class GridAnalysis:
    source_sha256: str
    source_size: tuple[int, int]
    native_size: tuple[int, int]
    step_x: float
    step_y: float
    decision: str
    confidence: str
    upstream_commit: str = UPSTREAM_COMMIT
    warnings: tuple[str, ...] = ()


def _rgba(image: Image.Image) -> Image.Image:
    if not isinstance(image, Image.Image):
        raise ValueError("image must be a Pillow image")
    dimensions(image.size)
    if getattr(image, "n_frames", 1) != 1:
        raise ValueError("animated input requires explicit frame extraction")
    return image.convert("RGBA")


def _engine():
    # Imported lazily so native bypass and all existing Forge commands need no
    # SciPy/OpenCV installation. Never install or download packages at runtime.
    try:
        from ._vendor.rd_pixelfixer import detect
        from ._vendor.rd_pixelfixer.reconstruct import two_stage_pack
    except ImportError as exc:
        raise RuntimeError(
            "Optional grid dependencies unavailable; see requirements-grid.txt. "
            "The source is unchanged."
        ) from exc
    return detect, two_stage_pack


def _confidence(decision: str) -> str:
    if decision == "native_bypass":
        return "authoritative"
    if decision in ("fast:ac+rl(S)", "fast:ac+rl+ss"):
        return "high"
    if decision in ("arbitrated", "fastmode:ac+rl", "fastmode:ac+ss", "fastmode:rl+ss"):
        return "medium"
    if decision == "fastmode:lowconf":
        return "low"
    if isinstance(decision, str) and re.fullmatch(r"(?:ac|rl|ss|fu)(?:\+(?:ac|rl|ss|fu)){2,3}", decision):
        if len(set(decision.split("+"))) == len(decision.split("+")):
            return "low"
    raise ValueError("unknown detector consensus")


def analyze_grid(image: Image.Image, *, source_is_native: bool = True,
                 mode: str = "full") -> GridAnalysis:
    """Return metadata only. Opt into inference for generated/upscaled inputs.

    Native lineage must come from the caller's asset metadata, not a heuristic
    color-count guess. An already-native 356-color sprite is never quantized.
    Confidence describes detector consensus, not a calibrated probability.
    """
    if type(source_is_native) is not bool:
        raise ValueError("source_is_native must be boolean")
    if mode not in ("full", "fast"):
        raise ValueError("mode must be full or fast")
    rgba = _rgba(image)
    source_hash = pixel_hash(rgba)
    if source_is_native:
        return GridAnalysis(source_hash, rgba.size, rgba.size, 1.0, 1.0,
                            "native_bypass", "authoritative")
    if min(rgba.size) < 16:
        raise ValueError("generated grid detection requires sides of at least 16 pixels")
    if rgba.width * rgba.height > MAX_DETECTION_PIXELS:
        raise ValueError("generated grid detection exceeds 4 million pixels")
    pixels = np.array(rgba, dtype=np.uint8)
    visible_colors = pixels[pixels[:, :, 3] > 0, :3]
    if not len(visible_colors) or np.all(visible_colors == visible_colors[0]):
        raise ValueError("insufficient visible color structure for grid detection")
    detect, _ = _engine()
    result = detect(pixels, mode=mode, low_memory=True)
    target = dimensions((result["cols"], result["rows"]))
    if target[0] > rgba.width or target[1] > rgba.height:
        raise ValueError("detector proposed upscaling rather than grid recovery")
    sx, sy = float(result["step_x"]), float(result["step_y"])
    if not np.isfinite((sx, sy)).all() or min(sx, sy) < 1:
        raise ValueError("detector returned an invalid grid step")
    decision = str(result["consensus"])
    confidence = _confidence(decision)
    return GridAnalysis(source_hash, rgba.size, target, sx, sy, decision,
                        confidence, warnings=LOSS_WARNINGS)


def reconstruct_grid(image: Image.Image, analysis: GridAnalysis, *,
                     allow_lossy: bool = False,
                     protected_requirements: Sequence[str] = ()) -> Image.Image:
    """Create a review candidate; never mutate or write the authoritative image.

    Any exact/protected requirement blocks lossy recovery, e.g. alpha, colors,
    dimensions, frame_origins, feet or held_props. Keep the existing preserve-
    first finish/edit-mask workflow for those assets. Native bypass is exact.
    """
    rgba = _rgba(image)
    if not isinstance(analysis, GridAnalysis):
        raise ValueError("analysis must come from analyze_grid")
    target = dimensions(analysis.native_size)
    if analysis.source_sha256 != pixel_hash(rgba) or analysis.source_size != rgba.size:
        raise ValueError("analysis source pixels or dimensions have changed")
    if analysis.upstream_commit != UPSTREAM_COMMIT:
        raise ValueError("analysis engine version mismatch")
    if analysis.confidence != _confidence(analysis.decision):
        raise ValueError("analysis confidence is inconsistent with detector consensus")
    if not np.isfinite((analysis.step_x, analysis.step_y)).all() or min(analysis.step_x, analysis.step_y) < 1:
        raise ValueError("analysis has an invalid grid step")
    if target[0] > rgba.width or target[1] > rgba.height:
        raise ValueError("analysis cannot upscale the source")
    if analysis.decision == "native_bypass":
        if target != rgba.size or (analysis.step_x, analysis.step_y) != (1, 1):
            raise ValueError("native bypass dimensions must equal source dimensions")
        return rgba.copy()
    if allow_lossy is not True:
        raise ValueError("lossy reconstruction requires allow_lossy=True")
    if protected_requirements:
        raise ValueError("protected requirements cannot be met by lossy grid reconstruction")
    if analysis.confidence == "low":
        raise ValueError("uncertain grid requires manual review; reconstruction blocked")
    _, pack = _engine()
    result = pack(np.array(rgba, dtype=np.uint8), target[0], target[1])
    return Image.fromarray(result)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--generated", action="store_true", help="explicitly infer a generated/upscaled grid")
    parser.add_argument("--mode", choices=("full", "fast"), default="full")
    parser.add_argument("--extract", type=Path, help="write a NEW review-candidate PNG, never overwrite")
    parser.add_argument("--allow-lossy", action="store_true", help="acknowledge dimension, alpha and color changes")
    parser.add_argument("--protect", action="append", default=[], help="exact/protected requirement; blocks lossy extraction")
    args = parser.parse_args(argv)
    try:
        if args.extract is not None and (args.extract.exists() or args.extract.is_symlink()):
            raise ValueError("output already exists; overwriting source or other files is refused")
        image = decode_rgba(read_bounded(args.input, MAX_FILE_BYTES))
        analysis = analyze_grid(image, source_is_native=not args.generated, mode=args.mode)
        output_receipt = {}
        if args.extract is not None:
            candidate = reconstruct_grid(image, analysis, allow_lossy=args.allow_lossy,
                                         protected_requirements=args.protect)
            # Exclusive creation prevents a check/write race from overwriting data.
            with args.extract.open("xb") as stream:
                candidate.save(stream, format="PNG")
            output_receipt = {"output_pixel_sha256": pixel_hash(candidate), "output_size": candidate.size}
        print(json.dumps({"status": "REVIEW_ONLY", "upstream_url": UPSTREAM_URL,
                          **asdict(analysis), **output_receipt}, indent=2))
    except (ValueError, RuntimeError, OSError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
