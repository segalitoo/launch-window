"""One-off test, Session 2: three night treatments for a unit sprite at game scale.
Writes assets/raw/gen/CH_unit_grade_test.png. Kept as the record of the unit-grade decision."""
import json, sys
sys.argv=['x']
import importlib.util
spec=importlib.util.spec_from_file_location('c','/Users/rannsegal/Claude/special-ops/tools/char_scale_test.py')
src=open('/Users/rannsegal/Claude/special-ops/tools/char_scale_test.py').read().replace('\nmain()\n','\n')
ns={}; exec(compile(src,'cst','exec'),ns)
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
import numpy as np
root='/Users/rannsegal/Claude/special-ops/assets/raw/gen/'
scene=Image.open(root+'SF-01_yard_paint_1_night.png').convert('RGB'); meta=json.load(open(root+'SF-01_yard_paint_1.json'))
ss=meta['supersample']; ox,oy=meta['origin_px']; sx,sy=16.6,28.4
fx,fy=ox+(sx-sy)*32*ss, oy+(sx+sy)*16*ss
def tint(fig,t):
    r,g,b,a=fig.split(); return Image.merge('RGBA',(r.point(lambda v:v*t[0]),g.point(lambda v:v*t[1]),b.point(lambda v:v*t[2]),a))
def rim(fig):
    a=np.asarray(fig.split()[3]).astype(float)/255
    # pixels inside the figure whose up-left neighbour is outside: moonlit edge
    sh=np.zeros_like(a); sh[2:,2:]=a[:-2,:-2]
    edge=np.clip(a-sh,0,1)
    rgb=np.asarray(fig.convert('RGB')).astype(float)
    moon=np.array([170,190,230.])
    rgb=rgb*(1-edge[...,None]*0.8)+moon*edge[...,None]*0.8
    out=Image.fromarray(rgb.clip(0,255).astype('uint8')); out.putalpha(fig.split()[3]); return out
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',15)
rows=[]
for name in ['CH-01_yoav_turnaround_1','CH-02_yoav_turnaround_hood_1']:
    base=ns['cut_figures'](root+name+'.jpg')
    th=44*ss; tw=round(base.width*th/base.height); base=base.resize((tw,th),Image.LANCZOS)
    variants=[('a. full night grade',tint(base,(0.36,0.43,0.60))),('b. lighter unit grade',tint(base,(0.62,0.68,0.82))),('c. lighter + moon rim',rim(tint(base,(0.62,0.68,0.82))))]
    tiles=[]
    for label,fig in variants:
        sc=scene.copy().convert('RGBA')
        sh=Image.new('RGBA',sc.size,(0,0,0,0)); ImageDraw.Draw(sh).ellipse((fx-8*ss,fy-4*ss,fx+14*ss,fy+4*ss),fill=(0,0,0,110)); sc=Image.alpha_composite(sc,sh)
        sc.alpha_composite(fig,(int(fx-tw/2),int(fy-th+2*ss)))
        cw,ch=130,90
        crop=sc.crop((int(fx-cw*ss/2),int(fy-ch*ss*0.7),int(fx+cw*ss/2),int(fy+ch*ss*0.3))).convert('RGB').resize((cw,ch),Image.LANCZOS).resize((cw*3,ch*3),Image.NEAREST)
        t=Image.new('RGB',(cw*3,ch*3+24),(18,20,21)); ImageDraw.Draw(t).text((4,4),f'{name[:5]}  {label}  (3x of 100% zoom)',font=font,fill=(236,228,211)); t.paste(crop,(0,24)); tiles.append(t)
    row=Image.new('RGB',(sum(t.width for t in tiles)+16,tiles[0].height),(18,20,21)); x=0
    for t in tiles: row.paste(t,(x,0)); x+=t.width+8
    rows.append(row)
out=Image.new('RGB',(rows[0].width,sum(r.height+8 for r in rows)),(18,20,21)); y=0
for r in rows: out.paste(r,(0,y)); y+=r.height+8
out.save(root+'CH_unit_grade_test.png')
