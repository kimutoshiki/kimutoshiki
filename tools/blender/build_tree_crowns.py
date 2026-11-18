"""Build the shared distant crown meshes for each walking district.

blender -b -t 4 --python-exit-code 1 --python tools/blender/build_tree_crowns.py
"""

import importlib.util
from pathlib import Path
import sys

import bpy

HERE=Path(__file__).resolve().parent
ASSETS=HERE.parents[1]/'assets/models/blender'
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE))
from pack_geometry import pack_static_glb

spec=importlib.util.spec_from_file_location('region_solids',HERE/'region-solids.py')
solids=importlib.util.module_from_spec(spec)
spec.loader.exec_module(solids)


def export_crowns(region):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material=bpy.data.materials.new('Seasonal foliage · distant crown')
    material.use_nodes=True
    material.use_backface_culling=False
    shading=material.node_tree.nodes.get('Principled BSDF')
    shading.inputs['Roughness'].default_value=.62
    vertex_color=material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex_color.layer_name='Pigment'
    material.node_tree.links.new(vertex_color.outputs['Color'],shading.inputs['Base Color'])
    for variant in range(3):
        solids.tree(region=='karatsu',variant,None,material,distant=True)
    output=ASSETS/(region+'-tree-crowns.glb')
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_extras=True,
        export_yup=True,export_animations=False,export_cameras=False,export_lights=False,
        export_normals=False)
    pack_static_glb(output)
    print(f'{region}: {output.stat().st_size:,} bytes')


if __name__=='__main__':
    for region in ('waseda','karatsu'):
        export_crowns(region)
