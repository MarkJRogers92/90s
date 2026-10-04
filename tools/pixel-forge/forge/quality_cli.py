"""Local review utilities and independent cached states; never a final export gate."""
from __future__ import annotations
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys
from PIL import Image
from forge_accel import cli as offline
from forge_accel.atlas import import_json_atlas, inspect_motion, _preview
from forge_accel.briefs import ArtRequest
from forge_accel.constraints import binary_mask
from forge_accel.pixels import load_rgba, pixel_hash, integer
from .quality_speed import publish_repair, compile_requirements

OFFLINE = {'finish','inspect','learn-style','recolor','compose','check-repair','pack','slice','import-atlas'}


def replace_frame(sheet_path, manifest_path, index, replacement, destination):
    """Change exactly one rectangle; preserve source metadata including events/loop."""
    frames = import_json_atlas(sheet_path,manifest_path)
    integer(index,'index',0,len(frames)-1)
    image = load_rgba(replacement)
    if image.size != frames[index].image.size:
        raise ValueError('replacement dimensions must match; no resizing')
    sheet = load_rgba(sheet_path)
    meta = offline.read_json(manifest_path)
    entries = list(meta['frames'].values()) if isinstance(meta['frames'],dict) else meta['frames']
    rect = entries[index]['frame']
    # Overlapping atlas cells cannot be independently replaced safely.
    x,y,w,h = (rect[k] for k in ('x','y','w','h'))
    for i,entry in enumerate(entries):
        r=entry['frame']
        if i != index and x < r['x']+r['w'] and r['x'] < x+w and y < r['y']+r['h'] and r['y'] < y+h:
            raise ValueError('overlapping atlas cells require repacking before replacement')
    sheet.paste(image,(x,y))
    from dataclasses import replace
    frames[index] = replace(frames[index],image=image)
    meta.setdefault('meta',{}).setdefault('forge',{}).update(
        status='REVIEW_ONLY', source_pixel_sha256=[pixel_hash(f.image) for f in frames])
    preview_meta=deepcopy(meta)
    # Import accepts minimal external entries. Materialize the validated defaults
    # for the preview without changing the caller's exported metadata schema.
    preview_meta['frames']={f'{f.state}/{i:04d}-{f.name}':dict(
        e, sourceSize={'w':f.image.width,'h':f.image.height}, duration=f.duration_ms)
        for i,(f,e) in enumerate(zip(frames,entries))}
    if not preview_meta['meta'].get('frameTags'):
        preview_meta['meta']['frameTags']=[{'name':'imported','from':0,'to':len(frames)-1,'direction':'forward'}]
    html = _preview(sheet,preview_meta)
    dest=Path(destination);dest.parent.mkdir(parents=True,exist_ok=True);dest.mkdir()
    with (dest/'atlas.png').open('xb') as stream:sheet.save(stream,format='PNG')
    meta['meta']['image']='atlas.png'
    (dest/'preview.html').write_text(html)
    (dest/'motion-review.json').write_text(json.dumps(inspect_motion(frames),indent=2))
    aseprite={'frames':[dict(e,filename=str(i)) for i,e in enumerate(entries)],'meta':meta['meta']}
    (dest/'aseprite.json').write_text(json.dumps(aseprite,indent=2))
    (dest/'atlas.json').write_text(json.dumps(meta,indent=2))
    return {'path':str(dest),'replaced_frame':index,'status':'REVIEW_ONLY'}


def state_requests(spec_path):
    spec=offline.read_json(spec_path)
    if not isinstance(spec,dict) or set(spec)-{'defaults','states'}:
        raise ValueError('states spec must contain defaults and states only')
    defaults=spec.get('defaults',{})
    rows=spec.get('states')
    if not isinstance(defaults,dict) or not isinstance(rows,list) or not 1<=len(rows)<=128:
        raise ValueError('states requires 1..128 independent requests')
    allowed={'prompt','state','width','height','brief','refs','checks','profile','artist_name','model',
             'rounds','candidates','polish','combine','use_references','routes','refiner'}
    root=Path(spec_path).resolve().parent
    requests=[]
    for row in rows:
        if not isinstance(row,dict) or set(row)-allowed or set(defaults)-allowed:
            raise ValueError('unknown state generation option')
        options={**defaults,**row}
        # Validate every state before allowing any provider work.
        prompt=options.get('prompt');brief=compile_requirements(options.get('brief'))
        if not isinstance(prompt,str) or not 1<=len(prompt.strip())<=2000:
            raise ValueError('prompt must contain 1..2000 characters')
        ArtRequest(prompt+brief,options.get('width',32),options.get('height',32),
                   state=options.get('state','still'),checks=options.get('checks') or ())
        integer(options.get('rounds',2),'rounds',0,8)
        integer(options.get('candidates',1),'candidates',1,4)
        for name in ('polish','combine','use_references'):
            if name in options and type(options[name]) is not bool:raise ValueError(name+' must be boolean')
        refs=options.get('refs',[])
        if not isinstance(refs,list) or len(refs)>8:raise ValueError('refs requires up to 8 PNG paths')
        options['refs']=[str(offline.asset_path(root,p).resolve()) for p in refs]
        for ref in options['refs']:load_rgba(ref)
        requests.append(options)
    if len({r.get('state','still') for r in requests})!=len(requests):
        raise ValueError('state names must be unique in a batch')
    return requests


