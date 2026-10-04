import importlib
import json
from pathlib import Path
import numpy as np
import pytest
from PIL import Image


def cli():
    try:return importlib.import_module('forge_accel.cli')
    except ModuleNotFoundError:pytest.fail('Missing CLI implementation')


def test_generation_defaults_to_dry_run_without_backend_or_writes(tmp_path,capsys):
    code=cli().main(['generate','a soda machine','--cache',str(tmp_path/'cache'),'--forge-root',str(tmp_path/'nonexistent')])
    data=json.loads(capsys.readouterr().out)
    assert code==0 and data['dry_run'] is True
    assert not (tmp_path/'cache').exists()


def test_finish_preserves_source_and_rich_palette_by_default(tmp_path):
    c=cli();p=tmp_path/'rich.png';a=np.zeros((32,32,4),dtype=np.uint8)
    a[:,:,0]=np.arange(32)[:,None];a[:,:,1]=np.arange(32)[None,:];a[:,:,3]=255;Image.fromarray(a).save(p)
    before=p.read_bytes();out=tmp_path/'out'
    assert c.main(['finish',str(p),'--out',str(out)])==0
    assert p.read_bytes()==before and np.array_equal(np.array(Image.open(out/'sprite.png')),a)
    assert c.main(['finish',str(p),'--out',str(out)])==2


def test_pack_cli_uses_explicit_file_order_not_filename_sort(tmp_path):
    c=cli();Image.new('RGBA',(8,8),'red').save(tmp_path/'z.png');Image.new('RGBA',(8,8),'blue').save(tmp_path/'a.png')
    spec={'frames':[{'file':'z.png','name':'first','state':'idle','duration_ms':142},
                    {'file':'a.png','name':'second','state':'idle','duration_ms':133}]}
    path=tmp_path/'pack.json';path.write_text(json.dumps(spec));out=tmp_path/'out'
    assert c.main(['pack',str(path),'--out',str(out)])==0
    meta=json.loads((out/'atlas.json').read_text())
    assert list(meta['frames'])==['idle/first','idle/second']


def test_invalid_repair_is_retained_but_not_promoted(tmp_path):
    c=cli();Image.new('RGBA',(8,8),'red').save(tmp_path/'source.png')
    Image.new('RGBA',(8,8),'blue').save(tmp_path/'candidate.png')
    Image.new('L',(8,8),0).save(tmp_path/'mask.png');out=tmp_path/'out'
    assert c.main(['check-repair',str(tmp_path/'source.png'),str(tmp_path/'candidate.png'),str(tmp_path/'mask.png'),
                   '--budget','2','--out',str(out)])==3
    assert (out/'candidate.png').exists() and not (out/'sprite.png').exists()


def test_recolor_and_compose_cli(tmp_path):
    c=cli();p=tmp_path/'part.png';Image.new('RGBA',(4,4),'red').save(p)
    mapping=tmp_path/'map.json';mapping.write_text(json.dumps({'#ff0000':'#0000ff'}))
    assert c.main(['recolor',str(p),'--mapping',str(mapping),'--out',str(tmp_path/'blue')])==0
    assert Image.open(tmp_path/'blue'/'sprite.png').getpixel((0,0))==(0,0,255,255)
    spec=tmp_path/'layers.json';spec.write_text(json.dumps({'canvas':[8,8],'layers':[{'name':'part','file':'part.png','x':2,'y':2}]}))
    assert c.main(['compose',str(spec),'--out',str(tmp_path/'composite')])==0
    assert Image.open(tmp_path/'composite'/'sprite.png').getpixel((2,2))==(255,0,0,255)
