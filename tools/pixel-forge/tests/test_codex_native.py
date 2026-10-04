"""Native subscription bridge contract; a real stdio peer, never paid inference."""
import base64
import importlib.util
import io
import json
from pathlib import Path

from PIL import Image
import pytest


@pytest.fixture(autouse=True)
def synthetic_unmanaged_host(monkeypatch):
    import forge.codex_native as native
    monkeypatch.setattr(native,'_SYSTEM_CONFIGS',(),raising=False)


def png():
    out = io.BytesIO()
    Image.new('RGBA', (8, 8), (20, 180, 160, 127)).save(out, format='PNG')
    return out.getvalue()


def peer(tmp_path, mode='ok'):
    """An executable protocol fixture, intentionally not an image generator."""
    target = tmp_path / ('peer-' + mode)
    target.write_text('''#!/usr/bin/env python3
import json, sys, time
from pathlib import Path
MODE = ''' + repr(mode) + '''
PNG = ''' + repr(base64.b64encode(png()).decode()) + '''
CAPTURE = ''' + repr(str(tmp_path / ('capture-' + mode + '.jsonl'))) + '''
def emit(x):
 print(json.dumps(x), flush=True)
for line in sys.stdin:
 q=json.loads(line)
 with open(CAPTURE, 'a') as f: f.write(json.dumps(q)+'\\n')
 if 'id' not in q: continue
 method=q.get('method')
 if method=='initialize': result={'userAgent':'codex/0.159.2'}
 elif method=='account/read': result={'account':None if MODE=='signed_out' else {'type':'apiKey' if MODE=='api' else 'chatgpt', 'planType':'enterprise' if MODE=='managed_account' else 'pro'},'requiresOpenaiAuth':True}
 elif method=='thread/start':
  if MODE=='auth_before_turn': emit({'method':'account/updated','params':{'authMode':'apikey','planType':None}})
  result={'thread':{'id':'thread-1'}, 'modelProvider':'other' if MODE=='provider' else 'openai', 'model':'other' if MODE=='model' else 'explicit-codex-model', 'approvalPolicy':'on-request', 'approvalsReviewer':'auto_review' if MODE=='reviewer' else 'user', 'sandbox':{'type':'readOnly','networkAccess': MODE=='network'}}
 elif method=='turn/start':
  if MODE=='user_item':
   emit({'method':'item/completed','params':{'threadId':'thread-1','turnId':'turn-1','item':{'type':'userMessage','id':'user-1','content':[]}}})
  if MODE=='auth_changed':
   emit({'method':'account/updated','params':{'authMode':'apikey','planType':None}})
  if MODE=='rerouted':
   emit({'method':'model/rerouted','params':{'threadId':'thread-1','turnId':'turn-1','fromModel':'explicit-codex-model','toModel':'other','reason':'highRiskCyberActivity'}})
  if MODE=='approval':
   emit({'id':900,'method':'item/commandExecution/requestApproval','params':{'threadId':'thread-1'}})
   continue
  if MODE=='timeout': time.sleep(5); continue
  item={'type':'imageGeneration','id':'image-1','status':'completed','result':PNG,'transparentBackground':True}
  if MODE=='invalid_item_id': item['id']=[]
  if MODE=='invalid': item['result']='not-a-png'
  if MODE=='url': item['result']='https://example.test/image.png'
  if MODE=='saved_only': item.update(result='', savedPath='/outside/request.png')
  if MODE=='rate_limit': item.update(status='failed', failure={'type':'usageLimitExceeded','limitId':'images'})
  if MODE=='background': item['transparentBackground']=False
  if MODE=='prose': item={'type':'agentMessage','id':'message-1','text':'I generated the image!'}
  if MODE=='foreign':
   emit({'method':'item/completed','params':{'threadId':'other','turnId':'turn-1','item':item}})
  else:
   emit({'method':'item/completed','params':{'threadId':'thread-1','turnId':'turn-1','item':item}})
  if MODE=='multiple':
   emit({'method':'item/completed','params':{'threadId':'thread-1','turnId':'turn-1','item':{**item,'id':'image-2'}}})
  if MODE=='second_started':
   emit({'method':'item/started','params':{'threadId':'thread-1','turnId':'turn-1','item':{**item,'id':'image-2','status':'in_progress'}}})
  if MODE=='duplicate':
   emit({'method':'item/completed','params':{'threadId':'thread-1','turnId':'turn-1','item':item}})
  if MODE=='unexpected_tool':
   emit({'method':'item/started','params':{'threadId':'thread-1','turnId':'turn-1','item':{'type':'commandExecution','id':'command-1'}}})
  emit({'id':q['id'],'result':{'turn':None if MODE=='null_turn_start' else {'id':'turn-1','status':'inProgress'}}})
  emit({'method':'turn/completed','params':{'threadId':'thread-1','turn':None if MODE=='null_turn_complete' else {'id':'turn-1','status':'failed' if MODE=='failed_turn' else 'completed'}}})
  continue
 else: result={}
 if method=='thread/start' and MODE=='null_thread': result['thread']=None
 emit({'id':q['id'],'result':result})
''')
    target.chmod(0o700)
    return target


