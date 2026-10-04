"""Durable mockup -> associated sprite sheet jobs with explicit provider handoffs.

This module never invents a native image tool or calls a provider on import.
A caller claims one request, really invokes its tool, then supplies result bytes.
A configured API adapter can execute the same request through run_provider().
Mechanical acceptance always remains REVIEW_ONLY, never art approval.
"""
from __future__ import annotations
from copy import deepcopy
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

import numpy as np
from PIL import Image
from .bounded_io import read_bounded
from forge_accel.briefs import digest
from forge_accel.constraints import binary_mask, check_revision
from forge_accel.pixels import (MAX_FILE_BYTES, FinishOptions, decode_rgba,
                                dimensions, finish, integer)
from forge_accel.runner import _json_write, _lock

VERSION = 'gpt-image-pair-v1'
FACINGS = ('south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east')
FIELDS = {'prompt','style','references','start_png','frame_size','frames','facings',
          'durations_ms','pivot','constraints','max_followups','revision','alpha_threshold'}


def capabilities():
    return {'native_image_tool':'caller_must_advertise',
            'openai_images_api':'requires_explicit_configured_adapter',
            'network_or_account_verified':False, 'automatic_fallback':False,
            'note':'Claude/cloud availability depends on its configured tools or API adapter, not its model name.'}


def _text(value, name, limit):
    if not isinstance(value,str) or not value.strip() or len(value)>limit:
        raise ValueError(f'{name} must contain 1..{limit} characters')
    return value


def _png(path):
    data=read_bounded(Path(path).expanduser(),MAX_FILE_BYTES)
    decode_rgba(data)
    return data


def _sha(data): return hashlib.sha256(data).hexdigest()


