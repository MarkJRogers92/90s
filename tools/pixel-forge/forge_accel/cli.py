"""Offline by default. `generate` is a dry run unless --execute is explicit."""
from __future__ import annotations
import argparse
from dataclasses import asdict
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image
from .atlas import Frame, export_bundle, import_json_atlas, slice_grid
from .backends import ForgeCLIBackend
from .briefs import ArtRequest, compile_brief, learn_style
from .bundles import save_bundle
from .constraints import check_revision
from .pixels import KINDS, FinishOptions, dimensions, finish, inspect, load_rgba, load_rgba_many, pixel_hash
from .runner import JobStore
from .variants import Layer, compose_layers, recolor_exact


def read_json(path: str | Path) -> dict | list:
    path=Path(path)
    if path.stat().st_size>2_000_000:raise ValueError('JSON byte limit exceeded')
    result=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(result,(dict,list)):raise ValueError('JSON must be an object or array')
    return result


def size(text: str) -> tuple[int,int]:
    try:return dimensions(tuple(int(s) for s in text.lower().split('x')))
    except (ValueError,TypeError) as e:raise argparse.ArgumentTypeError('use WIDTHxHEIGHT, e.g. 64x64') from e


def asset_path(base: Path, value: str) -> Path:
    if not isinstance(value,str) or not value:raise ValueError('asset file must be a nonempty local path')
    p=Path(value).expanduser()
    return p if p.is_absolute() else base/p


def parser() -> argparse.ArgumentParser:
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('finish',help='offline opt-in pixel processing, preserving source')
    c.add_argument('source');c.add_argument('--out',required=True);c.add_argument('--palette')
    c.add_argument('--grid',type=size);c.add_argument('--alpha',type=int);c.add_argument('--kind',choices=sorted(KINDS),default='prop')
    c=sub.add_parser('inspect',help='read-only mechanical report');c.add_argument('source');c.add_argument('--kind',choices=sorted(KINDS),default='prop')
    c=sub.add_parser('learn-style',help='sample explicit reference PNGs without changing them')
    c.add_argument('references',nargs='+');c.add_argument('--colors',type=int,default=32);c.add_argument('--out',required=True)
    c=sub.add_parser('recolor',help='exact color substitutions, not regeneration')
    c.add_argument('source');c.add_argument('--mapping',required=True);c.add_argument('--out',required=True)
    c=sub.add_parser('compose',help='reuse declared source layers at integer offsets')
    c.add_argument('spec');c.add_argument('--out',required=True)
    c=sub.add_parser('check-repair',help='validate a source/candidate/mask contract; no model calls')
    c.add_argument('source');c.add_argument('candidate');c.add_argument('mask');c.add_argument('--budget',type=int,required=True)
    c.add_argument('--expected-sha');c.add_argument('--out',required=True)
    c=sub.add_parser('pack',help='pack explicitly ordered PNG frames + timings + pivots')
    c.add_argument('spec');c.add_argument('--out',required=True);c.add_argument('--columns',type=int);c.add_argument('--padding',type=int,default=1)
    c=sub.add_parser('slice',help='slice an exact grid (does not guess AI frame boundaries)')
    c.add_argument('source');c.add_argument('--cell',type=size,required=True);c.add_argument('--count',type=int)
    c.add_argument('--duration',type=int,default=100);c.add_argument('--state',default='still');c.add_argument('--out',required=True)
    c=sub.add_parser('import-atlas',help='import untrimmed Aseprite/TexturePacker JSON + its explicit PNG')
    c.add_argument('source');c.add_argument('manifest');c.add_argument('--out',required=True)
    c=sub.add_parser('generate',help='plan one draft; invoking installed Forge requires --execute')
    c.add_argument('prompt');c.add_argument('--width',type=int,default=64);c.add_argument('--height',type=int,default=64)
    c.add_argument('--style',default=ArtRequest.__dataclass_fields__['style'].default)
    c.add_argument('--check',action='append',default=[]);c.add_argument('--reference',action='append',default=[])
    c.add_argument('--kind',choices=sorted(KINDS),default='prop');c.add_argument('--state',default='still');c.add_argument('--revision',default='')
    c.add_argument('--cache',default='./forge-review-cache');c.add_argument('--forge-root',default='~/code/pixel-forge')
    c.add_argument('--backend-revision');c.add_argument('--artist',choices=['gpt-image','gpt','claude'],default='gpt-image')
    c.add_argument('--timeout',type=float,default=180);c.add_argument('--execute',action='store_true')
    return p


def _hex(s: str) -> tuple[int,int,int]:
    if not isinstance(s,str) or len(s)!=7 or not s.startswith('#'):raise ValueError('use #rrggbb color keys and values')
    return tuple(int(s[i:i+2],16) for i in (1,3,5))


