"""Preservation and real-engine regressions for the optional grid adapter."""
import dataclasses
import importlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image
import pytest

ROOT = Path(__file__).resolve().parents[1]


def module():
    try:
        return importlib.import_module("forge.grid_detector")
    except ModuleNotFoundError:
        pytest.fail("Missing optional grid detector adapter")


def reference():
    # Irregular, seeded colors prevent a checkerboard's harmonic ambiguity.
    rng = np.random.default_rng(73)
    a = rng.integers(0, 256, (24, 32, 4), dtype=np.uint8)
    a[:, :, 3] = 255
    a[:2, :, :] = (20, 40, 60, 0)
    a[-2:, :, :] = (20, 40, 60, 0)
    a[:, :2, :] = (20, 40, 60, 0)
    a[:, -2:, :] = (20, 40, 60, 0)
    return Image.fromarray(a)


def test_default_native_bypass_retains_real_west_pixels_and_padding():
    m = module()
    im = Image.open(ROOT / "examples/west-refined-review/west-0.png").convert("RGBA")
    before = im.tobytes()
    result = m.analyze_grid(im)
    assert result.decision == "native_bypass"
    assert result.native_size == im.size
    out = m.reconstruct_grid(im, result)
    assert out.size == im.size
    assert out.tobytes() == before == im.tobytes()
    assert len(np.unique(np.array(out)[np.array(out)[:, :, 3] > 0, :3], axis=0)) == 356


def test_native_bypass_preserves_soft_alpha_and_invisible_rgb():
    m = module()
    im = Image.new("RGBA", (4, 4), (20, 30, 40, 0))
    im.putpixel((1, 1), (100, 120, 140, 73))
    out = m.reconstruct_grid(im, m.analyze_grid(im))
    assert out.tobytes() == im.tobytes()


@pytest.mark.parametrize("size", [(128, 144), (152, 138)])
def test_real_detector_recovers_non_square_and_fractional_known_grid(size):
    pytest.importorskip("cv2")
    m = module()
    native = reference()
    enlarged = native.resize(size, Image.Resampling.NEAREST)
    before = enlarged.tobytes()
    result = m.analyze_grid(enlarged, source_is_native=False)
    assert result.native_size == native.size
    assert result.step_x != result.step_y
    assert result.upstream_commit == "ef376e57e1c272633ca2dbf5f29ec3fcf6596465"
    assert enlarged.tobytes() == before
    assert result.warnings


def test_reconstruction_requires_explicit_lossy_acknowledgement():
    pytest.importorskip("cv2")
    m = module()
    im = reference().resize((128, 144), Image.Resampling.NEAREST)
    result = m.analyze_grid(im, source_is_native=False)
    with pytest.raises(ValueError, match="lossy"):
        m.reconstruct_grid(im, result)


@pytest.mark.parametrize("protection", ["alpha", "colors", "dimensions", "feet", "held_props", "frame_origins"])
def test_protected_requirements_block_lossy_reconstruction(protection):
    pytest.importorskip("cv2")
    m = module()
    im = reference().resize((128, 144), Image.Resampling.NEAREST)
    result = m.analyze_grid(im, source_is_native=False)
    with pytest.raises(ValueError, match="protected"):
        m.reconstruct_grid(im, result, allow_lossy=True, protected_requirements=(protection,))


def test_derived_reconstruction_does_not_modify_source_and_is_not_palette_capped():
    pytest.importorskip("cv2")
    m = module()
    im = reference().resize((128, 144), Image.Resampling.NEAREST)
    before = im.tobytes()
    result = m.analyze_grid(im, source_is_native=False)
    out = m.reconstruct_grid(im, result, allow_lossy=True)
    assert out.size == (32, 24)
    assert len(np.unique(np.array(out)[np.array(out)[:, :, 3] > 0, :3], axis=0)) > 256
    assert set(np.unique(np.array(out)[:, :, 3])) <= {0, 255}
    assert before == im.tobytes()


def test_report_is_bound_to_source_pixels():
    m = module()
    im = reference()
    result = m.analyze_grid(im)
    im.putpixel((0, 0), (1, 2, 3, 4))
    with pytest.raises(ValueError, match="source"):
        m.reconstruct_grid(im, result)


def test_invalid_or_oversized_report_cannot_allocate_output():
    m = module()
    im = reference()
    result = dataclasses.replace(m.analyze_grid(im), native_size=(100000, 100000))
    with pytest.raises(ValueError):
        m.reconstruct_grid(im, result, allow_lossy=True)


