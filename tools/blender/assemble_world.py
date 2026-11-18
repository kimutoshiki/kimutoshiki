"""Assemble the eight shipped GLBs into one portable, editable Blender project.

From the repository:
  blender -b -t 4 --python-exit-code 1 --python tools/blender/assemble_world.py -- /tmp/kimura-world.blend

Works with Blender 4.3+ and Node.js. The site's bundled Draco decoder opens
the shipped regional meshes even on Blender distributions without Draco.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

import bpy
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ASSETS = REPO / 'assets/models/blender'
SHORT = {'okuma-auditorium': 'auditorium', 'okuma-statue': 'statue',
         'karatsu-castle': 'castle', 'karatsu-bank': 'bank'}
# Same bounding envelopes and sockets (in glTF XYZ metres) as scene/blender-room.js.
MINIATURES = {
    'okuma-auditorium': ('SocketResearch', (.43, .48, .32)),
    'okuma-statue': ('SocketProfile', (.21, .54, .21)),
    'karatsu-castle': ('SocketPhotos', (.40, .40, .32)),
    'karatsu-bank': ('SocketBank', (.34, .24, .26)),
}
REGIONS = {'waseda': 'waseda-campus', 'karatsu': 'karatsu-town'}


def world_layout():
    # Camera heights include the same uneven terrain that the walking engine uses.
    source = """
      import {HOME, LANDMARK_SITES, OUTDOOR_VIEWS, regionalHeight, worldFov} from './scene/world-layout.js';
      const views = Object.fromEntries(Object.entries(OUTDOOR_VIEWS).map(([key,v]) => [key, {
        eye:[v.eye[0], HOME.eyeHeight + regionalHeight(v.region, ...v.eye), v.eye[1]],
        target:v.target, fov:v.fov
      }]));
      console.log(JSON.stringify({sites:LANDMARK_SITES,views,seat:{...HOME.seated,fov:worldFov(1.5,true)}}));
    """
    result = subprocess.check_output(['node', '--input-type=module', '-e', source], cwd=REPO)
    return json.loads(result)


def gltf_to_blender(xyz):
    x, y, z = xyz
    return Vector((x, -z, y))


def glb_document(path):
    with path.open('rb') as f:
        f.seek(12)
        length, chunk = struct.unpack('<I4s', f.read(8))
        if chunk != b'JSON':
            raise ValueError('Missing glTF JSON in ' + str(path))
        return json.loads(f.read(length))


def collection(scene, name):
    group = bpy.data.collections.new(name)
    scene.collection.children.link(group)
    return group


def locator(name, dest, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .12
    dest.objects.link(obj)
    obj.parent = parent
    return obj


def import_model(key, dest, temporary):
    path = ASSETS / (key + '.glb')
    document = glb_document(path)
    if 'KHR_draco_mesh_compression' in document.get('extensionsRequired', []):
        unpacked = temporary / path.name
        subprocess.run(['node', str(HERE / 'unpack_tabby.mjs'), str(path), str(unpacked)], check=True)
        path = unpacked
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=True, loglevel=0)
    # Blender creates hidden armature display helpers which are not part of the
    # imported glTF scene. Keep them in the importer's non-rendering collection.
    imported = set(bpy.data.objects) - before
    objects = sorted((obj for obj in imported if any(not c.hide_render for c in obj.users_collection)),
                     key=lambda obj: obj.name)
    if not any(obj.type == 'MESH' for obj in objects):
        raise ValueError('No imported meshes in ' + key)
    for obj in objects:
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        dest.objects.link(obj)
    return objects, document


def parent_roots(objects, parent):
    original = set(objects)
    for obj in objects:
        if obj.parent not in original:
            obj.parent = parent


def bounds(objects):
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in objects
               if obj.type == 'MESH' for corner in obj.bound_box]
    return (Vector(min(c[i] for c in corners) for i in range(3)),
            Vector(max(c[i] for c in corners) for i in range(3)))


def linked_landmark(originals, dest, anchor, key):
    """Each counterpart keeps its own transforms; mesh and material data stay linked."""
    copies = {}
    for original in originals:
        obj = original.copy()
        obj.name = 'Mini.' + original.name
        dest.objects.link(obj)
        copies[original] = obj
    for original, obj in copies.items():
        obj.parent = copies.get(original.parent, anchor)
    anchor['source_glb'] = key + '.glb'


def camera(dest, name, eye, target, vertical_fov, outdoor=False):
    data = bpy.data.cameras.new(name)
    data.sensor_fit = 'VERTICAL'
    data.lens = data.sensor_height / (2 * math.tan(math.radians(vertical_fov) / 2))
    data.clip_start = .12 if outdoor else .014
    data.clip_end = 3200 if outdoor else 60
    data.display_size = .9 if outdoor else .14
    obj = bpy.data.objects.new(name, data)
    dest.objects.link(obj)
    obj.location = gltf_to_blender(eye)
    obj.rotation_euler = (gltf_to_blender(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def area(dest, name, pos, target, power, size, color):
    light = bpy.data.lights.new(name, type='AREA')
    light.energy = power
    light.color = color
    light.shape = 'DISK'
    light.size = size
    obj = bpy.data.objects.new(name, light)
    dest.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def daylight(scene, dest, indoor):
    world = bpy.data.worlds.new(scene.name + ' daylight')
    world.use_nodes = True
    scene.world = world
    background = world.node_tree.nodes.get('Background')
    if indoor:
        background.inputs['Color'].default_value = (.73, .83, 1, 1)
        background.inputs['Strength'].default_value = .5
        area(dest, 'Light.Window', (-2, -.57, 2.4), (0, .2, .68), 230, 2, (1, .87, .70))
        area(dest, 'Light.Ceiling bounce', (.43, -.85, 2.65), (0, .12, .79), 68, 1.9, (1, .89, .75))
        area(dest, 'Light.Wall bounce', (-.88, -1.18, 1.8), (.25, .20, .87), 31, 1.6, (.79, .86, 1))
        lamp = area(dest, 'Light.Desk lamp', (.95, .08, 1.16), (.86, -.04, .80), 2.8, .13, (1, .72, .40))
    else:
        sky = world.node_tree.nodes.new('ShaderNodeTexSky')
        sky.sky_type = 'NISHITA'
        sky.sun_elevation = .85
        sky.sun_rotation = math.radians(-59)
        sky.sun_intensity = .36
        world.node_tree.links.new(sky.outputs[0], background.inputs['Color'])
        background.inputs['Strength'].default_value = .45
        lamp = None
    sun = bpy.data.lights.new(scene.name + ' sun', type='SUN')
    sun.energy = 1.5 if indoor else 1.65
    sun.angle = .14 if indoor else .035
    if indoor:
        sun.color = (1, .86, .68)
    obj = bpy.data.objects.new(sun.name, sun)
    dest.objects.link(obj)
    obj.rotation_euler = (.59, -.62, -.70) if indoor else Vector((.48, -.51, -.78)).to_track_quat('-Z', 'Y').to_euler()
    return lamp


def make_scene(name, existing=None):
    scene = existing or bpy.data.scenes.new(name)
    scene.name = name
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = scene.cycles.glossy_bounces = 2
    scene.cycles.sample_clamp_indirect = 1.75
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 120
    return scene


def label_action(data, title):
    if data.animation_data and data.animation_data.action:
        data.animation_data.action.name = 'Study | ' + title


def study_actions(study, lamp):
    lookup = study.objects.__getitem__
    cover, leaf, flap = [lookup(n) for n in ('NotebookCover', 'NotebookLeaf', 'LetterFlap')]
    drawer, shade = lookup('Drawer'), lookup('LampShade')
    flex_data = lookup('NotebookPageFlex').data.shape_keys
    flex = flex_data.key_blocks['Flex']
    for obj in (cover, leaf, flap, shade):
        obj.rotation_mode = 'QUATERNION'
    rotations = {obj: obj.rotation_quaternion.copy() for obj in (cover, leaf, flap, shade)}
    positions = {obj: obj.location.copy() for obj in (cover, leaf, drawer)}

    def rotate(obj, axis, angle, frame):
        obj.rotation_quaternion = rotations[obj] @ Quaternion(axis, angle)
        obj.keyframe_insert('rotation_quaternion', frame=frame)

    def shift(obj, offset, frame):
        obj.location = positions[obj] + Vector(offset)
        obj.keyframe_insert('location', frame=frame)

    for frame, progress in [(1,0), (13,0), (32,.65), (47,1), (79,1), (99,.55), (118,0), (120,0)]:
        rotate(cover, (0,-1,0), 3.095 * progress, frame)
        shift(cover, (0,0,-.021 * progress), frame)
    for frame, progress in [(1,0), (21,0), (37,.40), (45,.70), (53,1), (82,1), (94,.65), (104,.30), (110,0), (120,0)]:
        rotate(leaf, (0,-1,0), 3.10 * progress, frame)
        shift(leaf, (0,0,-.014 * progress), frame)
        flex.value = math.sin(math.pi * progress)
        flex.keyframe_insert('value', frame=frame)
    for frame, progress in [(1,0),(18,0),(45,1),(82,1),(112,0),(120,0)]:
        rotate(flap, (1,0,0), -2.73 * progress, frame)
        shift(drawer, (0,-.38*progress,0), frame)
    for frame, progress in [(1,0),(57,0),(66,1),(78,1),(90,0),(120,0)]:
        rotate(shade, (1,0,0), .14 * progress, frame)
        lamp.data.energy = 2.8 * (1-progress)
        lamp.data.keyframe_insert('energy', frame=frame)
    for data, label in [(cover,'cloth cover'),(leaf,'turning leaf'),(flex_data,'paper flex'),
                        (flap,'wax-sealed letter'),(drawer,'writing drawer'),
                        (shade,'banker lamp'),(lamp.data,'lamp light')]:
        label_action(data, label)
    for frame, label in [(1,'書斎 / Closed'),(37,'ページをめくる / Page turn'),
                         (56,'開いた机 / Open'),(118,'元に戻る / Closed')]:
        study.timeline_markers.new(label, frame=frame)
    study.frame_set(1)


def set_idle(cat_objects):
    # Keep both original reusable actions; the saved first view uses the idle pose.
    for rig in cat_objects:
        if rig.type != 'ARMATURE' or not rig.animation_data:
            continue
        animation = rig.animation_data
        idle = None
        for track in animation.nla_tracks:
            for strip in track.strips:
                if strip.action and 'idle' in strip.action.name.lower():
                    idle = strip.action
            track.mute = True
        if idle:
            animation.action = idle


def configure_editor(study):
    bpy.context.window.scene = study
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = None
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type != 'VIEW_3D':
                    continue
                space.region_3d.view_perspective = 'CAMERA'
                space.overlay.show_overlays = False
                space.shading.type = 'SOLID'
                space.shading.color_type = 'TEXTURE'
                space.shading.show_shadows = True
                space.clip_end = 3500
                space.clip_start = .015


def assemble(output, temporary):
    layout = world_layout()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    study = make_scene('Study', bpy.context.scene)
    room_group = collection(study, '書斎 / Room and furnishings')
    import_model('study-room', room_group, temporary)
    cat_group = collection(study, '猫 / Rigged tabby')
    cats, _ = import_model('cat', cat_group, temporary)
    cat = locator('Rug cat', cat_group, study.objects['SocketCat'])
    cat.location = (0,-.02,-.001)
    cat.rotation_euler.z = .91
    parent_roots(cats, cat)
    set_idle(cats)
    rig = collection(study, '書斎 / Cameras and lighting')
    lamp = daylight(study, rig, indoor=True)
    seat = layout['seat']
    study.camera = camera(rig, 'Camera.Study', seat['position'], seat['target'], seat['fov'])
    study_actions(study, lamp)
    master_models = {}
    for region, asset in REGIONS.items():
        scene = make_scene(region.capitalize())
        ground_group = collection(scene, scene.name + ' / Terrain, streets and buildings')
        grounds, doc = import_model(asset, ground_group, temporary)
        metadata = next(node['extras'] for node in doc['nodes'] if node.get('extras', {}).get('region') == region)
        x, z = metadata['origin']
        ground = locator('Terrain.' + scene.name, ground_group)
        ground.location = (x,-z,0)
        ground['source_glb'] = asset + '.glb'
        parent_roots(grounds, ground)
        rig = collection(scene, scene.name + ' / Cameras and daylight')
        daylight(scene, rig, indoor=False)
        for site in layout['sites']:
            if site['region'] != region:
                continue
            key = site['key']
            short = SHORT[key]
            dest = collection(scene, site['title'] + ' / ' + key)
            objects, _ = import_model(key, dest, temporary)
            minimum, maximum = bounds(objects)
            master_models[key] = objects, minimum, maximum
            site_anchor = locator('Site.' + short, dest)
            site_anchor['source_glb'] = key + '.glb'
            site_anchor.location = (site['position'][0],-site['position'][1],site.get('foundationY',0))
            site_anchor.rotation_euler.z = site['rotation']
            parent_roots(objects, site_anchor)
            view = layout['views'][key]
            cam = camera(rig, 'Camera.' + short, view['eye'], view['target'], view['fov'], outdoor=True)
            frame = 1 if short in ('auditorium','castle') else 73
            marker = scene.timeline_markers.new(site['title'], frame=frame)
            marker.camera = cam
            if frame == 1:
                scene.camera = cam
        scene.frame_set(1)

    bpy.context.window.scene = study
    for key, (socket, envelope) in MINIATURES.items():
        dest = collection(study, '卓上模型 / ' + SHORT[key])
        anchor = locator('Miniature.' + SHORT[key], dest, study.objects[socket])
        objects, minimum, maximum = master_models[key]
        size = maximum - minimum
        blender_dimensions = (envelope[0],envelope[2],envelope[1])
        scale = min(limit/dimension for limit, dimension in zip(blender_dimensions, size))
        center = (minimum + maximum) / 2
        center.z = minimum.z
        anchor.scale = (scale,)*3
        anchor.location = -center * scale
        linked_landmark(objects, dest, anchor, key)
    for group in list(bpy.data.collections):
        if not group.objects and not group.children:
            bpy.data.collections.remove(group)
    note = bpy.data.texts.new('はじめに / About this file')
    note.write("""木村紀喜の書斎・早稲田・唐津

画面上部のシーン選択で Study、Waseda、Karatsu を切り替えられます。
Study のタイムラインを再生すると、ノートと封筒、引き出し、ランプが動きます。
猫のアーマチュアには、待機と歩行のモーションがあります。
Waseda と Karatsu は1フレーム目と73フレーム目で到着地点のカメラが切り替わります。
テンキーの 0 でカメラ表示を切り替えます。オーバーレイはビューポートの右上で切り替えます。
机上の4つの模型は、実寸の建物と像とメッシュを共有しています。
材質画像はすべてこのファイルに含まれています。
""")
    configure_editor(study)
    bpy.ops.file.pack_all()
    missing = [img.name for img in bpy.data.images if img.source == 'FILE' and not img.packed_file]
    if missing:
        raise RuntimeError('External texture dependency: ' + ', '.join(missing))
    bpy.context.preferences.filepaths.save_version = 0
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True, relative_remap=False)
    print('ASSEMBLY', output, output.stat().st_size, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    with tempfile.TemporaryDirectory(prefix='blender-world-') as tmp:
        assemble(args.output.resolve(), Path(tmp))
