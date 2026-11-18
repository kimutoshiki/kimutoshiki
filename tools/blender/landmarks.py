"""Build four original, metre-scaled Blender landmarks from the site's authored
architecture. Blender 4.3.2 and Node are required. From the repository root:
blender -b -t 6 -P tools/blender/landmarks.py -- --render
Use --only NAME for one model and --blend-dir DIR for editable Blender files.
"""
import argparse
import importlib.util
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, Matrix

sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
NAMES=('okuma-auditorium','okuma-statue','karatsu-castle','karatsu-bank')
parser=argparse.ArgumentParser()
parser.add_argument('--only',choices=NAMES)
parser.add_argument('--render',action='store_true')
parser.add_argument('--blend-dir',type=Path)
parser.add_argument('--input-dir',type=Path)
parser.add_argument('--output',type=Path,default=ROOT/'assets/models/blender')
parser.add_argument('--review',type=Path,default=ROOT/'docs/reviews/blender')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])


def module(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def linear(value):
    return value/12.92 if value<.04045 else ((value+.055)/1.055)**2.4


def rgb(hex_value):
    raw=hex_value.lstrip('#')
    return tuple(linear(int(raw[i:i+2],16)/255.) for i in (0,2,4))


def material(record,cache,work):
    source=record.get('surface')
    hex_value=record['hex']
    name=(source.title() if source else 'Finish')+' '+hex_value
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*record['rgb'],1)
    mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    shader=nodes.get('Principled BSDF')
    base=record['rgb']
    shader.inputs['Base Color'].default_value=(*base,1)
    shader.inputs['Roughness'].default_value=record['roughness']
    shader.inputs['Metallic'].default_value=record['metalness']
    mat.use_backface_culling=not record['doubleSided']
    if record['vertexColors']:
        attribute=nodes.new('ShaderNodeVertexColor')
        attribute.layer_name='Casting'
        links.new(attribute.outputs['Color'],shader.inputs['Base Color'])
    elif source:
        # Architectural photograph plates are never used. These seamless
        # material swatches are the same original albedos as the native model.
        filename=record['texture']
        tint=record.get('tint') or '#ffffff'
        key=filename+':'+tint
        if key not in cache:
            image=bpy.data.images.load(str(ROOT/'images/materials'/(filename+'.webp')),check_existing=False)
            side=384
            image.scale(side,side)
            pixels=np.empty(side*side*4,dtype=np.float32)
            image.pixels.foreach_get(pixels)
            pixels=pixels.reshape(-1,4)
            pixels[:,:3]*=np.array(rgb(tint),dtype=np.float32)
            image.pixels.foreach_set(pixels.ravel())
            image.name=filename+' '+tint
            image.file_format='JPEG'
            image.filepath_raw=str(work/(filename+'-'+tint.lstrip('#')+'.jpg'))
            image.save();image.pack()
            cache[key]=image
        image=nodes.new('ShaderNodeTexImage')
        image.image=cache[key]
        links.new(image.outputs['Color'],shader.inputs['Base Color'])
    return mat


def empty(name,parent=None):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    if parent: obj.parent=parent
    return obj


