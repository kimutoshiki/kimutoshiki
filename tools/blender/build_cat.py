"""Rebuild the study tabby from the owner's rig, in metres.
blender -b -t 2 -P tools/blender/build_cat.py -- --preview /tmp/study-cat.png
"""
import argparse
import json
import math
import random
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview', type=Path)
parser.add_argument('--blend', type=Path)
parser.add_argument('--output', type=Path, default=REPO/'assets/models/blender/cat.glb')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
tmp = tempfile.TemporaryDirectory(prefix='study-tabby-')
work = Path(tmp.name)
bpy.ops.wm.read_factory_settings(use_empty=True)
subprocess.run(['node', str(HERE/'unpack_tabby.mjs'), str(REPO/'models/tabby-cat-world.glb'),
                str(work/'source.glb')], check=True)
bpy.ops.import_scene.gltf(filepath=str(work/'source.glb'))
scene = bpy.context.scene
rig = bpy.data.objects['CAT_RIG']
rig.data.pose_position = 'REST'
random.seed(284)

# The larger source retains the original baked, hand-painted facial markings.
# Re-sample these before exporting rather than magnifying the small outdoor map.
raw = (REPO/'models/tabby-cat-room.glb').read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
data = json.loads(raw[20:20+size])
for source in data['images']:
    view = data['bufferViews'][source['bufferView']]
    offset = 28+size+view.get('byteOffset',0)
    destination = work/(source['name']+('.jpg' if source['mimeType']=='image/jpeg' else '.png'))
    destination.write_bytes(raw[offset:offset+view['byteLength']])
    original = bpy.data.images[source['name']]
    improved = bpy.data.images.load(str(destination))
    target = 1024 if source['name']=='coat-original-baked' else 256
    if improved.size[0] > target:
        improved.scale(target,target)
        improved.file_format='JPEG' if destination.suffix=='.jpg' else 'PNG'
        improved.save()
    original.user_remap(improved)
    improved.pack()

def solid(name, rgb, roughness=.65):
    material = bpy.data.materials.new(name)
    material.diffuse_color=(*rgb,1)
    material.use_nodes=True
    surface=material.node_tree.nodes['Principled BSDF']
    surface.inputs['Base Color'].default_value=(*rgb,1)
    surface.inputs['Roughness'].default_value=roughness
    return material

def skinned_mesh(name, vertices, faces, materials, indices, weights):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj=bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    for mat in materials: mesh.materials.append(mat)
    for poly,mat in zip(mesh.polygons,indices):
        poly.material_index=mat
        poly.use_smooth=True
    obj.parent=rig
    for bone in sorted(set(weights)):
        group=obj.vertex_groups.new(name=bone)
        group.add([i for i,key in enumerate(weights) if key==bone],1.0,'REPLACE')
    modifier=obj.modifiers.new('Follow the tabby rig','ARMATURE')
    modifier.object=rig
    return obj

# Reduce the solid surfaces only. Keep eyelid/pupil outlines, texture seams
# and the original weights; all study poses use the same watertight body.
for obj in list(scene.objects):
    if obj.type!='MESH' or obj.name=='Icosphere': continue
    prefixes={'Cat • continuous':.50,'Cat • thick':.55,'Paw •':.28,
              'Nose | nostril':.55,'Whisker follicle':.48,'Muzzle | philtrum':.65}
    ratio=next((r for prefix,r in prefixes.items() if obj.name.startswith(prefix)),1)
    if ratio==1: continue
    bpy.context.view_layer.objects.active=obj
    dec=obj.modifiers.new('Preserve silhouette at study distance','DECIMATE')
    dec.ratio=ratio
    bpy.ops.object.modifier_move_to_index(modifier=dec.name,index=0)
    bpy.ops.object.modifier_apply(modifier=dec.name)

