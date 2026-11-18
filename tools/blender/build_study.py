"""blender -b -t 2 --python tools/blender/build_study.py [-- --preview /tmp/study]
Build the furnished study and its interactive props. Blender coordinates are
X right, Y toward the map, Z up. glTF export converts these to metres/Y up.

Tested in Blender 4.3.2 with Pillow, NumPy, fontTools, Noto Serif CJK and
DejaVu Serif. Surface textures are read from this repository. Pass --output
to export a separate copy, or --blend to keep an editable packed scene.
"""
import argparse, math, random, sys, tempfile
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
from study_mesh import Mesh,group,text_mesh,material
from study_textures import prepare

p=argparse.ArgumentParser()
p.add_argument('--preview',type=Path)
p.add_argument('--output',type=Path,default=ROOT/'assets/models/blender/study-room.glb')
p.add_argument('--blend',type=Path)
p.add_argument('--samples',type=int,default=12)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
tmp=tempfile.TemporaryDirectory(prefix='study-materials-')
textures=prepare(ROOT,Path(tmp.name))
def m(name,color,r=.62,metal=0,tex=None,em=0):return material(name,color,r,metal,textures.get(tex),em)
walnut=m('Waxed quarter-cut walnut','975d39',.38,tex='veneer')
oak=m('Oiled cabinet oak','956343',.47,tex='oak')
edge=m('Dark shellac moulding','4e382c',.38);vein=m('Inlaid pearwood','b28b63',.48);dark=m('Recess and ink','302b27',.68)
bronze=m('Patinated bronze','746044',.50,.54);brass=m('Brushed brass','c8994c',.32,.72);gilt=m('Burnished brass highlights','dfbc71',.25,.67)
blackmetal=m('Cast iron','383a35',.55,.38); sage=m('Painted olive wainscot','465448',.63);sage2=m('Raised wainscot rail','566458',.50)
plaster=m('Lime plaster','d9cfb9',.94,tex='plaster');mapmat=m('Printed Karatsu survey on paper','dfc496',.91,tex='map')
leather=m('Green skiver leather','374b3c',.72,tex='leather');fabric=m('Burgundy wool pile','8d4e43',.96,tex='carpet')
cotton=m('Rug fringing','baa787',.87);ivory=m('Ivory wove paper','e8dec3',.90);pageEdge=m('Folded paper signatures','c7b69b',.91)
linen=m('Cream bookbinding thread','d5be91',.89);red=m('Crimson ribbon','883c36',.70);wax=m('Burgundy sealing wax','8b3b36',.39)
green=m('Cased emerald glass shade','215536',.23,.10);inside=m('Warm opaline interior','f2dfb0',.28,0,em=.20)
bulb=m('Incandescent pearl bulb','fff1bf',.25,0,em=2.2);porcelain=m('Celadon cup glaze','c7c8b2',.23,.03)
tea=m('Tea surface','563b22',.17,.12);honey=m('Honey willow cane','c8ab74',.68);caneDark=m('Chair weave shadows','70604b',.81)
spineprint=m('Gilt Mincho book titles','b08e5d',.69,tex='book-spines')
journal=m('Printed journal cloth and folios','dbcaa1',.81,tex='journal')
inkglass=m('Midnight ink bottle','263b36',.24,.08);saffron=m('Yellow lacquer pencil','b98646',.46)
bookmats=[m('Buckram '+str(i),c,.76) for i,c in enumerate(['533732','546350','9a7646','3f454c','75473e','505345','ab8661','685948'])]
root=group('StudyRoom',style='Meiji-inspired walnut study',units='metres')
def station(name,**extras):return group(name,root,**extras)
def built(name):return Mesh(name,root)
ROOM=built('RoomShell');R=ROOM
# Oak floor and printed wool rug. Each board has actual seams and end grain.
for i in range(22):
    x=-1.64+i*.173
    for j in range(5):
        y=-3.6+j*1.11+(i%3)*.26
        R.box((x,y,-.026),(.172,1.108,.05),oak,.001)
rug=built('Rug');rug.box((0,-.42,.004),(2.45,1.98,.010),red,.003)
rug.quad([(-1.22,-1.405,.010),(1.22,-1.405,.010),(1.22,.565,.010),(-1.22,.565,.010)],fabric)
for i in range(116):
    x=-1.205+i*.0209
    for y,sg in [(-1.402,-1),(.56,1)]:rug.tube([(x,y,.009),(x+.002,y+.022*sg,.005),(x-.002,y+(.033+(i%3)*.003)*sg,.003)],.0023,cotton,4)
# Back plaster and timber panels. The doorway in the rear opens to the garden.
back=1.08; left=-1.57;right=2.25
R.box(((left+right)/2,back,1.46),(right-left+.12,.12,2.92),plaster)
R.box((right,-1.17,1.46),(.12,4.55,2.92),plaster)
R.box(((left+right)/2,-1.19,2.97),(right-left+.12,4.58,.12),plaster)
def wall_panels():
    for y in [.017,.114,.158,.665,.715,.742]:
        h=.055 if y in [.114,.665] else .021
        R.box(((left+right)/2,back-.078,y),(right-left+.06,.045,h),sage2,.003)
        R.box((right-.078,-1.16,y),(.045,4.48,h),sage2,.003)
    for i in range(9):
        x=left+.18+i*.44
        R.box((x,back-.070,.386),(.43,.038,.51),sage,.008)
        R.box((x,back-.093,.393),(.337,.026,.385),sage2,.009)
        R.box((x,back-.111,.393),(.307,.016,.354),sage,.007)
    for i in range(11):
        y=-3.25+i*.416
        R.box((right-.068,y,.386),(.040,.405,.51),sage,.008)
        R.box((right-.095,y,.39),(.023,.312,.385),sage2,.008)
    for z,h,d in [(2.75,.035,.07),(2.805,.075,.103),(2.865,.06,.145)]:
        R.box(((right+left)/2,back-.04,z),(right-left+.08,d,h),edge,.008)
        R.box((right-.04,-1.16,z),(d,4.51,h),edge,.008)
