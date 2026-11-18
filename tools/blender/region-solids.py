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

def path_tube(batch, points, radii, tint, sides=7):
    """Parallel-transport rings along the branch without the seams of stacked cylinders."""
    rings=[];previous=None
    for i,(p,radius) in enumerate(zip(points,radii)):
        t=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        if previous is None:
            previous=t.cross(Vector((0,0,1)) if abs(t.z)<.88 else Vector((1,0,0))).normalized()
        previous=(previous-t*t.dot(previous)).normalized()
        side=t.cross(previous)
        for j in range(sides):
            a=TAU*j/sides
            rings.append(tuple(p+(previous*math.cos(a)+side*math.sin(a))*radius*(1+.035*math.sin(a*5+.21*i))))
    faces=[];colors=[]
    for i in range(len(points)-1):
        for j in range(sides):
            k=i*sides;jj=(j+1)%sides
            faces.append((k+j,k+jj,k+jj+sides,k+j+sides))
            colors.append(tone(tint,.87+.14*math.sin(j*2.45+i*.31)))
    base=(len(points)-1)*sides
    faces.extend([tuple(reversed(range(sides))),tuple(base+i for i in range(sides))]);colors.extend([tint,tint])
    batch.part(rings,faces,colors,True)

def leaf(batch,stem,angle,rise,length,width,roll,tint):
    # Real cupped leaves whose petiole, two shoulders, midrib and tip are in
    # different planes. No transparent foliage cards, opaque hulls or crown shells.
    aim=Vector((math.cos(angle),math.sin(angle),rise)).normalized()
    across=Vector((-math.sin(angle),math.cos(angle),0))
    across=across*math.cos(roll)+aim.cross(across)*math.sin(roll)
    p=Vector(stem);end=p+aim*length;end.z-=length*.10
    heart=p+aim*(length*.49);heart.z+=width*.31
    left=p+aim*(length*.34)+across*width;right=p+aim*(length*.38)-across*(width*.95)
    verts=[tuple(v) for v in [p,left,end,right,heart]]
    batch.part(verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],tint,True)

def needle(batch,p,a,rise,length,width,tint):
    c,s=math.cos(a),math.sin(a)
    start=Vector(p);mid=start+Vector((c*length*.47,s*length*.47,rise*length*.53))
    end=start+Vector((c*length,s*length,(rise-.14)*length))
    side=Vector((-s*width,c*width,width*.22))
    batch.part([tuple(start),tuple(mid+side),tuple(end),tuple(mid-side)],[(0,1,2),(0,2,3)],tint,True)