def backend(tmp_path, mode='ok', **kwargs):
    assert importlib.util.find_spec('forge.codex_native') is not None, 'native Codex bridge is missing'
    from forge.codex_native import CodexNativeBackend
    home=tmp_path/'native-home';home.mkdir(exist_ok=True)
    return CodexNativeBackend(executable=peer(tmp_path, mode), work_root=tmp_path / 'requests', codex_home=home,
                              model='explicit-codex-model', revision='test-native-v1',
                              enabled=True, **kwargs)


def request(**kwargs):
    return {'prompt':'A teal pixel-art gem', 'referenced_image_paths':[],
            'transparent_background':True, **kwargs}


def capture(tmp_path, mode='ok'):
    path=tmp_path / ('capture-' + mode + '.jsonl')
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def test_native_exact_png_requires_real_tool_and_turn_completion(tmp_path):
    result=backend(tmp_path).generate(request())
    assert result['image_bytes']==png()
    assert result['provider']=='codex-native-chatgpt'
    assert result['request_id']=='thread-1:turn-1:image-1'
    assert result['model']=='explicit-codex-model'
    messages=capture(tmp_path)
    assert [m.get('method') for m in messages]==['initialize','initialized','account/read','thread/start','turn/start']
    thread=messages[3]['params']
    assert thread['ephemeral'] is True
    assert thread['sandbox']=='read-only'
    assert thread['approvalPolicy']=='on-request'
    assert thread['modelProvider']=='openai'
    assert messages[2]['params']=={'refreshToken':False}


@pytest.mark.parametrize('mode,code',[('managed_account','UNSUPPORTED_NATIVE_ACCOUNT'),('api','CHATGPT_LOGIN_REQUIRED'),('signed_out','CHATGPT_LOGIN_REQUIRED'),
 ('provider','NATIVE_PROVIDER_REQUIRED'),('model','MODEL_MISMATCH'),('reviewer','UNSAFE_WORKER_POLICY'),('network','UNSAFE_WORKER_POLICY'),('auth_before_turn','AUTH_CHANGED'),('null_thread','NATIVE_PROTOCOL_INVALID')])
def test_preflight_never_starts_generation_on_wrong_auth_or_provider(tmp_path,mode,code):
    from forge.image_provider import ImageProviderError
    with pytest.raises(ImageProviderError) as raised: backend(tmp_path,mode).generate(request())
    assert raised.value.code==code
    assert raised.value.completion=='not_started'
    assert not any(m.get('method')=='turn/start' for m in capture(tmp_path,mode))


@pytest.mark.parametrize('mode,code',[('null_turn_start','NATIVE_PROTOCOL_INVALID'),('null_turn_complete','NATIVE_PROTOCOL_INVALID'),('invalid_item_id','NATIVE_PROTOCOL_INVALID'),('prose','NATIVE_IMAGE_MISSING'),('foreign','NATIVE_IMAGE_MISSING'),
 ('multiple','MULTIPLE_IMAGES'),('second_started','MULTIPLE_IMAGES'),('invalid','INVALID_NATIVE_IMAGE'),('url','INVALID_NATIVE_IMAGE'),
 ('saved_only','INVALID_NATIVE_IMAGE'),('failed_turn','TURN_FAILED'),
 ('rate_limit','NATIVE_IMAGE_FAILED'),('background','BACKGROUND_MISMATCH'),
 ('approval','APPROVAL_REQUIRED'),('auth_changed','AUTH_CHANGED'),('rerouted','MODEL_REROUTED'),('unexpected_tool','UNEXPECTED_TOOL')])
def test_fail_closed_without_retry_or_fallback(tmp_path,mode,code):
    from forge.image_provider import ImageProviderError
    with pytest.raises(ImageProviderError) as raised: backend(tmp_path,mode).generate(request())
    assert raised.value.code==code
    assert raised.value.completion in ('unknown','response_received')
    assert raised.value.result()['error']['retryable'] is False
    assert sum(m.get('method')=='turn/start' for m in capture(tmp_path,mode))==1


