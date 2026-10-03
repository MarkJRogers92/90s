from pathlib import Path
import os,sys,json,math
sys.path.insert(0,os.environ['PIXEL_FORGE_ROOT'])
from forge.dsl import render
from forge.sprite import Sprite
p=Path(__file__).parent
pal={'d':'#28252b','s':'#8d7965','b':'#cab594','h':'#e4d1ae','g':'#406569','c':'#5caaaa','w':'#ac9341'}
seeds=[(-1,-.85,4),(1,-.9,3),(-.45,-1,2),(.65,-.45,3),(-.9,.25,2),(.8,.35,2)]
ss=[]
for frame in range(6):
 ops=[]
 for i,(vx,vy,size) in enumerate(seeds):
  x=round(24+vx*(4+frame*2));y=round(24+vy*(4+frame*1.8)+frame*frame*.32)
  if frame>=4 and i in (2,4):continue
  points=[[x-size,y-1],[x+1,y-2],[x+size,y],[x+size-1,y+2],[x-2,y+1]]
  ops.append({'op':'poly','points':points,'c':'b' if i<3 else 'g','stroke':'d'})
  ops.append({'op':'points','points':[[x-1,y-1],[x,y-1]],'c':'h' if i<3 else 'c'})
 # Cut cable follows an arc; electrical discharge only in first two low-luminance frames.
 x=17-frame;y=27+round(frame*frame*.25)
 ops.append({'op':'points','points':[[x,y],[x+1,y-1],[x+2,y-1],[x+3,y],[x+3,y+1]],'c':'w'})
 if frame<2:
  ops.append({'op':'points','points':[[22,20],[23,21],[22,22],[23,23],[25,24],[26,23]],'c':'c'})
 program={'width':48,'height':48,'palette':pal,'base':'blank','ops':ops}
 r=render(program);assert not r.errors,r.errors;ss.append(r.sprite)
 (p/f'crt-impact-{frame}.dsl.json').write_text(json.dumps(program))
 (p/f'crt-impact-{frame}.sprite.json').write_text(json.dumps(r.sprite.to_dict()))
Sprite(288,48,pal,[sum([s.grid[y] for s in ss],[]) for y in range(48)]).save(p/'static-crt-impact.png')
(p/'static-crt-impact.json').write_text(json.dumps({'frameWidth':48,'frameHeight':48,'frames':6,'ticksPerFrame':2,'pivot':[24,24],'loop':False,'alpha':'binary','material':'CRT casing, glass, cut cable; localized muted discharge','source':'actual Forge DSL hand-pixel authoring'},indent=2))
