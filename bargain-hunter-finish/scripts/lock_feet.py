"""Plant the shoes for wind-up frames 0-3 of each facing: frame 0's shoes, copied exactly.

Shoes = light sneaker pixels connected to a pixel within 3 rows of the floor (so a low cream
bag is never mistaken for a shoe), plus the 1 px outline/cuff ring around them. In frames 1-3
the union of frame 0's and the frame's own shoe boxes takes frame 0's pixels."""
import json, numpy as np
from PIL import Image
from collections import deque
import os
P=os.path.join(os.path.dirname(os.path.realpath(__file__)),'..','inputs')+'/'
NAMES=['S','SW','W','NW','N','NE','E','SE']
FLOOR=111

def shoe_boxes(a):
    op=a[:,:,3]>0
    light=op&(a[:,:,0].astype(int)+a[:,:,1]+a[:,:,2]>480)&(np.abs(a[:,:,0].astype(int)-a[:,:,2])<70)
    seen=np.zeros_like(light); boxes=[]
    for y,x in zip(*np.where(light)):
        if seen[y,x]: continue
        comp=[];q=deque([(y,x)]);seen[y,x]=True
        while q:
            cy,cx=q.popleft();comp.append((cy,cx))
            for ny in (cy-1,cy,cy+1):
                for nx in (cx-1,cx,cx+1):
                    if 0<=ny<128 and 0<=nx<128 and light[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True;q.append((ny,nx))
        ys=[p[0] for p in comp]; xs=[p[1] for p in comp]
        if max(ys)>=FLOOR-3 and len(comp)>=6:
            boxes.append((int(max(0,min(ys)-2)),int(min(xs)-1),FLOOR+1,int(max(xs)+2)))
    return boxes

def lock(sheet):
    out=sheet.copy(); report={}
    for r,n in enumerate(NAMES):
        f0=sheet[r*128:(r+1)*128,0:128]; b0=shoe_boxes(f0)
        report[n]={'frame0_shoes':b0,'changed':[]}
        for c in (1,2,3):
            cell=out[r*128:(r+1)*128,c*128:(c+1)*128]; before=cell.copy()
            for (y0,x0,y1,x1) in b0+shoe_boxes(before):
                cell[y0:y1,x0:x1]=f0[y0:y1,x0:x1]
            report[n]['changed'].append(int(np.any(before!=cell,axis=2).sum()))
    return out,report

if __name__=='__main__':
    sheet=np.array(Image.open(P+'pilot-sheet.png').convert('RGBA'))
    out,report=lock(sheet)
    Image.fromarray(out).save('planted.png'); json.dump(report,open('planted.json','w'),indent=1)
    for n,v in report.items(): print(n,len(v['frame0_shoes']),'shoes',v['changed'])
