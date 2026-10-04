import json
from pathlib import Path
import pytest
from PIL import Image
from forge import cli


def quality_module():
    try:
        from forge import quality_cli
        return quality_cli
    except ImportError:
        pytest.fail('missing integrated quality CLI')


def test_native_quality_offline_finish_preserves_partial_hidden_alpha(tmp_path):
    quality_module()
    source=tmp_path/'source.png'
    image=Image.new('RGBA',(9,7),(80,90,100,70));image.putpixel((0,0),(1,2,3,0)); image.save(source)
    assert cli.main(['quality','finish',str(source),'--out',str(tmp_path/'review')]) == 0
    assert Image.open(tmp_path/'review'/'sprite.png').convert('RGBA').tobytes() == image.tobytes()


def test_replace_one_frame_keeps_order_timing_pivots_blank_and_events(tmp_path):
    q=quality_module()
    from forge_accel.atlas import Frame, export_bundle, import_json_atlas
    image=Image.new('RGBA',(8,8),'red');blank=Image.new('RGBA',(8,8))
    frames=[Frame('first',image,70,'walk',(4,7)),Frame('hold',image,140,'walk',(4,7)),
            Frame('blank',blank,30,'walk',(4,7))]
    export_bundle(frames,tmp_path/'old',columns=3)
    manifest=tmp_path/'old'/'atlas.json'; data=json.loads(manifest.read_text())
    data['meta']['events']=[{'frame':1,'event':'footstep'}];data['meta']['loop']=False
    manifest.write_text(json.dumps(data))
    replacement=tmp_path/'new.png';Image.new('RGBA',(8,8),'blue').save(replacement)
    q.replace_frame(tmp_path/'old'/'atlas.png',manifest,1,replacement,tmp_path/'new')
    result=import_json_atlas(tmp_path/'new'/'atlas.png',tmp_path/'new'/'atlas.json')
    assert [(f.name,f.duration_ms,f.pivot) for f in result]==[(f.name,f.duration_ms,f.pivot) for f in frames]
    assert result[0].image.tobytes()==image.tobytes() and result[2].image.tobytes()==blank.tobytes()
    assert result[1].image.getpixel((0,0))==(0,0,255,255)
    new=json.loads((tmp_path/'new'/'atlas.json').read_text())
    assert new['meta']['events']==data['meta']['events'] and new['meta']['loop'] is False
    assert Image.open(tmp_path/'new'/'atlas.png').size == Image.open(tmp_path/'old'/'atlas.png').size


def test_bad_replacement_dimensions_does_not_publish(tmp_path):
    q=quality_module()
    from forge_accel.atlas import Frame,export_bundle
    export_bundle([Frame('one',Image.new('RGBA',(8,8),'red'))],tmp_path/'old')
    image=tmp_path/'wrong.png';Image.new('RGBA',(9,8),'blue').save(image)
    with pytest.raises(ValueError,match='dimensions'):
        q.replace_frame(tmp_path/'old'/'atlas.png',tmp_path/'old'/'atlas.json',0,image,tmp_path/'new')
    assert not (tmp_path/'new').exists()


def test_states_dry_run_and_validates_entire_batch_before_generation(tmp_path,monkeypatch):
    q=quality_module(); spec=tmp_path/'states.json'
    spec.write_text(json.dumps({'states':[{'state':'idle','prompt':'cola machine'},
                                        {'state':'damaged','prompt':'broken cola machine'}]}))
    def forbidden(*args,**kwargs):pytest.fail('dry run must never generate')
    monkeypatch.setattr(cli,'make',forbidden)
    assert q.main(['states',str(spec),'--cache-dir',str(tmp_path/'cache'),'--generation-revision','v1'])==0
    spec.write_text(json.dumps({'states':[{'state':'idle','prompt':'cola machine'},
                                        {'state':'bad/state','prompt':'broken cola machine'}]}))
    assert q.main(['states',str(spec),'--cache-dir',str(tmp_path/'cache'),'--generation-revision','v1','--execute'])==2


