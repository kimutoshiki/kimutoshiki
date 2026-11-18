"""Blender finishing of the site's three architectural landmark maquettes."""
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

# Also supports executing this source directly from Blender's Text Editor.
module_directory = str(Path(__file__).resolve().parent)
if module_directory not in sys.path:
    sys.path.insert(0, module_directory)
from study_mesh import Mesh, material


def xyz(p):
    """Model dimensions are X across, Y high and Z towards the main façade."""
    x, y, z = p
    return (x, -z, y)


def rod(mesh, path, radius, mat, sides=6, closed=False):
    mesh.tube([xyz(p) for p in path],radius,mat,n=sides,closed=closed)


def box(mesh, center, dimensions, mat):
    w,h,d=dimensions
    mesh.box(xyz(center),(w,d,h),mat)


def oval(mesh, center, size, mat, around=12, bands=6):
    """Closed ellipsoid with one vertex per pole, including very small cast eyes."""
    cx,cy,cz=center
    rx,ry,rz=size
    points=[xyz((cx,cy-ry,cz))]
    rings=[]
    for j in range(1,bands):
        phi=-pi/2+pi*j/bands
        ring=[]
        for k in range(around):
            a=2*pi*k/around
            ring.append(len(points))
            points.append(xyz((cx+rx*cos(phi)*cos(a), cy+ry*sin(phi), cz+rz*cos(phi)*sin(a))))
        rings.append(ring)
    top=len(points)
    points.append(xyz((cx,cy+ry,cz)))
    faces=[]
    for k in range(around):
        n=(k+1)%around
        faces.append((0,rings[0][k],rings[0][n]))
        for low,high in zip(rings,rings[1:]):
            faces.append((low[k],high[k],high[n],low[n]))
        faces.append((top,rings[-1][n],rings[-1][k]))
    mesh.geom(points,faces,mat,smooth=True)


def horizontal_bead(mesh, center, radius, gauge, mat):
    x,y,z=center
    points=[(x+radius*cos(i*2*pi/22),y,z+radius*sin(i*2*pi/22)) for i in range(22)]
    rod(mesh,points,gauge,mat,5,True)


def darken_portal_grilles(scene, iron):
    # Only the original lower gate, set forward of each arched stone reveal,
    # receives iron. Its many diagonal bars retain their native geometry.
    for obj in scene.objects:
        if obj.type!='MESH':
            continue
        mesh=obj.data
        bounds=[obj.matrix_world@v.co for v in mesh.vertices]
        eligible={i for i,(x,y,z) in enumerate(bounds)
                  if -5.825<y<-5.712 and .55<z<3.54
                  and min(abs(x-j) for j in (-3.,2.,7.))<1.38}
        if not eligible:
            continue
        polygons=[p for p in mesh.polygons if all(i in eligible for i in p.vertices)]
        if polygons:
            slot=len(mesh.materials)
            mesh.materials.append(iron)
            for p in polygons:p.material_index=slot


