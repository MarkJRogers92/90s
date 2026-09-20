from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from validate_runtime_asset import validate


def write_png(path: Path, size=(64, 64), color=(10, 20, 30, 255), bottom=True) -> Path:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    y = size[1] - 1 if bottom else size[1] - 2
    image.putpixel((size[0] // 2, y), color)
    image.save(path)
    return path


def test_accepts_palette_valid_rgba_with_bottom_contact():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette_json = root / "palette.json"
        palette_json.write_text('{"grid":[{"swatches":[{"rgb":[10,20,30]}]}]}')
        assert validate(write_png(root / "valid.png"), palette_json, 64, 64) == []


def test_rejects_wrong_size_off_palette_semialpha_and_bottom_gap():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette_json = root / "palette.json"
        palette_json.write_text('{"grid":[{"swatches":[{"rgb":[10,20,30]}]}]}')
        cases = {
            "expected 64x64": write_png(root / "wrong.png", size=(32, 32)),
            "outside approved palette": write_png(root / "off.png", color=(11, 20, 30, 255)),
            "alpha must be 0 or 255": write_png(root / "alpha.png", color=(10, 20, 30, 127)),
            "bottom row has no opaque anchor pixel": write_png(root / "gap.png", bottom=False),
        }
        for message, path in cases.items():
            assert any(message in error for error in validate(path, palette_json, 64, 64))


if __name__ == "__main__":
    test_accepts_palette_valid_rgba_with_bottom_contact()
    test_rejects_wrong_size_off_palette_semialpha_and_bottom_gap()
    print("validate_runtime_asset tests PASS (5/5 cases)")
