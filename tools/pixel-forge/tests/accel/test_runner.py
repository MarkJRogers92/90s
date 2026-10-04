import importlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json
from pathlib import Path
import time
import pytest
from PIL import Image


def modules():
    try:
        return (importlib.import_module('forge_accel.runner'),importlib.import_module('forge_accel.backends'))
    except ModuleNotFoundError:
        pytest.fail('Missing cached runner/backend implementation')


def request(**kwargs):
    from forge_accel.briefs import ArtRequest
    return ArtRequest(**({'prompt':'test prop','width':8,'height':8}|kwargs))


def test_cache_runs_backend_once_and_rechecks_artifacts(tmp_path):
    r,b=modules(); calls=[]
    backend=b.CallbackBackend('fixture','v1',lambda req,work,profile:(calls.append(req) or Image.new('RGBA',(8,8),'red')))
    store=r.JobStore(tmp_path/'cache')
    one=store.run(request(),backend); two=store.run(request(),backend)
    assert len(calls)==1 and not one.cached and two.cached
    assert (one.path/'review.png').exists()
    assert json.loads((one.path/'job.json').read_text())['review_status']=='REVIEW_ONLY'
    (one.path/'sprite.png').write_bytes(b'corrupt')
    with pytest.raises(r.CachedArtifactError): store.run(request(),backend)
    assert len(calls)==1


def test_reference_bytes_not_name_and_backend_revision_control_cache(tmp_path):
    r,b=modules(); ref=tmp_path/'ref.png'; Image.new('RGBA',(8,8),'red').save(ref)
    seen=[]
    def gen(req,work,profile):
        assert Path(req.references[0]).parent != tmp_path
        assert profile and profile['palette']
        seen.append(Path(req.references[0]).read_bytes())
        return Image.new('RGBA',(8,8),'red')
    store=r.JobStore(tmp_path/'cache'); backend=b.CallbackBackend('fixture','v1',gen)
    first=store.run(request(references=(str(ref),)),backend)
    Image.new('RGBA',(8,8),'blue').save(ref)
    second=store.run(request(references=(str(ref),)),backend)
    third=store.run(request(references=(str(ref),)),b.CallbackBackend('fixture','v2',gen))
    assert len({first.key,second.key,third.key})==3 and len(seen)==3


def test_same_reference_at_different_path_reuses_job(tmp_path):
    r,b=modules(); a=tmp_path/'a.png'; c=tmp_path/'c.png'; Image.new('RGBA',(8,8),'red').save(a);c.write_bytes(a.read_bytes())
    backend=b.CallbackBackend('fixture','v1',lambda *args:Image.new('RGBA',(8,8),'red'))
    store=r.JobStore(tmp_path/'cache')
    one=store.run(request(references=(str(a),)),backend)
    two=store.run(request(references=(str(c),)),backend)
    assert one.key==two.key and two.cached


def test_failed_generation_never_auto_retries(tmp_path):
    r,b=modules(); calls=[]
    def bad(*args): calls.append(1); raise RuntimeError('network result uncertain')
    backend=b.CallbackBackend('fixture','v1',bad); store=r.JobStore(tmp_path/'cache')
    with pytest.raises(RuntimeError): store.run(request(),backend)
    with pytest.raises(r.UncertainJobError): store.run(request(),backend)
    assert len(calls)==1


def test_concurrent_duplicate_requests_do_one_generation(tmp_path):
    r,b=modules(); calls=[]
    def gen(*args): calls.append(1); time.sleep(.04); return Image.new('RGBA',(8,8),'red')
    backend=b.CallbackBackend('fixture','v1',gen)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(lambda _:r.JobStore(tmp_path/'cache').run(request(),backend),range(3)))
    assert len(calls)==1 and sum(x.cached for x in results)==2


def test_state_batch_only_regenerates_changed_state(tmp_path):
    r,b=modules(); calls=[]
    backend=b.CallbackBackend('fixture','v1',lambda req,*_:(calls.append(req.state) or Image.new('RGBA',(8,8),'red')))
    store=r.JobStore(tmp_path/'cache'); reqs=[request(state='idle'),request(state='walk')]
    store.run_many(reqs,backend,max_workers=2)
    results=store.run_many([reqs[0],replace(reqs[1],prompt='different walk')],backend,max_workers=2)
    assert len(calls)==3 and results[0].cached and not results[1].cached