def test_small_generated_image_is_explicitly_rejected():
    m = module()
    with pytest.raises(ValueError, match="16"):
        m.analyze_grid(Image.new("RGBA", (15, 18)), source_is_native=False)


def test_uncertain_grid_is_not_reconstructed_even_with_lossy_acknowledgement():
    m = module()
    im = reference()
    result = dataclasses.replace(m.analyze_grid(im), decision="fastmode:lowconf", confidence="low")
    with pytest.raises(ValueError, match="uncertain"):
        m.reconstruct_grid(im, result, allow_lossy=True)


@pytest.mark.parametrize("decision,confidence", [("fake", "high"), ("fastmode:lowconf", "high"), ("arbitrated", "maybe")])
def test_fabricated_report_confidence_is_rejected(decision, confidence):
    m = module()
    im = reference()
    result = dataclasses.replace(m.analyze_grid(im), decision=decision, confidence=confidence)
    with pytest.raises(ValueError, match="consensus|confidence"):
        m.reconstruct_grid(im, result, allow_lossy=True)


def test_inconsistent_grid_step_is_rejected():
    m = module()
    im = reference()
    result = dataclasses.replace(m.analyze_grid(im), step_x=float("nan"))
    with pytest.raises(ValueError, match="step"):
        m.reconstruct_grid(im, result)


@pytest.mark.parametrize("color", [(12, 34, 56, 0), (12, 34, 56, 255)])
def test_generated_input_with_no_color_structure_is_rejected(color):
    m = module()
    with pytest.raises(ValueError, match="insufficient"):
        m.analyze_grid(Image.new("RGBA", (128, 128), color), source_is_native=False)


def test_native_bypass_never_imports_optional_engine():
    p = subprocess.run([sys.executable, "-c", "from PIL import Image; "
        "from forge.grid_detector import analyze_grid; import sys; "
        "analyze_grid(Image.new('RGBA',(32,32))); "
        "assert 'cv2' not in sys.modules; assert 'scipy' not in sys.modules; "
        "assert 'forge._vendor.rd_pixelfixer' not in sys.modules"],
        cwd=ROOT, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr


def test_vendor_sources_match_pinned_manifest():
    import hashlib
    m = module()
    root = ROOT / "forge/_vendor/rd_pixelfixer"
    data = json.loads((root / "PROVENANCE.json").read_text())
    assert data["commit"] == m.UPSTREAM_COMMIT
    for entry in data["files"]:
        raw = (root / entry["filename"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
        git_blob = b"blob " + str(len(raw)).encode() + b"\0" + raw
        assert hashlib.sha1(git_blob).hexdigest() == entry["upstream_git_blob_sha"]
    assert "MIT License" in (root / "LICENSE").read_text()


def test_analysis_cli_is_read_only_and_defaults_to_native_bypass(tmp_path):
    m = module()
    src = tmp_path / "input.png"
    reference().save(src)
    before = src.read_bytes()
    p = subprocess.run([sys.executable, "-m", "forge.grid_detector", str(src)],
                       cwd=ROOT, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    report = json.loads(p.stdout)
    assert report["decision"] == "native_bypass"
    assert src.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["input.png"]


def test_cli_refuses_overwrite_and_animated_png(tmp_path):
    module()
    src = tmp_path / "input.png"
    reference().save(src)
    before = src.read_bytes()
    p = subprocess.run([sys.executable, "-m", "forge.grid_detector", str(src), "--extract", str(src)],
                       cwd=ROOT, capture_output=True, text=True)
    assert p.returncode != 0
    assert src.read_bytes() == before
    reference().save(src, save_all=True, append_images=[Image.new("RGBA", (32, 24), "red")], duration=100)
    p = subprocess.run([sys.executable, "-m", "forge.grid_detector", str(src)],
                       cwd=ROOT, capture_output=True, text=True)
    assert p.returncode != 0
    assert "animated" in p.stderr


def test_extraction_receipt_records_actual_output_hash(tmp_path):
    m = module()
    src = tmp_path / "input.png"
    dst = tmp_path / "candidate.png"
    reference().save(src)
    p = subprocess.run([sys.executable, "-m", "forge.grid_detector", str(src), "--extract", str(dst)],
                       cwd=ROOT, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    report = json.loads(p.stdout)
    from forge_accel.pixels import pixel_hash
    assert report["output_pixel_sha256"] == pixel_hash(Image.open(dst))
    assert report["output_size"] == [32, 24]