# The original ears have solid outer cartilage, mapped rim and inner membrane.
# Add the small tapered furnishings of a short-haired tabby to each ear joint.
outer=solid('Tabby | warm umber ear',(.147,.083,.051))
rim=solid('Tabby | golden ear rim',(.255,.164,.093))
tuft=solid('Tabby | cream ear furnishings',(.51,.365,.22))
vertices,faces,indices,weights=[],[],[],[]
def point(p,bone):
    vertices.append(tuple(p));weights.append(bone)
    return len(vertices)-1
def face(v,m):
    faces.append(v);indices.append(m)
def tapered(start,end,radius,bone,mat):
    axis=(Vector(end)-Vector(start)).normalized()
    side=axis.cross(Vector((0,1,0))).normalized()
    up=axis.cross(side)
    base=[point(Vector(start)+radius*(side*math.cos(t*math.tau/4)+up*math.sin(t*math.tau/4)),bone) for t in range(4)]
    tip=point(end,bone)
    for t in range(4):face((base[t],base[(t+1)%4],tip),mat)
for sign,bone in [(-1,'ear.R'),(1,'ear.L')]:
    for index in range(20):
        h=random.uniform(.03,.94)
        z=.418+h*.061
        x=.087-h*.002 if index%2 else .021+h*.060
        y=-.250+h*.021
        direction=1 if index%2 else -1
        tapered((sign*x,y,z),(sign*(x+direction*.004),y-random.uniform(.002,.006),z+random.uniform(.004,.010)),
                random.uniform(.00055,.0012),bone,2 if index%4 else 1)
ears=skinned_mesh('Tufted ears | tapered guard hairs',vertices,faces,[outer,rim,tuft],indices,weights)

# Muzzle whiskers grow in ordered rows and fan out slightly ahead of the cheek.
# Swept tubes keep a fine, gently tapering silhouette from all camera angles.
vertices,faces,indices,weights=[],[],[],[]
ivory=solid('Tabby | pale whisker tips',(.77,.69,.54),.48)
for sign in (-1,1):
    for i in range(11):
        row=i%4
        start=Vector((sign*(.021+row*.003),-.345+i%3*.0008,.320+row*.0033))
        end=Vector((sign*(.094+.035*((i*3)%8)/7),-.345-.034*math.cos(i*.76),.295+.064*i/10))
        middle=(start+end)*.5+Vector((sign*.003,-.007,.007))
        last=[]
        for step in range(6):
            t=step/5
            c=(1-t)**2*start+2*(1-t)*t*middle+t*t*end
            radius=.00089*(1-t)**.66+.00008
            ring=[point(c+Vector((0,radius*math.cos(j*math.tau/4),radius*math.sin(j*math.tau/4))),'head') for j in range(4)]
            if last:
                for j in range(4):face((last[j],ring[j],ring[(j+1)%4],last[(j+1)%4]),0)
            last=ring
skinned_mesh('Whiskers | tapered cheek fan',vertices,faces,[ivory],indices,weights)

# Eyelids follow each almond-shaped cornea. The open state is a narrow rim;
# the morph draws a real upper lid down to a softly slanted lash line.
vertices,faces,indices,weights=[],[],[],[]
closed=[]
for sign in (-1,1):
    for i in range(19):
        t=i/18; arc=max(0,math.sin(math.pi*t))**.74
        x=.0221+.0354*t; center=.3754+.005*t
        top=center+.0080*arc
        # The cornea slopes toward the temple; keep the lid on its surface.
        y=-.3257+.0182*t-.0017*arc
        for z in (top+.00125*arc, top-.00055*arc):
            point((sign*x,y,z),'head')
        closed.extend([(sign*x,y,top+.00125*arc),(sign*x,y-.0009*arc,center-.0017*arc)])
        if i:
            a=len(vertices)-4
            face((a,a+1,a+3,a+2) if sign>0 else (a+2,a+3,a+1,a),0)
