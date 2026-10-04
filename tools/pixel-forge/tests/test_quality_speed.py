"""Integration regressions exercise cli.make -> artist.generate -> real DSL.

Only the paid backend boundary is replaced; no invented generator API.
"""
import inspect
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from PIL import Image
from forge import artist, cli, library, profiles


class DrawingBackend(artist.Backend):
    name = 'fixture'
    model = 'fixture-v1'

    def __init__(self):
        self.calls = []

    def ask(self, system, text, images, workdir):
        self.calls.append((text, [p.read_bytes() for p in images]))
        time.sleep(.01)
        return json.dumps({'width': 8, 'height': 8, 'palette': {'a': '#e0408a'},
                           'ops': [{'op':'rect','x':1,'y':1,'w':6,'h':6,'c':'a'}]})


@pytest.fixture
def drawing(tmp_path, monkeypatch):
    backend = DrawingBackend()
    monkeypatch.setattr(artist, 'make_backend', lambda *args: backend)
    monkeypatch.setattr(library, 'ROOT', tmp_path / 'library')
    monkeypatch.setattr(profiles, 'ROOT', tmp_path / 'profiles')
    return backend


def cached(tmp_path, **kwargs):
    assert 'cache_dir' in inspect.signature(cli.make).parameters, 'make needs opt-in native caching'
    return cli.make('cola machine', width=8, height=8, rounds=0, candidates=1,
                    polish=False, log=lambda _: None, cache_dir=tmp_path / 'cache',
                    generation_revision='fixture-config-v1', **kwargs)


def test_real_make_cache_hit_never_calls_artist_again(tmp_path, drawing):
    first = cached(tmp_path)
    second = cached(tmp_path)
    assert len(drawing.calls) == 1
    assert first['library_id'] == second['library_id']
    assert not first['cache']['hit'] and second['cache']['hit']
    assert Path(second['png']).read_bytes() == Path(first['png']).read_bytes()


def test_state_change_regenerates_only_changed_state(tmp_path, drawing):
    idle = cached(tmp_path, state='idle')
    cached(tmp_path, state='damaged')
    again = cached(tmp_path, state='idle')
    changed = cached(tmp_path, state='damaged', brief={'physical_cues': ['broken glass']})
    assert len(drawing.calls) == 3
    assert idle['cache']['key'] == again['cache']['key']
    assert again['cache']['hit'] and not changed['cache']['hit']
    assert 'broken glass' in drawing.calls[-1][0]


def test_concurrent_native_make_suppresses_duplicate_backend(tmp_path, drawing):
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: cached(tmp_path), range(3)))
    assert len(drawing.calls) == 1
    assert len({r['library_id'] for r in results}) == 1
    assert sum(r['cache']['hit'] for r in results) == 2


def test_reference_and_profile_mutations_invalidate_cache(tmp_path, drawing):
    ref = tmp_path / 'ref.png'
    Image.new('RGBA', (8,8), 'red').save(ref)
    profiles.ROOT.mkdir()
    profile = profiles.ROOT / 'mall.json'
    profile.write_text(json.dumps({'style':'neon', 'references':['../ref.png']}))
    first = cached(tmp_path, profile='mall')
    cached(tmp_path, profile='mall')
    Image.new('RGBA', (8,8), 'blue').save(ref)
    second = cached(tmp_path, profile='mall')
    profile.write_text(json.dumps({'style':'gritty neon', 'references':['../ref.png']}))
    third = cached(tmp_path, profile='mall')
    assert len(drawing.calls) == 3
    assert len({r['cache']['key'] for r in (first,second,third)}) == 3
    assert drawing.calls[-1][1] == [ref.read_bytes()]


def test_export_on_hit_does_not_generate_and_never_overwrites(tmp_path, drawing):
    cached(tmp_path)
    out = tmp_path / 'export.png'
    cached(tmp_path, out=str(out))
    with pytest.raises(FileExistsError): cached(tmp_path, out=str(out))
    assert len(drawing.calls) == 1 and out.exists()


def test_invalid_brief_rejected_before_backend(tmp_path, drawing):
    with pytest.raises(ValueError): cached(tmp_path, brief={'unknown': ['stuff']})
    assert not drawing.calls


def test_bounded_repair_preserves_alpha_and_rejects_outside(tmp_path):
    from forge import quality_speed
    assert hasattr(quality_speed, 'publish_repair'), 'missing bounded repair publisher'
    source = Image.new('RGBA', (8,8), (20,30,40,90))
    candidate = source.copy(); candidate.putpixel((2,2), (40,50,60,90))
    mask = Image.new('L', (8,8)); mask.putpixel((2,2),255)
    report = quality_speed.publish_repair(source,candidate,mask,tmp_path/'ok',budget=1)
    assert report['accepted']
    saved = Image.open(tmp_path/'ok'/'sprite.png').convert('RGBA')
    assert saved.tobytes() == candidate.tobytes()
    candidate.putpixel((3,3),(255,0,0,90))
    with pytest.raises(ValueError, match='outside_edit_mask'):
        quality_speed.publish_repair(source,candidate,mask,tmp_path/'bad',budget=10)
    assert not (tmp_path/'bad').exists()


