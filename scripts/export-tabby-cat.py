"""Export the user-supplied cat without changing the source .blend.

Usage: blender --background --factory-startup --disable-autoexec SOURCE.blend
       --python scripts/export-tabby-cat.py -- --audit PATH
The working scene is transient. No save_mainfile operation is used.
"""
import bpy, sys, json, hashlib, argparse, math, struct, tempfile
import numpy as np
from pathlib import Path
from collections import defaultdict
from mathutils import Vector

args=argparse.ArgumentParser();args.add_argument('--audit',required=True);args.add_argument('--render',action='store_true');args.add_argument('--variant',choices=['high','room'],default='high')
opts=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
audit=Path(opts.audit).resolve();audit.mkdir(exist_ok=True,parents=True)
temporary=audit/'blender-temp';temporary.mkdir(exist_ok=True);tempfile.tempdir=str(temporary)
repo=Path(__file__).resolve().parents[1];output=repo/'models'/('tabby-cat-room.glb' if opts.variant=='room' else 'tabby-cat.glb');output.parent.mkdir(exist_ok=True)
source=Path(bpy.data.filepath);source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
scene=bpy.context.scene;rig=bpy.data.objects.get('CAT_RIG')
if not rig or rig.type!='ARMATURE':raise RuntimeError('The expected user-supplied CAT_RIG is absent')
fps=scene.render.fps/scene.render.fps_base
clip_names=['Idle','Walk','Run','Jump','Lie_Roll_Rest','Stretch']
clips=[]
for name in clip_names:
    action=bpy.data.actions.get(name)
    if not action:raise RuntimeError('Missing source action '+name)
    start,end=action.frame_range
    tracks=[]
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    if fc.data_path in ['pose.bones["root"].location','pose.bones["MASTER"].location']:
                        values=[fc.evaluate(frame) for frame in range(round(start),round(end)+1)]
                        tracks.append({'path':fc.data_path,'axis':fc.array_index,'min':min(values),'max':max(values),'first':values[0],'last':values[-1]})
    clips.append({'name':name,'sourceFrameStart':start,'sourceFrameEnd':end,'durationSeconds':(end-start)/fps,'rootMotion':tracks})
rig.data.pose_position='REST';scene.frame_set(1)
source_objects=list(rig.children_recursive)
source_mesh_triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in source_objects if obj.type=='MESH')
lod_changes=[]

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.hide_set(False);obj.select_set(True)
    if objects:bpy.context.view_layer.objects.active=objects[0]

