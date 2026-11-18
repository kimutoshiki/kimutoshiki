"""Build the small versions of the four landmarks displayed on the desk.

blender -b -t 4 --python-exit-code 1 --python tools/blender/build_desk_miniatures.py
"""

from pathlib import Path
import sys

import bpy

HERE=Path(__file__).resolve().parent
ASSETS=HERE.parents[1]/'assets/models/blender'
LANDMARKS=('okuma-auditorium','okuma-statue','karatsu-castle','karatsu-bank')
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
from pack_geometry import pack_static_glb


def simplify(obj,dense_ratio,fine_ratio):
    if obj.type!='MESH':
        return
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles)<=128:
        return
    bpy.context.view_layer.objects.active=obj
    planar=obj.modifiers.new('Planar construction','DECIMATE')
    planar.decimate_type='DISSOLVE'
    planar.angle_limit=.006
    planar.delimit={'MATERIAL','SHARP','UV'}
    bpy.ops.object.modifier_apply(modifier=planar.name)
    obj.data.calc_loop_triangles()
    triangles=len(obj.data.loop_triangles)
    if triangles>256:
        # Keep small mesh groups at a higher ratio so details like the bank's
        # fanlight and the castle's roof ornaments stay legible on the desk.
        miniature=obj.modifiers.new('Desk viewing distance','DECIMATE')
        miniature.ratio=max(256/triangles,dense_ratio if triangles>8000 else fine_ratio)
        miniature.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=miniature.name)
    obj.data.validate()


def export_miniature(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=ASSETS/(name+'.glb')
    output=ASSETS/('desk-'+name+'.glb')
    bpy.ops.import_scene.gltf(filepath=str(source),import_pack_images=True,merge_vertices=True)
    # The layered eaves retain more of their closely spaced slate ridges.
    ratios=(.40,.51) if name=='karatsu-castle' else (.20,.35)
    for obj in bpy.data.objects:
        simplify(obj,*ratios)
    # Packed source images and landmark transforms (including the eight clock
    # hands) are exported with their original material and motion metadata.
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_extras=True,
        export_yup=True,export_animations=False,export_cameras=False,export_lights=False,
        export_normals=True,export_image_format='AUTO',export_texcoords=True)
    pack_static_glb(output)
    print(f'{name}: {source.stat().st_size:,} -> {output.stat().st_size:,} bytes')


if __name__=='__main__':
    for landmark in LANDMARKS:
        export_miniature(landmark)
