"""Small, solid models for the open-world Blender scenes. Coordinates are Z-up."""
import math
import random
import bpy
from mathutils import Vector

TAU=2*math.pi

def srgb(value):
    value=value.lstrip('#')
    def linear(byte):
        v=int(byte,16)/255
        return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    return tuple(linear(value[i:i+2]) for i in (0,2,4))

def tone(rgb,gain):
    return tuple(min(1,max(0,c*gain)) for c in rgb)

class SolidBatch:
    def __init__(self,name):
        self.name=name;self.v=[];self.polys=[];self.colors=[];self.smooth=[]
    def part(self,verts,faces,color,smooth=False):
        first=len(self.v);self.v.extend(verts)
        for i,face in enumerate(faces):
            self.polys.append(tuple(first+k for k in face))
            self.colors.append(color[i] if isinstance(color,list) else color)
            self.smooth.append(smooth)
    def box(self,center,size,color,angle=0):
        x,y,z=center;w,d,h=(v/2 for v in size);co=math.cos(angle);si=math.sin(angle)
        v=[(x+xx*co-yy*si,y+xx*si+yy*co,z+zz) for zz in (-h,h) for xx,yy in [(-w,-d),(w,-d),(w,d),(-w,d)]]
        self.part(v,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],color)
    def taper(self,a,b,r0,r1,clr,n=7):
        a,b=Vector(a),Vector(b);direction=(b-a).normalized()
        tangent=direction.cross(Vector((0,0,1)) if abs(direction.z)<.83 else Vector((1,0,0))).normalized()
        bitangent=direction.cross(tangent)
        ring=[tangent*math.cos(j*TAU/n)+bitangent*math.sin(j*TAU/n) for j in range(n)]
        v=[tuple(p+normal*r) for p,r in [(a,r0),(b,r1)] for normal in ring]
        f=[tuple(reversed(range(n))),tuple(n+j for j in range(n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        self.part(v,f,clr,True)
    def tuft(self,center,rad,clr,rng,n=7):
        x,y,z=center;rx,ry,rz=rad;v=[];ang=rng.random()*TAU
        for height,ratio in [(-.77,.39),(-.19,.86),(.27,1),(.65,.64)]:
            for j in range(n):
                a=ang+TAU*(j+rng.uniform(-.14,.14))/n;k=ratio*rng.uniform(.79,1.15)
                v.append((x+math.cos(a)*rx*k,y+math.sin(a)*ry*k,z+rz*(height+rng.uniform(-.16,.16))))
        low=len(v);v.extend([(x,y,z-rz),(x+rx*.14,y+ry*.15,z+rz)])
        fs=[(low,(j+1)%n,j) for j in range(n)]
        cs=[tone(clr,rng.uniform(.37,.54)) for _ in range(n)]
        for k in range(3):
            for j in range(n):
                fs.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
                cs.append(tone(clr,rng.uniform(.64,1.13)*(.75+.11*k)))
        fs.extend([(n*3+j,n*3+(j+1)%n,low+1) for j in range(n)])
        cs.extend([tone(clr,rng.uniform(.90,1.25)) for _ in range(n)])
        self.part(v,fs,cs,True)
    def blade(self,x,y,z,angle,pitch,length,width,color):
        # Four folded surfaces meet at a real vein. Blades remain visible in
        # silhouette from the sides and can cast dappled shadows through the crown.
        c,s=math.cos(angle),math.sin(angle);delta=(c*length,s*length,pitch*length)
        mid=(x+c*length*.48,y+s*length*.48,z+delta[2]*.45)
        v=[(x,y,z),(mid[0]-s*width,mid[1]+c*width,mid[2]),(x+delta[0],y+delta[1],z+delta[2]),(mid[0]+s*width,mid[1]-c*width,mid[2]),(mid[0],mid[1],mid[2]+width*.40)]
        self.part(v,[(0,4,1),(1,4,2),(2,4,3),(3,4,0)],color)
    def finish(self,material,parent=None):
        if not self.v: return None
        m=bpy.data.meshes.new(self.name);m.from_pydata(self.v,[],self.polys);m.update()
        m.materials.append(material)
        color=m.color_attributes.new(name='Pigment',type='BYTE_COLOR',domain='CORNER')
        for f,col,smo in zip(m.polygons,self.colors,self.smooth):
            f.use_smooth=smo
            for k in f.loop_indices: color.data[k].color=(*col,1)
        obj=bpy.data.objects.new(self.name,m);bpy.context.collection.objects.link(obj)
        if parent:obj.parent=parent
        return obj

def tree(pine,variant,mat):
    rng=random.Random(7841+variant*71+int(pine)*73)
    tree=SolidBatch(('Black pine' if pine else 'Avenue tree')+' structure '+str(variant))
    detail=SolidBatch(('Pine sprays' if pine else 'Cupped leaves')+' '+str(variant))
    bark=srgb('#735942' if pine else '#726050')
    if pine:
        palette=['#3f6243','#456c48','#587651','#4f7050']
        path=[(0,0,0),(-.31,.06,.98),(-.19,.13,2.1),(.32,.17,2.9),(.81,.02,3.68),(1.01,.04,4.62),(1.15,.16,5.23)]
    else:
        palette=[['#707c42','#9e9144','#aba34e','#9a8e48'],['#657b42','#81914b','#939e4e','#ac9c54'],['#9b773c','#b48643','#b99a4e','#98723e']][variant%3]
        path=[(0,0,0),(.07,-.02,1.4),(-.05,.1,2.65),(.19,.06,3.75),(.12,.22,5.09),(.31,.16,6.02),(.44,.11,7.08)]
    greens=list(map(srgb,palette))
    for i in range(1,len(path)):
        tree.taper(path[i-1],path[i],.31-(i-1)*.044,.31-i*.044,bark,10)
    for j in range(7):
        ang=j*TAU/7
        tree.taper((.05,0,.56),(math.cos(ang)*.54,math.sin(ang)*.54,.027),.14,.041,tone(bark,.85),7)
    branches=12 if pine else 16
    for j in range(branches):
        f=j/(branches-1);ang=(j*2.399+rng.uniform(-.45,.45))
        by=(1.68+f*(2.98 if pine else 4.61))
        reach=(2.57 if pine else 2.93)*(1-f*.71)*rng.uniform(.83,1.16)
        r=path[1+min(4,int(f*5))];origin=Vector(r)
        elbow=Vector((origin.x+reach*.46*math.cos(ang),origin.y+reach*.46*math.sin(ang),by-(.43 if pine else .78)))
        end=Vector((origin.x+reach*math.cos(ang),origin.y+reach*math.sin(ang),by+.36))
        tree.taper(origin,elbow,.142*(1-f*.56),.086*(1-f*.49),bark,8)
        tree.taper(elbow,end,.089*(1-f*.47),.032,bark,7)
        for k in range(4):
            t=ang+(k-1.5)*.79+rng.uniform(-.29,.29)
            fork=end+Vector((math.cos(t)*rng.uniform(.28,.91),math.sin(t)*rng.uniform(.28,.91),rng.uniform(.06,.48 if pine else 1.04)))
            tree.taper(end,fork,.042,.013,bark,5)
            r0=rng.uniform(.49,.91)*(1-f*.20);ry=r0*rng.uniform(.65,1)
            rz=r0*(rng.uniform(.32,.49) if pine else rng.uniform(.69,1.05))
            col=rng.choice(greens)
            tree.tuft(fork,(r0*.81,ry*.87,rz*.84),col,rng,7)
            for lf in range(44 if pine else 34):
                a=rng.random()*TAU;v=rng.uniform(-1,1);k2=math.sqrt(1-v*v)*(rng.uniform(.77,1.37))
                x=fork.x+math.cos(a)*r0*k2;y=fork.y+math.sin(a)*ry*k2;z=fork.z+v*rz*rng.uniform(.68,1.2)
                if pine:
                    for h in range(2):
                        detail.blade(x,y,z,a+rng.uniform(-1.17,1.17),rng.uniform(-.31,.80),rng.uniform(.17,.35),rng.uniform(.029,.047),tone(col,rng.uniform(.83,1.43)))
                else:
                    detail.blade(x,y,z,a+rng.uniform(-.78,.78),rng.uniform(-.68,.83),rng.uniform(.15,.32),rng.uniform(.060,.093),tone(col,rng.uniform(.79,1.44)))
    wood=tree.finish(mat);leaves=detail.finish(mat)
    return wood,leaves