def test_duplicate_notification_is_not_a_second_generation(tmp_path):
    assert backend(tmp_path,'duplicate').generate(request())['image_bytes']==png()


def test_timeout_is_unknown_and_never_retries(tmp_path):
    from forge.image_provider import ImageProviderError
    with pytest.raises(ImageProviderError) as raised: backend(tmp_path,'timeout',timeout=0.3).generate(request())
    assert raised.value.code=='NATIVE_TIMEOUT'
    assert raised.value.completion=='unknown'
    assert sum(m.get('method')=='turn/start' for m in capture(tmp_path,'timeout'))==1


def test_reference_snapshots_are_ordered_and_exact(tmp_path):
    refs=[tmp_path/'a.png',tmp_path/'b.png']
    for ref in refs: ref.write_bytes(png())
    result=backend(tmp_path).generate(request(referenced_image_paths=refs))
    assert result['image_bytes']==png()
    inputs=capture(tmp_path)[-1]['params']['input']
    paths=[Path(x['path']) for x in inputs if x['type']=='localImage']
    assert [p.name for p in paths]==['reference-1.png','reference-2.png']
    assert all(p.read_bytes()==png() for p in paths)
    assert all(p.parent!=tmp_path for p in paths)


def test_configuration_is_offline_and_does_not_claim_account_availability(tmp_path):
    b=backend(tmp_path)
    cap=b.capability()
    assert cap['available'] is None
    assert cap['transport']=='private-stdio'
    assert cap['account_access']=='unverified'
    assert not capture(tmp_path)


def test_disabled_backend_never_spawns(tmp_path):
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path);b.enabled=False
    with pytest.raises(ImageProviderError) as raised: b.generate(request())
    assert raised.value.code=='PROVIDER_DISABLED'
    assert not capture(tmp_path)


def test_rejects_api_options_instead_of_silently_ignoring_them(tmp_path):
    from forge.image_provider import ImageProviderError
    with pytest.raises(ImageProviderError) as raised: backend(tmp_path).generate(request(quality='high'))
    assert raised.value.code=='INVALID_REQUEST'
    assert not capture(tmp_path)


def test_cli_capabilities_requires_no_worker_or_provider_call(tmp_path):
    import subprocess
    import sys
    proc=subprocess.run([sys.executable,'-m','forge.codex_native','capabilities',
        '--work-root',str(tmp_path/'work'),'--codex-home',str(tmp_path/'native-home'),'--model','explicit-codex-model',
        '--revision','native-test-v1'],capture_output=True,text=True)
    assert proc.returncode==0
    result=json.loads(proc.stdout)
    assert result['provider']=='codex-native-chatgpt'
    assert result['status']=='disabled'
    assert not (tmp_path/'work').exists()


def test_native_pair_integration_records_provider_and_never_reissues_unknown(tmp_path):
    from forge import image_pair
    from forge.image_provider import ImageProviderError
    ref=tmp_path/'source.png';ref.write_bytes(png())
    spec={'prompt':'A gem','style':'Match original reference','references':[str(ref)],
          'frame_size':8,'frames':1,'facings':['south'],'durations_ms':[100],'revision':'native-fixture-v1'}
    root=tmp_path/'jobs'
    job=image_pair.begin(root,spec)
    result=image_pair.run_provider(root,job['key'],backend(tmp_path))
    assert result['state']=='pending'
    state=json.loads((root/job['key']/'job.json').read_text())
    assert state['history'][0]['receipt']['provider']=='codex-native-chatgpt'
    assert state['dispatch_capabilities']['configured_provider'] is True
    assert 'configured_api_adapter' not in state['dispatch_capabilities']
    with pytest.raises(ImageProviderError): image_pair.run_provider(root,job['key'],backend(tmp_path,'prose'))
    assert image_pair.status(root,job['key'])['state']=='in_flight'
    with pytest.raises(RuntimeError): image_pair.run_provider(root,job['key'],backend(tmp_path,'ok'))


def test_disabled_provider_does_not_read_reference_files(tmp_path, monkeypatch):
    import forge.codex_native as native
    from forge.image_provider import ImageProviderError
    def unexpected(*args): raise AssertionError('reference read while disabled')
    monkeypatch.setattr(native,'read_bounded',unexpected)
    b=backend(tmp_path);b.enabled=False
    with pytest.raises(ImageProviderError) as raised: b.generate(request(referenced_image_paths=['unused.png']))
    assert raised.value.code=='PROVIDER_DISABLED'