wall_panels()
# A real open sash, deep reveal and muntins. The view behind is separate geometry.
ylo,yhi=-2.02,.745;zlo,zhi=.76,2.61
for yc,depth in [((-3.48+ylo)/2,ylo+3.48),((yhi+back)/2,back-yhi)]:
    R.box((left,yc,1.48),(.13,depth,2.96),plaster)
R.box((left,(ylo+yhi)/2,zlo/2),(.14,yhi-ylo,zlo),sage)
R.box((left,(ylo+yhi)/2,(zhi+2.94)/2),(.14,yhi-ylo,2.94-zhi),plaster)
for y in [ylo,yhi]:
    R.box((left+.019,y,(zhi+zlo)/2),(.17,.08,zhi-zlo+.15),walnut,.009,True)
for z in [zlo,zhi]:
    R.box((left+.035,(ylo+yhi)/2,z),(.17,yhi-ylo+.19,.09),walnut,.010)
R.box((left+.051,(ylo+yhi)/2,zlo-.055),(.25,yhi-ylo+.23,.048),oak,.009)
for j in range(1,6):
    y=ylo+j*(yhi-ylo)/6;R.box((left,y,(zhi+zlo)/2),(.049,.028 if j!=3 else .048,zhi-zlo),edge,.004)
for j in [1,2]:
    z=zlo+j*(zhi-zlo)/3;R.box((left,(ylo+yhi)/2,z),(.047,yhi-ylo,.032),oak,.004)
for y in [-2.35,-1.95,-1.55,-1.15,-.75,-.35,.05,.45,.85]:
    R.box((left+.059,y,.40),(.024,.32,.43),sage2,.006)
R.box((left+.07,-1.14,.15),(.072,4.48,.09),edge,.005)
# Hinged threshold at the far camera side, also makes the room useful in free view.
for x,w in [(left+.34,.68),(.91,2.56)]:R.box((x,-3.47,1.46),(w,.12,2.92),plaster)
R.box((-.72,-3.48,2.60),(.70,.12,.65),plaster)
for x in [-1.17,-.35]:R.box((x,-3.40,1.12),(.073,.11,2.24),walnut,.006,True)
R.box((-.76,-3.40,2.25),(.94,.11,.095),walnut,.007)
for x in [left+.045,right-.05]:R.box((x,back-.052,1.55),(.075,.073,2.7),edge,.007,True)
ROOM.build();rug.build()
# Archival wall map under a maple-and-gilt frame, printed on a real stretched sheet.
wallMap=built('FramedMap');mx=-.03;mz=1.86;mw=2.32;mh=1.30;ym=back-.098
wallMap.box((mx,ym,mz),(mw+.094,.055,mh+.092),edge,.009)
wallMap.quad([(mx-mw/2,ym-.030,mz-mh/2),(mx+mw/2,ym-.030,mz-mh/2),(mx+mw/2,ym-.030,mz+mh/2),(mx-mw/2,ym-.030,mz+mh/2)],mapmat)
for x in [mx-mw/2-.011,mx+mw/2+.011]:wallMap.box((x,ym-.031,mz),(.027,.022,mh+.052),brass,.003)
for z in [mz-mh/2-.012,mz+mh/2+.012]:wallMap.box((mx,ym-.031,z),(mw+.055,.022,.025),brass,.003)
wallMap.build()
# Exterior canopy, individually shaped seven-lobed maple leaves on branching stems.
garden=built('WindowGarden');rng=random.Random(136)
bark=m('Maple bark','685340',.91)
leaves=[m('Autumn maple '+str(i),c,.83) for i,c in enumerate(['ae4c2c','9b5837','b87937','c99446','8a7644','b66437','785f3b'])]
mountain=[m('Distant hills '+str(i),c,.99) for i,c in enumerate(['8faaa2','809b8c','749074'])]
for row in range(3):
    vs=[];fs=[]
    for j in range(24):
        y=-12+j*1.1;h=.57+.18*math.sin(j*.55+row*2.7)+.08*math.sin(j*1.26)+row*.12
        vs.extend([(-6.5-row*1.5,y,-.52),(-6.5-row*1.5,y,h)])
        if j:fs.append((2*j-2,2*j,2*j+1,2*j-1))
    garden.geom(vs,fs,mountain[2-row])
def maple(center,radius,angle,tilt,mat):
    x,y,z=center;verts=[(x,y,z)];faces=[]
    for k in range(16):
        a=angle+k*math.pi/8
        rad=radius*(1 if k%2==0 else .39)
        verts.append((x+rad*math.cos(a),y+rad*math.sin(a)*.85,z+rad*math.sin(a)*tilt+(.07*radius if k%2 else 0)))
        if k:faces.append((0,k,k+1))
    faces.append((0,16,1));garden.geom(verts,faces,mat,smooth=True)