def build_mesh(block,buffer,mat):
    def arr(name,dtype):
        offset,count=block[name]
        return np.frombuffer(buffer,dtype=dtype,count=count,offset=offset)
    pos=arr('p','<f4').reshape(-1,3)
    norm=arr('n','<f4').reshape(-1,3)
    faces=arr('idx','<u4').reshape(-1,3)
    # Weld touching geometry in object space while preserving the original
    # loop UVs, normals and colours at hard corners, seams and carved joins.
    _,first,mapping=np.unique(np.rint(pos*200000).astype(np.int64),axis=0,return_index=True,return_inverse=True)
    triangles=mapping[faces]
    area=np.linalg.norm(np.cross(pos[faces[:,1]]-pos[faces[:,0]],pos[faces[:,2]]-pos[faces[:,0]]),axis=1)
    keep=(triangles[:,0]!=triangles[:,1])&(triangles[:,1]!=triangles[:,2])&(triangles[:,2]!=triangles[:,0])&(area>1e-10)
    faces,triangles=faces[keep],triangles[keep]
    mesh=bpy.data.meshes.new(block['name'])
    mesh.vertices.add(len(first));mesh.vertices.foreach_set('co',pos[first].reshape(-1))
    mesh.loops.add(triangles.size);mesh.loops.foreach_set('vertex_index',triangles.astype(np.int32).reshape(-1))
    mesh.polygons.add(len(triangles));mesh.polygons.foreach_set('loop_start',np.arange(0,triangles.size,3,dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.polygons.foreach_set('use_smooth',np.ones(len(triangles),dtype=bool))
    mesh.normals_split_custom_set(norm[faces].reshape(-1,3))
    if 'uv' in block and any(n.type=='TEX_IMAGE' for n in mat.node_tree.nodes):
        uv=arr('uv','<f4').reshape(-1,2)[faces].reshape(-1)
        mesh.uv_layers.new(name='Measured material').data.foreach_set('uv',uv)
    if 'c' in block:
        colors=arr('c','<f4').reshape(-1,3)[faces].reshape(-1,3)*np.asarray(mat.diffuse_color[:3],dtype=np.float32)
        rgba=np.column_stack((colors,np.ones(len(colors),dtype=np.float32)))
        attribute=mesh.color_attributes.new(name='Casting',type='BYTE_COLOR',domain='CORNER')
        attribute.data.foreach_set('color',rgba.ravel())
    mesh.materials.append(mat)
    obj=bpy.data.objects.new(block['name'],mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def bounds(objects):
    bpy.context.view_layer.update()
    corners=[o.matrix_world@Vector(corner) for o in objects if o.type=='MESH' for corner in o.bound_box]
    return Vector(tuple(min(c[a] for c in corners) for a in range(3))),Vector(tuple(max(c[a] for c in corners) for a in range(3)))


def stage(name,staging,work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    data=json.loads((staging/(name+'.json')).read_text())
    buffer=(staging/(name+'.bin')).read_bytes()
    cache={}
    mats=[material(rec,cache,work) for rec in data['materials']]
    clocks={}
    for n,record in data['clockFaces'].items():
        node=empty('Clock_Face_'+n)
        x,y,z=record['pivot']
        node.location=(x,-z,y)
        node.rotation_euler.z=record['yaw']
        node['clockTimeZone']='Asia/Tokyo'
        clocks[int(n)]=node
    for block in data['groups']:
        obj=build_mesh(block,buffer,mats[block['material']])
        if block['hand']:
            hand=block['hand']
            face,kind=hand['face'],hand['kind']
            obj.parent=clocks[face]
            obj.name='Clock_'+str(face)+'_'+kind.title()
            obj['worldClockHand']=kind;obj['clockFace']=face;obj['clockTimeZone']='Asia/Tokyo'
        else:
            obj.name=data['title']+' · '+obj.data.materials[0].name
    bpy.context.view_layer.update()
    if name=='okuma-statue':
        module('sculpture-details').refine_statue(scene)
    else:
        module('architecture-details').refine_architecture(name,scene)
    objects=list(scene.objects)
    low,high=bounds(objects)
    scale=data['height']/(high.z-low.z)
    root=empty(name)
    root['title']=data['title'];root['metresHigh']=data['height'];root['frontAxis']='+Z';root['source']='Blender 4.3.2'
    # Bake normalization only into top-level meshes and clock mount empties.
    # The exported assembly node itself retains an identity transform.
    center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    transform=Matrix.Scale(scale,4)@Matrix.Translation(-center)
    for obj in objects:
        if obj.parent is None:
            obj.matrix_world=transform@obj.matrix_world
            obj.parent=root
    bpy.context.view_layer.update()
    return root


def aim(o,target):
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()


def render(root,name,path):
    scene=bpy.context.scene
    low,high=bounds(root.children_recursive)
    dims=high-low
    # Use the same ground and lights for front/side readability across
    # models. Proof views never become part of the downloadable landmark.
    floor_height=low.z-.002
    bpy.ops.mesh.primitive_plane_add(size=max(dims)*200,location=(0,0,floor_height))
    floor=bpy.context.object
    clay=bpy.data.materials.new('Studio floor');clay.diffuse_color=(.29,.30,.28,1)
    floor.data.materials.append(clay)
    scene.world=bpy.data.worlds.new('Soft blue daylight')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.67,.76,.88,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.46
    directions={'okuma-statue':(.20,-1,.13),'karatsu-bank':(-.67,-1,.28),'karatsu-castle':(.38,-1,.26),'okuma-auditorium':(.43,-1,.25)}
    direction=Vector(directions[name]).normalized()
    camera=bpy.data.cameras.new('Inspection');camera.type='ORTHO'
    cam=bpy.data.objects.new('Inspection camera',camera);scene.collection.objects.link(cam);scene.camera=cam
    target=Vector((0,0,dims.z*.48))
    cam.location=target+direction*max(dims)*2.3;aim(cam,target)
    rotation=cam.rotation_euler.to_matrix().inverted()
    corners=[rotation@(p.matrix_world@Vector(v)-target) for p in root.children_recursive if p.type=='MESH' for v in p.bound_box]
    xx=[c.x for c in corners];yy=[c.y for c in corners]
    width,height=840,680
    camera.ortho_scale=max(max(xx)-min(xx),(max(yy)-min(yy))*width/height)*1.09
    # Account for asymmetrical wings/towers in the fitted projected box.
    cam.location+=cam.rotation_euler.to_matrix()@Vector(((max(xx)+min(xx))/2,(max(yy)+min(yy))/2,0))
    for label,vector,power,size,tint in [
        ('Large north window',(-.55,-1.0,1.35),35,1.10,(1,.88,.73)),
        ('Sky fill',(.90,-.35,.76),14,1.18,(.69,.80,1)),
        ('Rim',(.22,.85,.85),28,.71,(1,.84,.68))]:
        light=bpy.data.lights.new(label,'AREA');light.energy=power*max(dims)**2;light.shape='DISK';light.size=size*max(dims);light.color=tint
        obj=bpy.data.objects.new(label,light);scene.collection.objects.link(obj);obj.location=Vector(vector)*max(dims);aim(obj,target)
    scene.render.engine='CYCLES';scene.cycles.samples=56
    scene.cycles.use_denoising=False;scene.cycles.max_bounces=4
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='WEBP';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.quality=90
    scene.view_settings.view_transform='AgX'
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    # Ground-level hero views and close details use the same downloadable
    # geometry. Fine bronze, stone carving and roof ornaments can be inspected
    # without confusing a locally fitted portrait with the complete monument.
    details={
        'okuma-statue':('portrait',(.19,-.26,15.79),(.44,-1,.06),4.04),
        'okuma-auditorium':('belfry',(-9.25,-2.50,24.82),(.42,-1,.17),11.5),
        'karatsu-bank':('entrance',(-10.82,-6.95,4.54),(-.38,-1,.14),10.1),
        'karatsu-castle':('ridge',(3.0,0,25.12),(.23,-1,.23),2.08),
    }
    label,authored_pos,direction,frame=details[name]
    registration=next(obj.matrix_world for obj in root.children if obj.type=='MESH')
    detail_target=registration@Vector(authored_pos)
    cam.location=detail_target+Vector(direction).normalized()*max(dims)*1.5
    aim(cam,detail_target)
    camera.ortho_scale=frame*registration.to_scale().x
    scene.render.resolution_x=700;scene.render.resolution_y=640
    scene.render.filepath=str(path.with_name(name+'-'+label+'.webp'))
    bpy.ops.render.render(write_still=True)


def run():
    args.output.mkdir(parents=True,exist_ok=True)
    if args.render: args.review.mkdir(parents=True,exist_ok=True)
    if args.blend_dir: args.blend_dir.mkdir(parents=True,exist_ok=True)
    names=(args.only,) if args.only else NAMES
    with tempfile.TemporaryDirectory(prefix='landmark-authoring-') as directory:
        work=Path(directory)
        staging=args.input_dir or work
        if not args.input_dir:
            subprocess.run(['node',str(HERE/'landmark-input.mjs'),str(staging),*names],cwd=ROOT,check=True)
        for name in names:
            root=stage(name,staging,work)
            if args.blend_dir:
                bpy.ops.wm.save_as_mainfile(filepath=str(args.blend_dir/(name+'.blend')))
            candidate=work/(name+'.glb')
            bpy.ops.export_scene.gltf(filepath=str(candidate),export_format='GLB',export_extras=True,
                export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',
                export_normals=True,export_image_format='JPEG',export_jpeg_quality=82,export_texcoords=True)
            module('pack_geometry').pack_static_glb(candidate)
            (args.output/(name+'.glb')).write_bytes(candidate.read_bytes())
            if args.render: render(root,name,args.review/(name+'.webp'))


if __name__=='__main__':
    run()
