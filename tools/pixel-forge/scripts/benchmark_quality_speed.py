"""Reproducible local-only measurements; uses no model credentials/providers."""
import argparse
import json
from pathlib import Path
import statistics
import sys
import tempfile
import time
import numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from forge import artist,cli,library
from forge_accel.pixels import finish,pixel_hash
from forge_accel.variants import recolor_exact,Layer,compose_layers
from forge_accel.atlas import Frame,export_bundle,import_json_atlas


def measure(fn,count=20):
    times=[]
    for _ in range(count):
        start=time.perf_counter();fn();times.append((time.perf_counter()-start)*1000)
    return round(statistics.median(times),3)


class FixtureBackend(artist.Backend):
    name='benchmark-fixture';model='fixture-v1'
    def __init__(self):self.calls=0
    def ask(self,*_):
        self.calls+=1
        return json.dumps({'width':16,'height':16,'palette':{'a':'#e0408a'},
                           'ops':[{'op':'rect','x':2,'y':2,'w':12,'h':12,'c':'a'}]})


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);a=ap.parse_args()
    root=Path(__file__).resolve().parents[1];repo=root.parents[1]
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    paths=[repo/'public/assets/neon/legacy-props/claw-machine.png',
           repo/'public/assets/neon/props/rack-toppled.png',
           root/'examples/west-refined-review/west-0.png']
    reports=[];pairs=[]
    for path in paths:
        source=Image.open(path).convert('RGBA');result=finish(source)
        reports.append({'asset':str(path.relative_to(repo)),'size':list(source.size),
                        'finish_median_ms':measure(lambda:finish(source)),
                        'changed_rgba_pixels':int(np.any(np.array(source)!=np.array(result),axis=2).sum()),
                        'exact_pixel_hash':pixel_hash(source)==pixel_hash(result)})
        pairs.append((path.stem,source,result))
    source=pairs[0][1];arr=np.array(source);colors,counts=np.unique(arr[arr[:,:,3]>0,:3],axis=0,return_counts=True)
    # Explicit exact swap to another source color: palette-safe and reproducible.
    old=tuple(int(v) for v in colors[np.argmax(counts)])
    new=tuple(int(v) for v in colors[np.argmin(counts)])
    recolored=recolor_exact(source,{old:new});pairs.append(('authored exact recolor',source,recolored))
    alpha_equal=source.getchannel('A').tobytes()==recolored.getchannel('A').tobytes()
    report={'environment':'Linux Python; local processing only','preservation':reports,
            'recolor':{'median_ms':measure(lambda:recolor_exact(source,{old:new})),
                       'old_rgb':old,'new_rgb':new,'alpha_exact':alpha_equal},
            'compose_median_ms':measure(lambda:compose_layers(source.size,[Layer('source',source)])),
            'expensive_provider_calls':0,'provider_latency_s':None}
    frames=[Frame(f'west-{i}',Image.open(root/f'examples/west-refined-review/west-{i}.png').convert('RGBA'),
                  duration_ms=100,state='charge',pivot=(64,111)) for i in range(6)]
    # These are review timings/pivots, not changes to the game's action manifest.
    start=time.perf_counter();export_bundle(frames,out/'motion',columns=6)
    loaded=import_json_atlas(out/'motion/atlas.png',out/'motion/atlas.json')
    report['animation']={'export_import_ms':round((time.perf_counter()-start)*1000,3),
                         'frame_count':len(frames),'pixel_exact':all(pixel_hash(x.image)==pixel_hash(y.image) for x,y in zip(frames,loaded)),
                         'timing_and_pivot_exact':[(f.duration_ms,f.pivot) for f in frames]==[(f.duration_ms,f.pivot) for f in loaded],
                         'timing_scope':'100 ms review timing; authoritative game timing unchanged'}
    with tempfile.TemporaryDirectory() as temp:
        backend=FixtureBackend();original_backend=artist.make_backend;original_library=library.ROOT
        artist.make_backend=lambda *args:backend;library.ROOT=Path(temp)/'library'
        try:
            options=dict(width=16,height=16,rounds=0,candidates=1,polish=False,log=lambda _:None)
            old_ms=measure(lambda:cli.make('fixture crate',**options),count=5);old_calls=backend.calls
            backend.calls=0
            cold=cli.make('fixture crate',**options,cache_dir=Path(temp)/'cache',generation_revision='fixture-v1')
            cold_calls=backend.calls
            hit_ms=measure(lambda:cli.make('fixture crate',**options,cache_dir=Path(temp)/'cache',generation_revision='fixture-v1'),count=5)
            report['native_pipeline_fixture']={'uncached_median_ms':old_ms,'uncached_5_requests_artist_asks':old_calls,
                'cache_cold_elapsed_ms':round(cold['cache']['elapsed_s']*1000,3),'cold_artist_asks':cold_calls,
                'cache_hit_median_ms':hit_ms,'hit_5_requests_artist_asks':backend.calls-cold_calls,
                'scope':'real make/generate/DSL; paid backend replaced by local deterministic fixture, not a provider speed benchmark'}
        finally:artist.make_backend=original_backend;library.ROOT=original_library
    # Same art at native, 2x, and 4x on a representative dark mall floor.
    heights=[im.height*4+55 for _,im,_ in pairs]
    sheet=Image.new('RGBA',(2000,sum(heights)),(24,22,31,255));draw=ImageDraw.Draw(sheet)
    y=0
    for row,(name,before,after) in enumerate(pairs):
        draw.text((12,y+8),name+' | BEFORE (left), AFTER (right) | 1x / 2x / 4x',fill='white')
        for image,xstart in ((before,15),(after,1015)):
            x=xstart
            for scale in (1,2,4):
                scaled=image.resize((image.width*scale,image.height*scale),Image.Resampling.NEAREST)
                sheet.alpha_composite(scaled,(x,y+40));x+=scaled.width+15
        y+=heights[row]
    sheet.save(out/'comparison.png')
    (out/'benchmark.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
