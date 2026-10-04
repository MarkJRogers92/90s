"""Public review fixture: portable rebuild, immutable inputs, and exact pixels.

Regressions caught: private-machine paths, changed sources/peak, output overwrite,
native pixel drift, protected-domain changes, and misleading GIF timing/colors.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image
import pytest

FORGE = Path(__file__).resolve().parents[1]
EXAMPLE = FORGE / "examples/source-preserving-west-hurt"
SOURCE = "4ecc5c275ecd29210dc4b68f3d7850dd33740bd51dca76dfca937cbe181a29b3"
WALK = "7760bd56724fa1abe0dc8c7cf4e64a1a6c51056543f9146f2f1688b6f0c06b5b"
PEAK = "c14567847026eb93b536e13ec2acb04647f97b404b23c8362cfbaae7c149fcfb"
ONSET = "466cb4faab08eee8fd2f11db1bbd2599dd52a5e915d51aa91ba94a005ddbd1be"
ARTIFACT_HASHES = {
    "source.png": SOURCE,
    "walk-source.png": WALK,
    "frames/frame-000.png": ONSET,
    "frames/frame-001.png": PEAK,
    "frames/frame-002.png": ONSET,
    "frames/frame-003.png": SOURCE,
    "strip.png": "4ae36b0b2f2517b922d2aee64d187ae15b66b1b54441ff04d48d10235ad55487",
    "preview-exact.png": "f1275afd193a28878fa4a5991465ee1efde39872ba8b4200d124406b436e9864",
    "preview-gif-approx.gif": "5ef87f68880794c6a17ab052d6f929c279c6f174406235a20768ac5049d23e73",
    "preview-slow-inspection.gif": "059487811cfc951369e95e4473fbe99bce33c6ae6d99fce033c6a131ceeab0d4",
}


def require_fixture():
    assert (EXAMPLE / "MANIFEST.json").is_file(), "compact public review fixture is missing"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgba(path):
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def run_builder(name, cwd, *args):
    require_fixture()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    env.pop("PYTHONPATH", None)
    return subprocess.run(
        [sys.executable, str(EXAMPLE / name), *map(str, args)],
        cwd=cwd, env=env, capture_output=True, text=True, timeout=120,
    )


@pytest.fixture(scope="module")
def rebuilt(tmp_path_factory):
    root = tmp_path_factory.mktemp("public-west-review")
    peak, animation = root / "peak", root / "animation"
    # Defaults must resolve from the script location, never the working directory.
    result = run_builder("build_recoil.py", root, "--out", peak)
    assert result.returncode == 0, result.stderr
    result = run_builder("build_animation.py", root, "--bundle", peak, "--out", animation)
    assert result.returncode == 0, result.stderr
    return root, peak, animation


def test_exact_public_allowlist_and_hashes():
    require_fixture()
    manifest = json.loads((EXAMPLE / "MANIFEST.json").read_text())
    actual = {p.relative_to(EXAMPLE).as_posix() for p in EXAMPLE.rglob("*")
              if p.is_file() and "__pycache__" not in p.parts}
    assert actual == set(manifest["files"]) | {"MANIFEST.json"}
    assert manifest["status"] == "REVIEW_ONLY"
    assert len(actual) <= 30
    assert sum((EXAMPLE / path).stat().st_size for path in actual) < 150_000
    for name, expected in manifest["files"].items():
        assert digest(EXAMPLE / name) == expected, name
    for name, expected in ARTIFACT_HASHES.items():
        assert digest(EXAMPLE / name) == expected, name


def test_public_text_is_portable_and_contains_no_delivery_metadata():
    require_fixture()
    # Reject actual machine roots and local-only links without publishing a
    # particular author's machine path or delivery-system vocabulary.
    roots = {str(FORGE.resolve()), str(Path.home())}
    forbidden = [root.rstrip(os.sep) + os.sep for root in roots if root not in {"", os.sep}]
    forbidden += ["file://", "localhost:", "127.0.0.1:"]
    for path in EXAMPLE.rglob("*"):
        if path.suffix in {".py", ".json", ".md"}:
            text = path.read_text()
            assert not any(value in text for value in forbidden), path.name


def test_rebuild_matches_all_retained_animation_and_source_artifacts(rebuilt):
    _, peak, animation = rebuilt
    for name, expected in ARTIFACT_HASHES.items():
        rendered = name.replace("frames/", "render/")
        assert digest(animation / rendered) == expected, name
    assert digest(peak / "candidate.png") == PEAK
    assert np.array_equal(rgba(peak / "source-render/frame-000.png"), rgba(EXAMPLE / "source.png"))
    for directory in ["masks", "patches"]:
        for path in (EXAMPLE / directory).iterdir():
            assert (animation / directory / path.name).read_bytes() == path.read_bytes()
    assert (peak / "artifact-provenance.json").read_bytes() == (EXAMPLE / "artifact-provenance.json").read_bytes()
    assert (animation / "animation-evidence.json").read_bytes() == (EXAMPLE / "animation-evidence.json").read_bytes()
    for output in [peak, animation]:
        checks = json.loads((output / "forge-checks.json").read_text())
        assert checks["technical_status"] == "pass"
        assert not any(check["status"] == "fail" for check in checks["checks"])


@pytest.mark.parametrize("option,filename", [("--source", "source.png"), ("--walk", "walk-source.png")])
def test_peak_builder_rejects_changed_sources_before_writing(tmp_path, option, filename):
    require_fixture()
    changed = tmp_path / filename
    changed.write_bytes((EXAMPLE / filename).read_bytes() + b"changed")
    out = tmp_path / "out"
    result = run_builder("build_recoil.py", tmp_path, option, changed, "--out", out)
    assert result.returncode != 0 and "hash mismatch" in result.stderr
    assert not out.exists()


@pytest.mark.parametrize("filename", ["candidate.png", "source.png", "walk-source.png"])
def test_animation_builder_rejects_changed_inputs_before_writing(rebuilt, tmp_path, filename):
    _, peak, _ = rebuilt
    bundle = tmp_path / "bundle"
    shutil.copytree(peak, bundle)
    path = bundle / filename
    path.write_bytes(path.read_bytes() + b"changed")
    out = tmp_path / "out"
    result = run_builder("build_animation.py", tmp_path, "--bundle", bundle, "--out", out)
    assert result.returncode != 0 and "hash mismatch" in result.stderr
    assert not out.exists()


def test_builders_refuse_existing_outputs(rebuilt, tmp_path):
    _, peak, _ = rebuilt
    out = tmp_path / "exists"
    out.mkdir()
    marker = out / "keep.txt"
    marker.write_text("must survive")
    for name, args in [("build_recoil.py", []), ("build_animation.py", ["--bundle", peak])]:
        result = run_builder(name, tmp_path, *args, "--forge-root", FORGE, "--out", out)
        assert result.returncode != 0 and "FileExistsError" in result.stderr
        assert marker.read_text() == "must survive"
        assert list(out.iterdir()) == [marker]


def test_native_frames_preserve_protected_domains_palette_and_ground():
    require_fixture()
    evidence = json.loads((EXAMPLE / "animation-evidence.json").read_text())
    source = rgba(EXAMPLE / "source.png")
    palette = {tuple(p) for p in source.reshape(-1, 4) if p[3]}
    assert [f["id"] for f in evidence["frames"]] == ["onset", "peak", "rebound", "settle"]
    assert evidence["status"] == "REVIEW_ONLY" and evidence["production_changes"] is False
    assert evidence["semantic_motion"].startswith("PENDING")
    for index, frame in enumerate(evidence["frames"]):
        image = rgba(EXAMPLE / f"frames/frame-{index:03d}.png")
        assert image.shape == (96, 96, 4)
        assert set(np.unique(image[:, :, 3])) == {0, 255}
        assert np.where(image[:, :, 3])[0].max() == 95
        assert np.array_equal(image[89:], source[89:])
        assert all(tuple(p) in palette for p in image.reshape(-1, 4) if p[3])
        for part, protected in frame["protected"].items():
            mask = np.array(Image.open(EXAMPLE / protected["domain"])) == 255
            y, x = np.where(mask)
            dx, dy = protected["translation"]
            assert np.array_equal(image[y + dy, x + dx], source[y, x]), (index, part)
            assert protected["rotation_degrees"] == 0 and protected["scale"] == 1
        assert frame["protected"]["shoes"]["translation"] == [0, 0]
    assert np.array_equal(rgba(EXAMPLE / "frames/frame-003.png"), source)


def test_source_copy_provenance_matches_pixels_and_excludes_protected_domains():
    require_fixture()
    source = rgba(EXAMPLE / "source.png")
    frames = json.loads((EXAMPLE / "animation-evidence.json").read_text())["frames"]
    for index, filename in [(0, "onset-source-pixel-copies.json"), (1, "source-pixel-copies.json"),
                            (2, "rebound-source-pixel-copies.json")]:
        image = rgba(EXAMPLE / f"frames/frame-{index:03d}.png")
        copies = json.loads((EXAMPLE / "patches" / filename).read_text())
        assert len(copies) == frames[index]["repair_pixels"]
        protected_targets = set()
        for protected in frames[index]["protected"].values():
            y, x = np.where(np.array(Image.open(EXAMPLE / protected["domain"])) == 255)
            dx, dy = protected["translation"]
            protected_targets.update(zip(x + dx, y + dy))
        for pixel in copies:
            sx, sy = pixel["source"]
            tx, ty = pixel["target"]
            assert source[sy, sx].tolist() == image[ty, tx].tolist() == pixel["rgba"]
            assert (tx, ty) not in protected_targets


def test_exact_apng_and_approximate_gif_timing_and_stable_protected_colors():
    require_fixture()
    with Image.open(EXAMPLE / "preview-exact.png") as apng:
        assert apng.n_frames == 4
        durations = []
        for index in range(4):
            apng.seek(index)
            durations.append(apng.info["duration"])
            assert np.array_equal(np.array(apng.convert("RGBA")), rgba(EXAMPLE / f"frames/frame-{index:03d}.png"))
        assert durations == [50, 50, 67, 67]
    frames = json.loads((EXAMPLE / "animation-evidence.json").read_text())["frames"]
    for filename, timing in [("preview-gif-approx.gif", [50, 50, 70, 70]),
                             ("preview-slow-inspection.gif", [400] * 4)]:
        decoded, durations = [], []
        with Image.open(EXAMPLE / filename) as gif:
            assert gif.n_frames == 4
            for index in range(4):
                gif.seek(index)
                durations.append(gif.info["duration"])
                decoded.append(np.array(gif.convert("RGB").resize((96, 96), Image.Resampling.NEAREST)))
        assert durations == timing
        for index, frame in enumerate(frames):
            for part, protected in frame["protected"].items():
                y, x = np.where(np.array(Image.open(EXAMPLE / f"masks/{part}-opaque.png")) == 255)
                dx, dy = protected["translation"]
                assert np.array_equal(decoded[index][y + dy, x + dx], decoded[3][y, x])
