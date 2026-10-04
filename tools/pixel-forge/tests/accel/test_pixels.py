import importlib
from pathlib import Path

import numpy as np
import pytest
from PIL import Image


def module():
    try:
        return importlib.import_module("forge_accel.pixels")
    except ModuleNotFoundError:
        pytest.fail("Missing pixel-processing implementation")


def sprite(size=(16, 16)):
    a = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    a[3:-2, 4:-3] = (120, 30, 90, 255)
    a[4:6, 5:7] = (230, 210, 100, 255)
    a[2, 2] = (180, 160, 80, 255)  # intentional detached effect pixel
    a[-2, 4:8] = (15, 15, 20, 70)  # intentional shadow
    return Image.fromarray(a)


def test_default_finishing_preserves_every_rgba_pixel():
    p = module()
    im = sprite()
    original = np.array(im)
    result = p.finish(im)
    np.testing.assert_array_equal(np.array(result), original)
    np.testing.assert_array_equal(np.array(im), original)


def test_palette_mapping_preserves_alpha_and_does_not_mutate():
    p = module()
    im = sprite()
    before = np.array(im)
    pal = ((0, 0, 0), (128, 20, 90), (255, 230, 100))
    out = np.array(p.finish(im, p.FinishOptions(palette=pal)))
    np.testing.assert_array_equal(out[:, :, 3], before[:, :, 3])
    assert {tuple(c) for c in out[out[:, :, 3] > 0, :3]} <= set(pal)
    np.testing.assert_array_equal(np.array(im), before)


def test_exact_palette_colors_are_fixed_points():
    p = module()
    colors = [(0, 0, 0), (255, 255, 255), (250, 5, 20), (20, 240, 50)]
    im = Image.new("RGBA", (4, 1))
    im.putdata([(*c, 255) for c in colors])
    assert p.finish(im, p.FinishOptions(palette=tuple(colors))).tobytes() == im.tobytes()


def test_palette_lock_does_not_recolor_invisible_rgb():
    p = module()
    im = Image.new("RGBA", (2, 2), (23, 55, 88, 0))
    assert p.finish(im, p.FinishOptions(palette=((255, 0, 0),))).tobytes() == im.tobytes()


def test_binary_alpha_is_opt_in():
    p = module()
    im = sprite()
    out = np.array(p.finish(im, p.FinishOptions(alpha_threshold=128)))
    assert set(np.unique(out[:, :, 3])) <= {0, 255}
    assert 70 in np.unique(np.array(p.finish(im))[:, :, 3])


def test_integer_grid_recovers_exact_nearest_scaled_image():
    p = module()
    im = sprite()
    big = im.resize((48, 64), Image.Resampling.NEAREST)
    out = p.finish(big, p.FinishOptions(target_size=(16, 16)))
    assert out.tobytes() == im.tobytes()


def test_grid_uses_original_color_not_average():
    p = module()
    im = Image.new("RGBA", (4, 4), (100, 10, 80, 255))
    im.putpixel((0, 0), (0, 0, 0, 255))
    out = p.finish(im, p.FinishOptions(target_size=(1, 1)))
    assert out.getpixel((0, 0)) == (100, 10, 80, 255)


def test_noninteger_downsampling_is_rejected_not_guessed():
    p = module()
    with pytest.raises(ValueError, match="integer"):
        p.finish(sprite(), p.FinishOptions(target_size=(7, 7)))


def test_upscaling_is_not_a_fake_detail_upgrade():
    p = module()
    with pytest.raises(ValueError):
        p.finish(sprite(), p.FinishOptions(target_size=(32, 32)))


@pytest.mark.parametrize("palette", [(), ((300, 0, 0),), ((1, 2),), ((True, 0, 0),)])
def test_invalid_palette_is_rejected(palette):
    p = module()
    with pytest.raises(ValueError):
        p.FinishOptions(palette=palette)


@pytest.mark.parametrize("alpha", [-1, 256, True, 1.5])
def test_invalid_alpha_threshold_is_rejected(alpha):
    p = module()
    with pytest.raises(ValueError):
        p.FinishOptions(alpha_threshold=alpha)


def test_diagnostics_are_advisory_and_never_delete_effects():
    p = module()
    im = sprite()
    q = p.inspect(im, kind="effect")
    assert q["isolated_pixels"] >= 1
    assert q["status"] == "REVIEW_ONLY"
    assert "aesthetic_score" not in q
    assert p.finish(im).tobytes() == im.tobytes()


def test_blank_image_is_a_mechanical_error():
    q = module().inspect(Image.new("RGBA", (8, 8)))
    assert "empty_image" in q["errors"]


def test_tiles_are_not_penalized_for_touching_border():
    p = module()
    im = Image.new("RGBA", (8, 8), (10, 20, 30, 255))
    assert "touches_canvas_edge" not in p.inspect(im, kind="tile")["warnings"]
    assert "touches_canvas_edge" in p.inspect(im, kind="prop")["warnings"]


def test_loading_enforces_pixel_limit(tmp_path):
    p = module()
    path = tmp_path / "s.png"
    sprite().save(path)
    with pytest.raises(ValueError, match="limit"):
        p.load_rgba(path, max_pixels=100)


def test_animation_intake_is_rejected(tmp_path):
    p = module()
    path = tmp_path / "animation.png"
    sprite().save(path, save_all=True, append_images=[Image.new("RGBA", (16, 16), "red")])
    with pytest.raises(ValueError, match="animated|frame"):
        p.load_rgba(path)


def test_preview_has_native_and_2x_panels():
    p = module()
    im = sprite()
    preview = p.review_sheet(im)
    assert preview.width >= im.width * 3
    assert preview.height >= im.height * 4


def test_batch_loading_has_an_aggregate_pixel_budget(tmp_path):
    p=module();path=tmp_path/'s.png';sprite((16,16)).save(path)
    assert hasattr(p,'load_rgba_many'), 'Missing aggregate-bounded loader'
    with pytest.raises(ValueError,match='aggregate'):
        p.load_rgba_many([path,path],max_total_pixels=300)


def test_aggregate_loader_preserves_explicit_order(tmp_path):
    p=module();a=tmp_path/'a.png';b=tmp_path/'b.png'
    Image.new('RGBA',(4,4),'red').save(a);Image.new('RGBA',(4,4),'blue').save(b)
    assert hasattr(p,'load_rgba_many'), 'Missing aggregate-bounded loader'
    result=p.load_rgba_many([b,a])
    assert result[0].getpixel((0,0))==(0,0,255,255)