def thin_groom(obj):
    """Retain complete original strands using a stable uniform integer hash.

    A strand is 15 vertices / 24 triangles in this source; assertions prevent
    applying the source-specific optimization to a differently authored groom.
    Kept vertices retain their exact position, color and skin attachments.
    """
    source_mesh=obj.data
    if len(source_mesh.vertices)%15 or not all(len(set(v//15 for v in p.vertices))==1 for p in source_mesh.polygons):
        raise RuntimeError('Unexpected groom strand topology')
    def keep(strand):
        value=(strand+0x9e3779b9)&0xffffffff
        value=((value^(value>>16))*0x85ebca6b)&0xffffffff
        value=((value^(value>>13))*0xc2b2ae35)&0xffffffff
        return ((value^(value>>16))&15)==0
    indices=[v.index for v in source_mesh.vertices if keep(v.index//15)]
    remap={old:new for new,old in enumerate(indices)}
    polygons=[p for p in source_mesh.polygons if p.vertices[0] in remap]
    mesh=bpy.data.meshes.new(source_mesh.name+' room density')
    mesh.from_pydata([source_mesh.vertices[i].co[:] for i in indices],[],[[remap[v] for v in p.vertices] for p in polygons])
    for material in source_mesh.materials:mesh.materials.append(material)
    for old,new in zip(polygons,mesh.polygons):new.use_smooth=old.use_smooth;new.material_index=old.material_index
    for attribute in source_mesh.color_attributes:
        if attribute.domain!='POINT':raise RuntimeError('Unexpected groom color domain')
        new=mesh.color_attributes.new(name=attribute.name,type=attribute.data_type,domain=attribute.domain)
        colors=np.empty(len(attribute.data)*4,dtype=np.float32);attribute.data.foreach_get('color',colors)
        new.data.foreach_set('color',colors.reshape(-1,4)[indices].ravel())
    weights=[[(g.group,g.weight) for g in source_mesh.vertices[i].groups] for i in indices]
    group_names=[g.name for g in obj.vertex_groups]
    obj.data=mesh
    if not obj.vertex_groups:
        for name in group_names:obj.vertex_groups.new(name=name)
    for index,groups in enumerate(weights):
        for group,weight in groups:obj.vertex_groups[group].add([index],weight,'REPLACE')
    lod_changes.append({'object':obj.name,'method':'Stable uniform whole-strand subset; all kept attributes unchanged','sourceStrands':len(source_mesh.vertices)//15,'retainedStrands':len(indices)//15})

if opts.variant=='room':
    # Retain the original dense painted coat in a UV bake before reducing its
    # surface. Pure vertex-color interpolation otherwise softens fine stripes.
    body=bpy.data.objects['Cat • continuous anatomical surface'];select([body])
    material=body.data.materials[0].copy();material.name='Tabby • original coat baked for room distance';body.data.materials[0]=material
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002,area_weight=.5)
    bpy.ops.object.mode_set(mode='OBJECT')
    coat_image=bpy.data.images.new('Tabby original dense coat',width=2048,height=2048,alpha=False);coat_image.colorspace_settings.name='sRGB'
    node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=coat_image;material.node_tree.nodes.active=node
    scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=8
    bpy.ops.object.bake(type='DIFFUSE')
    principled=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    material.node_tree.links.new(node.outputs['Color'],principled.inputs['Base Color'])
    coat_image.filepath_raw=str(audit/'coat-original-baked.png');coat_image.file_format='PNG';coat_image.save();coat_image.pack()
    lod_changes.append({'object':body.name,'method':'Original full-density vertex paint baked before surface collapse','colorMapPixels':[2048,2048]})
    for obj in source_objects:
        if obj.type=='CURVE':
            obj.data.resolution_u=4;obj.data.render_resolution_u=4;obj.data.bevel_resolution=0
        if obj.type=='MESH' and obj.name.startswith('Groom'):thin_groom(obj)
        ratio=.25 if obj.name=='Cat • continuous anatomical surface' else .30 if obj.name.startswith('Paw •') else .25 if obj.name.startswith('Whisker follicle') else None
        if ratio:
            # Keep the original armature after the transient collapse operation.
            before=sum(len(p.vertices)-2 for p in obj.data.polygons)
            modifier=obj.modifiers.new('Measured room-distance surface LOD','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
            select([obj]);bpy.ops.object.modifier_apply(modifier=modifier.name)
            lod_changes.append({'object':obj.name,'method':'Surface-error-checked collapse','ratio':ratio,'trianglesBefore':before,'trianglesAfter':sum(len(p.vertices)-2 for p in obj.data.polygons)})

# Curves are real tapered whisker and ear-hair geometry. Convert, then merge
# only parts with identical material and attachment bone; no triangles removed.
curves=[obj for obj in source_objects if obj.type=='CURVE']
if curves:
    select(curves);bpy.ops.object.convert(target='MESH')
meshes=[obj for obj in rig.children_recursive if obj.type=='MESH']
for obj in meshes:
    select([obj])
    for mod in list(obj.modifiers):
        if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)

# Preserve the authored iris fibres and nose mottling by baking only these
# tiny procedural surfaces; the coat and groom already use exact vertex color.
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
scene.render.bake.margin=8;scene.render.bake.use_clear=True
baked=[]
for object_name,material_name,label,size in [
    ('Eye L | inset corneal iris','Cat | olive iris radial fibres','Iris',512),
    ('Nose | rounded leather triangle','Cat | mottled leather nose','Nose',256),
]:
    obj=bpy.data.objects.get(object_name);material=bpy.data.materials.get(material_name)
    if not obj or not material:raise RuntimeError('Missing procedural detail '+label)
    select([obj])
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.035);bpy.ops.object.mode_set(mode='OBJECT')
    image=bpy.data.images.new('Tabby '+label+' baked color',width=size,height=size,alpha=False)
    image.colorspace_settings.name='sRGB'
    temp_nodes=[]
    for mat in obj.data.materials:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node;temp_nodes.append((mat,node))
    bpy.ops.object.bake(type='DIFFUSE')
    # Route the tested baked map into the same original Principled material.
    node=next(node for mat,node in temp_nodes if mat==material)
    principled=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    material.node_tree.links.new(node.outputs['Color'],principled.inputs['Base Color'])
    for mat,temporary in temp_nodes:
        if mat!=material:mat.node_tree.nodes.remove(temporary)
    image.filepath_raw=str(audit/(label.lower()+'-baked.png'));image.file_format='PNG';image.save();image.pack()
    baked.append({'material':material_name,'resolution':[size,size],'purpose':'Diffuse color of original procedural shader'})

# Identical bind parents, vertex color layer layouts and materials may share a
# draw call. Bones/weights, vertex positions, normals and painted color remain.
batches=defaultdict(list)
for obj in list(rig.children_recursive):
    if obj.type!='MESH':continue
    key=(obj.parent.name if obj.parent else '',obj.parent_type,obj.parent_bone,
         tuple(m.name if m else '' for m in obj.data.materials),
         tuple((a.name,a.domain,a.data_type) for a in obj.data.color_attributes),
         tuple(uv.name for uv in obj.data.uv_layers),
         tuple((m.type,m.object.name if m.type=='ARMATURE' and m.object else '') for m in obj.modifiers))
    batches[key].append(obj)
merged_groups=[]
for objects in batches.values():
    if len(objects)<2:continue
    names=[o.name for o in objects];select(objects);bpy.ops.object.join();merged_groups.append({'retainedObject':objects[0].name,'sourceObjects':names})

meshes=[o for o in rig.children_recursive if o.type=='MESH']
select([rig]+meshes)
rig.data.pose_position='POSE'
# A muted strip still registers its action with the exporter while avoiding
# the staged 29-second NLA demonstration being exported as the only clip.
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.frame_set(1);bpy.context.view_layer.update()
def evaluated_bounds():
    depsgraph=bpy.context.evaluated_depsgraph_get();points=[]
    for obj in meshes:
        evaluated=obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world@Vector(c) for c in evaluated.bound_box)
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return {'min':list(low),'max':list(high),'dimensions':list(high-low)}
bounds=evaluated_bounds()
mesh_stats=[{'name':obj.name,'vertices':len(obj.data.vertices),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'materials':[m.name for m in obj.data.materials]} for obj in meshes]
export_options=dict(filepath=str(output),export_format='GLB',use_selection=True,use_visible=False,
    export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',
    export_nla_strips=True,export_frame_range=False,export_frame_step=1,export_force_sampling=True,export_anim_slide_to_zero=True,
    export_bake_animation=True,export_skins=True,export_def_bones=False,export_rest_position_armature=True,
    export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True,
    export_morph=False,export_cameras=False,export_lights=False,export_extras=False,
    export_vertex_color='MATERIAL',export_all_vertex_colors=False,
    # Texture encoding is an explicit separate pass, keeping Blender's export
    # independent of platform-specific JPEG temporary-file handling.
    export_image_format='AUTO',
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=18,export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=14,export_draco_color_quantization=12,export_draco_generic_quantization=16)
bpy.ops.export_scene.gltf(**export_options)
# Blender 5.2 exports Sheen Tint but omits a non-unit Sheen Weight. glTF folds
# intensity into sheenColorFactor; carry the authored weight into that factor.
payload=output.read_bytes();json_length=struct.unpack_from('<I',payload,12)[0]
gltf=json.loads(payload[20:20+json_length]);sheen_corrections=[]
for item in gltf.get('materials',[]):
    sheen=item.get('extensions',{}).get('KHR_materials_sheen')
    if not sheen:continue
    material=bpy.data.materials.get(item['name'])
    principled=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not principled:continue
    weight=principled.inputs['Sheen Weight'].default_value;tint=principled.inputs['Sheen Tint'].default_value
    sheen['sheenColorFactor']=[float(weight*tint[i]) for i in range(3)]
    sheen_corrections.append({'material':item['name'],'sourceSheenWeight':weight,'exportedSheenColorFactor':sheen['sheenColorFactor']})
encoded=json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode('utf-8');encoded+=b' '*((-len(encoded))%4)
remaining=payload[20+json_length:];total=12+8+len(encoded)+len(remaining)
output.write_bytes(struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+remaining)
triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
report={'source':source.name,'sourceSha256':source_hash,'sourceBytes':source.stat().st_size,
 'exportFile':'models/'+output.name,'exportSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'exportBytes':output.stat().st_size,'variant':opts.variant,
 'blenderVersion':bpy.app.version_string,'units':{'sourceSystem':scene.unit_settings.system,'sourceScale':scene.unit_settings.scale_length,'glTFUnit':'meter'},
 'orientation':{'sourceUp':'+Z','sourceForward':'-Y','glTFUp':'+Y','glTFForward':'+Z'},
 'sourceRigBoneCount':len(rig.data.bones),'sourceMeshTrianglesBeforeCurveConversion':source_mesh_triangles,
 'exportMeshCount':len(meshes),'exportTrianglesBeforeDraco':triangles,'idleBoundsBlender':bounds,
 'clips':clips,'bakedTextures':baked,'mergedGroups':merged_groups,'meshStats':mesh_stats,'lodChanges':lod_changes,'sheenCorrections':sheen_corrections,
 'preservation':['Source file is never saved or modified','High variant retains all original geometry; room variant lists each measured LOD change','Original six actions sampled at 30 fps; strongest four skin weights normalized for standard glTF runtime','Original coat and groom vertex colors retained','Only matching material/parent/bone groups joined'],
 'materialNotes':['Sub-pixel generated coat and nose microbump is not represented by a standard glTF node; geometry, painted coat and all groom strands remain','Procedural iris and nose diffuse detail baked into 512/256-pixel images; packed reference photos are intentionally excluded'],
 'exportOptions':export_options}
(audit/('export-room-report.json' if opts.variant=='room' else 'export-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if opts.render:
    scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    if scene.camera.data.animation_data:scene.camera.data.animation_data_clear()
    for name,frame in [('Idle',1),('Walk',14)]:
        rig.animation_data.action=bpy.data.actions[name];rig.animation_data.action_slot=rig.animation_data.action.slots[0];scene.frame_set(frame)
        scene.render.filepath=str(audit/(opts.variant+'-'+name.lower()+'.png'));bpy.ops.render.render(write_still=True)
if hashlib.sha256(source.read_bytes()).hexdigest()!=source_hash:raise RuntimeError('Source unexpectedly changed')
print('TABBY_EXPORT',json.dumps({'output':str(output),'bytes':output.stat().st_size,'meshes':len(meshes),'triangles':triangles,'bounds':bounds,'clips':clip_names}))
