"""Re-import an exported GLB into the source studio, without saving the blend.

blender --background --factory-startup --disable-autoexec SOURCE.blend
  --python scripts/render-tabby-export.py -- --asset models/tabby-cat-room.glb --audit PATH
"""
import bpy,sys,argparse,json
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--asset',required=True);p.add_argument('--audit',required=True)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);asset=Path(args.asset).resolve();audit=Path(args.audit).resolve()
scene=bpy.context.scene;original=bpy.data.objects['CAT_RIG']
for obj in list(original.children_recursive)+[original]:bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):
 if action.name in ['Idle','Walk','Run','Jump','Lie_Roll_Rest','Stretch']:bpy.data.actions.remove(action)
if scene.camera.data.animation_data:scene.camera.data.animation_data_clear()
bpy.ops.import_scene.gltf(filepath=str(asset))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';records=[]
for label,frame in [('Idle',0),('Walk',13)]:
 action=next(a for a in bpy.data.actions if a.name==label or a.name.startswith(label+'.'))
 rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];scene.frame_set(frame);bpy.context.view_layer.update()
 points=[];depsgraph=bpy.context.evaluated_depsgraph_get()
 for obj in rig.children_recursive:
  if obj.type!='MESH':continue
  e=obj.evaluated_get(depsgraph);points.extend(e.matrix_world@Vector(c) for c in e.bound_box)
 low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
 records.append({'clip':label,'frame':frame,'boundsBlender':{'min':low,'max':high},'actionFrames':list(action.frame_range)})
 scene.render.filepath=str(audit/(asset.stem+'-roundtrip-'+label.lower()+'.png'));bpy.ops.render.render(write_still=True)
(audit/(asset.stem+'-roundtrip.json')).write_text(json.dumps(records,indent=2),encoding='utf-8')
print('ROUNDTRIP',json.dumps(records))