def test_repair_default_rejects_alpha_changes_and_budget(tmp_path):
    from forge.quality_speed import publish_repair
    source=Image.new('RGBA',(8,8),(1,2,3,90));candidate=source.copy()
    candidate.putpixel((2,2),(4,5,6,100));mask=Image.new('L',(8,8),255)
    with pytest.raises(ValueError,match='alpha_changed'):
        publish_repair(source,candidate,mask,tmp_path/'bad',budget=10)
    with pytest.raises(ValueError,match='pixel_budget_exceeded'):
        publish_repair(source,candidate,mask,tmp_path/'bad',budget=0,preserve_alpha=False)


def test_replacement_rejects_overlapping_cells_without_publishing(tmp_path):
    q=quality_module()
    from forge_accel.atlas import Frame,export_bundle
    export_bundle([Frame('one',Image.new('RGBA',(8,8),'red')),
                   Frame('two',Image.new('RGBA',(8,8),'red'))],tmp_path/'old')
    meta=tmp_path/'old'/'atlas.json';data=json.loads(meta.read_text());entries=list(data['frames'].values())
    entries[1]['frame']=dict(entries[0]['frame']);meta.write_text(json.dumps(data))
    replacement=tmp_path/'replacement.png';Image.new('RGBA',(8,8),'blue').save(replacement)
    with pytest.raises(ValueError,match='overlapping'):
        q.replace_frame(tmp_path/'old'/'atlas.png',meta,0,replacement,tmp_path/'bad')


@pytest.mark.parametrize('execute', [False, True])
def test_states_reject_invalid_refiner_in_later_state_before_any_generation(tmp_path, monkeypatch, capsys, execute):
    q = quality_module()
    spec = tmp_path / 'states.json'
    spec.write_text(json.dumps({'defaults': {'artist_name': 'gpt-image'}, 'states': [
        {'state': 'idle', 'prompt': 'cola machine', 'refiner': 'cli'},
        {'state': 'damaged', 'prompt': 'broken cola machine', 'refiner': 'typo'},
    ]}))
    def forbidden(*args, **kwargs):
        pytest.fail('invalid batch must be rejected before generating even its first state')
    monkeypatch.setattr(cli, 'make', forbidden)
    args = ['states', str(spec), '--cache-dir', str(tmp_path / 'cache'), '--generation-revision', 'v1']
    assert q.main(args + (['--execute'] if execute else [])) == 2
    assert 'unknown refiner' in capsys.readouterr().err
    assert not (tmp_path / 'cache').exists()


def test_make_rejects_invalid_refiner_before_image_provider_or_library_write(tmp_path, monkeypatch):
    from forge import artist, library
    monkeypatch.setattr(library, 'ROOT', tmp_path / 'library')
    def forbidden(*args, **kwargs):
        pytest.fail('invalid refiner must be rejected before the image provider')
    monkeypatch.setattr(artist, 'paint_with_gpt_image', forbidden)
    with pytest.raises(ValueError, match='unknown refiner'):
        cli.make('cola machine', artist_name='gpt-image', refiner='typo', log=lambda _: None)
    assert not (tmp_path / 'library').exists()


@pytest.mark.parametrize('array_format', [False, True])
def test_replace_minimal_external_atlas_preview_has_validated_defaults(tmp_path, array_format):
    q = quality_module()
    sheet = tmp_path / 'source.png'
    replacement = tmp_path / 'replacement.png'
    Image.new('RGBA', (16, 8), 'red').save(sheet)
    Image.new('RGBA', (8, 8), 'blue').save(replacement)
    entries = [{'frame': {'x': i * 8, 'y': 0, 'w': 8, 'h': 8}} for i in range(2)]
    manifest = tmp_path / 'external.json'
    frames = entries if array_format else {str(i): entry for i, entry in enumerate(entries)}
    manifest.write_text(json.dumps({'frames': frames}))
    q.replace_frame(sheet, manifest, 1, replacement, tmp_path / 'replaced')
    html = (tmp_path / 'replaced' / 'preview.html').read_text()
    preview = json.loads(html.split('const M=', 1)[1].split('; const image=', 1)[0])
    assert len(preview['frames']) == 2
    assert all(e['sourceSize'] == {'w': 8, 'h': 8} for e in preview['frames'].values())
    assert all(e['duration'] == 100 for e in preview['frames'].values())
    assert preview['meta']['frameTags'] == [{'name': 'imported', 'from': 0, 'to': 1, 'direction': 'forward'}]
    # Defaulting review metadata must not rewrite the imported external schema.
    exported = json.loads((tmp_path / 'replaced' / 'atlas.json').read_text())
    assert exported['frames'] == frames