def test_api_capability_alias_is_preserved():
    from forge.image_pair_cli import action
    class ExistingAPI:
        def capability(self): return {'provider':'openai-images-api','enabled':False}
    result=action('capabilities','unused',backend=ExistingAPI())
    assert result['api_adapter']==result['provider_adapter']


def test_native_capabilities_do_not_mislabel_an_api():
    from forge.image_pair_cli import action
    class Native:
        def capability(self): return {'provider':'codex-native-chatgpt','enabled':False}
    result=action('capabilities','unused',backend=Native())
    assert result['provider_adapter']['provider']=='codex-native-chatgpt'
    assert 'api_adapter' not in result


def test_worker_lock_is_held_until_child_cleanup(tmp_path, monkeypatch):
    import fcntl
    import forge.codex_native as native
    original=native._Stdio.close
    held=[]
    def inspected_close(worker):
        with (tmp_path/'requests'/'.native-worker.lock').open('a+b') as lock:
            try: fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: held.append(True)
            else: held.append(False);fcntl.flock(lock.fileno(),fcntl.LOCK_UN)
        original(worker)
    monkeypatch.setattr(native._Stdio,'close',inspected_close)
    assert backend(tmp_path).generate(request())['image_bytes']==png()
    assert held==[True]


def test_stdin_backpressure_respects_deadline(tmp_path):
    import sys
    import threading
    from forge.codex_native import _Stdio
    from forge.image_provider import ImageProviderError
    worker=_Stdio([sys.executable,'-c','import time; time.sleep(3)'],tmp_path,0.1)
    errors=[]
    def send():
        try: worker.send({'payload':'x'*100000})
        except ImageProviderError as error: errors.append(error.code)
    thread=threading.Thread(target=send,daemon=True);thread.start();thread.join(0.5)
    blocked=thread.is_alive()
    worker.close();thread.join(1)
    assert not blocked, 'stdin write escaped the configured deadline'
    assert errors==['NATIVE_TIMEOUT']


def test_normal_user_message_lifecycle_is_allowed(tmp_path):
    assert backend(tmp_path,'user_item').generate(request())['image_bytes']==png()


@pytest.mark.parametrize('unsafe',['config.toml','custom.config.toml','hooks.json'])
def test_dedicated_profile_rejects_inherited_custom_configuration(tmp_path,unsafe):
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path)
    (tmp_path/'native-home'/unsafe).write_text('not read by the bridge')
    with pytest.raises(ImageProviderError) as raised: b.generate(request())
    assert raised.value.code=='NATIVE_PROFILE_UNSAFE'
    assert raised.value.completion=='not_started'
    assert not capture(tmp_path)


def test_missing_dedicated_profile_never_starts_or_logs_in(tmp_path):
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path)
    (tmp_path/'native-home').rmdir()
    with pytest.raises(ImageProviderError) as raised: b.probe()
    assert raised.value.code=='NATIVE_PROFILE_REQUIRED'
    assert not capture(tmp_path)


def test_real_mcp_stdio_runs_native_fixture_and_exposes_only_pair_tool(tmp_path):
    import asyncio
    import sys
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    exe=peer(tmp_path)
    home=tmp_path/'native-home';home.mkdir()
    ref=tmp_path/'source.png';ref.write_bytes(png())
    spec={'prompt':'A gem','style':'Match reference','references':[str(ref)],
          'frame_size':8,'frames':1,'facings':['south'],'durations_ms':[100]}
    async def run():
        params=StdioServerParameters(command=sys.executable,
            cwd=Path(__file__).resolve().parents[1],
            args=['-c',"from forge import codex_native as n; n._SYSTEM_CONFIGS=(); raise SystemExit(n.main())",'serve','--executable',str(exe),
                  '--work-root',str(tmp_path/'workers'),'--codex-home',str(home),
                  '--model','explicit-codex-model','--revision','mcp-fixture-v1','--enable-native'])
        async with stdio_client(params,errlog=sys.__stderr__) as streams, ClientSession(*streams,read_timeout_seconds=15) as client:
            await client.initialize()
            assert {tool.name for tool in (await client.list_tools()).tools}=={'forge_image_pair'}
            async def call(action,**kwargs):
                value=await client.call_tool('forge_image_pair',{'action':action,'root':str(tmp_path/'jobs'),**kwargs})
                assert not value.is_error
                return json.loads(value.content[0].text)
            cap=await call('capabilities')
            assert cap['provider_adapter']['provider']=='codex-native-chatgpt'
            job=await call('begin',spec=spec)
            result=await call('run',key=job['key'])
            assert result['state']=='pending' and result['next']['stage']=='sheet'
            assert len(result['next']['referenced_image_paths'])==2
            state=json.loads((tmp_path/'jobs'/job['key']/'job.json').read_text())
            assert state['history'][0]['receipt']['request_id']=='thread-1:turn-1:image-1'
            exe.write_text(peer(tmp_path,'api').read_text())
            rejected=await client.call_tool('forge_image_pair',{'action':'run','root':str(tmp_path/'jobs'),'key':job['key']})
            assert rejected.is_error
            assert json.loads(rejected.content[0].text)['error']['code']=='CHATGPT_LOGIN_REQUIRED'
    asyncio.run(run())



