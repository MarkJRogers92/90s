from pathlib import Path
import os,sys,json,hashlib,subprocess
from PIL import Image
sys.path.insert(0,os.environ['PIXEL_FORGE_ROOT'])
from forge.sprite import Sprite,to_hex
from forge.dsl import render
p=Path(__file__).parent;out={};source=Image.open(p/'static-idle.png').convert('RGBA')
for kind,cols in [('hurt',4),('death',7)]:
 im=Image.open(p/f'static-{kind}.png').convert('RGBA');assert im.size==(96*cols,768)
 colors={};grid=[]
 for y in range(im.height):
  row=[]
  for x in range(im.width):
   c=im.getpixel((x,y))
   assert c[3] in (0,255)
   if not c[3]:row.append('.');continue
   if c not in colors:colors[c]=chr(0x100+len(colors))
   row.append(colors[c])
  grid.append(row)
 s=Sprite(im.width,im.height,{k:to_hex(c) for c,k in colors.items()},grid)
 path=p/f'static-{kind}.sprite.json';path.write_text(json.dumps(s.to_dict()))
 assert Sprite.from_dict(json.loads(path.read_text())).to_image().tobytes()==im.tobytes()
 target=p/f'{kind}-aseprite-roundtrip.png'
 subprocess.run([os.environ.get('ASEPRITE_BIN','aseprite'),'-b',str(p/f'static-{kind}.aseprite'),'--sheet-type','rows','--sheet-columns',str(cols),'--sheet',str(target)],check=True,capture_output=True)
 assert Image.open(target).convert('RGBA').tobytes()==im.tobytes()
 hashes=[];bounds=[]
 for d in range(8):
  row=im.crop((0,d*96,cols*96,(d+1)*96));hashes.append(hashlib.sha256(row.tobytes()).hexdigest());bb=[]
  for c in range(cols):
   f=row.crop((c*96,0,(c+1)*96,96));b=f.getbbox();assert b[0]>0 and b[1]>0 and b[2]<96 and b[3]<96,(kind,d,c,b);bb.append(b)
   if kind=='hurt':
    idle=source.crop((d*96,0,(d+1)*96,96))
    if c==3: assert f.tobytes()==idle.tobytes(),('recovery differs',d)
    for y in range(85,96):
     for x in range(96):
      if idle.getpixel((x,y))[3]:assert f.getpixel((x,y))==idle.getpixel((x,y)),('shoe moved',d,c,x,y)
  bounds.append(bb)
 assert len(set(hashes))==8
 out[kind]={'forgeRoundtrip':True,'asepriteRoundtrip':True,'colors':len(colors),'rgbaSha256':hashlib.sha256(im.tobytes()).hexdigest(),'uniqueDirectionalRows':8,'bounds':bounds}
im=Image.open(p/'static-crt-impact.png').convert('RGBA');assert im.tobytes()==Image.open(p/'CRT-aseprite-roundtrip.png').convert('RGBA').tobytes()
for i in range(6):
 r=render(json.loads((p/f'crt-impact-{i}.dsl.json').read_text()));assert not r.errors;assert r.sprite.to_image().tobytes()==im.crop((48*i,0,48*(i+1),48)).tobytes()
 b=im.crop((48*i,0,48*(i+1),48)).getbbox();assert b[0]>0 and b[1]>0 and b[2]<48 and b[3]<48
out['crt-impact']={'forgeDslReplay':True,'asepriteRoundtrip':True,'frames':6}
out['registration']={'frameCanvas':[96,96],'runtimeAnchor':[48,80.64],'displaySize':72,'hurtTicks':[3,3,4,4],'deathTicksPerFrame':4,'corpseHoldTicks':70,'fadeTicks':24,'sourceIdleSHA256':hashlib.sha256((p/'static-idle.png').read_bytes()).hexdigest(),'lastHurtMatchesIdle':True,'opaqueShoePixelsExact':True}
(p/'native-roundtrips.json').write_text(json.dumps(out,indent=2));print(json.dumps({k: {a:b for a,b in v.items() if a!='bounds'} for k,v in out.items()},indent=2))