def test_empty_backend_output_is_not_success(tmp_path):
    r,b=modules(); backend=b.CallbackBackend('fixture','v1',lambda *_:Image.new('RGBA',(8,8)))
    with pytest.raises(ValueError,match='empty'):
        r.JobStore(tmp_path/'cache').run(request(),backend)


def test_explicit_new_revision_has_new_cache_key(tmp_path):
    r,b=modules(); backend=b.CallbackBackend('fixture','v1',lambda *_:Image.new('RGBA',(8,8),'red'))
    store=r.JobStore(tmp_path/'cache')
    assert store.run(request(),backend).key != store.run(request(revision='take2'),backend).key


def make_fixture(tmp_path, mode='ok'):
    root=tmp_path/'forge';root.mkdir(); script=root/'forge.sh'
    script.write_text('''#!/usr/bin/env python3
import sys,time,json
from pathlib import Path
from PIL import Image
if '--help' in sys.argv:
 print('make -W -H -n --rounds --no-combine --artist --out');sys.exit(0)
args=sys.argv[1:]
Path(__file__).with_name('args.json').write_text(json.dumps(args))
''' + ("time.sleep(4)\n" if mode=='slow' else '') + '''
out=Path(args[args.index('--out')+1])
Image.new('RGBA',(int(args[args.index('-W')+1]),int(args[args.index('-H')+1])),'red').save(out)
''')
    script.chmod(0o755);return root


def test_real_process_cli_adapter_flags_and_no_shell_interpretation(tmp_path):
    r,b=modules();root=make_fixture(tmp_path);backend=b.ForgeCLIBackend(root,revision='fixture-v1',timeout_s=3)
    out=r.JobStore(tmp_path/'cache').run(request(prompt='$(touch HACKED); crate'),backend)
    args=json.loads((root/'args.json').read_text())
    assert args[args.index('-n')+1]=='1' and args[args.index('--rounds')+1]=='0'
    assert '--no-combine' in args and '--route' not in args
    assert not (root/'HACKED').exists() and (out.path/'sprite.png').exists()


def test_cli_timeout_stops_process_and_is_not_retried(tmp_path):
    r,b=modules();root=make_fixture(tmp_path,'slow');backend=b.ForgeCLIBackend(root,revision='fixture-v1',timeout_s=.15)
    store=r.JobStore(tmp_path/'cache')
    with pytest.raises(TimeoutError): store.run(request(),backend)
    with pytest.raises(r.UncertainJobError): store.run(request(),backend)


def test_cli_backend_fingerprint_changes_when_code_changes(tmp_path):
    r,b=modules();root=make_fixture(tmp_path);(root/'forge').mkdir();p=root/'forge'/'artist.py';p.write_text('version=1')
    one=b.ForgeCLIBackend(root,revision='v1').identity
    p.write_text('version=2')
    assert one != b.ForgeCLIBackend(root,revision='v1').identity


def test_unsupported_cli_flags_fail_before_generation(tmp_path):
    r,b=modules();root=make_fixture(tmp_path);script=root/'forge.sh'
    script.write_text('#!/usr/bin/env python3\nprint("make -W -H")\n');script.chmod(0o755)
    with pytest.raises(RuntimeError,match='flags'):
        r.JobStore(tmp_path/'cache').run(request(),b.ForgeCLIBackend(root,revision='v1'))
    assert not (root/'args.json').exists()


def test_batch_stops_scheduling_after_failure(tmp_path):
    r,b=modules();calls=[]
    def gen(req,*_):
        calls.append(req.state)
        if req.state=='bad': raise RuntimeError('stop')
        return Image.new('RGBA',(8,8),'red')
    with pytest.raises(RuntimeError):
        r.JobStore(tmp_path/'cache').run_many([request(state=s) for s in ['bad','two','three']],b.CallbackBackend('f','v1',gen))
    assert calls==['bad']


def _fork_worker(cache,counter):
    from forge_accel.runner import JobStore
    from forge_accel.backends import CallbackBackend
    def gen(*_):
        with open(counter,'a') as f: f.write('one\n')
        time.sleep(.05)
        return Image.new('RGBA',(8,8),'red')
    JobStore(cache).run(request(),CallbackBackend('fork-fixture','v1',gen))


def test_cross_process_duplicate_is_single_flight(tmp_path):
    import multiprocessing
    ctx=multiprocessing.get_context('spawn')
    counter=tmp_path/'counter';processes=[ctx.Process(target=_fork_worker,args=(tmp_path/'cache',counter)) for _ in range(2)]
    for p in processes:p.start()
    for p in processes:
        p.join(5);assert p.exitcode==0
    assert counter.read_text()=='one\n'