for k in range(4):
    tx=-2.18-.15*(k%3);ty=-.33+k*.75
    garden.tube([(tx+.07,ty-.30,-.08),(tx,ty-.13,.82),(tx-.08,ty,1.57),(tx-.20,ty+.10,2.08)],[.056,.039,.023,.010],bark,10)
    for j in range(10):
        h=.8+j*.14;ang=rng.random()*6.28
        v=Vector((tx-.04,ty-.08,h));e=v+Vector((rng.uniform(-.56,.24),math.cos(ang)*.7,rng.uniform(.20,.56)))
        mid=v.lerp(e,.56)+Vector((0,.045,-.06));garden.tube([v,mid,e],[.018,.011,.003],bark,7)
        for n in range(3):
            f=e+Vector((rng.uniform(-.28,.27),rng.uniform(-.36,.35),rng.uniform(.035,.25)))
            garden.tube([mid,e,f],[.006,.004,.0018],bark,5)
            for t in range(9):
                c=f+Vector((rng.uniform(-.14,.14),rng.uniform(-.17,.17),rng.uniform(-.10,.10)))
                maple(c,rng.uniform(.033,.066),rng.random()*6.28,rng.uniform(-.9,.5),rng.choice(leaves))
garden.build()
# The worktop sits in a stepped, string-inlaid surround. Drawer cabinets are
# open at the front; each leg has fluting, a turned shoulder and a brass foot.
deskRoot=station('WritingDesk')
desk=Mesh('WalnutJoinery',deskRoot)
for z,w,d,h,mat,bev in [(.742,2.44,.93,.058,edge,.008),(.772,2.52,1.00,.034,walnut,.008),
    (.794,2.48,.973,.012,walnut,.004)]:
    desk.box((0,0,z),(w,d,h),mat,bev)
desk.box((0,0,.801),(2.26,.798,.007),leather,.003)
for x in [-1.151,1.151]:desk.box((x,0,.8009),(.005,.833,.002),gilt,.0004)
for y in [-.415,.415]:desk.box((0,y,.8009),(2.306,.004,.002),gilt,.0004)
for x in [-1.14,1.14]:
    for y in [-.395,.395]:
        desk.lathe((x,y,.01),[(.048,0),(.052,.007),(.049,.021),(.037,.036),(.035,.06),(.042,.095),(.042,.12),(.039,.133),(.044,.145)],brass,16)
        desk.lathe((x,y,.135),[(.042,0),(.054,.008),(.055,.023),(.047,.038),(.042,.049),(.044,.062),(.045,.34),(.057,.37),(.052,.397),(.060,.432),(.061,.445),(.049,.454)],walnut,20)
        for j in range(9):
            a=j*2*math.pi/9;xx=x+.044*math.cos(a);yy=y+.044*math.sin(a)
            desk.tube([(xx,yy,.23),(xx,yy,.46)],[.0018,.002],vein,4)
        desk.box((x,y,.66),(.133,.127,.17),walnut,.008,True)
# Carcase partitions, rear board, lower rail and end panels.
for x in [-1.19,0,1.19]:desk.box((x,.015,.660),(.063,.85,.17),walnut,.006,True)
desk.box((0,.413,.659),(2.35,.042,.178),walnut,.006)
desk.box((0,-.425,.582),(2.43,.071,.041),edge,.007)
desk.box((0,-.46,.589),(2.398,.017,.013),vein,.002)
for x in [-1.192,1.192]:
    desk.box((x,.014,.65),(.069,.815,.163),walnut,.006)
    desk.box((x*1.025,.014,.655),(.018,.675,.090),edge,.004)
    desk.box((x*1.034,.014,.655),(.009,.634,.063),walnut,.002)
def hardware(mesh,length):
    # Old bail handle, cast rosettes, screw heads and surface-mounted keyhole.
    for x in [-length/2,length/2]:
        mesh.sphere((x,-.018,.014),(.023,.010,.023),bronze,14,6)
        mesh.sphere((x,-.027,.014),(.015,.009,.015),brass,14,6)
        mesh.tube([(x,-.028,.016),(x,-.045,.009),(x,-.047,-.001)],.0053,gilt,8)
        for dx in [-.013,.013]:mesh.sphere((x+dx,-.026,.015),(.003,.002,.003),gilt,8,4)
    L=length/2
    mesh.tube([(-L,-.044,.007),(-L,-.052,-.011),(-L+.012,-.060,-.026),(-L+.035,-.063,-.030),
               (L-.035,-.063,-.030),(L-.012,-.060,-.026),(L,-.052,-.011),(L,-.044,.007)],
              [.005,.005,.006,.007,.007,.006,.005,.005],brass,10)
    mesh.sphere((0,-.017,.043),(.008,.003,.008),bronze,12,6);mesh.box((0,-.021,.042),(.003,.001,.007),dark)
