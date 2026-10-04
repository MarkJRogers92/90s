"""Assemble the Bargain Hunter shoulder-charge sheet: rows S,SW,W,NW,N,NE,E,SE x frames 0-5, 128 px cells."""
import json, hashlib, numpy as np
from PIL import Image
from lock_feet import lock, shoe_boxes, NAMES
from parts import comps, drop_islands
import os
P=os.path.join(os.path.dirname(os.path.realpath(__file__)),'..','inputs')+'/'
pilot=np.array(Image.open(P+'pilot-sheet.png').convert('RGBA'))
planted=np.array(Image.open('planted.png').convert('RGBA'))
sheet=planted.copy(); prov={}
def put(r,c,a,src):
    sheet[r*128:(r+1)*128,c*128:(c+1)*128]=a; prov[f'{NAMES[r]}{c}']=src
for r,n in enumerate(NAMES):
    for c in range(6):
        prov[f'{n}{c}']='pilot' + (' + planted shoes (frame 0 copied)' if c in (1,2,3) else '')
# WEST: the rig v3 render (frozen benchmark lineage: torso lean, bag swing, grounded push-off)
for c in range(6): put(2,c,np.array(Image.open(P+f'west-v3-frame-{c}.png').convert('RGBA')),'rig v3 (recipe-v3.json)')
# NW: approved frame-3 repair; 1,2,4,5 the same pull-in method
put(3,3,np.array(Image.open(P+'nw-frame3-approved-repair.png').convert('RGBA')),'approved NW frame-3 repair (reference)')
for c in (1,2,4,5): put(3,c,np.array(Image.open(f'nw{c}-fixed.png')),'pilot + near-arm bag pulled in (-11,-3), as the frame-3 repair')
# SE: wind-up bag on the far hand behind the body; charge arm tucked behind the torso
for c in (1,2,3): put(7,c,np.array(Image.open(f'se{c}-fixed.png')),'pilot + bag moved to far (anatomical-left) hand, behind body; near hand empty')
for c in (4,5): put(7,c,np.array(Image.open(f'se{c}-fixed.png')),'pilot + trailing bag arm moved behind torso, outline sealed')
final,lockrep=lock(sheet)                       # re-plant after the NW/SE edits
for r in range(8):                              # sweep sub-4 px slivers the shoe copy can leave at box edges
    for c in range(6):
        final[r*128:(r+1)*128,c*128:(c+1)*128]=drop_islands(final[r*128:(r+1)*128,c*128:(c+1)*128],4)
for r,n in enumerate(NAMES):
    if r!=2:
        for c in (1,2,3): prov[f'{n}{c}']+=' | shoes re-planted'
Image.fromarray(final).save('bargain-hunter-charge-768x1024.png')
# checks
src=np.array(Image.open(P+'shopper-walk.png').convert('RGBA')); pal={tuple(c) for c in src[src[:,:,3]>0].tolist()}
v3pal=set()
for c in range(6):
    a=final[256:384,c*128:(c+1)*128]; v3pal|={tuple(x) for x in a[a[:,:,3]>0].tolist()}
report={'rows':{}}
for r,n in enumerate(NAMES):
    row=final[r*128:(r+1)*128]; cells=[row[:,c*128:(c+1)*128] for c in range(6)]
    f0=cells[0]; boxes=shoe_boxes(f0)
    feet=[int(sum(np.any(cells[c][y0:y1,x0:x1]!=f0[y0:y1,x0:x1],axis=2).sum() for y0,x0,y1,x1 in boxes)) for c in (1,2,3)]
    floor=[int(np.where(a[:,:,3]>0)[0].max()) for a in cells]
    islands=[sum(1 for k in comps(a[:,:,3]>0) if len(k)<8) for a in cells]
    cols={tuple(x) for a in cells for x in a[a[:,:,3]>0].tolist()}
    report['rows'][n]={'feet_changed_px_vs_f0':feet,'lowest_row':floor,'tiny_islands':islands,
        'binary_alpha':bool(np.isin(row[:,:,3],[0,255]).all()),'colours_outside_source_palette':len(cols-pal),
        'charge_pair_changed_px':int(np.any(cells[4]!=cells[5],axis=2).sum())}
report['provenance']=prov
report['sha256']=hashlib.sha256(open('bargain-hunter-charge-768x1024.png','rb').read()).hexdigest()
json.dump(report,open('sheet-report.json','w'),indent=1)
for n,v in report['rows'].items(): print(n,v)
