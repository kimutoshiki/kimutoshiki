"""Finishing pass for the bronze Okuma monument in the landmark authoring scene."""

from math import atan2, cos, exp, pi, sin

import bpy
import bmesh
from mathutils import Matrix, Vector


def placement(translation, rotation):
    """The native model describes its portrait and cap with Three's XYZ order."""
    rx, ry, rz = rotation
    return (
        Matrix.Translation(translation)
        @ Matrix.Rotation(rx, 4, 'X')
        @ Matrix.Rotation(ry, 4, 'Y')
        @ Matrix.Rotation(rz, 4, 'Z')
    )


# Native +Z points toward the face. Blender uses +Z up.
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
HEAD = placement((.19, 16.055, .04), (-.025, .115, -.065))
HEAD_LOCAL = HEAD.inverted()
CAP = TO_BLENDER @ HEAD @ placement((.013, .815, .006), (-.025, .34, -.040))


def ramp(low, high, x):
    t = max(0., min(1., (x-low)/(high-low)))
    return t*t*(3.-2.*t)


def bump(x, center, width):
    return exp(-((x-center)/width)**2)


def model_face(point):
    """Bring the bony outer orbit forward against the softer ageing cheek."""
    x, y, z = point
    ax = abs(x)
    side = -1 if x < 0 else 1
    # Seat the helix against the temple. In a low-angle view this connection
    # distinguishes a human ear from a detached flat disc beside the head.
    if .399 < ax < .56 and -.165 < y < .204 and -.149 < z < .14:
        point.x -= side*.044*ramp(.399, .485, ax)*(1.-ramp(.108, .15, abs(z)))
    if not .085 < z < .74 or ax > .478 or y < -.596 or y > .525:
        return
    mask = ramp(.085, .215, z) * (1.-ramp(.418, .478, ax))
    mask *= ramp(-.596, -.50, y) * (1.-ramp(.42, .525, y))

    # The lower eye is bounded by a shallow oblique trough that tucks under
    # the cheekbone. Work the original skin surface, including the eyelids.
    corner = .012 - .20*(ax-.23) - .32*(ax-.23)**2 + side*.005
    relief = .026*bump(ax, .32, .086)*bump(y, corner-.033, .062)
    relief -= .016*bump(ax, .205, .107)*bump(y, corner-.035, .027)
    relief += .014*bump(ax, .179, .105)*bump(y, corner+.006, .027)
    relief += .017*bump(ax, .139, .080)*bump(y, .205 + side*.007, .056)
    # A continuous plane from the bridge into the forehead, a softly divided
    # chin and gently hollowed temples retain the sober cast-bronze expression.
    relief += .021*bump(x, .009, .083)*bump(y, .232, .12)
    relief -= .018*bump(ax, .355, .081)*bump(y, .275, .15)
    relief += .018*bump(x, .014, .125)*bump(y, -.48, .082)
    relief -= .012*bump(x, .008, .020)*bump(y, -.448, .048)
    jaw = .30-.20*(y+.35)
    relief += .016*bump(ax, jaw, .072)*bump(y, -.30, .122)
    relief -= .013*bump(ax, .225+.27*(-y-.22), .023)*bump(y, -.265, .089)
    # Smooth the old tooling between lips and chin and keep the drooping
    # corners asymmetrical. Narrow eyelid openings sit deep in the socket.
    lip = -.273-.123*min(1., ax/.245)**1.65
    relief -= .033*bump(x, .01, .213)*bump(y, lip-.026, .029)
    relief += .021*bump(x, 0, .19)*bump(y, -.405, .024)
    relief -= .032*bump(x, .012, .204)*bump(y, -.50, .089)
    for forehead in (.318, .392, .461):
        relief += .007*bump(x,.005,.29)*bump(y,forehead+.046*(x/.35)**2,.012)
    eyelid = .096 - .07*(ax-.16) + side*.006
    point.y += mask*(.049*bump(ax,.207,.073)*bump(y,-.35,.064)
                     - .33*(y-eyelid)*bump(ax,.205,.150)*bump(y,eyelid,.059))
    point.z += relief*mask
    point.x += side*.012*bump(ax, .335, .077)*bump(y, -.10, .12)*mask