def replace_belfry_masonry(scene):
    # Remove the old square pinnacles, horizontal upper fence, roof slab and
    # its window surrounds. The structural floor and moving clockwork remain.
    for obj in list(scene.objects):
        if obj.type!='MESH':continue
        limits=[obj.matrix_world@v.co for v in obj.data.vertices]
        region={i for i,p in enumerate(limits)
                if p.z>21.24 and 2.29<max(abs(p.x+9.25),abs(p.y+2.5))<3.4}
        heights={round(limits[i].z,3) for i in region}
        if not heights.intersection({28.695,28.555,22.665,26.73}):
            continue
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in region],context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()

    ivory=material('Tower dressed ivory limestone','d6cdb9',.79)
    edge=material('Tower pale cut stone arris','e3d9c6',.76)
    deck=material('Belfry recessed weathered roof','676a5c',.84)
    body=Mesh('Raked stone corner fins and recessed Gothic bell chamber')
    box(body,(-9.25,26.425,2.5),(4.77,.19,4.77),deck)

    # Triangulate one chamber elevation with true punched openings. Each bay
    # has two lancets, an upper quatrefoil and two smaller ones at its foot.
    outer=[(-2.66,21.47),(2.66,21.47),(2.66,26.51)]
    for center in (2.18,1.14,0,-1.14,-2.18):
        outer.extend(((center+.10,26.51),(center+.075,26.72),
                      (center-.075,26.72),(center-.10,26.51)))
    outer.append((-2.66,26.51))
    holes=[]
    for bay in (-1.20,1.20):
        for sign in (-1,1):
            cx=bay+sign*.505
            lancet=[(cx-.321,23.15),(cx+.321,23.15),(cx+.321,24.95)]
            for j in range(1,9):
                t=j/8
                lancet.append((cx+.321*(1-t*t),24.95+.545*t))
            for j in range(7,-1,-1):
                t=j/8
                lancet.append((cx-.321*(1-t*t),24.95+.545*t))
            holes.append(lancet)
        for cx,cy,r in ((bay,25.88,.271),(bay-.50,22.63,.212),(bay+.50,22.63,.212)):
            clover=[]
            for j in range(32):
                a=2*pi*j/32
                h=r*(.784+.216*cos(4*a))
                clover.append((cx+h*cos(a),cy+h*sin(a)))
            holes.append(clover)
    loops=[outer]+[list(reversed(h)) for h in holes]
    planar=[]; constraints=[];boundaries=[]
    for loop in loops:
        indices=list(range(len(planar),len(planar)+len(loop)));boundaries.append(indices)
        planar.extend(Vector(p) for p in loop)
        constraints.extend(zip(indices,indices[1:]+indices[:1]))
    points,_,triangles,source,_,_=delaunay_2d_cdt(planar,constraints,[],0,1.e-6)
    lookup={index:j for j,indices in enumerate(source) for index in indices}
    def inside(x,y,loop):
        hit=False
        for (x1,y1),(x2,y2) in zip(loop,loop[1:]+loop[:1]):
            if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1:
                hit=not hit
        return hit
    cap=[]
    for face in triangles:
        center=sum((points[i] for i in face),Vector((0,0)))/3
        if inside(*center,outer) and not any(inside(*center,h) for h in holes):
            cap.append(tuple(face))
    for side in range(4):
        c,s=(1,0) if side==0 else (0,1) if side==1 else (-1,0) if side==2 else (0,-1)
        def place(u,h,d):
            return xyz((-9.25+c*u+s*d,h,2.5-s*u+c*d))
        n=len(points)
        verts=[place(u,h,d) for d in (2.57,2.28) for u,h in points]
        faces=list(cap)+[tuple(n+i for i in reversed(f)) for f in cap]
        for boundary in boundaries:
            for a,b in zip(boundary,boundary[1:]+boundary[:1]):
                i,j=lookup[a],lookup[b]
                faces.append((j,i,n+i,n+j))
        body.geom(verts,faces,ivory)

        # Hexagonal sections give the outer fin a projecting, sharply lit
        # nose. Its crest falls steeply towards the centre of each elevation.
        for hand in (-1,1):
            cross=[(2.01,2.40,26.86),(2.80,2.40,28.46),(2.902,2.59,28.695),
                   (2.91,2.85,28.695),(2.81,2.966,28.50),(2.03,2.85,26.90)]
            def fin(points):
                base=[place(hand*u,21.40,d) for u,d,h in points]
                top=[place(hand*(2.53+(u-2.53)*.92),h,2.67+(d-2.67)*.91) for u,d,h in points]
                count=len(points)
                faces=[tuple(range(count)),tuple(reversed(range(count,count*2)))]
                faces.extend((i,i+count,(i+1)%count+count,(i+1)%count) for i in range(count))
                if hand<0:faces=[tuple(reversed(f)) for f in faces]
                body.geom(base+top,faces,ivory)
            fin(cross)
            # Narrow return flutes pick out each tall corner in oblique light.
            fin([(2.631,2.85,28.18),(2.707,2.86,28.33),(2.72,2.97,28.32),
                 (2.675,3.016,28.25),(2.630,2.963,28.17)])

        # One lower blade divides the two bays. Its depth and raked nose
        # are apparent in profile; the roof parapet recedes between the fins.
        ring=[(-.170,2.40,26.72),(.170,2.40,26.72),(.159,2.803,27.31),
              (.041,3.034,27.75),(-.041,3.034,27.75),(-.159,2.803,27.31)]
        count=len(ring)
        vs=[place(u,21.43,d) for u,d,h in ring]+[place(u*.85,h,d) for u,d,h in ring]
        fs=[tuple(range(count)),tuple(reversed(range(count,2*count)))]
        fs.extend((i,i+count,(i+1)%count+count,(i+1)%count) for i in range(count))
        body.geom(vs,fs,edge)
        for bay in (-1.20,1.20):
            for h,depth,thick in ((22.20,2.615,.105),(23.08,2.630,.106)):
                verts=[place(bay+u,h+dy,d) for dy in (-thick/2,thick/2)
                       for u,d in ((-1.042,2.52),(1.042,2.52),(1.042,depth),(-1.042,depth))]
                body.geom(verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],edge)
    return body.build()


