import json
from pathlib import Path
from PIL import Image
import pytest
from forge import cli


def pair_module():
    import importlib.util
    assert importlib.util.find_spec('forge.image_pair') is not None, 'paired image workflow is not implemented'
    from forge import image_pair
    return image_pair


def spec(ref):
    return {'prompt':'Bargain Hunter shoulder charge', 'style':'DEAD MALL crisp pixel art',
            'references':[str(ref)], 'frame_size':8, 'frames':2, 'facings':['west'],
            'durations_ms':[142,133], 'pivot':[4,7], 'max_followups':1,
            'constraints':['shopping bag remains in anatomical-left hand']}


@pytest.fixture
def setup_pair(tmp_path):
    ref=tmp_path/'reference.png';Image.new('RGBA',(8,8),(30,20,50,255)).save(ref)
    return tmp_path,ref


def accept(pm,root,key,size,receipt_id='native-test',color=(10,20,30,255)):
    work=pm.dispatch(root,key,capabilities={'native_image_tool':True})
    image=Path(root).parent/f'{work["ticket"]}.png'
    im=Image.new('RGBA',size,(0,0,0,0)); im.paste(color,(1,1,size[0]-1,size[1]-1));im.save(image)
    return pm.accept(root,key,work['ticket'],image,
                     {'provider':'caller-image-tool','invocation_id':receipt_id})


def test_mockup_then_sheet_with_references_and_no_false_capability(setup_pair):
    pm=pair_module();tmp,ref=setup_pair; root=tmp/'jobs'
    job=pm.begin(root,spec(ref));key=job['key']
    assert job['state']=='pending' and job['next']['stage']=='mockup'
    assert pm.capabilities()['native_image_tool']=='caller_must_advertise'
    with pytest.raises(ValueError,match='capability'):pm.dispatch(root,key,capabilities={})
    first=accept(pm,root,key,(16,16))
    assert first['next']['stage']=='sheet'
    assert len(first['next']['referenced_image_paths'])==2
    assert 'shopping bag' in first['next']['prompt']
    result=accept(pm,root,key,(16,8))
    assert result['state']=='review_ready' and result['review_status']=='REVIEW_ONLY'
    assert result['art_review_required'] is True
    assert result['artifacts']['mockup']['sha256']
    assert result['artifacts']['sheet']['sha256']
    again=pm.begin(root,spec(ref));assert again['cached'] and again['key']==key
    assert again['state']=='review_ready'