@pytest.mark.parametrize('bad_prompt', ['missing', None, False, '', '   '])
@pytest.mark.parametrize('execute', [False, True])
def test_states_require_each_raw_prompt_even_when_brief_is_valid(tmp_path, monkeypatch, capsys, bad_prompt, execute):
    q = quality_module()
    invalid = {'state': 'damaged', 'brief': {'identity': ['preserve the cola cabinet']}}
    if bad_prompt != 'missing':
        invalid['prompt'] = bad_prompt
    spec = tmp_path / 'states.json'
    spec.write_text(json.dumps({'states': [{'state': 'idle', 'prompt': 'cola machine'}, invalid]}))
    def forbidden(*args, **kwargs):
        pytest.fail('every state prompt must pass before the first generation')
    monkeypatch.setattr(cli, 'make', forbidden)
    args = ['states', str(spec), '--cache-dir', str(tmp_path / 'cache'), '--generation-revision', 'v1']
    assert q.main(args + (['--execute'] if execute else [])) == 2
    assert 'prompt' in capsys.readouterr().err
    assert not (tmp_path / 'cache').exists()


@pytest.mark.parametrize('problem', ['size', 'reference'])
@pytest.mark.parametrize('execute', [False, True])
def test_states_validate_effective_profile_inputs_before_first_generation(tmp_path, monkeypatch, capsys, problem, execute):
    q = quality_module()
    from forge import profiles
    monkeypatch.setattr(profiles, 'ROOT', tmp_path / 'profiles')
    profiles.ROOT.mkdir()
    profile = {'size': [1024, 1024]} if problem == 'size' else {'references': ['bad.png']}
    (profiles.ROOT / 'bad.png').write_bytes(b'not a png')
    (profiles.ROOT / 'mall.json').write_text(json.dumps(profile))
    spec = tmp_path / 'states.json'
    spec.write_text(json.dumps({'states': [
        {'state': 'idle', 'prompt': 'cola machine'},
        {'state': 'damaged', 'prompt': 'broken cola machine', 'profile': 'mall'},
    ]}))
    def forbidden(*args, **kwargs):
        pytest.fail('profile-derived inputs must pass before the first generation')
    monkeypatch.setattr(cli, 'make', forbidden)
    args = ['states', str(spec), '--cache-dir', str(tmp_path / 'cache'), '--generation-revision', 'v1']
    assert q.main(args + (['--execute'] if execute else [])) == 2
    assert 'error' in capsys.readouterr().err
    assert not (tmp_path / 'cache').exists()


def test_replace_preview_keeps_all_frames_when_tags_create_name_collisions(tmp_path):
    q = quality_module()
    sheet = tmp_path / 'source.png'
    replacement = tmp_path / 'replacement.png'
    Image.new('RGBA', (16, 8), 'red').save(sheet)
    Image.new('RGBA', (8, 8), 'blue').save(replacement)
    manifest = tmp_path / 'external.json'
    manifest.write_text(json.dumps({'frames': {
        'idle/pose': {'frame': {'x': 0, 'y': 0, 'w': 8, 'h': 8}, 'duration': 70},
        'walk/pose': {'frame': {'x': 8, 'y': 0, 'w': 8, 'h': 8}, 'duration': 130},
    }, 'meta': {'frameTags': [{'name': 'same', 'from': 0, 'to': 1}]}}))
    q.replace_frame(sheet, manifest, 1, replacement, tmp_path / 'replaced')
    html = (tmp_path / 'replaced' / 'preview.html').read_text()
    preview = json.loads(html.split('const M=', 1)[1].split('; const image=', 1)[0])
    assert len(preview['frames']) == 2
    assert [e['frame']['x'] for e in preview['frames'].values()] == [0, 8]
    assert [e['duration'] for e in preview['frames'].values()] == [70, 130]