def model_cloth(point):
    """Shape long gravity folds and the slight lateral pull under the shoulders."""
    x, y, z = point
    if not 8.68 < y < 15.19 or abs(x) > 1.62 or abs(z) > .96:
        return
    t = (y-8.62)/6.77
    hem = ramp(8.68, 9.02, y)
    shoulder = 1.-ramp(14.95, 15.19, y)
    radius = 1.47-.54*t
    # Only broad gown surfaces are retouched. The cane and the hand remain
    # individually legible even where the right sleeve meets the silhouette.
    angle = atan2(x/radius, (z+.05)/.65)
    away_from_cane = 1.-ramp(.10, .25, -x-1.05)*ramp(.16, .40, z)
    mask = hem*shoulder*away_from_cane
    # Three irregular flutes open progressively below their attachment points.
    # This also gives a low, raking gallery light a broad surface to graze.
    relief = 0.
    for base, sweep, strength in ((-.64, -.23, .044), (.86, .34, .041),
                                  (2.42, -.27, .036), (-2.19, .23, .040)):
        center = base+sweep*t+.036*sin(t*5.2+base)
        dist = atan2(sin(angle-center), cos(angle-center))
        relief += strength*(bump(dist, 0., .112)-.66*bump(dist, .123, .066))
    front = ramp(.25, .63, z)
    for start, slope in ((14.91, .47), (14.76, .42), (14.52, .35)):
        height = start-slope*abs(x-.08)
        relief += .014*bump(y, height, .049)*bump(abs(x), .69, .36)*front
    relief *= mask
    point.x += sin(angle)*relief
    point.z += cos(angle)*relief



def model_bow(point):
    """Turn the original cast bow into two gathered wings and a tied centre."""
    if not 15.055 < point.y < 15.245 or not .293 < point.z < .454:
        return
    # The native bow comprises three ellipsoids. Identifying their shells
    # analytically also works after the materials have been consolidated.
    for side in (-1, 1):
        cx, cy, cz = .16+side*.137, 15.15, .358
        co, si = cos(side*.13), sin(side*.13)
        dx, dy, dz = point.x-cx, point.y-cy, point.z-cz
        local_x, local_y = (co*dx+si*dy)/.145, (-si*dx+co*dy)/.068
        local_z = dz/.055
        if abs(local_x**2 + local_y**2 + local_z**2 - 1.) > .0006:
            continue
        outward = local_x*side
        opening = .51+.79*ramp(-.9, .83, outward)
        x, y = .145*local_x, .075*local_y*opening
        point.x = cx + co*x-si*y
        point.y = cy + si*x+co*y + .01*outward*outward
        pinch = .014*bump(local_y, 0., .22)*bump(outward, -.10, .72)
        point.z = .420 + .047*local_z - pinch
        return
    x, y, z = (point.x-.16)/.053, (point.y-15.145)/.056, (point.z-.397)/.047
    if abs(x*x+y*y+z*z-1.) < .0006:
        point.x = .16 + .053*(1 if x>=0 else -1)*abs(x)**.76
        point.y = 15.145 + .054*(1 if y>=0 else -1)*abs(y)**.78
        point.z = .460 + .047*z


def retouch(scene):
    native_from_blender = TO_BLENDER.inverted()
    changed = 0
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        local_to_native = native_from_blender @ obj.matrix_world
        native_to_local = local_to_native.inverted()
        mesh = obj.data
        touched = False
        for vertex in mesh.vertices:
            point = local_to_native @ vertex.co
            # The base, incised inscription and shoe soles keep their contact.
            if point.y <= 8.68 or point.y > 16.71:
                continue
            previous = point.copy()
            if point.y > 15.44:
                face_point = HEAD_LOCAL @ point
                model_face(face_point)
                point = HEAD @ face_point
            else:
                model_bow(point)
                model_cloth(point)
            if (point-previous).length_squared > 1e-10:
                vertex.co = native_to_local @ point
                touched = True
                changed += 1
        if touched:
            # A latitude strip in the imported cast meets itself down the
            # centre of the face. Unite paired boundary vertices so specular
            # light crosses the forehead, lips and chin without a centre seam.
            bm = bmesh.new()
            bm.from_mesh(mesh)
            candidates = []
            latitudes = {}
            for v in bm.verts:
                world = local_to_native @ v.co
                if 15.42 < world.y < 16.61:
                    face = HEAD_LOCAL @ world
                    if abs(face.x) < .0002 and face.z > .10:
                        latitude = round(face.y, 3)
                        latitudes.setdefault(latitude, []).append((v, face.z))
            for points in latitudes.values():
                # The source's small expression asymmetry displaces the two
                # border vertices in depth by slightly different amounts.
                if len(points) == 2 and abs(points[1][1]-points[0][1]) < .035:
                    a, b = points[0][0], points[1][0]
                    a.co = b.co = (a.co+b.co)*.5
                    candidates.extend((a,b))
            if candidates:
                bmesh.ops.remove_doubles(bm, verts=candidates, dist=.00001)
                bm.to_mesh(mesh)
            bm.free()
            mesh.update()
    return changed


