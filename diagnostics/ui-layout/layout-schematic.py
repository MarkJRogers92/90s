from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import sys
out=Path(sys.argv[1] if len(sys.argv)>1 else 'artifacts/ui-layout-schematics')
out.mkdir(parents=True,exist_ok=True)
f='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=lambda n:ImageFont.truetype(f,n)
for w,h,label,before_rail,after_rail in [(1280,720,'1280x720 store context',112,56),(1920,1080,'1920x1080 regular run',56,0),(1920,1200,'1920x1200 regular run',56,0),(390,844,'390x844 portrait regular run',112,56)]:
 scale=min(680/w,450/h);vw=round(w*scale);vh=round(h*scale)
 im=Image.new('RGB',(1500,700),'#0b1020');d=ImageDraw.Draw(im)
 d.text((38,22),'DEAD MALL / VIEWPORT LAYOUT',font=font(28),fill='#f4ecff')
 d.text((38,66),'OFFLINE GEOMETRY SCHEMATIC — not a runtime screenshot or playtest',font=font(18),fill='#ffd84a')
 d.text((38,99),label+' • unchanged 960 × 600 stage / 16:10',font=font(19),fill='#acbdd3')
 for x,title,rail,double in [(38,'BEFORE',before_rail,True),(790,'PROPOSED',after_rail,False)]:
  y=191;d.text((x,148),title,font=font(21),fill='#ff70bf' if double else '#63dedb')
  d.rectangle((x,y,x+vw,y+vh),fill='#191225',outline='#71647c',width=2)
  hh=h-rail;s=min(w/960,hh/600);cw=960*s;ch=600*s
  gapx=w-cw;gapy=hh-ch
  cx=(gapx*.75 if double else gapx/2);cy=rail+(gapy*.75 if double else gapy/2)
  if rail:d.rectangle((x,y,x+vw,y+rail*scale),fill='#604a64')
  r=(x+cx*scale,y+cy*scale,x+(cx+cw)*scale,y+(cy+ch)*scale)
  d.rectangle(r,fill='#19454f',outline='#60d2d0',width=2)
  # stage guides distinguish world floor from existing facade, without faking art.
  top=r[1]+(r[3]-r[1])*.2
  d.line((r[0],top,r[2],top),fill='#558894',width=1)
  text='960 × 600';tw=d.textbbox((0,0),text,font=font(18))[2]
  d.text(((r[0]+r[2]-tw)/2,(r[1]+r[3])/2-10),text,font=font(18),fill='#f0ffff')
  d.text((x,660),f'Stage {cw:.0f} × {ch:.0f}px | left {cx:.0f}px | right {w-cx-cw:.0f}px',font=font(16),fill='#d3ddeb')
  if not double:
   bx=(x+vw-8*scale-84 if w<=960 or h<=600 else x+vw/2-42);by=y+4*scale;d.rectangle((bx,by,bx+84,by+max(10,44*scale)),fill='#ecd16c')
   if vw>100:d.text((bx+6,by+2),'MENU / FULL',font=font(9),fill='#141424')
 im.save(out/f'layout-{w}x{h}.png')
(out/'README.txt').write_text('Offline source-derived geometry only. Not rendered gameplay. The 1280×720 before uses the inspected historical runtime capture’s 112px toolbar; other before panels assume illustrative toolbar heights (56px desktop minimum,112px portrait). Browser text wrapping may increase these. Before centering schematic accounts for CSS centering Phaser margins a second time. Proposed 1280 case retains a56px contextual rail; ordinary large desktop overlay has no rail; narrow/coarse/short viewports preserve a56px safe rail (an additional content-sized row when narrow contextual controls are present). No artwork, world/FOV, or gameplay state is changed by these diagrams.\n')
