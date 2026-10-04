import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
def grid(a, box, scale=8, out='g.png'):
    x0,y0,x1,y1=box
    crop=Image.fromarray(a[y0:y1,x0:x1]); bg=Image.new('RGBA',crop.size,(60,60,74,255)); bg.alpha_composite(crop)
    im=bg.resize(((x1-x0)*scale,(y1-y0)*scale),Image.NEAREST); d=ImageDraw.Draw(im); f=ImageFont.load_default(size=11)
    for x in range(x0,x1):
        if x%4==0: d.line([((x-x0)*scale,0),((x-x0)*scale,im.height)],fill=(255,255,255,60)); d.text(((x-x0)*scale+1,1),str(x),fill=(255,255,0),font=f)
    for y in range(y0,y1):
        if y%4==0: d.line([(0,(y-y0)*scale),(im.width,(y-y0)*scale)],fill=(255,255,255,60)); d.text((1,(y-y0)*scale+1),str(y),fill=(0,255,255),font=f)
    im.save(out)