def test_gpt_paint_receives_image_reference_arguments(tmp_path, monkeypatch):
    assert 'references' in inspect.signature(artist.paint_with_gpt_image).parameters
    ref = tmp_path/'ref.png'; Image.new('RGBA',(8,8),'red').save(ref)
    calls=[]
    def run(args, **kwargs):
        calls.append(args)
        line = next(line for line in args[-1].splitlines() if line.startswith('Output PNG path: '))
        output = Path(json.loads(line.removeprefix('Output PNG path: ')))
        Image.new('RGBA',(8,8),'red').save(output)
        return type('Result',(),{'stdout':'DONE','stderr':'','returncode':0})()
    monkeypatch.setattr(artist.subprocess,'run',run)
    artist.paint_with_gpt_image('cola',8,8,None,tmp_path/'work',log=lambda _:None,references=[ref])
    assert calls[0][calls[0].index('-i')+1] == str(ref.resolve())


def test_cached_result_metadata_integrity_is_verified_without_generation(tmp_path,drawing):
    first=cached(tmp_path)
    metadata=Path(first['cache']['path'])/'work'/'forge-result.json'
    metadata.write_text('{}')
    from forge_accel.runner import CachedArtifactError
    with pytest.raises(CachedArtifactError):cached(tmp_path)
    assert len(drawing.calls)==1


def test_options_and_starting_source_are_part_of_native_identity(tmp_path,drawing):
    first=cached(tmp_path,checks=['readable cola logo'])
    second=cached(tmp_path,checks=['readable coin slot'])
    from forge.sprite import Sprite
    base=Sprite.from_dict({'width':8,'height':8,'palette':{'b':'#00ff00'},'rows':['bbbbbbbb']*8})
    third=cached(tmp_path,base=base)
    base.palette['b']='#0000ff'
    fourth=cached(tmp_path,base=base)
    assert len({r['cache']['key'] for r in (first,second,third,fourth)})==4
    assert len(drawing.calls)==4


def test_soft_alpha_start_rejected_before_generation(tmp_path,drawing):
    source=tmp_path/'soft.png';Image.new('RGBA',(8,8),(100,40,50,90)).save(source)
    with pytest.raises(ValueError,match='cannot preserve'):
        cached(tmp_path,start=str(source))
    assert not drawing.calls


def test_failed_native_job_never_retries_paid_work(tmp_path,drawing,monkeypatch):
    def fail(*args):raise artist.ArtistError('provider completion uncertain')
    monkeypatch.setattr(drawing,'ask',fail)
    with pytest.raises(artist.ArtistError):cached(tmp_path)
    from forge_accel.runner import UncertainJobError
    with pytest.raises(UncertainJobError):cached(tmp_path)


def test_native_duplicate_suppression_across_processes(tmp_path):
    import subprocess
    import sys
    code = '''
import json,sys,time
from pathlib import Path
from forge import cli,artist,library
root=Path(sys.argv[1]);library.ROOT=root/'library'
class Fixture(artist.Backend):
 name='fixture';model='v1'
 def ask(self,*args):
  with (root/'calls.txt').open('a') as f:f.write('call\\n')
  time.sleep(.1)
  return json.dumps({'width':8,'height':8,'palette':{'a':'#e0408a'},'ops':[{'op':'rect','x':1,'y':1,'w':6,'h':6,'c':'a'}]})
artist.make_backend=lambda *args:Fixture()
r=cli.make('prop',width=8,height=8,rounds=0,candidates=1,polish=False,log=lambda _:None,cache_dir=root/'cache',generation_revision='fixture-v1')
print(json.dumps(r))
'''
    processes=[subprocess.Popen([sys.executable,'-c',code,str(tmp_path)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
    outputs=[]
    for p in processes:
        stdout,stderr=p.communicate(timeout=15)
        assert p.returncode==0,stderr
        outputs.append(json.loads(stdout))
    assert (tmp_path/'calls.txt').read_text().splitlines()==['call']
    assert len({o['library_id'] for o in outputs})==1
    assert sum(o['cache']['hit'] for o in outputs)==1


def test_cache_requires_explicit_external_config_revision(tmp_path,drawing):
    with pytest.raises(ValueError,match='generation_revision'):
        cli.make('cola',cache_dir=tmp_path/'cache')
    assert not drawing.calls


def test_real_state_command_reuses_unchanged_state(tmp_path,drawing,capsys):
    from forge import quality_cli
    spec=tmp_path/'states.json'
    data={'defaults':{'width':8,'height':8,'rounds':0,'candidates':1,'polish':False},
          'states':[{'state':'idle','prompt':'cola machine'}, {'state':'damaged','prompt':'broken cola machine'}]}
    spec.write_text(json.dumps(data))
    args=['states',str(spec),'--cache-dir',str(tmp_path/'cache'),'--generation-revision','v1','--execute']
    assert quality_cli.main(args)==0
    data['states'][1]['prompt']='cola machine with broken glass'
    spec.write_text(json.dumps(data))
    assert quality_cli.main(args)==0
    assert len(drawing.calls)==3
    assert len(list(library.ROOT.iterdir()))==3
