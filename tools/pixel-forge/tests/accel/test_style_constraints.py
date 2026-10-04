import importlib
import numpy as np
import pytest
from PIL import Image


def module(name):
    try:
        return importlib.import_module('forge_accel.' + name)
    except ModuleNotFoundError:
        pytest.fail('Missing ' + name + ' implementation')


def test_style_uses_only_reference_colors_and_does_not_edit_source(tmp_path):
    m = module('briefs')
    p = tmp_path / 'ref.png'
    im = Image.new('RGBA', (8, 8), (10, 20, 30, 255))
    im.putpixel((0, 0), (240, 120, 80, 255)); im.save(p)
    before = p.read_bytes()
    profile = m.learn_style([p], max_colors=4)
    assert set(map(tuple, profile['palette'])) == {(10, 20, 30), (240, 120, 80)}
    assert p.read_bytes() == before
    assert profile['reference_sizes'] == [[8, 8]]


def test_reference_changes_change_style_hash(tmp_path):
    m = module('briefs'); p = tmp_path / 'ref.png'
    Image.new('RGBA', (2, 2), 'red').save(p)
    a = m.learn_style([p])
    Image.new('RGBA', (2, 2), 'blue').save(p)
    assert a['fingerprint'] != m.learn_style([p])['fingerprint']


def test_brief_retains_checks_and_stays_explicit():
    m = module('briefs')
    req = m.ArtRequest('overturned clothing rack', width=120, height=70,
                       checks=('wheels up', 'spilled clothes'), style='DEAD MALL', state='damaged')
    text = m.compile_brief(req)
    assert 'wheels up' in text and 'spilled clothes' in text and '120' in text
    assert 'damaged' in text


@pytest.mark.parametrize('kwargs', [{'width':0}, {'height':True}, {'prompt':''}, {'kind':'nonsense'}, {'state':'../evil'}])
def test_invalid_request(kwargs):
    m = module('briefs')
    with pytest.raises(ValueError):
        m.ArtRequest(**({'prompt':'prop'} | kwargs))


def test_revision_accepts_only_inside_mask():
    c = module('constraints'); p = module('pixels')
    src = Image.new('RGBA', (8, 8), 'red'); out = src.copy(); out.putpixel((3, 4), (0, 0, 255, 255))
    mask = Image.new('L', src.size); mask.putpixel((3, 4), 255)
    result = c.check_revision(src, out, mask, max_changed_pixels=1, expected_source_sha256=p.pixel_hash(src))
    assert result['accepted'] and result['changed_pixels'] == 1
    out.putpixel((7, 7), (0, 0, 0, 0))
    result = c.check_revision(src, out, mask, max_changed_pixels=8)
    assert not result['accepted'] and 'outside_edit_mask' in result['errors']
    assert src.getpixel((3,4)) == (255,0,0,255)


def test_revision_budget_and_source_hash_are_enforced():
    c = module('constraints')
    src = Image.new('RGBA', (4,4), 'red'); out = Image.new('RGBA', (4,4), 'blue')
    mask = Image.new('L', src.size, 255)
    assert 'pixel_budget_exceeded' in c.check_revision(src,out,mask,max_changed_pixels=2)['errors']
    with pytest.raises(ValueError, match='hash'):
        c.check_revision(src,out,mask,max_changed_pixels=16,expected_source_sha256='0'*64)


def test_mask_must_be_binary_and_sizes_must_match():
    c = module('constraints'); im = Image.new('RGBA', (4,4))
    with pytest.raises(ValueError):
        c.check_revision(im,im,Image.new('L',(4,4),100),max_changed_pixels=1)
    with pytest.raises(ValueError):
        c.check_revision(im,Image.new('RGBA',(5,4)),Image.new('L',(4,4),255),max_changed_pixels=1)


def test_recolor_swaps_without_cascade_and_preserves_alpha():
    v = module('variants')
    im = Image.new('RGBA',(3,1)); im.putdata([(255,0,0,255),(0,0,255,64),(255,0,0,0)])
    out = v.recolor_exact(im,{(255,0,0):(0,0,255),(0,0,255):(255,0,0)})
    assert np.array(out).reshape(-1,4).tolist() == [[0,0,255,255],[255,0,0,64],[255,0,0,0]]
    assert im.getpixel((0,0)) == (255,0,0,255)


def test_composition_reuses_pixels_and_refuses_clipping():
    v = module('variants')
    head = Image.new('RGBA', (2,2), (1,2,3,255))
    out = v.compose_layers((8,8), [v.Layer('head',head,3,1)])
    assert out.crop((3,1,5,3)).tobytes() == head.tobytes()
    with pytest.raises(ValueError, match='clip'):
        v.compose_layers((4,4),[v.Layer('head',head,3,3)])


def test_composition_order_and_semitransparent_alpha():
    v = module('variants')
    base = Image.new('RGBA',(2,2),(10,20,30,255))
    top = Image.new('RGBA',(2,2),(100,120,130,128))
    expected = Image.alpha_composite(base,top)
    assert v.compose_layers((2,2),[v.Layer('base',base),v.Layer('top',top)]).tobytes() == expected.tobytes()


def test_negative_integer_layer_offset_allowed_when_only_transparent_padding_clips():
    v=module('variants'); im=Image.new('RGBA',(4,4)); im.putpixel((2,2),(1,2,3,255))
    out=v.compose_layers((4,4),[v.Layer('part',im,-1,-1)])
    assert out.getpixel((1,1)) == (1,2,3,255)