def drawer(name,x,moves):
    rootD=group(name,deskRoot,(x,-.454,.661),studyAction='drawer' if moves else 'furniture')
    D=Mesh(name+'Fittings',rootD)
    D.box((0,0,0),(1.132,.034,.146),walnut,.005)
    D.box((0,-.018,0),(1.083,.010,.112),edge,.006)
    D.box((0,-.022,0),(1.054,.009,.091),walnut,.006)
    for xx in [-.529,.529]:D.box((xx,-.027,0),(.003,.002,.09),vein)
    for zz in [-.045,.045]:D.box((0,-.027,zz),(1.061,.002,.003),vein)
    hardware(D,.255)
    if moves:
        D.box((0,.25,-.063),(1.082,.49,.014),oak,.003)
        D.box((0,.25,-.054),(1.060,.465,.005),leather,.002)
        for xx in [-.535,.535]:D.box((xx,.25,-.008),(.021,.48,.120),oak,.004)
        D.box((0,.483,-.012),(1.07,.019,.113),oak,.004)
        for i in range(4):
            D.box((-.25+i*.002,.17+i*.002,-.046+i*.003),(.225,.158,.003),ivory,.001)
        D.quad([(-.36,.095,-.034),(-.145,.095,-.034),(-.145,.244,-.034),(-.36,.244,-.034)],journal,[(.515,.51),(.98,.51),(.98,.99),(.515,.99)])
        for i in range(4):
            xx=.26+i*.027;D.tube([(xx,.083,-.043),(xx,.325,-.043)],.0051,bookmats[i],6)
            D.tube([(xx,.325,-.043),(xx,.345,-.043)],[.0051,.0007],vein,6)
        D.box((.10,.245,-.020),(.012,.45,.065),oak,.003)
    return D.build()
drawer('Drawer',-.596,True);drawer('DeskRightDrawer',.596,False);desk.build()
# Three wall shelves with turned pegs and scroll brackets, and an open cabinet.
shelves=built('ShelvesAndBookcase')
def shelf(x,y,z,w,depth):
    shelves.box((x,y,z),(w,depth,.044),walnut,.007)
    shelves.box((x,y-depth/2,z-.009),(w+.011,.015,.024),edge,.003)
    for xx in [x-w*.36,x+w*.36]:
        shelves.tube([(xx,y+.10,z-.24),(xx,y+.07,z-.21),(xx,y-.03,z-.075),(xx,y-.083,z-.033)],
                     [.013,.014,.011,.013],brass,8)
        shelves.box((xx,y+.095,z-.13),(.038,.017,.236),walnut,.003)
shelf(1.31,.891,1.48,1.26,.25);shelf(1.50,.902,2.15,.91,.24)
shelf(-1.00,.84,.93,.80,.30)
# Closed, cloth-bound books with paper blocks and ribs. Worn page ends, bands and
# stamped cartouches have separate material and geometry on each spine.
def book(mesh,x,y,z,w,d,h,color,seed):
    mesh.box((x,y,z+h/2),(w-.007,d-.008,h-.008),ivory,.0015)
    for xx in [x-w/2+.0017,x+w/2-.0017]:mesh.box((xx,y,z+h/2),(.004,d,h),color,.001)
    mesh.box((x,y-d/2+.001,z+h/2),(w,.010,h),color,.002)
    # Convex bound back, with raised headcaps and an individually printed title.
    design=bookmats.index(color);col=design%4;row=1-design//4
    for i in range(5):
        u=i/5;v=(i+1)/5
        def pt(t,zz):return (x+(t-.5)*w,y-d/2-.0043-.003*math.sin(t*math.pi),z+zz*h)
        corners=[pt(u,.012),pt(v,.012),pt(v,.988),pt(u,.988)]
        UV=[((col+.012+.976*t)/4,(row+.005+.99*yy)/2) for t,yy in [(u,0),(v,0),(v,1),(u,1)]]
        mesh.quad(corners,spineprint,UV)
    for f in [.052,.184,.862,.952]:
        mesh.tube([(x-w*.47,y-d/2-.003,z+h*f),(x,y-d/2-.0081,z+h*f),(x+w*.47,y-d/2-.003,z+h*f)],
                  .0017,bronze if seed%3 else gilt,5)
rng=random.Random(802)
for sx,y,z,count in [(.752,.895,1.505,13),(1.14,.912,2.177,9),(-1.35,.839,.955,8)]:
    for i in range(count):
        w=rng.uniform(.040,.072);h=rng.uniform(.199,.365);d=rng.uniform(.129,.183)
        book(shelves,sx+w/2,y,z,w,d,h,rng.choice(bookmats),i);sx+=w+.002
# A low oak cabinet at the window, complete on each side.
sx=-1.26;sy=-.39
for x in [sx-.145,sx+.145]:shelves.box((x,sy,.285),(.032,.68,.54),walnut,.004,True)
for z in [.06,.34,.60]:shelves.box((sx,sy,z),(.34,.73,.038),walnut,.005)
for i in range(4):
    shelves.box((sx,sy+.24,.648+i*.030),(.20,.18,.026),bookmats[i],.002)
shelves.build()
# Cane-backed chair. Curved crest rails and a double-sided woven lattice carry
# through to the opposite view; the chair has no billboard or cutout.
chair=group('CaneChair',root,(.84,-.96,0),(0,0,-.34));C=Mesh('CaneChairJoinery',chair)
for x in [-.18,.18]:
    for y in [-.18,.18]:
        C.tube([(x*1.14,y*1.14,.008),(x*1.05,y*1.04,.25),(x,y,.431)],[.015,.018,.023],walnut,10)
for x in [-.196,.196]:C.box((x,0,.412),(.031,.445,.052),walnut,.007)
for y in [-.212,.212]:C.box((0,y,.412),(.406,.033,.052),walnut,.007)
C.box((0,0,.422),(.369,.394,.010),caneDark,.002)
for i in range(38):
    pos=(i-18.5)*.0096
    C.tube([(pos,-.191,.434),(pos,.190,.434)],.0020,honey,4)
    C.tube([(-.177,pos,.436),(.177,pos,.436)],.0020,honey,4)
