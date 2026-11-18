"""Small Blender mesh builder, using metres and Blender Z up."""
import bpy
import math
from mathutils import Vector

def group(name, parent=None, loc=(0, 0, 0), rotation=(0, 0, 0), **extras):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent, obj.location, obj.rotation_euler = parent, loc, rotation
    obj.empty_display_size = .06
    for key, val in extras.items(): obj[key] = val
    return obj

def linear(x):
    x = x/255
    return x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4

def material(name, color, rough=.62, metal=0, image=None, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    rgba = tuple(linear(int(color[i:i+2],16)) for i in (0,2,4))+(1.,)
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = rgba
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    mat.diffuse_color = rgba
    mat['surface_texture'] = bool(image)
    if emission:
        bs.inputs['Emission Color'].default_value=rgba
        bs.inputs['Emission Strength'].default_value=emission
    if image:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image=bpy.data.images.load(str(image), check_existing=True)
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    return mat

class Mesh:
    def __init__(self,name,parent=None):
        self.name=name; self.parent=parent
        self.vertices=[];self.faces=[];self.uv=[];self.slots=[];self.material=[];self.smooth=[]
    def geom(self, verts, faces, mat, uvs=None, smooth=False, vertical=False):
        start=len(self.vertices)
        self.vertices.extend(tuple(p) for p in verts)
        if mat not in self.slots: self.slots.append(mat)
        slot=self.slots.index(mat)
        for i,face in enumerate(faces):
            if len(face)<3: continue
            self.faces.append(tuple(start+j for j in face))
            self.material.append(slot)
            self.smooth.append(smooth[i] if isinstance(smooth,list) else smooth)
            if uvs is not None:
                self.uv.append(uvs[i]); continue
            if not mat.get('surface_texture'):
                self.uv.append([(0,0)]*len(face)); continue
            p,q,r=[Vector(verts[j]) for j in face[:3]]
            normal=(q-p).cross(r-p)
            major=max(range(3),key=lambda k:abs(normal[k]))
            axes=[(1,2),(0,2),(0,1)][major]
            if vertical and major!=2: axes=axes[::-1]
            self.uv.append([(verts[j][axes[0]]*1.25,verts[j][axes[1]]*1.85) for j in face])
    def poly(self,points,mat,uv=None):
        self.geom(points,[list(range(len(points)))],mat,[uv] if uv else None)
    def quad(self,corners,mat,uv=((0,0),(1,0),(1,1),(0,1))):self.poly(corners,mat,uv)
    def box(self,center,size,mat,bevel=0,vertical=False):
        x,y,z=center; w,d,h=size; r=min(bevel,w*.22,d*.22,h*.22)
        if r<.00135:
            vs=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sz in (-1,1) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            fs=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
            self.geom(vs,fs,mat,vertical=vertical); return
        # Milled corners and a lip with a true rounded profile on all six faces.
        points=[]; faces=[]
        small = r < .0045
        segments=2 if small else 3
        n=4*segments
        levels=[(-h/2,r),(-h/2+r,0),(h/2-r,0),(h/2,r)] if small else [(-h/2,r),(-h/2+r*.32,r*.32),(-h/2+r,0),(h/2-r,0),(h/2-r*.32,r*.32),(h/2,r)]
        for zz,inset in levels:
            rr=max(r*.25,r*1.8-inset)
            for sx,sy,a in [(1,1,0),(-1,1,90),(-1,-1,180),(1,-1,270)]:
                cx=x+sx*(w/2-inset-rr); cy=y+sy*(d/2-inset-rr)
                for k in range(segments):
                    angle=math.radians(a+k*90/(segments-1));points.append((cx+rr*math.cos(angle),cy+rr*math.sin(angle),z+zz))
        faces.append(tuple(range(n-1,-1,-1)))
        faces.extend((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(len(levels)-1) for i in range(n))
        faces.append(tuple(range(n*(len(levels)-1),n*len(levels))));self.geom(points,faces,mat,vertical=vertical)
    def lathe(self,center,profile,mat,n=24,scale=(1,1)):
        x,y,z=center; vs=[];fs=[];sm=[]
        for radius,height in profile:
            for j in range(n):
                t=j*2*math.pi/n;vs.append((x+radius*scale[0]*math.cos(t),y+radius*scale[1]*math.sin(t),z+height))
        for k in range(len(profile)-1):
            for j in range(n):
                fs.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j));sm.append(True)
        fs.extend([tuple(range(n-1,-1,-1)),tuple(range(len(vs)-n,len(vs)))]);sm.extend([False,False]);self.geom(vs,fs,mat,smooth=sm)
    def tube(self,path,radius,mat,n=8,closed=False):
        points=[Vector(p) for p in path];vs=[];fs=[];old=None
        for i,p in enumerate(points):
            a=points[i-1] if (i or closed) else p
            b=points[(i+1)%len(points)] if (i+1<len(points) or closed) else p
            tangent=(b-a).normalized()
            if old is None or abs(old.dot(tangent))>.97:
                axis=Vector((0,0,1)) if abs(tangent.z)<.90 else Vector((0,1,0))
                normal=tangent.cross(axis).normalized()
            else:normal=(old-tangent*old.dot(tangent)).normalized()
            old=normal; other=tangent.cross(normal).normalized()
            r=radius[i] if isinstance(radius,list) else radius
            for j in range(n):
                t=j*2*math.pi/n;vs.append(p+r*(normal*math.cos(t)+other*math.sin(t)))
        for i in range(len(points) if closed else len(points)-1):
            for j in range(n):fs.append((i*n+j,i*n+(j+1)%n,((i+1)%len(points))*n+(j+1)%n,((i+1)%len(points))*n+j))
        if not closed:fs.extend([tuple(range(n-1,-1,-1)),tuple(range(len(vs)-n,len(vs)))])
        self.geom(vs,fs,mat,smooth=True)
    def sphere(self,center,radii,mat,n=14,rings=8):
        x,y,z=center;rx,ry,rz=radii;vs=[];fs=[]
        for k in range(rings+1):
            p=-math.pi/2+k*math.pi/rings
            for j in range(n):
                t=j*2*math.pi/n;vs.append((x+rx*math.cos(p)*math.cos(t),y+ry*math.cos(p)*math.sin(t),z+rz*math.sin(p)))
        for k in range(rings):
            for j in range(n):fs.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
        self.geom(vs,fs,mat,smooth=True)
    def build(self):
        geo=bpy.data.meshes.new(self.name)
        geo.from_pydata(self.vertices,[],self.faces);geo.update()
        for mat in self.slots:geo.materials.append(mat)
        uv=geo.uv_layers.new(name='Surface')
        for i,p in enumerate(geo.polygons):
            p.material_index=self.material[i];p.use_smooth=self.smooth[i]
            for j,value in zip(p.loop_indices,self.uv[i]):uv.data[j].uv=value
        obj=bpy.data.objects.new(self.name,geo); bpy.context.collection.objects.link(obj);obj.parent=self.parent
        return obj

def text_mesh(name,text,font,center,rot,size,mat,parent,depth=.0006,align='CENTER'):
    curve=bpy.data.curves.new(name,'FONT');curve.body=text;curve.font=font;curve.size=size
    curve.align_x=align;curve.align_y='CENTER';curve.extrude=depth;curve.resolution_u=3
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj)
    obj.parent=parent;obj.location=center;obj.rotation_euler=rot;obj.data.materials.append(mat)
    bpy.context.view_layer.update()
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=bpy.data.meshes.new_from_object(evaluated)
    result=bpy.data.objects.new(name+'.mesh',mesh);bpy.context.collection.objects.link(result)
    result.parent=parent;result.location=center;result.rotation_euler=rot
    bpy.data.objects.remove(obj,do_unlink=True);result.name=name
    return result
