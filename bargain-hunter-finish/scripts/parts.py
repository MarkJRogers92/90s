import numpy as np
from collections import deque
def comps(mask):
    seen=np.zeros_like(mask); out=[]
    h,w=mask.shape
    for y,x in zip(*np.where(mask)):
        if seen[y,x]: continue
        c=[];q=deque([(y,x)]);seen[y,x]=True
        while q:
            cy,cx=q.popleft();c.append((cy,cx))
            for ny in (cy-1,cy,cy+1):
                for nx in (cx-1,cx,cx+1):
                    if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True;q.append((ny,nx))
        out.append(c)
    return out
def to_mask(c,shape):
    m=np.zeros(shape,bool)
    for y,x in c: m[y,x]=True
    return m
def grow(m,n=1):
    m=m.copy()
    for _ in range(n):
        g=m.copy(); g[1:]|=m[:-1]; g[:-1]|=m[1:]; g[:,1:]|=m[:,:-1]; g[:,:-1]|=m[:,1:]; m=g
    return m
def bag_mask(a, floor=111):
    """Paper bag: the biggest light-cream/tan blob that does not touch the floor, plus its outline."""
    r,g,b,al=(a[:,:,i].astype(int) for i in range(4))
    op=al>0
    paper=op&(r>150)&(r-b>15)&(r-b<110)&(g>120)
    cs=[c for c in comps(paper) if max(p[0] for p in c)<floor-3 and len(c)>40]
    if not cs: return np.zeros(op.shape,bool)
    m=to_mask(max(cs,key=len),op.shape)
    # grow through the bag's own darker tan/brown shading (never into denim, skin or hair)
    shade=op&(r>70)&(r-b>20)&(g>45)&(r-g<70)
    while True:
        more=m|(shade&grow(m,1))
        if (more==m).all(): break
        m=more
    dark=op&(r+g+b<150)
    return m|(dark&grow(m,1))

def drop_islands(a, keep_min=8):
    """Remove tiny disconnected opaque islands (stray specks) from a cell."""
    a=a.copy()
    for c in comps(a[:,:,3]>0):
        if len(c)<keep_min:
            for y,x in c: a[y,x]=0
    return a