def test_vendor_system_skills_do_not_block_a_clean_profile(tmp_path):
    b=backend(tmp_path)
    (tmp_path/'native-home'/'skills'/'.system').mkdir(parents=True)
    assert b.generate(request())['image_bytes']==png()


def test_custom_skill_directory_blocks_before_spawn(tmp_path):
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path)
    (tmp_path/'native-home'/'skills'/'custom').mkdir(parents=True)
    with pytest.raises(ImageProviderError) as raised: b.probe()
    assert raised.value.code=='NATIVE_PROFILE_UNSAFE'
    assert not capture(tmp_path)


def test_known_system_configuration_is_not_read_or_overridden(tmp_path,monkeypatch):
    import forge.codex_native as native
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path)
    config=tmp_path/'managed.toml';config.write_text('not read')
    monkeypatch.setattr(native,'_SYSTEM_CONFIGS',(config,))
    with pytest.raises(ImageProviderError) as raised: b.probe()
    assert raised.value.code=='NATIVE_PROFILE_UNSAFE'
    assert not capture(tmp_path)


def test_ancestor_project_configuration_blocks_before_spawn(tmp_path):
    from forge.image_provider import ImageProviderError
    b=backend(tmp_path)
    (tmp_path/'.codex').mkdir();(tmp_path/'.codex'/'config.toml').write_text('not read')
    with pytest.raises(ImageProviderError) as raised: b.probe()
    assert raised.value.code=='NATIVE_PROFILE_UNSAFE'
    assert not capture(tmp_path)



def test_concurrent_requests_serialize_and_keep_unique_workspaces(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    b=backend(tmp_path)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(lambda _: b.generate(request()), range(2)))
    assert all(value['image_bytes']==png() for value in results)
    calls=capture(tmp_path)
    assert [x.get('method') for x in calls]==['initialize','initialized','account/read','thread/start','turn/start']*2
    workspaces=[x['params']['cwd'] for x in calls if x.get('method')=='thread/start']
    assert len(set(workspaces))==2


def test_descendant_holding_stdout_does_not_hang_cleanup(tmp_path):
    import sys
    import time
    from forge.codex_native import _Stdio
    child='import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)'
    parent='import subprocess,sys,time; subprocess.Popen([sys.executable,"-c",'+repr(child)+']); print("{}",flush=True); time.sleep(30)'
    worker=_Stdio([sys.executable,'-c',parent],tmp_path,1)
    time.sleep(0.15)
    started=time.monotonic();worker.close()
    assert time.monotonic()-started<3
    assert not worker.reader.is_alive()
    assert worker.process.poll() is not None


def test_descendant_with_detached_stdout_is_stopped_before_unlock(tmp_path):
    import os
    import signal
    import sys
    import time
    from forge.codex_native import _Stdio
    marker=tmp_path/'survived';pidfile=tmp_path/'child.pid'
    child=('import signal,time; from pathlib import Path; '
           'signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(0.7); '
           f'Path({str(marker)!r}).write_text("alive"); time.sleep(30)')
    parent=('import subprocess,sys,time; from pathlib import Path; '
            f'p=subprocess.Popen([sys.executable,"-c",{child!r}],stdout=subprocess.DEVNULL); '
            f'Path({str(pidfile)!r}).write_text(str(p.pid)); time.sleep(30)')
    worker=_Stdio([sys.executable,'-c',parent],tmp_path,1)
    end=time.monotonic()+1
    while not pidfile.exists() and time.monotonic()<end: time.sleep(0.01)
    assert pidfile.exists()
    time.sleep(0.1)
    try:
        worker.close();time.sleep(0.8)
        assert not marker.exists(), 'descendant survived worker cleanup'
    finally:
        try: os.kill(int(pidfile.read_text()),signal.SIGKILL)
        except ProcessLookupError: pass
