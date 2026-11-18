"""Render review views from the shipped GLB files in Blender, without source-scene data.

blender --background -t 4 --python tools/blender/render_study.py -- /tmp/study-review
"""
import argparse,sys
from pathlib import Path
import bpy
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path)
parser.add_argument('--samples',type=int,default=40);parser.add_argument('--width',type=int,default=960)
parser.add_argument('--only',choices=['seat','oblique','hinges','nameplate'])
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
assets=root/'assets/models/blender';args.directory.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def load_asset(name):
    already=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(assets/(name+'.glb')),import_pack_images=True,loglevel=0)
    bpy.context.view_layer.update()
    objects=set(bpy.data.objects)-already
    return [o for o in objects if o.parent not in objects], [o for o in objects if o.type=='MESH']
def q(name):return bpy.data.objects[name]
load_asset('study-room')
for asset,socket,max_size in [
    ('okuma-auditorium','SocketResearch',(.43,.32,.48)),('okuma-statue','SocketProfile',(.21,.21,.54)),
    ('karatsu-castle','SocketPhotos',(.40,.32,.40)),('karatsu-bank','SocketBank',(.34,.26,.24))]:
    roots,meshes=load_asset(asset)
    bounds=[obj.matrix_world@Vector(v) for obj in meshes for v in obj.bound_box]
    minimum=Vector(tuple(min(v[i] for v in bounds) for i in range(3)));maximum=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    size=maximum-minimum;scale=min(max_size[i]/max(.00001,size[i]) for i in range(3))
    assembly=bpy.data.objects.new('Display of '+asset,None);bpy.context.collection.objects.link(assembly)
    assembly.parent=q(socket);assembly.scale=(scale,)*3
    center=(minimum+maximum)/2;center.z=minimum.z;assembly.location=-center*scale
    for obj in roots:obj.parent=assembly
roots,_=load_asset('cat')
cat=bpy.data.objects.new('Rug cat',None);bpy.context.collection.objects.link(cat)
cat.parent=q('SocketCat');cat.location=(0,-.020,.01);cat.rotation_euler.z=.26
for obj in roots:obj.parent=cat
scene=bpy.context.scene;scene.frame_set(1)
scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
scene.cycles.max_bounces=4;scene.cycles.diffuse_bounces=2;scene.cycles.glossy_bounces=2
scene.cycles.sample_clamp_indirect=1.75
scene.world=bpy.data.worlds.new('Daylight in the study');scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.73,.83,1,1);bg.inputs[1].default_value=.50
def area(name,pt,target,power,size,color):
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=color
    obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=pt
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
area('Window daylight',(-2.0,-.57,2.4),(0,.2,.68),230,2.00,(1,.87,.70))
area('Daylight reflected by ceiling',(.43,-.85,2.65),(0,.12,.79),68,1.9,(1,.89,.75))
area('Ambient window fill',(-.88,-1.18,1.8),(.25,.20,.87),31,1.6,(.79,.86,1))
area('Lamp light',(.95,.08,1.16),(.86,-.04,.80),2.8,.13,(1,.72,.40))
sun=bpy.data.lights.new('Afternoon sun','SUN');sun.energy=1.5;sun.angle=.14;sun.color=(1,.86,.68)
sunObj=bpy.data.objects.new('Afternoon sun',sun);bpy.context.collection.objects.link(sunObj);sunObj.rotation_euler=(.59,-.62,-.70)
camera=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camera);bpy.context.collection.objects.link(cam);scene.camera=cam
scene.render.resolution_x=args.width;scene.render.resolution_y=round(args.width*2/3);scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92
def shot(name,eye,target,lens):
    if args.only and name!=args.only:return
    cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    camera.lens=lens;camera.sensor_width=36;scene.render.filepath=str(args.directory/('study-'+name+'.jpg'))
    bpy.ops.render.render(write_still=True)
shot('seat',q('CameraSeat').location,q('CameraTarget').location,30)
shot('oblique',(-1.13,-1.78,1.34),(.08,.12,.89),28)
shot('nameplate',(-.65,-1.14,1.10),(-.82,-.23,.87),60)
# glTF imports preserve quaternion rotation mode. Apply pose deltas in each
# pivot's local space so the proof uses the same joints as the live renderers.
from mathutils import Quaternion
def pose_joint(name,axis,radians):
    joint=q(name);joint.rotation_mode='QUATERNION'
    joint.rotation_quaternion=joint.rotation_quaternion @ Quaternion(axis,radians)
pose_joint('NotebookCover',(0,-1,0),3.095);q('NotebookCover').location.z-=.021
pose_joint('NotebookLeaf',(0,-1,0),2.03);q('NotebookLeaf').location.z-=.008
q('NotebookPageFlex').data.shape_keys.key_blocks['Flex'].value=.87
pose_joint('LetterFlap',(1,0,0),-2.0);q('Drawer').location.y-=.36
shot('hinges',(-.38,-1.74,1.42),(-.08,-.04,.77),37)