def parser():
    p=argparse.ArgumentParser(prog='forge quality',description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    for name in sorted(OFFLINE): sub.add_parser(name,help='local utility: '+name+' --help')
    s=sub.add_parser('states',help='serial independent-state generation, dry run unless --execute')
    s.add_argument('spec');s.add_argument('--cache-dir',required=True);s.add_argument('--generation-revision',required=True)
    s.add_argument('--execute',action='store_true')
    r=sub.add_parser('repair',help='publish an existing candidate only after exact mask/budget checks')
    r.add_argument('source');r.add_argument('candidate');r.add_argument('mask');r.add_argument('--budget',type=int,required=True)
    r.add_argument('--expected-sha');r.add_argument('--protected-mask');r.add_argument('--allow-alpha-change',action='store_true')
    r.add_argument('--out',required=True)
    r=sub.add_parser('replace-frame',help='replace one atlas frame, without regeneration or timing edits')
    r.add_argument('sheet');r.add_argument('manifest');r.add_argument('image');r.add_argument('--index',type=int,required=True)
    r.add_argument('--out',required=True)
    return p


def read_mask(path,size):
    mask=load_rgba(path)
    channels=mask.split()
    if channels[0].tobytes()!=channels[1].tobytes() or channels[1].tobytes()!=channels[2].tobytes() or channels[3].getextrema()!=(255,255):
        raise ValueError('mask must be opaque black and white')
    mask=mask.convert('L');binary_mask(mask,size)
    return mask


def main(argv=None):
    argv=sys.argv[1:] if argv is None else argv
    if argv and argv[0] in OFFLINE:
        return offline.main(argv)
    a=parser().parse_args(argv)
    try:
        if a.command=='states':
            from . import cli
            requests=state_requests(a.spec)
            if not 1<=len(a.generation_revision)<=128:raise ValueError('invalid generation revision')
            # Check profile/backend/route validity for the complete batch before generation.
            from . import profiles,artist,routes
            for req in requests:
                prof=profiles.load(req.get('profile')) or {}
                size=prof.get('size') or [32,32]
                if not isinstance(size,(list,tuple)) or len(size)!=2:
                    raise ValueError('profile size requires width and height')
                ArtRequest(req['prompt']+compile_requirements(req.get('brief')),
                           req.get('width') or size[0],req.get('height') or size[1],
                           state=req.get('state','still'),checks=req.get('checks') or ())
                refs=list(req['refs'])
                if req.get('use_references',True):
                    refs+=prof.get('reference_paths',[])[:max(0,3-len(refs))]
                for ref in refs:load_rgba(ref)
                if sum(Path(ref).stat().st_size for ref in refs)>64*1024*1024:
                    raise ValueError('total reference byte limit exceeded')
                if req.get('artist_name') not in {None,'gpt-image',*artist.BACKENDS}:raise ValueError('unknown artist')
                refiner=req.get('refiner')
                if refiner is not None and (not isinstance(refiner,str) or refiner not in artist.BACKENDS):
                    raise ValueError('unknown refiner')
                names=req.get('routes',[])
                if not isinstance(names,list) or any(n not in routes.ROUTES for n in names):raise ValueError('unknown routes')
            if a.execute:
                result={'states':[cli.make(**r,cache_dir=a.cache_dir,generation_revision=a.generation_revision)
                                  for r in requests],'status':'REVIEW_ONLY'}
            else:result={'dry_run':True,'states':requests,'note':'No backend calls; re-run with --execute'}
        elif a.command=='repair':
            source=load_rgba(a.source);candidate=load_rgba(a.candidate);mask=read_mask(a.mask,source.size)
            if a.protected_mask:
                from PIL import ImageChops
                protected=read_mask(a.protected_mask,source.size)
                mask=ImageChops.subtract(mask,protected)
            result=publish_repair(source,candidate,mask,a.out,budget=a.budget,expected_sha=a.expected_sha,
                                  preserve_alpha=not a.allow_alpha_change)
        elif a.command=='replace-frame':
            result=replace_frame(a.sheet,a.manifest,a.index,a.image,a.out)
        else:raise ValueError('unknown command')
        print(json.dumps(result,indent=2));return 0
    except (ValueError,RuntimeError,OSError,KeyError,TypeError) as e:
        print(json.dumps({'error':str(e),'type':type(e).__name__}),file=sys.stderr);return 2