def torchon_tassel(scene):
    """Closed cast bronze yarn and ties, joined into one smooth mesh."""
    vertices, faces = [], []

    def strand(centers, radius, sides=6):
        start = len(vertices)
        frame = Vector((0., 0., 1.))
        for j, center in enumerate(centers):
            tangent = (centers[min(j+1, len(centers)-1)]-centers[max(0, j-1)]).normalized()
            if abs(frame.dot(tangent)) > .95:
                frame = Vector((0., 1., 0.))
            frame = (frame - frame.dot(tangent)*tangent).normalized()
            second = tangent.cross(frame)
            for k in range(sides):
                angle = 2*pi*k/sides
                offset = radius*(cos(angle)*frame+sin(angle)*second)
                vertices.append(CAP @ (center+offset))
                if j > 0:
                    a = start+(j-1)*sides+k
                    b = start+(j-1)*sides+(k+1)%sides
                    faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(start+i for i in reversed(range(sides))))
        end = start+(len(centers)-1)*sides
        faces.append(tuple(end+i for i in range(sides)))

    # Two turns of binding press into the original tassel's distinct neck.
    # The relief grows beneath the knot and ends inside the fluted bundle.
    bound = []
    for j in range(53):
        t = j/52
        ang = 2*pi*(.07+2.12*t)
        bound.append(Vector((.882+(.046+.013*t)*cos(ang),
                             -.117-.048*t, .259+.003*t+(.037+.010*t)*sin(ang))))
    strand(bound,.0064,7)

    # Follow the fluted weight's measured elliptical cross sections. Each yarn
    # hangs under gravity; their small changing twist catches side lighting.
    profile = ((-.151,.055,.044,.880,.259),(-.27,.065,.049,.886,.268),
               (-.47,.075,.054,.889,.275),(-.549,.070,.051,.891,.280),
               (-.574,.034,.029,.886,.280))
    for k in range(10):
        centers = []
        for j in range(19):
            t = j/18
            y = -.150-.419*t
            lo = next((i for i in range(len(profile)-1) if y>=profile[i+1][0]), len(profile)-2)
            r0, r1 = profile[lo],profile[lo+1]
            f = max(0.,min(1.,(y-r0[0])/(r1[0]-r0[0])))
            rx, rz, cx, cz = [a+(b-a)*f for a,b in zip(r0[1:],r1[1:])]
            angle = k*2*pi/10 + .20*sin(t*pi+.31*k) - .58*t
            outer = 1.+.054*cos(12*angle)
            centers.append(Vector((cx+(rx*outer-.001)*sin(angle), y,
                                   cz+(rz*outer-.001)*cos(angle))))
        strand(centers,.0042,5)
    mesh = bpy.data.meshes.new('Modelled tassel yarn and winding')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    base = (.105, .132, .119, 1.)
    material = bpy.data.materials.new('Rubbed patina on the braided tassel')
    material.diffuse_color = base
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = base
    shader.inputs['Metallic'].default_value = .62
    shader.inputs['Roughness'].default_value = .46
    mesh.materials.append(material)
    result = bpy.data.objects.new('Braided silk tassel cast in bronze',mesh)
    scene.collection.objects.link(result)
    return result


def refine_statue(scene):
    """Sculpt the imported monument in place; return the added tassel mesh."""
    existing = next((o for o in scene.objects if o.get('okuma_cast_finishing')), None)
    if existing:
        return existing
    retouch(scene)
    detail = torchon_tassel(scene)
    detail['okuma_cast_finishing'] = True
    return detail
