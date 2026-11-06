"""Offline Cycles render of the actual Three.js snapshot; this is not a WebGL test.

The basis (x, -z, y) preserves handedness. Supplied normals retain the source
smooth/faceted decisions. Original skinned cat positions are baked by export.mjs.
Fog uses the production day FogExp2 density and color before the AgX transform.
"""

import argparse
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector
parser = argparse.ArgumentParser(description='Render the exported world snapshot in Blender 4.3.2.')
parser.add_argument('--input-dir', type=Path, default=Path(__file__).resolve().parents[2] / 'work/world-poster')
choices = ['desktop', 'mobile', 'preview', 'preview-mobile', 'doorway', 'exterior', 'house', 'contact', 'review']
parser.add_argument('--mode', choices=choices)
parser.add_argument('--samples', type=int, default=None)
parser.add_argument('view', nargs='?', choices=choices)
options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
if options.mode and options.view:
    parser.error('Choose either --mode or the positional view, not both.')
mode = options.mode or options.view or 'desktop'
ROOT = options.input_dir.resolve()
data = json.loads((ROOT / 'scene.json').read_text())
binary = (ROOT / 'scene.bin').read_bytes()

def arr(spec):
    if spec is None:
        return None
    dtype = {'Float32Array': np.float32, 'Uint32Array': np.uint32}[spec['type']]
    return np.frombuffer(binary, dtype=dtype, count=spec['length'], offset=spec['offset'])

def xyz(values):
    a = np.array(values, dtype=np.float32).reshape((-1, 3))
    return np.column_stack((a[:, 0], -a[:, 2], a[:, 1]))

def point(a):
    return Vector((a[0], -a[2], a[1]))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 192
