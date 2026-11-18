"""Verify a saved, portable Blender assembly against the website's metric scene plan.

blender -b /tmp/kimura-world.blend --python-exit-code 1 -P tools/blender/verify_assembly.py
"""
import json
import math
from pathlib import Path
import subprocess

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
NAMES = {
    'okuma-auditorium': 'auditorium', 'okuma-statue': 'statue',
    'karatsu-castle': 'castle', 'karatsu-bank': 'bank',
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def production_plan():
    # Read the same registered sites, ground heights and camera targets used
    # by explorePlace(). In Blender metres, site Y-up (x,y,z) is (x,-z,y).
    query = """
import { HOME, LANDMARK_SITES, OUTDOOR_VIEWS, regionalHeight, worldFov } from './scene/world-layout.js';
const views = {};
for (const site of LANDMARK_SITES) {
    const view = OUTDOOR_VIEWS[site.key];
    const [x,z] = view.eye;
    views[site.key] = {
        region:site.region, height:site.height, fov:view.fov, anchor:[site.position[0],site.foundationY||0,site.position[1]],
        eye:[x,HOME.eyeHeight+regionalHeight(site.region,x,z),z], target:view.target
    };
}
console.log(JSON.stringify({seat:{...HOME.seated,fov:worldFov(1.5,true)}, views}));
"""
    output = subprocess.check_output(['node', '--input-type=module', '-e', query], cwd=ROOT, text=True)
    return json.loads(output)


def coords(xyz):
    x, y, z = xyz
    return Vector((x, -z, y))


def select_scene(scene):
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    return bpy.context.evaluated_depsgraph_get()


def check_camera(scene, name, eye, target, vertical_fov):
    cam = scene.objects.get(name)
    require(cam and cam.type == 'CAMERA' and cam.data.type == 'PERSP', f'{scene.name} lacks perspective {name}')
    cam = cam.evaluated_get(bpy.context.evaluated_depsgraph_get())
    pos = cam.matrix_world.translation
    direction = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    distance = (pos - coords(eye)).length
    error = math.degrees(direction.angle((coords(target) - pos).normalized()))
    require(distance < .015 and error < .25, f'{name} differs from site camera by {distance:.3f} m, {error:.3f}°')
    corners = cam.data.view_frame(scene=scene)
    actual_fov = math.degrees(2*math.atan(abs(corners[0].y / corners[0].z)))
    require(abs(actual_fov-vertical_fov) < .15, f'{name} vertical field of view is {actual_fov:.2f}°')
    return cam


def visible_geometry(graph):
    objects = set()
    for instance in graph.object_instances:
        obj = instance.object
        if instance.show_self and obj.type == 'MESH' and not obj.hide_render and obj.data.polygons:
            objects.add(obj.original)
    return objects


def placement_geometry(anchor, visible):
    if anchor.instance_type == 'COLLECTION' and anchor.instance_collection:
        members = anchor.instance_collection.all_objects
    else:
        members = anchor.children_recursive
    members = {ob for ob in members if ob.type == 'MESH' and ob in visible}
    require(members, f'{anchor.name} has no visible mesh instances')
    return members


def mesh_height(graph, meshes):
    low, high = math.inf, -math.inf
    for instance in graph.object_instances:
        if instance.object.original in meshes:
            for corner in instance.object.bound_box:
                z = (instance.matrix_world @ Vector(corner)).z
                low, high = min(z, low), max(z, high)
    return high - low


def visible_in_camera(scene, graph, camera, meshes):
    # Trace through the camera film gate. Checking the first surface hit also
    # catches arrivals pointed into the back of a wall or behind another model.
    corners = camera.data.view_frame(scene=scene)
    left, right = min(c.x for c in corners), max(c.x for c in corners)
    bottom, top = min(c.y for c in corners), max(c.y for c in corners)
    rotation = camera.matrix_world.to_quaternion()
    hits = 0
    for iy in range(11):
        for ix in range(15):
            x = left + (ix + .5) * (right-left)/15
            y = bottom + (iy + .5) * (top-bottom)/11
            ray = (rotation @ Vector((x, y, corners[0].z))).normalized()
            ok, _, _, _, ob, _ = scene.ray_cast(graph, camera.matrix_world.translation, ray, distance=camera.data.clip_end)
            if ok and ob.original in meshes:
                hits += 1
    return hits


def check_regions(plan):
    shapes = {}
    scene_counts = {}
    for name, main in [('Waseda', 'auditorium'), ('Karatsu', 'castle')]:
        scene = bpy.data.scenes[name]
        graph = select_scene(scene)
        visible = visible_geometry(graph)
        require(scene.camera and scene.camera.name == 'Camera.' + main, f'{name} active arrival camera')
        sites = {key: spec for key, spec in plan['views'].items() if spec['region'] == name.lower()}
        require(len(sites) == 2, f'{name} should have two registered site arrivals')
        architecture = set()
        for key, spec in sites.items():
            short = NAMES[key]
            cam = check_camera(scene, 'Camera.' + short, spec['eye'], spec['target'], spec['fov'])
            anchor = scene.objects.get('Site.' + short)
            require(anchor and anchor.type == 'EMPTY', f'{name} lacks Site.{short}')
            offset = (anchor.evaluated_get(graph).matrix_world.translation - coords(spec['anchor'])).length
            require(offset < .015, f'Site.{short} differs from its registered foundation by {offset:.3f} m')
            meshes = placement_geometry(anchor, visible)
            architecture.update(meshes)
            height = mesh_height(graph, meshes)
            require(abs(height-spec['height']) < .2*spec['height'],
                    f'{short} is {height:.2f} m tall, site reference is {spec["height"]:.2f} m')
            hits = visible_in_camera(scene, graph, cam, meshes)
            require(hits > 0, f'{cam.name} sees no unoccluded surface of {short}')
            shapes[short] = {obj.data for obj in meshes}
            print(f'{cam.name}: {len(meshes)} meshes, {hits}/165 camera rays first hit target')
        require(visible - architecture, f'{name} lacks visible regional surroundings')
        markers = [m for m in scene.timeline_markers if m.camera]
        require({m.camera.name for m in markers} == {'Camera.'+NAMES[key] for key in sites},
                f'{name} needs both camera arrivals bound to its timeline')
        for marker in markers:
            scene.frame_set(marker.frame)
            require(scene.camera == marker.camera, f'{name} fails to switch camera at frame {marker.frame}')
        scene.frame_set(1)
        scene_counts[name] = len(visible)
    return shapes, scene_counts


def check_hidden_controls(study, rig):
    controls = {bone.custom_shape for bone in rig.pose.bones if bone.custom_shape}
    # Viewport visibility does not decide what Cycles renders. A multi-linked
    # helper is exposed if even one non-excluded collection path renders it.
    def render_collections(layer):
        if layer.exclude or layer.collection.hide_render:
            return
        yield layer.collection
        for child in layer.children:
            yield from render_collections(child)

    for view_layer in study.view_layers:
        if not view_layer.use:
            continue
        eligible = set(render_collections(view_layer.layer_collection))
        for obj in controls:
            exposed = [group.name for group in obj.users_collection if group in eligible]
            require(obj.hide_render or not exposed,
                    f'Rig control {obj.name} would render on {view_layer.name} via {", ".join(exposed)}')
    return len(controls)


def check_cat(study, visible):
    rigs = [ob for ob in study.objects if ob.type == 'ARMATURE' and ob.animation_data]
    rigs = [rig for rig in rigs if {'Walk','Idle'} <= {track.name for track in rig.animation_data.nla_tracks}]
    require(len(rigs) == 1, 'Expected one study cat rig with both Walk and Idle NLA clips')
    rig = rigs[0]
    body = [ob for ob in visible if ob.find_armature() == rig and ob.vertex_groups]
    require(body, 'No visible study meshes are weighted to the animated cat skeleton')
    for track in rig.animation_data.nla_tracks:
        if track.name not in ('Walk', 'Idle'):
            continue
        actions = [strip.action for strip in track.strips if strip.action]
        require(actions, f'The {track.name} clip has no action')
        bone_curves = [curve for action in actions for curve in action.fcurves if curve.data_path.startswith('pose.bones[')]
        moving = any(max(p.co.y for p in curve.keyframe_points) - min(p.co.y for p in curve.keyframe_points) > 1e-4
                     for curve in bone_curves if len(curve.keyframe_points) > 1)
        require(moving, f'The {track.name} action has no keyed bone movement')
    return len(body), check_hidden_controls(study, rig)


def check_mechanisms(study):
    ids = ['NotebookCover','NotebookLeaf','LetterFlap','Drawer','LampShade']
    joints = [study.objects[name] for name in ids]
    flex = study.objects['NotebookPageFlex'].data.shape_keys
    require(flex and 'Flex' in flex.key_blocks, 'The study notebook must retain its real flexible page')
    lamp = study.objects['Light.Desk lamp'].data
    frames = {1,120}
    for obj in [*joints,flex,lamp]:
        animation = obj.animation_data
        require(animation and animation.action, f'{obj.name} is missing its demonstration action')
        require(animation.action.name.startswith('Study | '), f'{obj.name} lacks a named study action')
        for curve in animation.action.fcurves:
            frames.update(round(point.co.x) for point in curve.keyframe_points if 1 <= point.co.x <= 120)
    study.frame_set(1)
    graph = bpy.context.evaluated_depsgraph_get()
    closed = {joint.name:joint.evaluated_get(graph).matrix_world.copy() for joint in joints}
    turns = {name:0. for name in ids if name != 'Drawer'}
    forward = page_flex = 0.
    energies = []
    for frame in sorted(frames):
        study.frame_set(frame)
        energies.append(lamp.evaluated_get(graph).energy)
        for name in turns:
            initial = closed[name].to_quaternion()
            current = study.objects[name].evaluated_get(graph).matrix_world.to_quaternion()
            angle = initial.rotation_difference(current).angle
            turns[name] = max(turns[name], min(angle, 2*math.pi-angle))
        # A negative Blender Y displacement moves the drawer toward the seated visitor.
        forward = max(forward, closed['Drawer'].translation.y-study.objects['Drawer'].evaluated_get(graph).matrix_world.translation.y)
        page_flex = max(page_flex, flex.evaluated_get(graph).key_blocks['Flex'].value)
    require(forward > .25, f'The drawer needs to open towards the seated visitor, measured {forward:.3f} m')
    require(turns['NotebookCover'] > 2.5 and turns['NotebookLeaf'] > 2.5, f'Notebook cover and leaf do not open: {turns}')
    require(turns['LetterFlap'] > 1.8 and turns['LampShade'] > .08, f'Envelope or lamp hinge did not move: {turns}')
    require(page_flex > .25, f'The page shape did not flex during the turn: {page_flex:.3f}')
    require(energies[0] > 0 and min(energies) < .01 and abs(energies[-1]-energies[0]) < .01,
            'Lamp light must switch off and back on')
    for joint in joints:
        end = joint.evaluated_get(graph).matrix_world
        delta = closed[joint.name].inverted() @ end
        require(delta.translation.length < .001 and abs(delta.to_quaternion().w) > .99999,
                f'{joint.name} does not return to its closed frame 1 pose')
    require(flex.evaluated_get(graph).key_blocks['Flex'].value < .01, 'Paper is still bent after closure')
    study.frame_set(1)
    return {'drawerForwardMetres':round(forward,3),'openDegrees':{k:round(math.degrees(v),1) for k,v in turns.items()},
            'pageFlex':round(page_flex,3)}


def verify():
    plan = production_plan()
    require(set(bpy.data.scenes.keys()) == {'Study','Waseda','Karatsu'}, 'Expected Study, Waseda and Karatsu scenes')
    for scene in bpy.data.scenes:
        require(scene.frame_current == 1, f'{scene.name} is not saved at frame 1')
        require(scene.unit_settings.system == 'METRIC' and abs(scene.unit_settings.scale_length-1) < 1e-6,
                f'{scene.name} must use real metres')
    require(not bpy.data.libraries, 'The assembly still uses external Blender libraries')
    textures = [img for img in bpy.data.images if img.source in {'FILE','TILED','SEQUENCE','MOVIE'}]
    require(textures, 'No embedded file-backed texture images')
    for image in textures:
        require(len(image.packed_files)>0 and all(p.packed_file and p.packed_file.size for p in image.packed_files),
                f'Image has no packed pixel data: {image.name} ({image.filepath})')
    shapes, scene_counts = check_regions(plan)
    study = bpy.data.scenes['Study']
    graph = select_scene(study)
    visible = visible_geometry(graph)
    cam = check_camera(study, 'Camera.Study', plan['seat']['position'], plan['seat']['target'], plan['seat']['fov'])
    require(study.camera == cam.original, 'The desk must be the active Study camera')
    require(visible_in_camera(study, graph, cam, visible)>0, 'The desk camera sees no physical surfaces')
    for short, region_meshes in shapes.items():
        mini = study.objects.get('Miniature.' + short)
        require(mini and mini.type == 'EMPTY', f'The desk lacks Miniature.{short}')
        meshes = placement_geometry(mini, visible)
        height = mesh_height(graph, meshes)
        require(.05 < height < .60, f'{short} desk model is not tabletop-sized ({height:.2f} m)')
        require({obj.data for obj in meshes} == region_meshes,
                f'{short} miniature does not share the full-size Blender mesh data')
    cats, controls = check_cat(study, visible)
    travel = check_mechanisms(study)
    print('Assembly verified:',json.dumps({'visibleMeshes':{**scene_counts,'Study':len(visible)},
          'packedImages':len(textures),'skinnedCatMeshes':cats,'hiddenRigControls':controls,'desk':travel},ensure_ascii=False))


verify()