def execute(a: argparse.Namespace) -> tuple[dict,int]:
    if a.command=='generate':
        req=ArtRequest(a.prompt,a.width,a.height,a.kind,a.style,tuple(a.check),tuple(a.reference),a.state,a.revision)
        if not a.execute:
            return {'dry_run':True,'request':asdict(req),'brief':compile_brief(req),
                    'planned_flags':['-n','1','--rounds','0','--no-combine','--artist',a.artist],
                    'note':'No subprocess, provider call, or output write. Execute requires a model/config revision. '
                           'Legacy CLI references are textual hints; native callbacks can receive images.'},0
        if not a.backend_revision:raise ValueError('--execute requires --backend-revision describing your current model/config')
        backend=ForgeCLIBackend(a.forge_root,revision=a.backend_revision,artist=a.artist,timeout_s=a.timeout)
        result=JobStore(a.cache).run(req,backend)
        return {'key':result.key,'path':str(result.path),'cached':result.cached,'elapsed_s':result.elapsed_s,
                'status':'REVIEW_ONLY','note':'Model usage/cost belongs to installed Forge configuration; not measured here.'},0
    if a.command=='inspect':return inspect(load_rgba(a.source),kind=a.kind),0
    if a.command=='learn-style':
        profile=learn_style([Path(p).expanduser() for p in a.references],max_colors=a.colors)
        out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
        with out.open('x',encoding='utf-8') as f:json.dump(profile,f,indent=2)
        return {'profile':str(out),'fingerprint':profile['fingerprint']},0
    if a.command=='finish':
        source=load_rgba(a.source);palette=None
        if a.palette:
            data=read_json(a.palette);palette=data['palette'] if isinstance(data,dict) else data
        options=FinishOptions(palette=palette,target_size=a.grid,alpha_threshold=a.alpha)
        output=finish(source,options)
        meta=save_bundle(output,a.out,source=source,kind=a.kind,details={'operation':'finish','options':asdict(options)})
        return {'path':a.out,'status':'REVIEW_ONLY','qa':meta['qa']},3 if meta['qa']['errors'] else 0
    if a.command=='recolor':
        source=load_rgba(a.source);mapping=read_json(a.mapping)
        if not isinstance(mapping,dict):raise ValueError('recolor mapping must be a #rrggbb object')
        output=recolor_exact(source,{_hex(k):_hex(v) for k,v in mapping.items()})
        save_bundle(output,a.out,source=source,details={'operation':'exact_recolor','mapping':mapping})
        return {'path':a.out,'status':'REVIEW_ONLY'},0
    if a.command=='compose':
        spec=read_json(a.spec);base=Path(a.spec).parent
        if not isinstance(spec,dict) or not isinstance(spec.get('layers'),list) or not 1<=len(spec['layers'])<=64:
            raise ValueError('compose spec requires 1..64 layers')
        images=load_rgba_many([asset_path(base,row['file']) for row in spec['layers']])
        layers=[Layer(row['name'],image,row.get('x',0),row.get('y',0)) for row,image in zip(spec['layers'],images)]
        output=compose_layers(spec['canvas'],layers)
        save_bundle(output,a.out,details={'operation':'compose','input_spec':spec})
        refs=Path(a.out)/'source-layers';refs.mkdir()
        exported=[]
        for i,layer in enumerate(layers):
            name=f'layer-{i:02d}.png';layer.image.save(refs/name)
            exported.append({'name':layer.name,'file':'source-layers/'+name,'x':layer.x,'y':layer.y,
                             'source_pixel_sha256':pixel_hash(layer.image)})
        (Path(a.out)/'layers.json').write_text(json.dumps({'canvas':list(output.size),'layers':exported},indent=2))
        return {'path':a.out,'status':'REVIEW_ONLY','editable_source':'layers.json'},0
    if a.command=='check-repair':
        source=load_rgba(a.source);candidate=load_rgba(a.candidate);m=load_rgba(a.mask);ma=np.array(m)
        if not np.all(ma[:,:,0]==ma[:,:,1]) or not np.all(ma[:,:,1]==ma[:,:,2]) or not np.all(ma[:,:,3]==255):
            raise ValueError('repair mask must be opaque black and white')
        mask=m.convert('L');report=check_revision(source,candidate,mask,max_changed_pixels=a.budget,expected_source_sha256=a.expected_sha)
        out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);out.mkdir()
        source.save(out/'source.png');candidate.save(out/'candidate.png');mask.save(out/'mask.png')
        (out/'repair.json').write_text(json.dumps(report,indent=2))
        # No sprite.png promotion, even on a valid contract. Human visual review is still required.
        return {'path':a.out,**report},0 if report['accepted'] else 3
    if a.command=='pack':
        spec=read_json(a.spec);base=Path(a.spec).parent
        if not isinstance(spec,dict) or not isinstance(spec.get('frames'),list) or not 1<=len(spec['frames'])<=256:
            raise ValueError('pack spec requires 1..256 frames')
        images=load_rgba_many([asset_path(base,row['file']) for row in spec['frames']])
        frames=[Frame(row.get('name',f'frame{i:04d}'),image,
                      row.get('duration_ms',100),row.get('state','still'),row.get('pivot')) for i,(row,image) in enumerate(zip(spec['frames'],images))]
        export_bundle(frames,a.out,columns=a.columns,padding=a.padding)
        return {'path':a.out,'frames':len(frames),'status':'REVIEW_ONLY'},0
    if a.command=='slice':
        frames=[Frame(f'frame{i:04d}',im,a.duration,a.state) for i,im in enumerate(slice_grid(load_rgba(a.source),a.cell,count=a.count))]
        export_bundle(frames,a.out);return {'path':a.out,'frames':len(frames),'status':'REVIEW_ONLY'},0
    if a.command=='import-atlas':
        frames=import_json_atlas(a.source,a.manifest);export_bundle(frames,a.out)
        return {'path':a.out,'frames':len(frames),'status':'REVIEW_ONLY'},0
    raise ValueError('unknown command')


def main(argv: list[str] | None=None) -> int:
    args=parser().parse_args(argv)
    try:
        result,code=execute(args)
        print(json.dumps(result,indent=2,allow_nan=False));return code
    except (OSError,ValueError,RuntimeError,KeyError,TypeError) as error:
        print(json.dumps({'error':str(error),'type':type(error).__name__}),file=sys.stderr);return 2


if __name__=='__main__':raise SystemExit(main())