scene.cycles.use_denoising = False
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.018
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 3
scene.cycles.transparent_max_bounces = 8
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.55
scene.render.film_transparent = False
world = bpy.data.worlds.new('Cool coastal sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.624, 0.708, 0.680, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.65
environment = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
environment.image = bpy.data.images.load(str(ROOT / data['environment']['file']))
world.node_tree.links.new(environment.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
light_path = world.node_tree.nodes.new('ShaderNodeLightPath')
strength = world.node_tree.nodes.new('ShaderNodeMath')
strength.operation = 'MULTIPLY_ADD'
strength.inputs[1].default_value = data['environment']['cameraStrength'] - data['environment']['indirectStrength']
strength.inputs[2].default_value = data['environment']['indirectStrength']
world.node_tree.links.new(light_path.outputs['Is Camera Ray'], strength.inputs[0])
world.node_tree.links.new(strength.outputs[0], world.node_tree.nodes['Background'].inputs['Strength'])
scene.world = world
scene.view_layers[0].use_pass_z = True
scene.use_nodes = True
comp = scene.node_tree
comp.nodes.clear()
render = comp.nodes.new('CompositorNodeRLayers')
scaled = comp.nodes.new('CompositorNodeMath')
scaled.operation = 'MULTIPLY'
scaled.inputs[1].default_value = data['fog']['density']
square = comp.nodes.new('CompositorNodeMath')
square.operation = 'MULTIPLY'
negative = comp.nodes.new('CompositorNodeMath')
negative.operation = 'MULTIPLY'
negative.inputs[1].default_value = -1
exponent = comp.nodes.new('CompositorNodeMath')
exponent.operation = 'EXPONENT'
factor = comp.nodes.new('CompositorNodeMath')
factor.operation = 'SUBTRACT'
factor.inputs[0].default_value = 1
fog = comp.nodes.new('CompositorNodeMixRGB')
fog.blend_type = 'MIX'

def srgb_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
fog_rgb = tuple(int(data['fog']['color'].lstrip('#')[i:i+2], 16) for i in (0,2,4))
fog.inputs[2].default_value = tuple(srgb_linear(c / 255) for c in fog_rgb) + (1,)
output = comp.nodes.new('CompositorNodeComposite')
comp.links.new(render.outputs['Depth'], scaled.inputs[0])
comp.links.new(scaled.outputs[0], square.inputs[0])
comp.links.new(scaled.outputs[0], square.inputs[1])
comp.links.new(square.outputs[0], negative.inputs[0])
comp.links.new(negative.outputs[0], exponent.inputs[0])
comp.links.new(exponent.outputs[0], factor.inputs[1])
is_geometry = comp.nodes.new('CompositorNodeMath')
is_geometry.operation = 'LESS_THAN'
is_geometry.inputs[1].default_value = 2000
comp.links.new(render.outputs['Depth'], is_geometry.inputs[0])
geometry_fog = comp.nodes.new('CompositorNodeMath')
geometry_fog.operation = 'MULTIPLY'
comp.links.new(factor.outputs[0], geometry_fog.inputs[0])
comp.links.new(is_geometry.outputs[0], geometry_fog.inputs[1])
comp.links.new(geometry_fog.outputs[0], fog.inputs[0])
comp.links.new(render.outputs['Image'], fog.inputs[1])
comp.links.new(fog.outputs[0], output.inputs[0])
textures = {}

def texture(node_tree, tid, noncolor=False):
    if tid is None:
        return None
    spec = data['textures'][tid]
    key = (tid, noncolor)
    if key not in textures:
        image = bpy.data.images.load(str(ROOT / spec['file']), check_existing=False)
        if noncolor:
            image.colorspace_settings.name = 'Non-Color'
        textures[key] = image
    node = node_tree.nodes.new('ShaderNodeTexImage')
    node.image = textures[key]
    node.extension = 'REPEAT'
    node.interpolation = 'Linear'
    uv = node_tree.nodes.new('ShaderNodeTexCoord')
    mapping = node_tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (spec['repeat'][0], spec['repeat'][1] * (1 if spec['flipY'] else -1), 1)
    mapping.inputs['Location'].default_value = (spec['offset'][0], spec['offset'][1] + (0 if spec['flipY'] else 1), 0)
    mapping.inputs['Rotation'].default_value = (0, 0, -spec['rotation'])
    node_tree.links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    node_tree.links.new(mapping.outputs['Vector'], node.inputs['Vector'])
    return node
materials = []
for spec in data['materials']:
    material = bpy.data.materials.new(spec['name'])
    material.use_nodes = True
    nt = material.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*spec['color'], 1)
    p.inputs['Roughness'].default_value = spec['roughness']
    p.inputs['Metallic'].default_value = spec['metalness']
    p.inputs['Alpha'].default_value = spec['opacity']
    p.inputs['Coat Weight'].default_value = spec['clearcoat']
    p.inputs['Emission Color'].default_value = (*spec['emissive'], 1)
    p.inputs['Emission Strength'].default_value = spec['emissiveIntensity']
    mapnode = texture(nt, spec['map'])
    if mapnode:
        mult = nt.nodes.new('ShaderNodeMixRGB')
        mult.blend_type = 'MULTIPLY'
        mult.inputs[0].default_value = 1
        mult.inputs[2].default_value = (*spec['color'], 1)
        nt.links.new(mapnode.outputs['Color'], mult.inputs[1])
        nt.links.new(mult.outputs[0], p.inputs['Base Color'])
        if spec['transparent']:
            alpha = nt.nodes.new('ShaderNodeMath')
            alpha.operation = 'MULTIPLY'
            alpha.inputs[1].default_value = spec['opacity']
            nt.links.new(mapnode.outputs['Alpha'], alpha.inputs[0])
            nt.links.new(alpha.outputs[0], p.inputs['Alpha'])
    if spec['vertexColors']:
        vertex = nt.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'Col'
        mult = nt.nodes.new('ShaderNodeMixRGB')
        mult.blend_type = 'MULTIPLY'
        mult.inputs[0].default_value = 1
        mult.inputs[2].default_value = (*spec['color'], 1)
        nt.links.new(vertex.outputs['Color'], mult.inputs[1])
        if p.inputs['Base Color'].is_linked:
            nt.links.new(p.inputs['Base Color'].links[0].from_socket, mult.inputs[2])
        nt.links.new(mult.outputs[0], p.inputs['Base Color'])
    bumpnode = texture(nt, spec['bumpMap'], True)
    if bumpnode:
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.45
        bump.inputs['Distance'].default_value = spec['bumpScale']
        nt.links.new(bumpnode.outputs['Color'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    normalnode = texture(nt, spec['normalMap'], True)
    if normalnode:
        normal = nt.nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = abs((spec['normalScale'] or [1])[0])
        nt.links.new(normalnode.outputs['Color'], normal.inputs['Color'])
        nt.links.new(normal.outputs['Normal'], p.inputs['Normal'])
    roughnode = texture(nt, spec['roughnessMap'], True)
    if roughnode:
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(roughnode.outputs['Color'], sep.inputs['Color'])
        mult = nt.nodes.new('ShaderNodeMath')
        mult.operation = 'MULTIPLY'
        mult.inputs[1].default_value = spec['roughness']
        nt.links.new(sep.outputs['Green'], mult.inputs[0])
        nt.links.new(mult.outputs[0], p.inputs['Roughness'])
    alphanode = texture(nt, spec['alphaMap'], True)
    if alphanode:
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(alphanode.outputs['Color'], sep.inputs['Color'])
        mult = nt.nodes.new('ShaderNodeMath')
        mult.operation = 'MULTIPLY'
        mult.inputs[1].default_value = spec['opacity']
        nt.links.new(sep.outputs['Green'], mult.inputs[0])
        nt.links.new(mult.outputs[0], p.inputs['Alpha'])
    if spec.get('alphaTest'):
        threshold = nt.nodes.new('ShaderNodeMath')
        threshold.operation = 'GREATER_THAN'
        threshold.inputs[1].default_value = spec['alphaTest']
        if p.inputs['Alpha'].is_linked:
            nt.links.new(p.inputs['Alpha'].links[0].from_socket, threshold.inputs[0])
        else:
            threshold.inputs[0].default_value = spec['opacity']
        nt.links.new(threshold.outputs[0], p.inputs['Alpha'])
    object_info = nt.nodes.new('ShaderNodeObjectInfo')
    instance_tint = nt.nodes.new('ShaderNodeMixRGB')
    instance_tint.blend_type = 'MULTIPLY'
    instance_tint.inputs[0].default_value = 1
    instance_tint.inputs[1].default_value = p.inputs['Base Color'].default_value
    if p.inputs['Base Color'].is_linked:
        nt.links.new(p.inputs['Base Color'].links[0].from_socket, instance_tint.inputs[1])
    nt.links.new(object_info.outputs['Color'], instance_tint.inputs[2])
    nt.links.new(instance_tint.outputs[0], p.inputs['Base Color'])
    if spec.get('unlit'):
        p.inputs['Emission Color'].default_value = p.inputs['Base Color'].default_value
        if p.inputs['Base Color'].is_linked:
            nt.links.new(p.inputs['Base Color'].links[0].from_socket, p.inputs['Emission Color'])
        p.inputs['Base Color'].default_value = (0, 0, 0, 1)
        if p.inputs['Base Color'].is_linked:
            nt.links.remove(p.inputs['Base Color'].links[0])
        p.inputs['Emission Strength'].default_value = 1
    materials.append(material)
meshes = []
for spec in data['geometries']:
    positions = xyz(arr(spec['positions']))
    indices = arr(spec['indices'])
    n = len(indices) // 3
    mesh = bpy.data.meshes.new(spec['name'])
    mesh.vertices.add(len(positions))
    mesh.vertices.foreach_set('co', positions.ravel())
    mesh.loops.add(len(indices))
    mesh.loops.foreach_set('vertex_index', indices)
    mesh.polygons.add(n)
    mesh.polygons.foreach_set('loop_start', np.arange(n, dtype=np.int32) * 3)
    mesh.polygons.foreach_set('loop_total', np.full(n, 3, dtype=np.int32))
    mesh.polygons.foreach_set('use_smooth', np.full(n, True, dtype=bool))
    uvs = arr(spec['uvs'])
    if uvs is not None:
        uv = mesh.uv_layers.new(name='UVMap')
        uv.data.foreach_set('uv', uvs.reshape((-1, 2))[indices].ravel())
    colors = arr(spec['colors'])
    if colors is not None:
        color = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        rgb = colors.reshape((-1, 3))
        rgba = np.column_stack((rgb, np.ones(len(rgb), dtype=np.float32)))
        color.data.foreach_set('color', rgba.ravel())
    mesh.update()
    normals = arr(spec['normals'])
    if normals is not None:
        mesh.normals_split_custom_set_from_vertices(xyz(normals).tolist())
    meshes.append(mesh)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
object_meshes = {}
for spec in data['objects']:
    key = (spec['geometry'], tuple(spec['materials']))
    new_mesh = key not in object_meshes
    if new_mesh:
        object_meshes[key] = meshes[spec['geometry']].copy()
    mesh = object_meshes[key]
    obj = bpy.data.objects.new(spec['name'], mesh)
    scene.collection.objects.link(obj)
    obj.color = (*spec.get('instanceColor', [1,1,1]), 1)
    obj.matrix_world = C @ Matrix(np.array(spec['matrix']).reshape((4, 4), order='F').tolist()) @ C.inverted()
    if new_mesh:
        for mid in spec['materials']:
            mesh.materials.append(materials[mid])
    groups = data['geometries'][spec['geometry']]['groups']
    if new_mesh and len(spec['materials']) > 1:
        mids = np.zeros(len(mesh.polygons), dtype=np.int32)
        for g in groups:
            mids[g['start'] // 3:(g['start'] + g['count']) // 3] = g['materialIndex']
        mesh.polygons.foreach_set('material_index', mids)
    obj.visible_shadow = bool(spec['castShadow'])
    if spec.get('cat'):
        obj['is_original_cat'] = True
sun_data = bpy.data.lights.new('Directional coastal sun', 'SUN')
sun_data.energy = data['sun']['energy']
sun_data.color = data['sun']['color']
sun_data.angle = 0.065
sun = bpy.data.objects.new('Directional coastal sun', sun_data)
scene.collection.objects.link(sun)
sun.location = point(data['sun']['position'])
sun.rotation_euler = (point(data['sun']['target']) - sun.location).to_track_quat('-Z', 'Y').to_euler()
window_spec = data['windowLight']
window_data = bpy.data.lights.new('Production window directional light', 'SUN')
window_data.energy = window_spec['energy']
window_data.color = window_spec['color']
window_data.angle = .065
window = bpy.data.objects.new(window_data.name, window_data)
scene.collection.objects.link(window)
window.location = point(window_spec['position'])
window.rotation_euler = (point(window_spec['target']) - window.location).to_track_quat('-Z', 'Y').to_euler()
for spec in data.get('lights', []):
    if spec['type'] != 'PointLight' or spec['intensity'] <= 0:
        continue
    lamp_data = bpy.data.lights.new(spec['name'] or 'Source point light', 'POINT')
    lamp_data.energy = spec['intensity'] * 4 * math.pi
    lamp_data.color = spec['color']
    lamp_data.shadow_soft_size = .04
    lamp = bpy.data.objects.new(lamp_data.name, lamp_data)
    scene.collection.objects.link(lamp)
    lamp.location = point(spec['position'])
camera_data = bpy.data.cameras.new('Production camera')
camera = bpy.data.objects.new('Production camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'PERSP'
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 24
camera_data.clip_start = 0.025
camera_data.clip_end = 2000
if mode == 'review':
    views = [(name, 1000, 625, spec) for name, spec in data['reviewViews'].items()]
elif mode in data['reviewViews']:
    views = [(mode, 1000, 625, data['reviewViews'][mode])]
elif mode == 'preview':
    views = [('preview', 1000, 625, data['camera'])]
elif mode == 'preview-mobile':
    views = [('preview-mobile', 650, 1000, data['mobileCamera'])]
elif mode == 'mobile':
    views = [('poster-mobile', 650, 1000, data['mobileCamera'])]
else:
    views = [('poster', 1600, 1000, data['camera'])]
for name, w, h, spec in views:
    camera.location = point(spec['position'])
    camera.rotation_euler = (point(spec['target']) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.lens = 12 / math.tan(math.radians(spec['fov'] / 2))
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.filepath = str(ROOT / (name + '.png'))
    if mode not in ('desktop', 'mobile'):
        scene.cycles.samples = 32
    else:
        scene.cycles.adaptive_threshold = .008
    if options.samples:
        scene.cycles.samples = options.samples
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / ('world-' + name + '.blend')))
    bpy.ops.render.render(write_still=True)
print('WORLD_RENDER_COMPLETE', mode)