def auditorium(scene):
    iron=material('Forged entrance iron','3b443e',.66,.57)
    bronze=material('Bell-founder bronze','8c7959',.53,.67)
    darken_portal_grilles(scene,iron)
    gates=Mesh('Forged gate scrolls, hinge knuckles and paired latch')
    for cx in (-3.,2.,7.):
        for side in (-1,1):
            # The arched fanlight and grille already exist. A mirrored pierced
            # scroll terminates each gate leaf beneath the timber transom.
            for offset in (.30,.82):
                path=[]
                for j in range(21):
                    t=j/20
                    a=pi*(1.09+1.83*t)
                    r=.155*(1.-.75*t)
                    path.append((cx+side*(offset+.14+r*cos(a)),3.12+r*sin(a),5.774))
                rod(gates,path,.020,iron)
                rod(gates,[(cx+side*offset,2.89,5.772),
                           (cx+side*(offset+.013),3.045,5.774),path[0]],.022,iron)
            for y in (1.23,2.51):
                x=cx+side*1.258
                rod(gates,[(x,y-.105,5.778),(x,y+.106,5.778)],.044,iron,8)
                box(gates,(x-side*.049,y,5.760),(.165,.065,.043),iron)
            # Forged bow pull returns into both ends of its backplate.
            x=cx+side*.125
            box(gates,(x,2.27,5.79),(.098,.256,.043),bronze)
            rod(gates,[(x,2.19,5.801),(x,2.205,5.854),
                       (x,2.332,5.854),(x,2.348,5.801)],.020,bronze)

    bells=Mesh('Casting beads, canons and suspended clapper fittings')
    for dx,dz,s in ((-1.08,-.82,1.20),(1.04,-.82,1.04),(-1.08,.87,.88),(1.04,.87,.75)):
        x,z=-9.25+dx,2.5+dz
        for y,r,gauge in ((.079,.384,.015),(.125,.352,.010),(.435,.215,.011),(.478,.206,.010)):
            horizontal_bead(bells,(x,24.55+y*s,z),r*s,gauge*s,bronze)
        # Paired open canons rise from the shoulder to a short forged saddle.
        for sign in (-1,1):
            path=[(x+sign*.125*s,24.55+.686*s,z),
                  (x+sign*.142*s,24.55+.765*s,z),
                  (x+sign*.087*s,24.55+.818*s,z),
                  (x+sign*.034*s,24.55+.800*s,z)]
            rod(bells,path,.023*s,bronze,7)
        box(bells,(x,24.55+.815*s,z),(.36*s,.062*s,.107*s),iron)
        rod(bells,[(x,24.55+.50*s,z),(x,24.55+.041*s,z)],.022*s,iron)
        oval(bells,(x,24.55+.004*s,z),(.075*s,.080*s,.075*s),bronze)
    return gates.build(),bells.build(),replace_belfry_masonry(scene)


