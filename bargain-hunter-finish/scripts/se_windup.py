"""SE wind-up 1-3: the bag hangs from the far (anatomical-left) hand, as in frame 0; the near hand is empty."""
import numpy as np
from PIL import Image
from parts import bag_mask, comps, to_mask, grow, drop_islands

def skin(a):
    r,g,b,al=(a[:,:,i].astype(int) for i in range(4))
    return (al>0)&(r>150)&(g>130)&(b>110)&(r-b<70)&(r-b>5)

def far_hand(a):
    """The far hand: the skin cluster furthest right, above the shoes."""
    m=skin(a); m[96:]=False
    cs=[c for c in comps(m) if len(c)>=6]
    c=max(cs,key=lambda c: np.mean([p[1] for p in c]))
    ys=[p[0] for p in c]; xs=[p[1] for p in c]
    return int(np.mean(xs)), int(max(ys))

def hang_bag(cell, frame0):
    a=cell.copy()
    a[bag_mask(a)]=0                                   # the near hand lets go
    a=drop_islands(a)
    b0=bag_mask(frame0); ys,xs=np.where(b0)
    hx0,hy0=far_hand(np.where(b0[:,:,None],0,frame0))  # frame 0's far hand (bag removed to find it)
    hx,hy=far_hand(a)
    dx,dy=hx-hx0,hy-hy0
    out=a.copy()
    ty,tx=ys+dy,xs+dx
    free=out[ty,tx,3]==0                               # far side: the bag goes BEHIND the body
    out[ty[free],tx[free]]=frame0[ys[free],xs[free]]
    return out,(dx,dy)

if __name__=="__main__":
    from grid import grid
    s=np.array(Image.open('planted.png').convert('RGBA'))
    f0=s[7*128:8*128,0:128]
    row=[]
    for c in (1,2,3):
        cell=s[7*128:8*128,c*128:(c+1)*128]
        fixed,shift=hang_bag(cell,f0); print(c,'bag shift',shift)
        Image.fromarray(fixed).save(f'se{c}-fixed.png'); row.append(fixed)
    both=np.concatenate([f0]+row,axis=1)
    grid(both,(10,24,512-10,112),3,'se-windup.png')