def _validate(spec):
    if not isinstance(spec,dict) or set(spec)-FIELDS:
        raise ValueError('unknown image pair specification fields')
    s=deepcopy(spec)
    _text(s.get('prompt'),'prompt',2000);_text(s.get('style'),'style',2000)
    refs=s.pop('references',[]);start=s.pop('start_png',None)
    if not isinstance(refs,list) or not 1<=len(refs)<=5 or any(not isinstance(x,str) for x in refs):
        raise ValueError('provide 1..5 original reference PNG paths')
    if start is not None and not isinstance(start,str): raise ValueError('start_png must be a path')
    s.setdefault('frame_size',128);s.setdefault('frames',6);s.setdefault('facings',list(FACINGS))
    integer(s['frame_size'],'frame_size',1,512);integer(s['frames'],'frames',1,16)
    if not isinstance(s['facings'],list) or not 1<=len(s['facings'])<=8 or any(x not in FACINGS for x in s['facings']) or len(set(s['facings']))!=len(s['facings']):
        raise ValueError('facings must be unique names in game row order')
    s.setdefault('durations_ms',[100]*s['frames'])
    if not isinstance(s['durations_ms'],list) or len(s['durations_ms'])!=s['frames']:
        raise ValueError('durations_ms must name each frame')
    for duration in s['durations_ms']: integer(duration,'duration_ms',1,60000)
    s.setdefault('pivot',[s['frame_size']//2,s['frame_size']-1])
    if not isinstance(s['pivot'],list) or len(s['pivot'])!=2: raise ValueError('pivot must be x,y')
    for p in s['pivot']: integer(p,'pivot',0,s['frame_size']-1)
    s.setdefault('constraints',[])
    if not isinstance(s['constraints'],list) or len(s['constraints'])>12: raise ValueError('at most 12 constraints')
    for c in s['constraints']: _text(c,'constraint',500)
    s.setdefault('max_followups',2);integer(s['max_followups'],'max_followups',0,3)
    s.setdefault('revision','1');_text(s['revision'],'revision',128)
    s.setdefault('alpha_threshold',128)
    if s['alpha_threshold'] is not None:integer(s['alpha_threshold'],'alpha_threshold',1,255)
    dimensions((s['frame_size']*s['frames'],s['frame_size']*len(s['facings'])))
    sources=[('reference',_png(x)) for x in refs]
    if start: sources.insert(0,('edit_target',_png(start)))
    if sum(len(data) for _,data in sources)>64*1024*1024:raise ValueError('reference aggregate byte limit exceeded')
    return s,sources


def _paths(root,key):
    if not isinstance(key,str) or not re.fullmatch('[0-9a-f]{64}',key):raise ValueError('invalid job key')
    root=Path(root).expanduser().resolve()
    path=root/key
    if path.is_symlink():raise RuntimeError('job integrity: symlinked job directory')
    return root,path


def _read(path,key):
    try:
        state=json.loads(read_bounded(path/'job.json',8_000_000))
        if state['key']!=key or digest(state['inputs'])!=key:raise ValueError('request hash')
        expected_sources=[{'path':f'sources/{i:02d}-{item["role"]}.png','role':item['role']} for i,item in enumerate(state['inputs']['sources'])]
        if state['sources']!=expected_sources:raise ValueError('source roles/paths')
        for source,item in zip(expected_sources,state['inputs']['sources']):
            if state['integrity'].get(source['path'])!=item['sha256']:raise ValueError('missing source integrity')
        for artifact in list(state['artifacts'].values())+[h['raw'] for h in state['history']]:
            rel=str(Path(artifact['path']).relative_to(path))
            if state['integrity'].get(rel)!=artifact['sha256']:raise ValueError('missing result integrity')
        for name,expected in state['integrity'].items():
            p=path/name
            if Path(name).is_absolute() or '..' in Path(name).parts or not p.resolve().is_relative_to(path.resolve()):
                raise ValueError('artifact path')
            if _sha(read_bounded(p,MAX_FILE_BYTES))!=expected:raise ValueError('artifact hash')
        for index,entry in enumerate(state['history']):
            prefix=f'results/{index:03d}-{entry["stage"]}'
            for filename in ('request.json','validation.json'):
                if prefix+'/'+filename not in state['integrity']:raise ValueError('missing result metadata integrity')
            recorded_request=json.loads(read_bounded(path/prefix/'request.json',256*1024))
            recorded_validation=json.loads(read_bounded(path/prefix/'validation.json',256*1024))
            if entry['validation']!=recorded_validation:raise ValueError('altered result validation')
            if entry['ticket']!=recorded_request['ticket'] or entry['request_fingerprint']!=recorded_request['request_fingerprint']:
                raise ValueError('altered result request identity')
            receipt_prefix=prefix
            if entry.get('operation')=='explicit_local_nearest_normalization':
                original=next(i for i,h in enumerate(state['history'][:index]) if h['ticket']==entry['ticket'] and not h.get('operation'))
                receipt_prefix=f'results/{original:03d}-{entry["stage"]}'
            receipt_name=receipt_prefix+'/receipt.json'
            if receipt_name not in state['integrity']:raise ValueError('missing receipt integrity')
            if entry['receipt']!=json.loads(read_bounded(path/receipt_name,512*1024)):
                raise ValueError('altered provider receipt')
        if state['history'] and state['validation']!=state['history'][-1]['validation']:
            raise ValueError('altered latest validation')
        request=state.get('next')
        if request:
            for ref in request['referenced_image_paths']:
                rel=str(Path(ref).relative_to(path))
                if rel not in state['integrity']:raise ValueError('unowned request reference')
            if _request_fingerprint(request)!=request['request_fingerprint']:raise ValueError('modified request')
        return state
    except (ValueError,OSError,KeyError,TypeError,StopIteration) as exc:
        raise RuntimeError('job integrity check failed; no generation started') from exc


def _publish_artifact(dst,data):
    """Publish complete bytes atomically, never replacing an existing artifact."""
    temporary=dst.with_name('.'+dst.name+'.'+uuid.uuid4().hex+'.tmp')
    fd=os.open(temporary,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        try:
            remaining=memoryview(data)
            while remaining:
                count=os.write(fd,remaining)
                if count<=0:raise OSError('incomplete artifact write')
                remaining=remaining[count:]
            os.fsync(fd)
        finally:os.close(fd)
        os.link(temporary,dst)
        directory=os.open(dst.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:temporary.unlink(missing_ok=True)


def _write_artifact(path,state,name,data):
    dst=path/name;dst.parent.mkdir(parents=True,exist_ok=True)
    if dst.exists():
        if read_bounded(dst,MAX_FILE_BYTES)!=data:
            raise RuntimeError('immutable artifact mismatch; refusing overwrite')
    else:
        _publish_artifact(dst,data)
    state['integrity'][name]=_sha(data)
    return {'path':str(dst),'sha256':_sha(data)}


def _original_refs(path,state):
    return [str(path/x['path']) for x in state['sources']]


def _request(path,state,stage,*,feedback=None,previous=None,protection=None):
    s=state['inputs']['spec'];refs=_original_refs(path,state)
    if stage=='mockup':
        target=previous or next((str(path/x['path']) for x in state['sources'] if x['role']=='edit_target'),None)
        if target:
            refs=[target]+[ref for ref in refs if ref!=target]
        purpose=('THIS CALL OUTPUT: exactly ONE full-body character/action mockup. Do not draw a sprite sheet, multiple poses, or a grid. '
                 'Show the whole subject with enough readable pixel detail to establish identity, outfit, props, palette, and lighting. '
                 'It must be drawable consistently in the exact game format below. No captions, text, labels, or presentation frame.')
    else:
        mockup=state['artifacts'].get('mockup')
        if not mockup:raise ValueError('a validated mockup is required before its associated sheet')
        refs.append(mockup['path']);target=previous
        if target:refs.insert(0,target)
        w=s['frame_size']*s['frames'];h=s['frame_size']*len(s['facings'])
        purpose=(f'Create the sprite sheet associated with the initial mockup reference. Exact canvas {w}x{h} pixels, '
                 f'{s["frames"]} columns by {len(s["facings"])} rows, square {s["frame_size"]}x{s["frame_size"]} cells, '
                 'no padding, gutters, labels, grid lines, scenery, ground shadows or captions. '
                 'Each cell contains exactly one complete pose. Use true transparent alpha. '
                 'An exact uniform integer enlargement of this complete grid is also allowed. '
                 'Match the original references and mockup identity, pixel scale, silhouette, palette, lighting and anatomical accessory hand. '
                 'Never mirror an asymmetric character. Frames progress through the requested action from left to right. '
                 'Keep the planned ground contact and frame pivot consistent. Crisp pixel clusters, no blur or antialiasing.')
    brief={'subject':s['prompt'],'style':s['style'],'constraints':s['constraints'],
           'sheet_format':{k:s[k] for k in ('frame_size','frames','facings','durations_ms','pivot')}}
    prompt=purpose+'\nOriginal reference images remain authoritative on every generation.\n'+json.dumps(brief,ensure_ascii=False)
    if stage=='sheet':prompt+='\nReference roles: original character/style references plus the initial mockup; on edits the previous sheet is first.'
    if stage=='mockup':prompt+='\nFor this call, the sheet format is downstream context only. Draw exactly ONE subject in ONE pose, never a sheet.'
    if protection:refs.append(protection['mask'])
    if feedback:prompt+='\nTargeted follow-up: '+feedback+'\nChange only what is requested; preserve all other identity and style requirements.'
    if protection:prompt+='\nLocked-pixel contract applies. The white edit-mask pixels may change; all black pixels must remain exactly unchanged.'
    request={'ticket':uuid.uuid4().hex,'stage':stage,'operation':'edit' if target else 'generate',
            'prompt':prompt,'referenced_image_paths':refs,'transparent_background':True,
            'feedback':feedback,'protection':protection,
            'request_fingerprint':None}
    request['request_fingerprint']=_request_fingerprint(request)
    return request


def _request_fingerprint(request):
    value={k:v for k,v in request.items() if k!='request_fingerprint'}
    value['reference_sha256']=[_sha(read_bounded(p,MAX_FILE_BYTES)) for p in request['referenced_image_paths']]
    return digest(value)


def _public(path,state,*,cached=False):
    result={'key':state['key'],'path':str(path),'state':state['state'],'cached':cached,
            'review_status':'REVIEW_ONLY','art_review_required':True,
            'artifacts':deepcopy(state['artifacts']),'validation':deepcopy(state.get('validation',{})),
            'sheet_format':{k:state['inputs']['spec'][k] for k in ('frame_size','frames','facings','durations_ms','pivot')},
            'followups_used':state['followups_used'],'history':deepcopy(state['history']),
            'automatic_retry':False,'provider_attempt':deepcopy(state.get('dispatch_capabilities'))}
    if state.get('next'):result['next']=deepcopy(state['next'])
    return result


def begin(root,spec):
    s,sources=_validate(spec)
    inputs={'version':VERSION,'spec':s,'sources':[{'role':role,'sha256':_sha(data)} for role,data in sources]}
    key=digest(inputs);root,path=_paths(root,key)
    root.mkdir(parents=True,exist_ok=True);(root/'.locks').mkdir(exist_ok=True)
    with _lock(root/'.locks'/f'{key}.lock',30):
        if path.exists():return _public(path,_read(path,key),cached=True)
        path.mkdir()
        state={'key':key,'inputs':inputs,'state':'pending','sources':[], 'integrity':{},
               'artifacts':{},'history':[],'followups_used':0,'next':None}
        for i,(role,data) in enumerate(sources):
            name=f'sources/{i:02d}-{role}.png';_write_artifact(path,state,name,data)
            state['sources'].append({'path':name,'role':role})
        state['next']=_request(path,state,'mockup')
        _json_write(path/'job.json',state)
        return _public(path,state)


def status(root,key):
    root,path=_paths(root,key)
    with _lock(root/'.locks'/f'{key}.lock',30):return _public(path,_read(path,key))


def dispatch(root,key,*,capabilities):
    if not isinstance(capabilities,dict) or not (capabilities.get('native_image_tool') is True or capabilities.get('configured_api_adapter') is True):
        raise ValueError('explicit image provider capability required; no provider selected or invoked')
    root,path=_paths(root,key)
    with _lock(root/'.locks'/f'{key}.lock',30):
        state=_read(path,key)
        if state['state']!='pending':raise RuntimeError(f'job is {state["state"]}; request not reissued')
        state['state']='in_flight';state['dispatch_capabilities']=deepcopy(capabilities)
        _json_write(path/'job.json',state)
        return deepcopy(state['next'])


def _receipt(receipt):
    if not isinstance(receipt,dict) or set(receipt)-{'provider','invocation_id','model','usage','revised_prompt','request_id','backend_revision'}:
        raise ValueError('receipt requires bounded provider provenance')
    _text(receipt.get('provider'),'provider',128)
    _text(receipt.get('invocation_id'),'invocation_id',256)
    for field,limit in (('model',128),('backend_revision',128),('request_id',256),('revised_prompt',32000)):
        if field in receipt:_text(receipt[field],field,limit)
    if len(json.dumps(receipt,allow_nan=False).encode())>400_000:raise ValueError('receipt too large')
    return deepcopy(receipt)


def _validate_sheet(raw,spec):
    target=(spec['frame_size']*spec['frames'],spec['frame_size']*len(spec['facings']))
    report={'errors':[],'scope':'Dimensions, alpha, cell occupancy, and optional exact protection only. Anatomy, direction, identity, action and style require visual review.'}
    try:
        if raw.width*target[1]!=raw.height*target[0]:
            raise ValueError('nonuniform scaling')
        output=finish(raw,FinishOptions(target_size=target,alpha_threshold=spec['alpha_threshold']))
    except ValueError:
        report['errors'].append('dimensions_not_exact_or_uniform_integer_enlargement')
        return None,report
    a=np.array(output);alpha=a[:,:,3]
    if not np.any(alpha==0):report['errors'].append('missing_transparency')
    if not np.isin(alpha,[0,255]).all():report['errors'].append('soft_alpha')
    empty=[];size=spec['frame_size']
    for row,facing in enumerate(spec['facings']):
        for col in range(spec['frames']):
            cell=alpha[row*size:(row+1)*size,col*size:(col+1)*size]
            if not np.any(cell):empty.append([row,col])
    if empty:report['errors'].append('empty_cells')
    report.update(size=list(output.size),empty_cells=empty,binary_alpha=bool(np.isin(alpha,[0,255]).all()))
    return output,report


def accept(root,key,ticket,image_path,receipt):
    receipt=_receipt(receipt)
    root,path=_paths(root,key)
    with _lock(root/'.locks'/f'{key}.lock',30):
        state=_read(path,key);request=state.get('next')
        if state['state']!='in_flight' or not request or request['ticket']!=ticket:
            raise ValueError('result ticket does not match the in-flight request')
        data=_png(image_path);raw=decode_rgba(data);stage=request['stage'];index=len(state['history'])
        prefix=f'results/{index:03d}-{stage}'
        raw_art=_write_artifact(path,state,prefix+'/raw.png',data)
        _write_artifact(path,state,prefix+'/request.json',json.dumps(request,sort_keys=True,indent=2).encode())
        _write_artifact(path,state,prefix+'/receipt.json',json.dumps(receipt,sort_keys=True,indent=2).encode())
        if stage=='sheet':output,report=_validate_sheet(raw,state['inputs']['spec'])
        else:
            output=raw;report={'errors':[],'size':list(raw.size),'scope':'Valid static PNG; mockup identity and style require visual review.'}
            if not raw.getbbox():report['errors'].append('empty_mockup')
        protection=request.get('protection')
        if protection and output is not None:
            source=decode_rgba(read_bounded(protection['source'],MAX_FILE_BYTES))
            mask=Image.open(BytesIO(read_bounded(protection['mask'],MAX_FILE_BYTES)));mask.load()
            try:
                check=check_revision(source,output,mask,max_changed_pixels=protection['max_changed_pixels'])
                report['protection']=check;report['errors'].extend(check['errors'])
            except ValueError as exc:report['errors'].append('protection_dimensions_or_contract_invalid')
        report['accepted']=not report['errors'];report['review_status']='REVIEW_ONLY'
        _write_artifact(path,state,prefix+'/validation.json',json.dumps(report,sort_keys=True,indent=2).encode())
        entry={'stage':stage,'ticket':ticket,'request_fingerprint':request['request_fingerprint'],
               'raw':raw_art,'receipt':receipt,'validation':report,
               'provenance_assurance':'caller-reported; not a cryptographic provider attestation'}
        state['history'].append(entry);state['validation']=report;state['next']=None
        if not report['accepted']:
            state['state']='needs_revision'
        else:
            buf=BytesIO();output.save(buf,format='PNG')
            state['artifacts'][stage]=_write_artifact(path,state,prefix+'/accepted.png',buf.getvalue())
            if stage=='mockup':
                state['artifacts'].pop('sheet',None)
                state['state']='pending';state['next']=_request(path,state,'sheet')
            else:state['state']='review_ready'
        _json_write(path/'job.json',state)
        return _public(path,state)


def revise(root,key,stage,feedback,*,edit_mask=None,max_changed_pixels=None):
    if stage not in ('mockup','sheet'):raise ValueError('target must be mockup or sheet')
    _text(feedback,'feedback',2000)
    root,path=_paths(root,key)
    with _lock(root/'.locks'/f'{key}.lock',30):
        state=_read(path,key)
        if state['state']=='in_flight':raise RuntimeError('in_flight work may have completed; accept or reconcile its result before revision')
        if state['followups_used']>=state['inputs']['spec']['max_followups']:raise ValueError('follow-up budget exhausted')
        prior=next((e['raw']['path'] for e in reversed(state['history']) if e['stage']==stage),None)
        if not prior:raise ValueError('no prior result for targeted revision')
        protection=None
        if edit_mask is not None:
            accepted=state['artifacts'].get(stage)
            if not accepted:raise ValueError('protected revision requires a mechanically accepted source')
            source=decode_rgba(read_bounded(accepted['path'],MAX_FILE_BYTES))
            data=read_bounded(edit_mask,MAX_FILE_BYTES)
            with Image.open(BytesIO(data)) as mask:
                if mask.format!='PNG':raise ValueError('mask must be PNG')
                if mask.size!=source.size or mask.mode not in ('L','1') or getattr(mask,'n_frames',1)!=1:
                    raise ValueError('mask must be same-size static L/1 PNG')
                mask.load();binary_mask(mask,source.size)
            integer(max_changed_pixels,'max_changed_pixels',0,source.width*source.height)
            name=f'masks/{state["followups_used"]:03d}.png';saved=_write_artifact(path,state,name,data)
            protection={'source':accepted['path'],'mask':saved['path'],'max_changed_pixels':max_changed_pixels}
            prior=accepted['path']
        elif max_changed_pixels is not None:raise ValueError('pixel budget requires an explicit edit mask')
        state['next']=_request(path,state,stage,feedback=feedback,previous=prior,protection=protection)
        state['followups_used']+=1;state['state']='pending';_json_write(path/'job.json',state)
        return _public(path,state)


def run_provider(root,key,backend):
    """Execute exactly one pending request with an explicitly injected adapter.

    The adapter owns authorization, configured credentials and SDK/network access.
    A failure leaves the ticket in_flight. Never auto-retry ambiguous completion.
    """
    if backend is None or not callable(getattr(backend,'capability',None)):
        raise ValueError('an explicitly configured API adapter is required')
    capability=backend.capability()
    if capability.get('enabled') is not True or capability.get('configured') is not True:
        raise ValueError('an enabled, configured API adapter is required')
    identity={k:capability[k] for k in ('provider','model','revision') if k in capability}
    request=dispatch(root,key,capabilities={'configured_api_adapter':True,**identity})
    from .image_provider import ImageProviderError
    try:
        result=backend.generate({k:request[k] for k in ('prompt','referenced_image_paths','transparent_background')})
    except ImageProviderError as error:
        if error.completion=='not_started':
            root_path,job_path=_paths(root,key)
            with _lock(root_path/'.locks'/f'{key}.lock',30):
                state=_read(job_path,key)
                if state['state']=='in_flight' and state['next']['ticket']==request['ticket']:
                    state['state']='pending';_json_write(job_path/'job.json',state)
        raise
    data=result['image_bytes'];decode_rgba(data)
    root,path=_paths(root,key);handoff=path/f'provider-{request["ticket"]}.png'
    with handoff.open('xb') as file:file.write(data)
    receipt={k:v for k,v in result.items() if k in ('provider','model','usage','revised_prompt','request_id') and v is not None}
    receipt['invocation_id']=result.get('request_id') or request['ticket']
    if capability.get('revision') is not None:receipt['backend_revision']=capability['revision']
    return accept(root,key,request['ticket'],handoff,receipt)


def normalize_sheet(root,key):
    """Explicit local cleanup of a generated, uniformly gridded rejected sheet.

    This is a lossy nearest-neighbor derivative, never a claim of exact original
    pixel preservation. Source references and raw provider bytes remain intact.
    It does not spend another provider call or relax protected-pixel checks.
    """
    root,path=_paths(root,key)
    with _lock(root/'.locks'/f'{key}.lock',30):
        state=_read(path,key)
        if state['state']!='needs_revision' or not state['history'] or state['history'][-1]['stage']!='sheet':
            raise ValueError('normalization requires the latest rejected generated sheet')
        source_entry=state['history'][-1];index=len(state['history'])-1
        request=json.loads(read_bounded(path/f'results/{index:03d}-sheet/request.json',256*1024))
        raw=decode_rgba(read_bounded(source_entry['raw']['path'],MAX_FILE_BYTES));s=state['inputs']['spec']
        cols=s['frames'];rows=len(s['facings'])
        if raw.width%cols or raw.height%rows or raw.width//cols!=raw.height//rows:
            raise ValueError('generated canvas must contain an exact uniform square-cell grid')
        source_cell=raw.width//cols;target=(cols*s['frame_size'],rows*s['frame_size'])
        output=raw.resize(target,Image.Resampling.NEAREST)
        output,report=_validate_sheet(output,s)
        report['normalization']={'method':'nearest-neighbor','source_cell_size':source_cell,
            'target_cell_size':s['frame_size'],'lossless':False,
            'warning':'Resampling can change clusters/details; inspect every frame. Source, padding and raw generation remain preserved.'}
        protection=request.get('protection')
        if protection:
            source=decode_rgba(read_bounded(protection['source'],MAX_FILE_BYTES))
            mask=Image.open(BytesIO(read_bounded(protection['mask'],MAX_FILE_BYTES)));mask.load()
            check=check_revision(source,output,mask,max_changed_pixels=protection['max_changed_pixels'])
            report['protection']=check;report['errors'].extend(check['errors'])
        report.update(accepted=not report['errors'],review_status='REVIEW_ONLY')
        prefix=f'results/{len(state["history"]):03d}-sheet'
        buf=BytesIO();output.save(buf,format='PNG')
        derived=_write_artifact(path,state,prefix+'/normalized.png',buf.getvalue())
        _write_artifact(path,state,prefix+'/request.json',json.dumps(request,sort_keys=True,indent=2).encode())
        _write_artifact(path,state,prefix+'/validation.json',json.dumps(report,sort_keys=True,indent=2).encode())
        entry={'stage':'sheet','ticket':source_entry['ticket'],'request_fingerprint':source_entry['request_fingerprint'],
               'raw':deepcopy(source_entry['raw']),'receipt':deepcopy(source_entry['receipt']),
               'validation':report,'operation':'explicit_local_nearest_normalization',
               'provider_calls':0,'derived':derived}
        state['history'].append(entry);state['validation']=report
        if report['accepted']:state['artifacts']['sheet']=derived;state['state']='review_ready'
        _json_write(path/'job.json',state)
        return _public(path,state)