for i in range(-16,17):
    offset=i*.019
    for sign in [-1,1]:
        ends=[]
        for x in [-.177,.177]:
            y=x*sign+offset
            if -.19<=y<=.19:ends.append((x,y,.437))
        for y in [-.19,.19]:
            x=(y-offset)/sign
            if -.177<x<.177:ends.append((x,y,.437))
        if len(ends)==2:C.tube(ends,.0014,vein,4)
for x in [-.184,.184]:
    C.tube([(x,-.194,.393),(x*1.03,-.203,.54),(x*1.11,-.222,.833),(x*1.08,-.227,.924)], [.020,.018,.025,.022],walnut,12)
path=[(-.202,-.226,.890),(-.195,-.236,.928),(-.158,-.242,.953),(-.087,-.246,.961),(0,-.247,.964),(.087,-.246,.961),(.158,-.242,.953),(.195,-.236,.928),(.202,-.226,.890)]
C.tube(path,.023,walnut,14)
C.tube([(-.188,-.209,.565),(0,-.223,.55),(.188,-.209,.565)],.012,walnut,10)
for i in range(21):
    x=(i-10)*.0166
    C.tube([(x,-.211,.564),(x*1.023,-.233,.749),(x*1.065,-.242,.934-(abs(i)/10)**4*.023)],[.0025,.0021,.0025],honey,5)
for i in range(19):
    z=.58+i*.0182;w=.177+(z-.58)*.035
    C.tube([(-w,-.210-(z-.58)*.082,z),(0,-.233-(z-.58)*.038,z-.003),(w,-.210-(z-.58)*.082,z)],.0026,honey,5)
C.build()
# Notebook. Cover boards, block and sewn gutter, the reverse of the cloth cover,
# back page and both printed faces of a turning, morphable leaf are real surfaces.
notebook=group('Notebook',root,(-.227,-.202,.806),(0,0,-.055),studyAction='notebook',destination='blog.html')
N=Mesh('NotebookBinding',notebook);W=.318;D=.252
N.box((W/2,0,.004),(W+.006,D+.008,.008),leather,.0028)
N.box((W/2,0,.019),(W-.006,D-.004,.021),ivory,.002)
for i in range(6):N.box((W/2,-D/2+.0011,.0105+i*.0030),(W-.009,.0021,.0006),pageEdge)
N.tube([(.004,-D/2,.019),(.004,D/2,.019)],.013,leather,16)
for j in range(4):
    y=-D/2+.021+j*.061
    N.tube([(-.008,y,.010),(-.010,y,.019),(-.008,y,.027)],.0018,linen,6)
