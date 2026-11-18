"""Surface-only textures for the Blender room. Every prop and its lettering has a mesh."""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

def prepare(root,out):
    out.mkdir(parents=True,exist_ok=True)
    files={}
    def save(key,img,quality=82):
        p=out/(key+'.jpg');img.convert('RGB').save(p,quality=quality,optimize=True);files[key]=p
    def surface(key,path,size,quality=82):
        im=Image.open(root/path).convert('RGB');im.thumbnail((size,size),Image.Resampling.LANCZOS);save(key,im,quality)
    surface('veneer','images/materials/figured-walnut.webp',768,86)
    surface('oak','images/materials/walnut.webp',640,80)
    surface('map','images/atlas/karatsu.webp',1250,86)
    surface('carpet','images/decor/burgundy-rug.webp',768,83)
    surface('plaster','images/materials/plaster.webp',512,77)
    gen=np.random.default_rng(219)
    grid=np.indices((512,512))
    gr=gen.normal(0,2.4,(512,512))+np.sin(grid[0]*math.pi*.63)*1.8+np.sin(grid[1]*math.pi*.49)*1.5
    leather=np.uint8(np.clip(np.array([62,75,55])+gr[:,:,None],0,255));save('leather',Image.fromarray(leather),80)
    rootfont='/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
    def jp(sz):return ImageFont.truetype(rootfont,sz,index=0)
    def serif(sz):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',sz)
    atlas=Image.new('RGB',(1024,1024));rng=random.Random(88)
    cover=Image.fromarray(np.uint8(np.clip(np.array([46,66,50])+gr[:,:,None]*1.5,0,255)))
    c=ImageDraw.Draw(cover);gold=(215,181,106)
    c.rounded_rectangle((22,18,491,491),radius=10,outline=gold,width=3);c.rounded_rectangle((29,25,484,484),radius=7,outline=gold,width=1)
    c.line((47,22,47,487),fill=gold,width=1)
    c.text((268,88),'FIELD NOTES',font=serif(27),anchor='mm',fill=gold)
    for r in [31,24]:c.ellipse((268-r,170-r,268+r,170+r),outline=gold,width=2)
    c.polygon([(268,131),(274,163),(307,170),(274,176),(268,208),(262,176),(229,170),(261,163)],outline=gold,width=2)
    c.text((268,258),'旅の手帖',font=jp(64),anchor='mm',fill=(232,202,131));c.line((145,307,392,307),fill=gold,width=1)
    c.text((268,350),'早稲田・唐津',font=jp(28),anchor='mm',fill=gold)
    c.text((268,445),'T. KIMURA',font=serif(21),anchor='mm',fill=gold);atlas.paste(cover,(0,0))
    def sheet(n,title,sub):
        noise=gen.normal(0,2.6,(512,512));im=Image.fromarray(np.uint8(np.clip(np.array([237,226,197])+noise[:,:,None],0,255)));d=ImageDraw.Draw(im)
        for y in range(151,466,28):d.line((35,y,477,y),fill=(193,177,151),width=1)
        d.line((55,138,55,462),fill=(186,139,120),width=1);d.text((43,34),sub,font=serif(18),fill=(112,55,46));d.text((40,62),title,font=jp(46),fill=(51,62,52))
        d.line((36,464,475,464),fill=(161,132,95));d.text((468,477),str(n),font=serif(15),anchor='mm',fill=(91,77,57));return im,d
    ink=(69,72,58)
    def line(d,pts,w=2):
        d.line(pts,fill=ink,width=w,joint='curve')
        if w>1:d.line([(x+rng.choice([0,0,1]),y+rng.choice([0,1,1])) for x,y in pts],fill=(113,107,85),width=1)
    a,d=sheet(1,'覚え書き','JOURNAL')
    d.text((77,170),'散策の記録',font=jp(25),fill=ink)
    for i,s in enumerate(['大隈講堂の時計塔','唐津城の天守','松浦川と城下町']):d.rectangle((78,240+46*i,91,253+46*i),outline=ink);d.text((110,230+46*i),s,font=jp(21),fill=ink)
    atlas.paste(a,(512,0))
    a,d=sheet(2,'大隈講堂','WASEDA  /  TOKYO')
    line(d,[(75,413),(428,413)])
    line(d,[(80,399),(82,318),(156,280),(214,316),(274,316),(274,399),(80,399)],3)
    line(d,[(76,321),(156,273),(213,305),(273,306)])
    for x in range(96,267,21):line(d,[(x,394),(x,343),(x+6,335),(x+13,342),(x+13,394)])
    for y in range(326,394,9):line(d,[(215,y),(267,y)],1)
    line(d,[(277,403),(277,235),(346,235),(346,403),(277,403)],3)
    line(d,[(271,236),(271,225),(280,224),(280,201),(288,196),(289,187),(311,154),(334,186),(335,196),(344,202),(344,224),(352,225),(352,236),(271,236)],3)
    d.ellipse((292,250,330,288),outline=ink,width=3);line(d,[(310,253),(310,270),(322,274)],2)
    for x in [283,298,314,330]:line(d,[(x,393),(x,305),(x+6,301),(x+6,393)])
    d.text((77,427),'OKUMA AUDITORIUM',font=serif(13),fill=ink);atlas.paste(a,(0,512))
    a,d=sheet(3,'唐津城','KARATSU  /  SAGA')
    line(d,[(98,402),(139,349),(340,349),(379,402),(98,402)],3)
    for y in range(360,399,10):
        line(d,[(135-(y-360)*.6,y),(344+(y-360)*.6,y)],1)
        for x in range(147+(y%3)*5,345,25):line(d,[(x,y-8),(x+3,y)],1)
    for y,w in [(344,186),(307,148),(274,119),(247,89),(223,61)]:
        x=240;line(d,[(x-w/2,y),(x-w/2,y-24),(x+w/2,y-24),(x+w/2,y)],2)
        line(d,[(x-w/2-14,y-22),(x-w/2+9,y-31),(x-w/2+22,y-42),(x+w/2-22,y-42),(x+w/2-9,y-31),(x+w/2+14,y-22),(x-w/2-14,y-22)],3)
        for xx in range(int(x-w/2)+8,int(x+w/2)-4,13):line(d,[(xx,y-19),(xx,y-4)],2)
    line(d,[(72,409),(408,409)]);d.text((77,427),'KARATSU CASTLE',font=serif(13),fill=ink);atlas.paste(a,(512,512));save('journal',atlas,86)
    # Eight separate clothbound spine designs with vertical Mincho lettering.
    # A spine is only one surface of its own modeled boards, bound back and block.
    titles=['唐津紀行','早稲田','建築素描','郷土誌','地図集','研究手帖','教育実践','旅の記録']
    colors=[(77,48,36),(57,68,48),(112,82,45),(53,58,63),(101,54,45),(65,65,47),(120,94,66),(75,60,44)]
    spines=Image.new('RGB',(512,512))
    for i,(title,base) in enumerate(zip(titles,colors)):
        noise=gen.normal(0,3.0,(256,128));linen=np.indices((256,128))[1]%3
        arr=np.clip(np.array(base)+(noise+linen*.95)[:,:,None],0,255).astype('uint8')
        tile=Image.fromarray(arr);d=ImageDraw.Draw(tile);gold=(205,176,116)
        for sy,weight in [(12,3),(20,1),(47,1),(50,2),(218,1),(226,3),(244,2)]:
            d.line((8,sy,120,sy),fill=gold,width=weight)
        for j,ch in enumerate(title):
            step=min(37,140/len(title))
            d.text((64,77+j*step),ch,font=jp(29),anchor='mm',fill=(223,199,145))
        d.ellipse((55,192,74,211),outline=gold,width=2);d.line((57,207,72,197),fill=gold,width=1)
        spines.paste(tile,((i%4)*128,(i//4)*256))
    save('book-spines',spines,87)
    return files
