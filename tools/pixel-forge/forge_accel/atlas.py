"""Lossless state-aware atlases, conservative imports, and offline motion review."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from collections import OrderedDict
import base64
from io import BytesIO
import json
import math
from typing import Sequence
import numpy as np
from PIL import Image
from .briefs import label
from .pixels import MAX_PIXELS, MAX_SEQUENCE_PIXELS, dimensions, integer, load_rgba, pixel_hash


@dataclass(frozen=True)
class Frame:
    name: str
    image: Image.Image
    duration_ms: int = 100
    state: str = 'still'
    pivot: tuple[int,int] | None = None

    def __post_init__(self):
        label(self.name); label(self.state); dimensions(self.image.size)
        integer(self.duration_ms, 'duration_ms', 1, 60_000)
        if self.pivot is not None:
            if not isinstance(self.pivot,(tuple,list)) or len(self.pivot)!=2:
                raise ValueError('pivot requires x,y pixel coordinates')
            integer(self.pivot[0],'pivot x',0,self.image.width)
            integer(self.pivot[1],'pivot y',0,self.image.height)
            object.__setattr__(self,'pivot',tuple(self.pivot))


def pack_frames(frames: Sequence[Frame], *, columns: int | None = None, padding: int = 1) -> tuple[Image.Image, dict]:
    if not 1 <= len(frames) <= 256:
        raise ValueError('atlas requires 1..256 frames')
    columns = math.ceil(math.sqrt(len(frames))) if columns is None else columns
    integer(columns,'columns',1,256); integer(padding,'padding',0,16)
    keys=[f'{f.state}/{f.name}' for f in frames]
    if len(set(keys)) != len(keys):
        raise ValueError('frame names must be unique within their state')
    closed=set(); previous=None
    for f in frames:
        if f.state != previous:
            if f.state in closed: raise ValueError('frames for a state must be contiguous')
            if previous is not None: closed.add(previous)
            previous=f.state
    cell_w=max(f.image.width for f in frames)+padding*2
    cell_h=max(f.image.height for f in frames)+padding*2
    w,h=dimensions((min(columns,len(frames))*cell_w,math.ceil(len(frames)/columns)*cell_h))
    sheet=Image.new('RGBA',(w,h)); entries=OrderedDict(); tags=[]
    for i,f in enumerate(frames):
        x=(i%columns)*cell_w+padding; y=(i//columns)*cell_h+padding
        # No mask argument: paste copies even hidden RGB and partial alpha exactly.
        sheet.paste(f.image.convert('RGBA'),(x,y))
        e={'frame':{'x':x,'y':y,'w':f.image.width,'h':f.image.height},
           'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':f.image.width,'h':f.image.height},
           'sourceSize':{'w':f.image.width,'h':f.image.height},'duration':f.duration_ms}
        if f.pivot is not None:
            e['pivot']={'x':f.pivot[0]/f.image.width,'y':f.pivot[1]/f.image.height}
        entries[keys[i]]=e
        if not tags or tags[-1]['name'] != f.state:
            tags.append({'name':f.state,'from':i,'to':i,'direction':'forward'})
        else: tags[-1]['to']=i
    meta={'frames':entries,'meta':{'app':'pixel-forge-accel','version':'0.1.0','image':'atlas.png',
          'format':'RGBA8888','size':{'w':w,'h':h},'scale':'1','frameTags':tags,
          'forge':{'status':'REVIEW_ONLY','trimmed':False,'rotation':False,'palette_reduction':False,
                   'source_pixel_sha256':[pixel_hash(f.image) for f in frames]}}}
    return sheet,meta


def slice_grid(image: Image.Image, size: tuple[int,int], *, count: int | None = None) -> list[Image.Image]:
    dimensions(image.size); fw,fh=dimensions(size)
    if image.width%fw or image.height%fh:
        raise ValueError('sheet must divide into an exact grid; arbitrary AI layouts require curation')
    columns=image.width//fw; total=columns*(image.height//fh)
    count=total if count is None else integer(count,'count',1,total)
    if count>256: raise ValueError('frame count limit exceeded')
    return [image.crop(((i%columns)*fw,(i//columns)*fh,(i%columns+1)*fw,(i//columns+1)*fh)) for i in range(count)]


def inspect_motion(frames: Sequence[Frame]) -> dict:
    if not 1<=len(frames)<=256: raise ValueError('provide 1..256 frames')
    groups={}; duplicate=[]
    for i,f in enumerate(frames):
        key=(f.state,pixel_hash(f.image))
        if key in groups: duplicate.append([groups[key],i])
        else: groups[key]=i
    return {'status':'REVIEW_ONLY','frame_count':len(frames),
            'duration_ms':sum(f.duration_ms for f in frames),'duplicate_pairs':duplicate,
            'visible_bounds':[f.image.convert('RGBA').getchannel('A').getbbox() for f in frames],
            'warnings':['duplicate_poses_may_be_intentional_holds'] if duplicate else [],
            'not_verified':['anatomy','handedness','foot_contact','world_root_motion','aesthetic_quality'],
            'note':'No frame was removed, shifted, interpolated, mirrored or recolored.'}


def _preview(sheet: Image.Image, meta: dict) -> str:
    stream=BytesIO(); sheet.save(stream,format='PNG')
    encoded=base64.b64encode(stream.getvalue()).decode('ascii')
    payload=json.dumps(meta,ensure_ascii=True).replace('<','\\u003c')
    return '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Forge motion review</title>
<style>body{font:16px system-ui;margin:28px;background:#202027;color:#eee}canvas{image-rendering:pixelated;border:1px solid #777;margin-top:20px;max-width:95vw}button,select,input{font:inherit;margin:6px;padding:6px}p{max-width:800px}</style>
<h1>Pixel Forge — motion review</h1><p><strong>REVIEW_ONLY.</strong> Native pixels, exact declared timings and explicit pivots. No inferred feet or anatomy. Browser display refresh limits sub-frame timing precision.</p>
<label>State <select id="state"></select></label><button id="pause">Pause</button><button id="prev">Previous</button><button id="next">Next</button>
<label>Scale <select id="scale"><option>1</option><option selected>2</option><option>4</option></select></label>
<label>Background <input id="bg" type="color" value="#202027"></label><br><canvas id="c"></canvas><p id="info"></p>
<script>const M=__META__; const image=new Image(); const c=document.getElementById('c'), ctx=c.getContext('2d');
const sel=document.getElementById('state'), scale=document.getElementById('scale'), bg=document.getElementById('bg');
const all=Object.entries(M.frames);let fs=[],i=0,playing=true,last=0,carry=0;
for(const tag of M.meta.frameTags){let o=document.createElement('option');o.value=tag.name;o.textContent=tag.name;sel.appendChild(o);}
function select(){let tag=M.meta.frameTags.find(t=>t.name===sel.value);fs=all.slice(tag.from,tag.to+1);i=0;carry=0;draw();}
function draw(){if(!image.complete||!fs.length)return;let [name,e]=fs[i], r=e.frame;
const pivots=fs.map(v=>v[1].pivot||{x:0,y:0});
const left=Math.max(...fs.map((v,j)=>Math.round(v[1].sourceSize.w*pivots[j].x)));
const top=Math.max(...fs.map((v,j)=>Math.round(v[1].sourceSize.h*pivots[j].y)));
const right=Math.max(...fs.map((v,j)=>v[1].sourceSize.w-Math.round(v[1].sourceSize.w*pivots[j].x)));
const bottom=Math.max(...fs.map((v,j)=>v[1].sourceSize.h-Math.round(v[1].sourceSize.h*pivots[j].y)));
const s=Number(scale.value),p=e.pivot||{x:0,y:0};c.width=(left+right+16)*s;c.height=(top+bottom+16)*s;
ctx.imageSmoothingEnabled=false;ctx.fillStyle=bg.value;ctx.fillRect(0,0,c.width,c.height);
ctx.drawImage(image,r.x,r.y,r.w,r.h,(left-Math.round(e.sourceSize.w*p.x)+8)*s,(top-Math.round(e.sourceSize.h*p.y)+8)*s,r.w*s,r.h*s);
document.getElementById('info').textContent=name+' | '+e.duration+' ms | '+(i+1)+' / '+fs.length+' | '+r.w+'×'+r.h+' native';}
sel.onchange=select;scale.onchange=draw;bg.oninput=draw;
document.getElementById('pause').onclick=()=>{playing=!playing;document.getElementById('pause').textContent=playing?'Pause':'Play';carry=0};
function step(n){playing=false;document.getElementById('pause').textContent='Play';i=(i+n+fs.length)%fs.length;carry=0;draw()}
document.getElementById('next').onclick=()=>step(1);document.getElementById('prev').onclick=()=>step(-1);
function tick(now){if(last&&playing&&fs.length){carry+=now-last;const cycle=fs.reduce((n,f)=>n+f[1].duration,0);carry%=cycle;while(carry>=fs[i][1].duration){carry-=fs[i][1].duration;i=(i+1)%fs.length;}draw()}last=now;requestAnimationFrame(tick)}
document.addEventListener('visibilitychange',()=>{last=0;carry=0});image.onload=()=>{select();requestAnimationFrame(tick)};
image.src='data:image/png;base64,__IMAGE__';</script></html>'''.replace('__META__',payload).replace('__IMAGE__',encoded)


def export_bundle(frames: Sequence[Frame], destination: str | Path, *, columns: int | None=None, padding: int=1) -> Path:
    """Write only a NEW directory. A missing atlas.json means incomplete export."""
    sheet,meta=pack_frames(frames,columns=columns,padding=padding)
    report=inspect_motion(frames); html=_preview(sheet,meta)
    destination=Path(destination)
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.mkdir()  # Exclusive reservation: never overwrite any existing bundle.
    with (destination/'atlas.png').open('xb') as f: sheet.save(f,format='PNG')
    (destination/'preview.html').write_text(html,encoding='utf-8')
    (destination/'motion-review.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    # Aseprite's animation-tag consumers index frames by numeric filename.
    # Keep the named TexturePacker hash separately for ordinary atlas loaders.
    aseprite={'frames':[dict(entry,filename=str(i)) for i,entry in enumerate(meta['frames'].values())],
              'meta':meta['meta']}
    (destination/'aseprite.json').write_text(json.dumps(aseprite,indent=2),encoding='utf-8')
    (destination/'atlas.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    return destination


def import_json_atlas(sheet_path: str | Path, manifest_path: str | Path) -> list[Frame]:
    """Read composed Aseprite/TexturePacker JSON, not pre-curation frame folders.

    Only untrimmed, unrotated frames are supported. Reject other layouts instead
    of silently throwing away placement information. The supplied image is used;
    paths in metadata are never fetched or followed.
    """
    sheet=load_rgba(sheet_path); manifest_path=Path(manifest_path)
    if manifest_path.stat().st_size>2_000_000: raise ValueError('manifest byte limit exceeded')
    meta=json.loads(manifest_path.read_text(encoding='utf-8'))
    if not isinstance(meta, dict) or not isinstance(meta.get('frames'), (dict, list)):
        raise ValueError('atlas metadata requires a frames object or array')
    entries=meta['frames']
    if not isinstance(meta.get('meta', {}), dict):
        raise ValueError('atlas meta must be an object')
    tags = meta.get('meta', {}).get('frameTags', [])
    if not isinstance(tags, list) or any(not isinstance(t, dict) for t in tags):
        raise ValueError('frameTags must be an array of objects')
    values = entries.values() if isinstance(entries, dict) else entries
    if any(not isinstance(e, dict) or not isinstance(e.get('frame'), dict) for e in values):
        raise ValueError('each frame requires an object rectangle')
    items=list(entries.items()) if isinstance(entries,dict) else [(e.get('filename',f'frame{i:04d}'),e) for i,e in enumerate(entries)]
    if not 1<=len(items)<=256: raise ValueError('frame count limit exceeded')
    # sprite-gen uses numeric frame names; states live in frameTags, not filenames.
    states={}
    for tag in meta.get('meta',{}).get('frameTags',[]):
        state_name=label(tag['name'])
        if tag.get('direction','forward') != 'forward':
            raise ValueError('only forward tag direction is supported; no silent motion reversal')
        first=integer(tag['from'],'tag start',0,len(items)-1)
        last=integer(tag['to'],'tag end',first,len(items)-1)
        for index in range(first,last+1):
            if index in states: raise ValueError('overlapping frame tags require explicit selection')
            states[index]=state_name
    result=[];total_pixels=0
    for i,(key,e) in enumerate(items):
        if e.get('rotated',False) or e.get('trimmed',False):
            raise ValueError('rotated/trimmed atlases require an explicit untrim adapter')
        r=e['frame']; x=integer(r['x'],'frame x',0,sheet.width); y=integer(r['y'],'frame y',0,sheet.height)
        w,h=dimensions((r['w'],r['h']))
        total_pixels += w*h
        if total_pixels > MAX_SEQUENCE_PIXELS: raise ValueError('aggregate decoded frame pixel limit exceeded')
        if x+w>sheet.width or y+h>sheet.height: raise ValueError('frame rectangle outside sheet')
        ss=e.get('sourceSize',{'w':w,'h':h}); offset=e.get('spriteSourceSize',{'x':0,'y':0,'w':w,'h':h})
        if ss!={'w':w,'h':h} or any(offset.get(k,0)!=v for k,v in [('x',0),('y',0),('w',w),('h',h)]):
            raise ValueError('trimmed/source-offset layout is unsupported')
        try:
            state,name=key.split('/',1); label(state); label(name)
        except (ValueError,AttributeError):
            state,name='imported',f'frame{i:04d}'
        state=states.get(i,state)
        pivot=None
        if 'pivot' in e:
            px=float(e['pivot']['x'])*w; py=float(e['pivot']['y'])*h
            if not math.isfinite(px+py) or abs(px-round(px))>1e-6 or abs(py-round(py))>1e-6:
                raise ValueError('pivot is not an integer pixel coordinate')
            pivot=(round(px),round(py))
        result.append(Frame(name,sheet.crop((x,y,x+w,y+h)),e.get('duration',100),state,pivot))
    return result
