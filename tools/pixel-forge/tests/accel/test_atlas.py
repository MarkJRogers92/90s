import importlib
import json
import numpy as np
import pytest
from PIL import Image


def module():
    try: return importlib.import_module('forge_accel.atlas')
    except ModuleNotFoundError: pytest.fail('Missing atlas implementation')


def frames():
    a=module(); im=Image.new('RGBA',(8,10),(20,40,90,255))
    f2=im.copy(); f2.putpixel((2,2),(255,0,0,128))
    return [a.Frame('a',im,duration_ms=142,state='idle',pivot=(4,9)),
            a.Frame('b',f2,duration_ms=133,state='idle',pivot=(4,9))]


def test_atlas_round_trip_is_pixel_exact_with_timings_and_pivots():
    a=module(); fs=frames(); sheet,meta=a.pack_frames(fs,columns=2,padding=2)
    assert meta['meta']['forge']['status']=='REVIEW_ONLY'
    for f in fs:
        entry=meta['frames'][f'{f.state}/{f.name}']
        r=entry['frame']; cut=sheet.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h']))
        assert cut.tobytes()==f.image.tobytes()
        assert entry['duration']==f.duration_ms and entry['pivot']=={'x':.5,'y':.9}
        assert entry['rotated'] is False and entry['trimmed'] is False


def test_blank_frames_and_duplicate_holds_are_preserved():
    a=module(); im=Image.new('RGBA',(4,4))
    fs=[a.Frame('a',im,100),a.Frame('b',im,200)]
    sheet,m=a.pack_frames(fs)
    assert len(m['frames'])==2
    report=a.inspect_motion(fs)
    assert report['duplicate_pairs']==[[0,1]] and report['status']=='REVIEW_ONLY'
    assert report['duration_ms']==300


def test_grid_slice_requires_exact_grid_and_count():
    a=module(); im=Image.new('RGBA',(8,4),'red')
    assert len(a.slice_grid(im,(4,4),count=2))==2
    with pytest.raises(ValueError): a.slice_grid(im,(3,4))
    with pytest.raises(ValueError): a.slice_grid(im,(4,4),count=3)


def test_native_sizes_not_downscaled_to_smallest_frame():
    a=module(); fs=[a.Frame('a',Image.new('RGBA',(8,8),'red')),
                   a.Frame('b',Image.new('RGBA',(16,24),'blue'))]
    sh,m=a.pack_frames(fs,columns=1)
    assert m['frames']['still/b']['sourceSize']=={'w':16,'h':24}
    assert sh.height>=32


@pytest.mark.parametrize('kwargs',[{'duration_ms':0},{'duration_ms':True},{'pivot':(20,0)},{'name':'../escape'}])
def test_frame_validation(kwargs):
    a=module()
    with pytest.raises(ValueError): a.Frame(**({'name':'a','image':Image.new('RGBA',(8,8))}|kwargs))


def test_noncontiguous_state_tags_rejected():
    a=module(); im=Image.new('RGBA',(4,4))
    with pytest.raises(ValueError,match='contiguous'):
        a.pack_frames([a.Frame('a',im,state='idle'),a.Frame('b',im,state='walk'),a.Frame('c',im,state='idle')])


def test_duplicate_names_rejected():
    a=module(); f=frames()[0]
    with pytest.raises(ValueError): a.pack_frames([f,f])


def test_export_is_no_overwrite_and_has_local_preview(tmp_path):
    a=module(); out=tmp_path/'bundle'; a.export_bundle(frames(),out)
    assert (out/'atlas.png').is_file() and (out/'atlas.json').is_file()
    assert (out/'preview.html').is_file()
    html=(out/'preview.html').read_text()
    assert 'data:image/png;base64,' in html and 'imageSmoothingEnabled=false' in html
    assert 'REVIEW_ONLY' in html
    meta=json.loads((out/'atlas.json').read_text())
    assert [v['duration'] for v in meta['frames'].values()]==[142,133]
    with pytest.raises(FileExistsError): a.export_bundle(frames(),out)


def test_aseprite_json_import_restores_order_alpha_and_duration(tmp_path):
    a=module(); out=tmp_path/'one'; a.export_bundle(frames(),out)
    imported=a.import_json_atlas(out/'atlas.png',out/'atlas.json')
    assert [f.duration_ms for f in imported]==[142,133]
    assert imported[1].image.tobytes()==frames()[1].image.tobytes()
    assert imported[0].pivot==(4,9)


def test_import_rejects_rotated_or_trimmed_atlas_instead_of_dropping_offsets(tmp_path):
    a=module(); out=tmp_path/'one'; a.export_bundle(frames(),out)
    path=out/'atlas.json'; m=json.loads(path.read_text()); m['frames']['idle/a']['trimmed']=True
    path.write_text(json.dumps(m))
    with pytest.raises(ValueError,match='trimmed|rotated'):
        a.import_json_atlas(out/'atlas.png',path)


def test_numeric_spritegen_aseprite_tags_are_preserved(tmp_path):
    a=module();out=tmp_path/'one';a.export_bundle(frames(),out)
    data=json.loads((out/'atlas.json').read_text())
    data['frames']=[dict(e,filename=str(i)) for i,e in enumerate(data['frames'].values())]
    data['meta']['frameTags']=[{'name':'idle','from':0,'to':0,'direction':'forward'},
                                {'name':'attack','from':1,'to':1,'direction':'forward'}]
    path=out/'numeric.json';path.write_text(json.dumps(data))
    fs=a.import_json_atlas(out/'atlas.png',path)
    assert [f.state for f in fs]==['idle','attack']
    assert [f.duration_ms for f in fs]==[142,133]


def test_export_also_writes_numeric_aseprite_data_for_engine_tag_lookup(tmp_path):
    a=module();out=tmp_path/'one';a.export_bundle(frames(),out)
    data=json.loads((out/'aseprite.json').read_text())
    assert [e['filename'] for e in data['frames']]==['0','1']
    assert data['meta']['frameTags'][0]['to']==1


def test_ambiguous_or_nonforward_import_tags_rejected(tmp_path):
    a=module();out=tmp_path/'one';a.export_bundle(frames(),out)
    path=out/'atlas.json';data=json.loads(path.read_text())
    data['meta']['frameTags'][0]['direction']='reverse';path.write_text(json.dumps(data))
    with pytest.raises(ValueError,match='direction'):
        a.import_json_atlas(out/'atlas.png',path)


@pytest.mark.parametrize('metadata', [[], {'frames':None}, {'frames':[],'meta':[]},
                                      {'frames':{'idle/a':None}}, {'frames':{},'meta':{'frameTags':[None]}}])
def test_invalid_metadata_structure_raises_value_error(tmp_path,metadata):
    from forge_accel.atlas import import_json_atlas
    from PIL import Image
    import json
    image=tmp_path/'atlas.png';Image.new('RGBA',(8,8),'red').save(image)
    manifest=tmp_path/'atlas.json';manifest.write_text(json.dumps(metadata))
    with pytest.raises(ValueError):import_json_atlas(image,manifest)