N.poly([(.035,-D*.42,.009),(.051,-D*.42,.009),(.056,-D*.66,.005),(.046,-D*.61,.004),(.039,-D*.66,.004)],red)
def atlas_panel(mesh,coordinates,index,flip=False):
    uv=[(0,0),(1,0),(1,1),(0,1)]
    uv=[((index%2+.008+(1-u if flip else u)*.984)/2,(1-index//2+.008+v*.984)/2) for u,v in uv]
    mesh.quad(coordinates,journal,uv)
atlas_panel(N,[(.005,-D*.47,.0301),(W-.004,-D*.47,.0301),(W-.004,D*.47,.0301),(.005,D*.47,.0301)],3);N.build()
coverRoot=group('NotebookCover',notebook,(0,0,.034),studyJoint='local-Z',openRadians=3.095)
cover=Mesh('NotebookClothBoard',coverRoot)
cover.box((W/2,0,.001),(W+.007,D+.009,.0085),leather,.003)
atlas_panel(cover,[(.002,-D/2,.0055),(W-.001,-D/2,.0055),(W-.001,D/2,.0055),(.002,D/2,.0055)],0)
cover.box((W/2,0,-.0038),(W-.007,D-.012,.0014),ivory,.0005)
for x in [.012,.016]:cover.tube([(x,-D*.47,.0059),(x,D*.47,.0059)],.0007,vein,5)
cover.build()
leafRoot=group('NotebookLeaf',notebook,(.002,0,.0312),studyJoint='local-Z',openRadians=3.10)
leaf=Mesh('NotebookPageFlex',leafRoot);cols=17;rows=4
for side in [1,-1]:
    vs=[];fs=[];uv=[]
    for j in range(rows+1):
        for i in range(cols+1):
            u=i/cols;v=j/rows;vs.append(((W-.009)*u,(v-.5)*(D-.009),side*.00055+.002*math.sin(u*math.pi)))
    for j in range(rows):
        for i in range(cols):
            a=j*(cols+1)+i;b=a+1;c=b+cols+1;d=c-1;f=[a,b,c,d] if side==1 else [d,c,b,a];fs.append(f)
            panel=1 if side==1 else 2; coords=[]
            for idx in f:
                u=idx%(cols+1)/cols;v=idx//(cols+1)/rows
                coords.append(((panel%2+.008+(u if side==1 else 1-u)*.984)/2,(1-panel//2+.008+v*.984)/2))
            uv.append(coords)
    leaf.geom(vs,fs,journal,uv,smooth=True)
leafObj=leaf.build();leafObj.shape_key_add(name='Basis')
shape=leafObj.shape_key_add(name='Flex');shape.value=0
for i,v in enumerate(leafObj.data.vertices):
    x,y,z=v.co;u=x/(W-.009);vnorm=(y/(D-.009)+.5)
    shape.data[i].co=(x-.036*u**1.4,y+.006*u*(vnorm-.5),z+.085*math.sin(math.pi*u*.865)*(.91+.18*vnorm))
# Correspondence and a wax-stamped flap hinged about its own rear crease.
letter=group('Letter',root,(.348,-.220,.808),(0,0,.09),studyAction='letter',destination='contact.html')
E=Mesh('LetterPocket',letter);ew=.282;ed=.17
E.box((0,0,.001),(ew,ed,.004),ivory,.0012)
E.poly([(-ew/2,-ed/2,.003),(-ew/2,ed/2,.003),(0,-.009,.0038)],linen)
E.poly([(ew/2,-ed/2,.003),(0,-.009,.0038),(ew/2,ed/2,.003)],linen)
E.poly([(-ew/2,-ed/2,.004),(ew/2,-ed/2,.004),(0,.018,.0063)],ivory)
E.box((0,.015,.0044),(.255,.128,.002),pageEdge,.001)
# Corners of the letter under the flap; ink and rules are deliberately sparse.
for i,w in enumerate([.158,.190,.127]):
    E.box((-.019,.047-i*.013,.0058),(w,.001,.0004),bookmats[2])
E.build()
flaproot=group('LetterFlap',letter,(0,ed/2,.0075),studyJoint='local-X',openRadians=-2.73)
ef=Mesh('SealedPaperFlap',flaproot);outline=[(-ew/2,0),(ew/2,0),(.016,-.113),(0,-.119),(-.016,-.113)]
for yOff,h,mat in [(0,0,ivory),(0,.0013,ivory)]:
    points=[(x,y+yOff,h) for x,y in outline]
    ef.poly(points if h else points[::-1],mat)
for i,(x,y) in enumerate(outline):
    xx,yy=outline[(i+1)%len(outline)]
    ef.poly([(x,y,0),(xx,yy,0),(xx,yy,.0013),(x,y,.0013)],pageEdge)
ef.lathe((.009,-.106,.0014),[(.017,0),(.019,.0012),(.018,.0038),(.016,.0053),(.014,.0043)],wax,23,scale=(1,.88))
ef.tube([(.002,-.109,.006),(.009,-.100,.006),(.017,-.109,.006),(.011,-.112,.006)],.0014,red,5)
ef.build()
# Sloped walnut plaque. Both actual Mincho glyph contours and the smaller Roman
# letters are extruded; no image file is used for the visitor's name.
name=group('Nameplate',root,(-.83,-.245,.806),(0,0,-.018),inscription='木村 紀喜')
np=Mesh('NameplateStand',name);nw=.474;nd=.12;nh=.125
np.box((0,0,.009),(nw+.036,nd+.015,.018),edge,.005)
for x in [-nw/2+.012,nw/2-.012]:
    np.poly([(x,-nd*.49,.016),(x,nd*.46,.016),(x,nd*.16,nh)],walnut)
np.quad([(-nw/2,-nd*.49,.016),(nw/2,-nd*.49,.016),(nw/2,nd*.16,nh),(-nw/2,nd*.16,nh)],walnut)
np.poly([(-nw/2,nd*.16,nh),(nw/2,nd*.16,nh),(nw/2,nd*.46,.016),(-nw/2,nd*.46,.016)],edge)
np.build()
angle=math.atan2(nh-.016,nd*.65)
panel=group('NameplateFace',name,(0,-.019,.077),(angle,0,0))
plate=Mesh('BrassPlaque',panel);plate.box((0,0,0),(nw-.028,.111,.0045),brass,.003)
plate.box((0,0,.0026),(nw-.044,.092,.0014),ivory,.001)
for xx in [-nw*.43,nw*.43]:
    for yy in [-.036,.036]:
        plate.sphere((xx,yy,.004),(.0028,.0028,.0015),bronze,8,4)
plate.build()
# Read a small, language-specific outline subset from the system collection.
from fontTools import subset
from fontTools.ttLib import TTFont
smallFont=Path(tmp.name)/'name-plate.otf'
ft=TTFont('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',fontNumber=0)
sub=subset.Subsetter();sub.populate(text='木村 紀喜');sub.subset(ft);ft.save(smallFont)
font=bpy.data.fonts.load(str(smallFont));latin=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')
text_mesh('NameplateInscription','木村 紀喜',font,(0,.012,.0037),(0,0,0),.058,dark,panel,.0008)
text_mesh('NameplateRoman','T O S H I K I   K I M U R A',latin,(0,-.029,.0037),(0,0,0),.0135,bronze,panel,.00045)
# Brass library lamp. The metal shade has wall thickness and a separate lumen,
# with a hinged trunnion, a cord and a pull chain made from actual segments.
lamp=group('Lamp',root,(1.035,.087,.806),(0,0,.08),studyAction='lamp')
L=Mesh('LampBaseAndArm',lamp)
L.lathe((0,0,0),[(.104,0),(.117,.004),(.120,.013),(.118,.020),(.107,.025),(.102,.033),(.074,.040),(.065,.048),(.042,.051),(.038,.062)],brass,38,scale=(1,.83))
L.lathe((0,0,.041),[(.042,0),(.041,.015),(.034,.020),(.025,.025),(.027,.030),(.029,.043),(.021,.055),(.018,.063)],bronze,26)
L.tube([(0,0,.090),(.018,.002,.135),(.046,.009,.210),(.064,.016,.286),(.069,.020,.349),(.053,.019,.395),(.025,.016,.431),(-.021,.011,.458),(-.076,.004,.467)],
       [.013,.012,.011,.0105,.010,.010,.010,.009,.008],brass,12)
for z,rad in [(.080,.024),(.097,.021),(.109,.017)]:L.lathe((0,0,z),[(rad,0),(rad,.004)],gilt,16)
L.sphere((-.075,.004,.465),(.021,.021,.021),bronze,18,8)
L.tube([(.025,.076,.012),(.056,.125,.006),(.176,.158,.004),(.241,.174,-.019),(.27,.20,-.21),(.28,.22,-.48)],.0037,dark,7)
L.build()
shade=group('LampShade',lamp,(-.079,.006,.464),studyJoint='local-X')
S=Mesh('EmeraldGlassShade',shade)
profile=[(.014,0),(.026,-.004),(.029,-.013),(.042,-.017),(.070,-.028),(.100,-.047),(.120,-.063),(.138,-.078),(.142,-.087),(.139,-.091)]
# This downward-sweeping shell has a modeled ivory inner surface rather than a
# solid bottom. A separate flared metal lip and a warm bulb are visible below it.
n=38
for k in range(len(profile)-1):
    ra,za=profile[k];rb,zb=profile[k+1]
    for j in range(n):
        a=j*2*math.pi/n;b=(j+1)*2*math.pi/n
        S.poly([(ra*math.cos(a),ra*math.sin(a),za),(rb*math.cos(a),rb*math.sin(a),zb),(rb*math.cos(b),rb*math.sin(b),zb),(ra*math.cos(b),ra*math.sin(b),za)],green)
        if k>1:S.poly([((ra-.002)*math.cos(b),(ra-.002)*math.sin(b),za-.001),((rb-.002)*math.cos(b),(rb-.002)*math.sin(b),zb-.001),((rb-.002)*math.cos(a),(rb-.002)*math.sin(a),zb-.001),((ra-.002)*math.cos(a),(ra-.002)*math.sin(a),za-.001)],inside)
for radius,z,r in [(.14,-.087,.0027),(.136,-.091,.0022),(.029,-.011,.0028)]:
    S.tube([(radius*math.cos(j*2*math.pi/38),radius*math.sin(j*2*math.pi/38),z) for j in range(38)],r,brass,7,True)
S.lathe((0,0,-.009),[(.016,0),(.014,.014),(.008,.021)],brass,18)
for i in range(13):S.sphere((.046,-.007,-.026-i*.0061),(.0025,.0025,.0030),bronze,6,4)
S.lathe((.046,-.007,-.119),[(.003,0),(.008,.004),(.006,.012),(.003,.017)],brass,10)
S.build();B=Mesh('LampBulb',shade);B.sphere((0,0,-.052),(.022,.022,.031),bulb,18,10);B.build()
# Fountain pen, divided cedar tray, glazed tea cup, glass ink bottle, pen pot,
# writing utensils, brush bristles and an ikebana twig sit around the main props.
acc=built('DeskStationery')
def cup(mesh,x,y,z,scale=1):
    profile=[(.035,0),(.039,.003),(.040,.007),(.035,.011),(.044,.016),(.054,.041),(.059,.072),(.059,.083),(.055,.084),(.053,.080),(.049,.049),(.035,.021)]
    mesh.lathe((x,y,z),[(r*scale,h*scale) for r,h in profile],porcelain,30)
    mesh.lathe((x,y,z+.067*scale),[(.053*scale,0),(.053*scale,.0007)],tea,30)
    # Elliptic ear, embedded into shell at both ends.
    pts=[(x+u*scale,y,z+h*scale) for u,h in [(.050,.066),(.066,.073),(.078,.075),(.089,.069),(.092,.058),(.090,.046),(.081,.037),(.066,.034),(.053,.037)]]
    mesh.tube(pts,.0054*scale,porcelain,8)
    mesh.lathe((x,y,z-.005*scale),[(.038*scale,0),(.062*scale,.002*scale),(.079*scale,.006*scale),(.080*scale,.009*scale),(.072*scale,.011*scale)],porcelain,30)
cup(acc,-1.04,.018,.812)
# Long slim pen tray with coved lips, a polished nib and a gold pocket clip.
px=.795;py=-.236
acc.box((px,py,.815),(.295,.109,.017),walnut,.004)
acc.box((px,py,.825),(.273,.084,.004),leather,.001)
for yy in [py-.052,py+.052]:acc.box((px,yy,.833),(.295,.009,.028),walnut,.003)
for xx in [px-.145,px+.145]:acc.box((xx,py,.833),(.009,.109,.028),walnut,.003)
acc.tube([(px-.099,py,.839),(px-.084,py,.839),(px+.052,py,.839),(px+.087,py,.839)],[.004,.0073,.0068,.0033],inkglass,12)
acc.tube([(px+.048,py,.839),(px+.049,py,.839),(px+.058,py,.839)],[.0077,.0077,.0066],brass,10)
acc.poly([(px+.066,py-.004,.843),(px+.081,py-.004,.842),(px+.101,py,.840),(px+.080,py+.006,.843),(px+.066,py+.005,.844)],gilt)
acc.tube([(px-.085,py-.002,.846),(px-.081,py-.004,.851),(px-.045,py-.003,.849),(px-.042,py-.002,.846)],.0015,brass,6)
# Square glass well with thick glazed shoulder and brass screw cap.
x=-1.008;y=-.172
for z,w,d,h,mat in [(.820,.075,.069,.020,bronze),(.843,.068,.064,.044,inkglass),(.865,.059,.054,.014,inkglass)]:
    acc.box((x,y,z),(w,d,h),mat,.004)
acc.lathe((x,y,.867),[(.021,0),(.021,.006),(.023,.009),(.023,.02),(.019,.023)],brass,23)
acc.box((x,y-.033,.847),(.048,.002,.018),ivory,.001)
x=-.959;y=.282
acc.lathe((x,y,.804),[(.046,0),(.05,.006),(.046,.012),(.046,.097),(.049,.103),(.047,.108),(.040,.107),(.039,.093)],bookmats[1],22)
for j in range(7):
    a=j*2.4;rr=.022+(j%3)*.003
    base=(x+.008*math.cos(a),y+.008*math.sin(a),.857);top=(x+rr*math.cos(a),y+rr*math.sin(a),.971+.014*(j%4))
    acc.tube([base,top],.0036,bookmats[j],7)
    acc.tube([top,(top[0]+.004*math.cos(a),top[1]+.004*math.sin(a),top[2]+.015)],[.0036,.0007],vein,7)
# Traditional ceramic bottle vase and individual crimson maple sprays.
x=-1.108;y=.253
acc.lathe((x,y,.805),[(.026,0),(.034,.005),(.047,.026),(.052,.060),(.048,.094),(.034,.111),(.019,.129),(.017,.162),(.023,.169),(.023,.173),(.016,.173)],bookmats[2],30)
for i in range(3):
    a=i*2.24
    stem=[(x,y,.957),(x+.023*math.cos(a),y+.020*math.sin(a),1.018),(x+.063*math.cos(a),y+.07*math.sin(a),1.077+i*.025)]
    acc.tube(stem,[.0028,.002,.0008],bark,6)
    for j in range(5):
        t=(j+1)/6;c=Vector(stem[1]).lerp(Vector(stem[2]),t)
        vx=.020*math.cos(a+j*2.6);vy=.020*math.sin(a+j*2.6);end=c+Vector((vx,vy,.009))
        acc.tube([c,end],.0008,bark,5)
        pts=[tuple(end)]
        for k in range(12):
            angle=k*math.pi/6+a;r=.016 if k%2==0 else .006;pts.append((end.x+r*math.cos(angle),end.y+r*math.sin(angle),end.z+.006*math.cos(angle)))
        acc.geom(pts,[(0,k+1,(k+1)%12+1) for k in range(12)],leaves[(i+j)%len(leaves)])
acc.build()
for name,position in {
    'SocketResearch':(-.65,.24,.805),'SocketProfile':(-.17,.24,.805),
    'SocketPhotos':(.32,.22,.805),'SocketBank':(.76,.23,.805),
    'SocketCat':(-.55,-.27,.010),'CameraSeat':(0,-2.42,1.49),'CameraTarget':(0,.065,.80),
}.items():group(name,root,position)
bpy.context.view_layer.update()
out=args.output;out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_extras=True,
    export_animations=False,export_morph=True,export_morph_normal=False,export_lights=False,export_cameras=False,
    export_image_format='JPEG',export_image_quality=84,export_jpeg_quality=84)
print('STUDY MODEL',out,out.stat().st_size,flush=True)
if args.blend:
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))
if args.preview:
    # Renderer lights/cameras are only for proof renders. Runtime supplies its own
    # clock-dependent lighting; this rig is never embedded in the delivery GLB.
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
    scene.cycles.max_bounces=4;scene.cycles.diffuse_bounces=2;scene.cycles.glossy_bounces=2;scene.cycles.sample_clamp_indirect=2.0
    scene.world=bpy.data.worlds.new('Morning sky');scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.71,.81,1,1);bg.inputs[1].default_value=.56
    def area(name,p,target,power,size,color):
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=color
        obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=p;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Light from the window',(-2.45,-.73,2.55),(.27,.15,.67),190,2.1,(1,.84,.63))
    area('Warm ceiling bounce',(.44,-.80,2.72),(0,0,.8),50,1.9,(1,.86,.70))
    area('Window fill',(-.90,-1.38,1.90),(0,0,.72),40,1.5,(.78,.86,1))
    area('Lamp glow',(1.00,.085,1.13),(.84,-.02,.80),2.8,.12,(1,.72,.40))
    sun=bpy.data.lights.new('Sun','SUN');sun.energy=1.75;sun.angle=.10;sun.color=(1,.85,.64)
    sunObj=bpy.data.objects.new('Sun',sun);bpy.context.collection.objects.link(sunObj);sunObj.rotation_euler=(.65,-.67,-.72)
    camera=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camera);bpy.context.collection.objects.link(cam);scene.camera=cam
    scene.render.resolution_x=960;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=89
    args.preview.mkdir(parents=True,exist_ok=True)
    def shot(name,at,target,lens):
        cam.location=at;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        camera.lens=lens;camera.sensor_width=36;scene.render.filepath=str(args.preview/(name+'.jpg'));bpy.ops.render.render(write_still=True)
    shot('study-seated',(0,-2.42,1.49),(0,.065,.80),30)
    shot('study-oblique',(-1.1,-1.63,1.29),(.10,.08,.90),28)
    shot('study-nameplate',(-.71,-.86,1.05),(-.83,-.24,.87),55)
    coverRoot.rotation_euler.y=-3.095;coverRoot.location.z-=.021
    leafRoot.rotation_euler.y=-2.04;leafRoot.location.z-=.009;shape.value=.87
    flaproot.rotation_euler.x=-1.99;bpy.data.objects['Drawer'].location.y-=.31
    shot('study-hinges',(-.42,-1.35,1.43),(-.13,-.07,.76),40)