def bank():
    limestone=material('Weathered dressed granite arris','bdb8a8',.87)
    brass=material('Oxidised bronze door furniture','88775b',.52,.61)
    lead=material('Dark glazing came','545d54',.62,.43)
    entrances=Mesh('Ionic capital coils, entrance dentils and bronze fittings')
    front=6.05
    for cx in (-10.82,10.82):
        # The façade's long cornice already has blocks. This finer return sits
        # underneath the projecting portico cornice, stopping before its corners.
        for i in range(15):
            x=cx+(i-7)*.25
            box(entrances,(x,5.187,front+1.596),(.097,.098,.107),limestone)
        for side in (-1,1):
            for i in range(4):
                box(entrances,(cx+side*2.012,5.185,front+.92+i*.17),(.086,.097,.094),limestone)
            column=cx+side*1.48
            for hand in (-1,1):
                coil=[]
                for j in range(27):
                    t=j/26
                    angle=pi*(.34+2.73*t)
                    radius=.108*(1.-.85*t)
                    coil.append((column+hand*(.23+radius*cos(angle)),4.58+radius*sin(angle),front+1.467))
                rod(entrances,coil,.014,limestone,5)
            # On the recessed timber doors, two leaf hinges and a bow handle
            # have sufficient depth to read from the pavement at an oblique angle.
            for y in (1.67,3.84):
                x=cx+side*.826
                box(entrances,(x-side*.047,y,front+.288),(.15,.16,.036),brass)
                rod(entrances,[(x,y-.095,front+.315),(x,y+.095,front+.315)],.025,brass,8)
            x=cx+side*.142
            box(entrances,(x,2.75,front+.432),(.112,.296,.050),brass)
            rod(entrances,[(x,2.65,front+.452),(x,2.672,front+.539),
                           (x,2.827,front+.539),(x,2.851,front+.452)],.022,brass,7)

    windows=Mesh('Lead fanlight arcs and solder joints')
    # Three monumental windows face the street; a single one turns the corner.
    for cx,upper,radius,left in ((-6.1,8.15,1.415,False),(0,8.15,1.415,False),
                                 (6.1,8.15,1.415,False),(0,8.08,1.52,True)):
        def facade(u,y,depth):
            return (-14-depth,y,-1.45+u) if left else (cx+u,y,front+depth)
        r=.82*radius
        rod(windows,[facade(r*cos(pi*j/32),upper+r*sin(pi*j/32),.340)
                     for j in range(33)],.014,lead,5)
        for j in range(1,6):
            a=pi*j/6
            pos=facade(r*cos(a),upper+r*sin(a),.355)
            oval(windows,pos,(.027,.027,.021),lead,8,4)
    return entrances.build(),windows.build()


def remove_flat_castings(scene):
    # The source batches these castings into their own material group. Its two
    # small separated islands are the only geometry wholly above this ridge.
    for obj in list(scene.objects):
        if obj.type!='MESH' or not len(obj.data.vertices):
            continue
        limits=[obj.matrix_world@v.co for v in obj.data.vertices]
        if all(p.z>24.65 and abs(p.y)<.151 and 2.18<abs(p.x)<3.59 for p in limits):
            if max(p.z for p in limits)>25.72:
                bpy.data.objects.remove(obj,do_unlink=True)
                continue
        # The old low-relief cheek and scale strokes share a material batch
        # with the building. Their sixteen complete islands sit just outside
        # the two flat castings at a constant offset from the roof centre.
        scale_vertices={i for i,p in enumerate(limits) if
                        .107<abs(p.y)<.172 and 24.812<p.z<25.157
                        and abs(abs(p.x)-2.88)<.309}
        if not scale_vertices:
            continue
        polygons=obj.data.polygons
        if any(any(i in scale_vertices for i in poly.vertices)
               and not all(i in scale_vertices for i in poly.vertices) for poly in polygons):
            continue
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index in scale_vertices],context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()