def distant_spray(crown,points,pine,tint):
    """Represent a terminal spray with a few leaves at its original positions."""
    stride=4 if pine else 5
    count=len(points)//stride
    shades=(.66,.88,.75,.98) if pine else (.72,.92,.78)
    for sample,shade in enumerate(shades):
        start=(sample*count//len(shades)+count//9)*stride
        stem,left,tip,right=map(Vector,points[start:start+4])
        axis=tip-stem
        center=stem+axis*.45
        wing=(left-right)*(5.4 if pine else 1.38)
        vertices=[center+axis*.69,center-axis*.53+wing,center-axis*.53-wing]
        crown.part([tuple(point) for point in vertices],[(0,1,2)],tone(tint,shade))


def tree(pine,variant,barkmat,leafmat,*,distant=False):
    rng=random.Random(20401+variant*167+int(pine)*673)
    prefix='Japanese black pine' if pine else 'Campus avenue tree'
    wood=SolidBatch(prefix+' · tapered trunk and live branches '+str(variant))
    crown=SolidBatch(prefix+' · outer leaf sprays '+str(variant))
    fill=SolidBatch(prefix+' · inner leaf sprays '+str(variant))
    tips=SolidBatch(prefix+' · fine growing branchlets '+str(variant))
    proxy=SolidBatch('Distant tree crown '+str(variant)) if distant else None
    bark=srgb('#715a49' if pine else ['#776c58','#786d59','#82755e'][variant])
    twig=srgb('#5d6249' if pine else '#6c624a')
    palette=(['#3f6041','#50764f','#5c7b4d','#6a8752','#789060'] if pine else [
        ['#688044','#8a9a49','#a4a957','#c1aa57','#b9ac57','#c6b66a'],
        ['#4c713d','#668445','#809648','#94a357','#a5aa61','#80964f'],
        ['#978446','#ac8f46','#b99950','#c2a05a','#c1a15b','#d1b367'],
    ][variant])
    tones=list(map(srgb,palette))
    def radial(a,r,z):return Vector((math.cos(a)*r,math.sin(a)*r,z))
    def twigpath(start,end,bend,n=5):
        d=end-start
        return [start+d*(i/(n-1))+bend*(4*i/(n-1)*(1-i/(n-1))) for i in range(n)]
    def limb(points,radius,tip,shade,sides=6):
        radii=[tip+(radius-tip)*(1-i/(len(points)-1))**.85 for i in range(len(points))]
        path_tube(wood,points,radii,shade,sides)
    if pine:
        trunk=[Vector(v) for v in [(0,0,0),(-.12,.02,.63),(-.30,.10,1.38),(-.17,.17,2.04),(.26,.20,2.71),(.57,.09,3.39),(.67,.05,4.17),(.99,-.08,4.87),(1.23,-.05,5.51)]]
    else:
        trunk=[Vector(v) for v in [(0,0,0),(.02,-.02,.66),(-.025,-.03,1.35),(.016,.025,1.98),(.12,.03,2.79),(.15,.11,3.65),(.23,.13,4.76),(.34,.23,5.64),(.43,.32,6.62),(.50,.49,7.08)]]
    if variant==1:
        for p in trunk:p.x*=1.28;p.y-=.05*p.z
    limb(trunk,.205 if pine else .217,.014,bark,12)
    # Subtle root flaring and intermittent lichen follow the bole, keeping the
    # ground profile of a street tree rather than a ring of radiating cones.
    for j in range(5):
        a=TAU*j/5+rng.uniform(-.28,.28)
        root=[radial(a,.13,.51),radial(a,.17,.27),radial(a+.05,.26,.09),radial(a+.11,.40,.013)]
        limb(root,.061,.018,tone(bark,.86),7)
    def shoot(base,axis,full_length,cluster_tone,scale):
        angle=axis+rng.uniform(-.31,.31);slope=rng.uniform(-.12,.56) if pine else rng.uniform(-.55,.85)
        end=base+radial(angle,full_length,slope*full_length)
        mid=(base+end)*.5+radial(angle+.8,.055,.072)
        # The twig is part of the same continuously visible solid as the tree.
        # Thin terminal rachises use triangular sections for fast instanced drawing.
        tips.taper(base,end,.009,.0021,twig,3)
        for j in range(7 if pine else 6):
            f=.10+.136*j
            at=base.lerp(mid,f*2) if f<.5 else mid.lerp(end,(f-.5)*2)
            if pine:
                for h in range(6):
                    dest=crown if (j+h)%3==0 else fill
                    a=angle+(h-2.5)*.39+rng.uniform(-.35,.35);pitch=rng.uniform(-.30,.91)
                    needle(dest,at,a,pitch,rng.uniform(.13,.27)*scale,rng.uniform(.006,.014)*scale,tone(cluster_tone,rng.uniform(.77,1.31)))
            else:
                for side in (-1,1):
                    a=angle+side*rng.uniform(.53,1.38)
                    dest=crown if (j+side+4)%3==0 else fill
                    length=rng.uniform(.113,.190)*scale*(1.12 if dest is crown else 1)
                    tilt=rng.uniform(-.84,.84);pitch=slope+rng.uniform(-.65,.44)
                    leaf(dest,at,a,pitch,length,length*rng.uniform(.26,.37),tilt,tone(cluster_tone,rng.uniform(.80,1.21)))
    count=8 if pine else 9
    for j in range(count):
        f=j/(count-1);a=j*2.40+rng.uniform(-.37,.37)
        i=2+int(f*(len(trunk)-5));start=trunk[i].lerp(trunk[i+1],rng.uniform(.05,.52))
        reach=(2.4 if pine else 2.7)*(1-.53*f)*rng.uniform(.87,1.17)
        rise=(.65 if pine else 1.47)+(1-f)*(.23 if pine else .57)
        outer=start+radial(a,reach,rise)
        arch=radial(a+.69,reach*.15,-.21 if pine else .26)
        arm=twigpath(start,outer,arch,7)
        limb(arm,(.107 if pine else .125)*(1-f*.43),.016,bark,8)
        for k in range(5):
            t=.20+.15*k;pos=t*(len(arm)-1);ik=int(pos);sub=arm[ik].lerp(arm[ik+1],pos-ik)
            turn=a+(1 if k%2 else -1)*rng.uniform(.47,1.28)
            span=(.69+reach*.28)*rng.uniform(.77,1.22)
            end=sub+radial(turn,span,rng.uniform(.08,.39) if pine else rng.uniform(.40,1.04))
            sec=twigpath(sub,end,radial(turn-.65,.10,.09),5);limb(sec,.047*(1-.38*t),.0095,tone(bark,1.07),6)
            for l in range(4):
                u=.27+.215*l;iv=min(3,int(u*4));part=sec[iv].lerp(sec[iv+1],u*4-iv)
                angle=turn+(-1 if l%2 else 1)*rng.uniform(.63,1.26)
                reach3=rng.uniform(.39,.78)
                tip=part+radial(angle,reach3,rng.uniform(-.12,.27) if pine else rng.uniform(.09,.66))
                third=twigpath(part,tip,radial(angle+.92,.051,.055),3)
                path_tube(tips,third,[.022,.012,.0046],twig,4)
                local=tones[(variant+rng.randrange(len(tones)))%len(tones)]
                if proxy:
                    outer_start=len(crown.v)
                for n in range(4):
                    u=.13+.25*n;tipbase=third[0].lerp(third[1],u*2) if u<.5 else third[1].lerp(third[2],(u-.5)*2)
                    shoot(tipbase,angle+(-1 if n%2 else 1)*rng.uniform(.49,1.26),rng.uniform(.28,.56) if pine else rng.uniform(.34,.64),local,rng.uniform(.90,1.13))
                if proxy:
                    distant_spray(proxy,crown.v[outer_start:],pine,local)
    if proxy:
        obj=proxy.finish(leafmat)
        obj['treeProxy']=variant
        return obj
    return wood.finish(barkmat),crown.finish(leafmat),fill.finish(leafmat),tips.finish(barkmat)
