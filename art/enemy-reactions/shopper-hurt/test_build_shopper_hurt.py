"""Offline converter contracts; no image provider calls."""
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import numpy as np
from PIL import Image
import pytest

HERE = Path(__file__).resolve().parent

def convert():
    path = HERE / "build_shopper_hurt.py"
    assert path.exists(), "The review converter must be committed and reproducible"
    spec = spec_from_file_location("shopper_hurt_converter", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build

def fixture():
    raw = np.zeros((120, 320, 4), dtype=np.uint8)
    for f in range(4):
        raw[25:110, f * 80 + 30:f * 80 + 45] = [40, 70, 90, 255]
        raw[110:115, f * 80 + 25:f * 80 + 46] = [220, 220, 210, 255]
    original = np.zeros((768,384,4),dtype=np.uint8)
    original[1,1] = [17,18,19,255]
    walk = np.zeros((768,576,4),dtype=np.uint8)
    walk[206:286,40:51] = [40,70,90,255]
    walk[286:288,36:58] = [220,220,210,255]
    return Image.fromarray(raw), Image.fromarray(original), Image.fromarray(walk)

def test_preserves_other_seven_rows_and_outputs_native_grid():
    raw, original, walk = fixture()
    out = np.array(convert()(raw, original, walk))
    assert out.shape == (768,384,4)
    for row in (0,1,3,4,5,6,7):
        assert np.array_equal(out[row*96:(row+1)*96],np.array(original)[row*96:(row+1)*96])
    for f in range(4):
        y,x = np.where(out[192:288,f*96:(f+1)*96,3]>0)
        assert y.max() == 95
        assert y.max()-y.min()+1 == 82

def test_hardens_alpha_and_clears_hidden_rgb_in_replacement_row():
    raw, original, walk = fixture()
    a=np.array(raw);a[30,31]=[255,0,0,100];a[31,32]=[255,0,0,200]
    out=np.array(convert()(Image.fromarray(a),original,walk))[192:288]
    assert set(np.unique(out[:,:,3])) <= {0,255}
    assert not out[:,:,:3][out[:,:,3]==0].any()

def test_rejects_empty_cell_instead_of_guessing_missing_pose():
    raw, original, walk = fixture();a=np.array(raw);a[:,80:160]=0
    with pytest.raises(ValueError,match="empty"):
        convert()(Image.fromarray(a),original,walk)

def test_rejects_indivisible_width_and_wrong_original_grid():
    raw,original,walk=fixture()
    with pytest.raises(ValueError,match="four"):
        convert()(raw.crop((0,0,319,120)),original,walk)
    with pytest.raises(ValueError,match="384"):
        convert()(raw,original.crop((0,0,383,768)),walk)

def test_rejects_pose_crossing_input_cell_boundary():
    raw,original,walk=fixture();a=np.array(raw);a[50,80]=[20,20,20,255]
    with pytest.raises(ValueError,match="boundary"):
        convert()(Image.fromarray(a),original,walk)