def castle(scene):
    remove_flat_castings(scene)
    cast=material('Smoked silver-grey shachi casting','787a70',.49,.35)
    edge=material('Worn fin and scale relief','919186',.56,.29)
    tiles=material('Glazed charcoal roof-end relief','58676a',.48,.13)
    lime=material('Whitewashed rafter end grain','cccfca',.81)
    fish=Mesh('Paired three-dimensional horned shachihoko')
    for sign in (-1,1):
        def at(x,y,z):return (sign*(2.88+x),24.68+y,z)
        stations=[(-.444,.208,.060,.081),(-.372,.206,.094,.133),
                  (-.279,.236,.133,.179),(-.164,.249,.150,.192),
                  (-.024,.240,.158,.177),(.116,.304,.146,.155),
                  (.213,.431,.123,.128),(.281,.586,.104,.098),
                  (.334,.724,.085,.072),(.386,.841,.063,.045),
                  (.423,.915,.037,.029)]
        verts=[]; faces=[]; n=14
        for i,(x,y,rx,rz) in enumerate(stations):
            before=stations[max(0,i-1)];after=stations[min(i+1,len(stations)-1)]
            dx,dy=after[0]-before[0],after[1]-before[1]
            length=(dx*dx+dy*dy)**.5
            for j in range(n):
                a=2*pi*j/n
                verts.append(xyz(at(x-rx*dy/length*cos(a),y+rx*dx/length*cos(a),rz*sin(a))))
        for i in range(len(stations)-1):
            for j in range(n):
                a=i*n+j;b=i*n+(j+1)%n
                faces.append((a,b,b+n,a+n))
        faces.append(tuple(reversed(range(n))))
        faces.append(tuple(range(len(verts)-n,len(verts))))
        if sign<0:faces=[tuple(reversed(f)) for f in faces]
        fish.geom(verts,faces,cast,smooth=True)

        def vane(outline,thickness,material):
            # Each fin has two cambered faces and a fine, closed perimeter.
            x=sum(p[0] for p in outline)/len(outline);y=sum(p[1] for p in outline)/len(outline)
            vs=[xyz(at(*p)) for p in outline]
            a=len(vs);vs.append(xyz(at(x,y,thickness)));vs.append(xyz(at(x,y,-thickness)))
            fs=[]
            for j in range(a):
                k=(j+1)%a
                fs.extend(((j,k,a),(k,j,a+1)))
            # Face the first fan towards local +Z on each side of the roof.
            area=sum(u[0]*v[1]-v[0]*u[1] for u,v in zip(outline,outline[1:]+outline[:1]))
            if area*sign<0:fs=[tuple(reversed(f)) for f in fs]
            fish.geom(vs,fs,material,smooth=True)
        vane([(.29,.710,0),(.278,1.087,0),(.367,1.031,0),(.422,.960,0),
              (.533,1.057,0),(.641,1.225,0),(.623,1.024,0),(.558,.855,0),
              (.44,.754,0)],.053,cast)
        vane([(-.12,.356,0),(-.076,.534,0),(-.018,.461,0),(.045,.567,0),
              (.077,.493,0),(.169,.606,0),(.20,.475,0),(.10,.375,0)],.037,edge)
        for side in (-1,1):
            rod(fish,[at(-.244,.308,side*.102),at(-.290,.405,side*.128),
                      at(-.319,.455,side*.151)],[.052,.032,.004],cast,8)
            oval(fish,at(-.292,.287,side*.153),(.051,.048,.038),edge,10,5)
            oval(fish,at(-.304,.29,side*.178),(.025,.026,.018),tiles,9,4)
            rod(fish,[at(-.410,.19,side*.080),at(-.359,.170,side*.129),
                      at(-.291,.187,side*.156)],.013,tiles,6)
            rod(fish,[at(-.19,.34,side*.137),at(-.163,.279,side*.190),
                      at(-.184,.198,side*.172),at(-.222,.17,side*.14)],.013,edge,6)
            for j in range(5):
                x,y,rx,rz=stations[j+4]
                center=at(x,y,side*rz)
                arc=[(center[0]+sign*.036*cos(pi*k/7),
                      center[1]-.038*sin(pi*k/7),center[2]-side*.006) for k in range(8)]
                rod(fish,arc,.008,edge,5)
            rod(fish,[at(.401,.812,side*.040),at(.493,.932,side*.040),
                      at(.593,1.105,side*.017)],.012,edge,6)

    eaves=Mesh('Roof end medallions and square rafter ends')
    # The existing rounded courses and white rafters remain intact. Dress
    # their exposed tips; a handful of crested end tiles stay readable nearby.
    for width,depth,y in ((18.60,15.20,8.82),(18.15,14.15,11.71),(9.10,7.92,22.30)):
        for side in (0,1,2,3):
            span=width if side<2 else depth
            direction=1 if side in (0,2) else -1
            def edge_point(u,h,d):
                return (u*width/2,h,direction*(depth/2+d)) if side<2 else (direction*(width/2+d),h,u*depth/2)
            count=round(span/.47)
            for i in range(2,count-1,2):
                u=2*i/count-1
                height=y+.15+.17*abs(u)**8
                center=edge_point(u,height-.29,-.042)
                box(eaves,center,(.112,.099,.170) if side<2 else (.170,.099,.112),lime)
            ribs=round(span/.415)
            for i in range(3,ribs-2,8):
                u=2*i/ribs-1
                h=y+.15+.17*abs(u)**8-.056
                for blade in range(3):
                    a=2*pi*blade/3
                    swirl=[]
                    for j in range(6):
                        t=j/5;radius=.034*(1-.68*t)
                        angle=a+2.3*t
                        swirl.append(edge_point(u+2*radius*cos(angle)/span,h+radius*sin(angle),.058))
                    rod(eaves,swirl,.005,tiles,4)
    return fish.build(),eaves.build()


def refine_architecture(key,scene):
    """Add genuine modelled details to a single imported landmark scene."""
    existing=tuple(obj for obj in scene.objects if obj.get('architectural_finish')==key)
    if existing:return existing
    if key=='okuma-auditorium':result=auditorium(scene)
    elif key=='karatsu-bank':result=bank()
    elif key=='karatsu-castle':result=castle(scene)
    else:raise ValueError('Unknown architectural landmark '+key)
    for obj in result:obj['architectural_finish']=key
    return result