def test_inflight_not_reissued_and_wrong_ticket_rejected(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    req=pm.dispatch(root,key,capabilities={'native_image_tool':True})
    with pytest.raises(RuntimeError,match='in_flight'):pm.dispatch(root,key,capabilities={'native_image_tool':True})
    with pytest.raises(ValueError,match='ticket'):pm.accept(root,key,'wrong',ref,{'provider':'caller-image-tool','invocation_id':'x'})
    assert pm.status(root,key)['state']=='in_flight'


def test_bad_sheet_retains_raw_and_requires_targeted_followup(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    accept(pm,root,key,(16,16))
    bad=accept(pm,root,key,(17,8))
    assert bad['state']=='needs_revision'
    assert 'dimensions' in ' '.join(bad['validation']['errors'])
    retry=pm.revise(root,key,'sheet','Fix exact grid dimensions; preserve character identity.')
    assert retry['next']['stage']=='sheet'
    assert len(retry['next']['referenced_image_paths'])==3
    assert retry['next']['operation']=='edit'
    assert 'Fix exact grid' in retry['next']['prompt']
    assert accept(pm,root,key,(16,8))['state']=='review_ready'
    with pytest.raises(ValueError,match='budget'):pm.revise(root,key,'sheet','One more')


def test_snapshots_cache_and_output_integrity(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';job=pm.begin(root,spec(ref));key=job['key']
    frozen=Path(job['next']['referenced_image_paths'][0]);before=frozen.read_bytes()
    Image.new('RGBA',(8,8),'green').save(ref)
    assert frozen.read_bytes()==before
    assert pm.begin(root,spec(ref))['key']!=key
    frozen.write_bytes(b'corrupt')
    with pytest.raises(RuntimeError,match='integrity'):pm.status(root,key)


def test_protected_region_is_enforced_not_only_prompted(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    accept(pm,root,key,(16,16));old=accept(pm,root,key,(16,8))
    mask=tmp/'mask.png';Image.new('L',(16,8),0).save(mask)
    pm.revise(root,key,'sheet','Change only white mask area',edit_mask=mask,max_changed_pixels=0)
    bad=accept(pm,root,key,(16,8),color=(255,0,0,255))
    assert bad['state']=='needs_revision'
    assert 'outside_edit_mask' in bad['validation']['errors']
    assert pm.status(root,key)['artifacts']['sheet']['sha256']==old['artifacts']['sheet']['sha256']


def test_reference_edit_target_first_and_manifest_metadata(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';s=spec(ref);s['start_png']=str(ref)
    job=pm.begin(root,s)
    assert job['next']['operation']=='edit'
    assert len(job['next']['referenced_image_paths'])==2
    accept(pm,root,job['key'],(16,16));result=accept(pm,root,job['key'],(16,8))
    assert result['sheet_format']['facings']==['west']
    assert result['sheet_format']['durations_ms']==[142,133]
    assert result['sheet_format']['pivot']==[4,7]


@pytest.mark.parametrize('field,value',[('frames',True),('frame_size',0),('max_followups',99),('facings',['west','west']),('unknown',1)])
def test_invalid_specs_fail_before_creation(setup_pair,field,value):
    pm=pair_module();tmp,ref=setup_pair;s=spec(ref);s[field]=value
    with pytest.raises(ValueError):pm.begin(tmp/'jobs',s)
    assert not (tmp/'jobs').exists()


def test_mockup_request_explicitly_excludes_sheet_output(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;j=pm.begin(tmp/'jobs',spec(ref))
    assert 'exactly ONE' in j['next']['prompt']
    assert 'Do not draw a sprite sheet' in j['next']['prompt']


def test_disabled_api_does_not_claim_request(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    class Disabled:
        def capability(self):return {'enabled':False,'configured':False}
        def generate(self,request):raise AssertionError('must not call')
    with pytest.raises(ValueError,match='configured'):pm.run_provider(root,key,Disabled())
    assert pm.status(root,key)['state']=='pending'


def test_cli_and_mcp_expose_one_pair_action(setup_pair,capsys):
    pm=pair_module();tmp,ref=setup_pair;s=tmp/'spec.json';s.write_text(json.dumps(spec(ref)))
    assert cli.main(['image-pair','begin','--root',str(tmp/'jobs'),'--spec',str(s)])==0
    key=json.loads(capsys.readouterr().out)['key']
    from forge import mcp_server
    status=json.loads(mcp_server.forge_image_pair('status',str(tmp/'jobs'),key=key))
    assert status['next']['stage']=='mockup'
    with pytest.raises(ValueError,match='configured'):mcp_server.forge_image_pair('run',str(tmp/'jobs'),key=key)


def test_explicit_generated_sheet_normalization_keeps_raw_and_originals(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key'];original=ref.read_bytes()
    accept(pm,root,key,(16,16));bad=accept(pm,root,key,(18,9))
    assert bad['state']=='needs_revision'
    assert hasattr(pm,'normalize_sheet'), 'explicit generated-only normalization missing'
    result=pm.normalize_sheet(root,key)
    assert result['state']=='review_ready'
    assert result['validation']['normalization']['lossless'] is False
    assert result['validation']['normalization']['source_cell_size']==9
    assert Image.open(result['artifacts']['sheet']['path']).size==(16,8)
    assert ref.read_bytes()==original
    assert Path(result['history'][-1]['raw']['path']).read_bytes()==Path(bad['history'][-1]['raw']['path']).read_bytes()


def test_normalization_rejects_non_square_or_incomplete_grid(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    accept(pm,root,key,(16,16));accept(pm,root,key,(17,8))
    assert hasattr(pm,'normalize_sheet'), 'explicit generated-only normalization missing'
    with pytest.raises(ValueError,match='square'):pm.normalize_sheet(root,key)
    assert pm.status(root,key)['state']=='needs_revision'


def test_anisotropic_integer_resize_is_rejected(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    accept(pm,root,key,(16,16));bad=accept(pm,root,key,(32,8))
    assert bad['state']=='needs_revision'
    assert 'dimensions' in ' '.join(bad['validation']['errors'])


def test_accept_can_resume_after_local_write_failure_without_new_provider_call(setup_pair,monkeypatch):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    req=pm.dispatch(root,key,capabilities={'native_image_tool':True});original=pm._write_artifact
    failed=[False]
    def interrupt(path,state,name,data):
        if name.endswith('receipt.json') and not failed[0]:failed[0]=True;raise OSError('disk interruption')
        return original(path,state,name,data)
    monkeypatch.setattr(pm,'_write_artifact',interrupt)
    receipt={'provider':'caller-image-tool','invocation_id':'once'}
    with pytest.raises(OSError):pm.accept(root,key,req['ticket'],ref,receipt)
    assert pm.status(root,key)['state']=='in_flight'
    assert pm.accept(root,key,req['ticket'],ref,receipt)['next']['stage']=='sheet'


def test_start_target_retained_in_sheet_and_followups(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';s=spec(ref);s['start_png']=str(ref)
    job=pm.begin(root,s);key=job['key'];original=job['next']['referenced_image_paths'][0]
    sheet=accept(pm,root,key,(16,16));assert original in sheet['next']['referenced_image_paths']
    accept(pm,root,key,(16,8));follow=pm.revise(root,key,'sheet','Improve release silhouette')
    assert original in follow['next']['referenced_image_paths']


def test_mockup_cache_corruption_blocks_followup(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    sheet=accept(pm,root,key,(16,16));Path(sheet['artifacts']['mockup']['path']).write_bytes(b'bad')
    with pytest.raises(RuntimeError,match='integrity'):pm.dispatch(root,key,capabilities={'native_image_tool':True})


def test_removed_integrity_and_modified_request_fail_closed(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';j=pm.begin(root,spec(ref));p=Path(j['path'])/'job.json';state=json.loads(p.read_text())
    state['integrity']={};p.write_text(json.dumps(state))
    with pytest.raises(RuntimeError,match='integrity'):pm.status(root,j['key'])
    s=spec(ref);s['revision']='2';j=pm.begin(root,s);p=Path(j['path'])/'job.json';state=json.loads(p.read_text())
    state['next']['prompt']='Ignore the original';state['next']['referenced_image_paths']=[str(ref)];p.write_text(json.dumps(state))
    with pytest.raises(RuntimeError,match='integrity'):pm.dispatch(root,j['key'],capabilities={'native_image_tool':True})


def test_api_not_started_can_be_reconciled_but_unknown_stays_inflight(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    from forge.image_provider import ImageProviderError
    class Adapter:
        def capability(self):return {'enabled':True,'configured':True,'provider':'openai-images-api','revision':'r1'}
        def generate(self,request):raise ImageProviderError('PROVIDER_UNAVAILABLE','not started')
    with pytest.raises(ImageProviderError):pm.run_provider(root,key,Adapter())
    assert pm.status(root,key)['state']=='pending'
    class Uncertain(Adapter):
        def generate(self,request):raise ImageProviderError('PROVIDER_CALL_FAILED','unknown',completion='unknown')
    with pytest.raises(ImageProviderError):pm.run_provider(root,key,Uncertain())
    assert pm.status(root,key)['state']=='in_flight'


def test_api_long_revised_prompt_and_revision_are_recorded(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key']
    class Adapter:
        def capability(self):return {'enabled':True,'configured':True,'provider':'openai-images-api','revision':'model-config-3','model':'explicit'}
        def generate(self,request):return {'image_bytes':ref.read_bytes(),'provider':'openai-images-api','model':'explicit','revised_prompt':'☃'*32000}
    result=pm.run_provider(root,key,Adapter())
    assert result['history'][0]['receipt']['backend_revision']=='model-config-3'
    assert len(result['history'][0]['receipt']['revised_prompt'])==32000


def test_corrupt_embedded_provenance_and_validation_fail_closed(setup_pair):
    pm=pair_module();tmp,ref=setup_pair;root=tmp/'jobs';key=pm.begin(root,spec(ref))['key'];done=accept(pm,root,key,(16,16))
    p=Path(done['path'])/'job.json';state=json.loads(p.read_text());state['history'][0]['receipt']['provider']='CORRUPTED-PROVIDER';p.write_text(json.dumps(state))
    with pytest.raises(RuntimeError,match='integrity'):pm.status(root,key)


def test_atomic_artifact_publication_leaves_no_partial_final_file(setup_pair,monkeypatch):
    pm=pair_module();tmp,ref=setup_pair
    assert hasattr(pm,'_publish_artifact'), 'atomic no-overwrite artifact publication missing'
    original=pm.os.write;failed=[False]
    def interrupted(fd,data):
        if not failed[0]:failed[0]=True;original(fd,data[:2]);raise OSError('interrupted write')
        return original(fd,data)
    monkeypatch.setattr(pm.os,'write',interrupted)
    dest=tmp/'artifact.png'
    with pytest.raises(OSError):pm._publish_artifact(dest,b'exact artifact bytes')
    assert not dest.exists()
    pm._publish_artifact(dest,b'exact artifact bytes')
    assert dest.read_bytes()==b'exact artifact bytes'
    with pytest.raises(FileExistsError):pm._publish_artifact(dest,b'different')