lid=skinned_mesh('Lids | paired upper lids',vertices,faces,[solid('Tabby | mocha lids',(.115,.068,.039))],indices,weights)
lid.shape_key_add(name='Basis')
close_key=lid.shape_key_add(name='Blink')
for p,destination in zip(close_key.data,closed):p.co=destination

# Small warm window reflections are modeled geometry, legible in software
# shading as well as in a physically lit render.
vertices,faces,indices,weights=[],[],[],[]
for sign in (-1,1):
    for cx,cy,cz,r in [(.0367,-.3218,.3821,.00225),(.0433,-.3188,.3750,.0008)]:
        rings=[]
        for j in range(5):
            theta=math.pi*j/4
            rings.append([point((sign*cx+r*math.sin(theta)*math.cos(k*math.tau/8),
                                 cy+r*.57*math.sin(theta)*math.sin(k*math.tau/8),
                                 cz+r*math.cos(theta)),'head') for k in range(8)])
        for j in range(4):
            for k in range(8):face((rings[j][k],rings[j+1][k],rings[j+1][(k+1)%8],rings[j][(k+1)%8]),0)
glints=skinned_mesh('Eyes | window gleams',vertices,faces,[solid('Tabby | reflected window',(.97,.90,.70),.19)],indices,weights)
for obj in (bpy.data.objects['Eye L | inset corneal iris'],bpy.data.objects['Eye L | vertical pupil'],glints):
    obj.shape_key_add(name='Basis')
    blink=obj.shape_key_add(name='Blink')
    for v in blink.data:
        center=.3754+.005*max(0,min(1,(abs(v.co.x)-.0221)/.0354))
        v.co.z=center+(v.co.z-center)*.045
    if obj.name!='Eye L | inset corneal iris':
        gaze=obj.shape_key_add(name='Gaze')
        for v in gaze.data:
            sign=1 if v.co.x>=0 else -1
            v.co.x+=.0022
            v.co.y+=sign*.0010

# Only locomotion and the resting pose are needed in this small room.
rig.data.pose_position='POSE'
animations=rig.animation_data
animations.action=None
for track in list(animations.nla_tracks):
    if track.name not in {'Idle','Walk'}:animations.nla_tracks.remove(track)
    else:track.mute=False
for obj in scene.objects: obj.select_set(obj.name not in {'Icosphere','Groom • body'})
bpy.context.view_layer.objects.active=rig
scene.frame_set(1)
args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,
    export_force_sampling=True,export_frame_step=2,export_skins=True,export_morph=True,
    export_morph_normal=False,export_morph_animation=False,export_yup=True,export_extras=False,
    export_image_format='AUTO',export_jpeg_quality=86)
if args.blend:
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))
if args.preview:
    for track in animations.nla_tracks:track.mute=track.name!='Idle'
    scene.frame_set(15)
    bpy.ops.mesh.primitive_plane_add(size=20,location=(0,0,-.001))
    bpy.context.object.data.materials.append(solid('Preview | muted olive floor',(.117,.136,.108)))
    def area(name,location,power,size,color):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=location
        ob.rotation_euler=(Vector((0,-.08,.26))-ob.location).to_track_quat('-Z','Y').to_euler()
    area('Linen window',(-1.2,-1.4,1.85),65,1.3,(1,.90,.76))
    area('Sky fill',(1.2,-.5,.8),33,1.2,(.77,.87,1))
    area('Afternoon',(0,.8,1.1),52,.75,(1,.82,.60))
    bpy.ops.object.camera_add(location=(.70,-1.00,.57))
    camera=bpy.context.object;camera.rotation_euler=(Vector((0,-.01,.248))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=.90;scene.camera=camera
    scene.world=bpy.data.worlds.new('Preview sky');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False
    scene.render.resolution_x=650;scene.render.resolution_y=530;scene.render.resolution_percentage=100
    scene.render.filepath=str(args.preview)
    bpy.ops.render.render(write_still=True)
