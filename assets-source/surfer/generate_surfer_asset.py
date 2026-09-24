"""The surfer's body: the Bearded Beachcomber scan hung on the rider's physics skeleton.

Run from the repository root (Blender 5.2, headless, about ten seconds):

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P assets-source/surfer/generate_surfer_asset.py

SURFER_SOURCE: the scan (default assets-source/surfer/source/bearded_beachcomber.glb,
not in git: 20 MB, from Sketchfab — see README.md). Writes
public/models/surfer/surfer.glb and assets-source/surfer/surfer-authoring-manifest.json.
SURFER_DEBUG_BLEND: also save the working .blend there, for a look in Blender.

What it does, in order:
1. The scan in the rider's frame (riderSkeleton.js: 1.74 m, facing +Z, left on +X,
   soles on y = 0), welded, the hair's loose crumbs dropped, decimated to 60 000
   triangles (at that count the face and the beard read as the source's 280 000).
2. Where the scan fused what a body keeps apart — each upper arm along the side of
   the chest, the thighs of the shorts from the knees to the crotch — the surface is
   cut along its creases up to where a real armpit and crotch begin, and each side
   closed with a patch of its own (the arm's inner side, the chest's side, each
   thigh's inner side), so a raised arm or a wide stance opens a gap, not a web.
3. Weights: the body cut into its segments — each limb flooded from its tip over the
   skin, never across a cut, bounded at the trunk by the shoulder, hip and neck
   planes — and blended across each joint by distance over the skin, so no bone
   pulls skin it only lay beside.
4. The scan's pose (arms out over the belly, feet apart and turned out) moved into
   the physics rest pose by its own weights: each bone maps its joints onto the
   physics joints, so at runtime a bone is simply its body's pose.
5. The patches' texture: the atlas grows by a strip, each patch gets a region of
   it, painted by harmonic interpolation of the scan's colours along its rim.
"""

import heapq
import json
import math
import os
import re
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, geometry

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('SURFER_SOURCE', ROOT / 'assets-source/surfer/source/bearded_beachcomber.glb'))
OUT_GLB = Path(os.environ.get('SURFER_OUTPUT', ROOT / 'public/models/surfer/surfer.glb'))
OUT_MANIFEST = Path(os.environ.get('SURFER_MANIFEST', ROOT / 'assets-source/surfer/surfer-authoring-manifest.json'))
DEBUG_BLEND = os.environ.get('SURFER_DEBUG_BLEND')

TARGET_TRIANGLES = 60000
MAX_INFLUENCES = 4
# The patches' vertex spacing (m): they are smooth, and hidden while the parts touch.
PATCH_STEP = 0.015

# The source in its own glTF frame (y up): turned 43° about y it faces +z; the feet's
# midpoint is at (x, z) = (0.0715, -0.0465), the soles at y = -0.949, the hair's top
# 1.895 above them.
SCAN_TURN = math.radians(43.0)
SCAN_CENTRE = (0.0715, -0.0465)
SCAN_FLOOR = -0.949
SCAN_HEIGHT = 1.895
RIDER_HEIGHT = 1.74


def B(p):
    """Rider frame (three.js: x left, y up, z forward) to Blender's (z up, facing -y)."""
    return Vector((p[0], -p[2], p[1]))


def rider(v):
    return (v.x, v.z, -v.y)


# --- the physics skeleton, read from riderSkeleton.js so the two never disagree ---------

SKELETON_JS = (ROOT / 'src/components/surfboard/riderSkeleton.js').read_text()


def _floats(text):
    return [float(x) for x in text.split(',')]


SEGMENT_CENTRE = {name: _floats(centre) for name, centre in re.findall(
    r"\['(\w+)', [\d.]+, \[[^\]]+\], \[([^\]]+)\], \d+\]", SKELETON_JS)}
PHYSICS_JOINT = {name: _floats(anchor) for name, anchor in re.findall(
    r"name: '(\w+)', parent: '\w+', child: '\w+', anchor: \[([^\]]+)\]", SKELETON_JS)}
JOINT_PARENT = {child: parent for parent, child in re.findall(r"parent: '(\w+)', child: '(\w+)'", SKELETON_JS)}
SEGMENT_NAMES = list(SEGMENT_CENTRE)
assert len(SEGMENT_NAMES) == 14 and len(PHYSICS_JOINT) == len(JOINT_PARENT) == 13, (SEGMENT_NAMES, PHYSICS_JOINT, JOINT_PARENT)
PHYSICS_JOINT['hips'] = [0.0, PHYSICS_JOINT['hipL'][1], 0.0]
for side, sign in (('L', 1), ('R', -1)):
    ankle = PHYSICS_JOINT[f'ankle{side}']
    # The foot box runs from 7 cm behind the ankle to 19 cm ahead, its sole on y = 0.
    PHYSICS_JOINT[f'toe{side}'] = [ankle[0], 0.02, 0.19]
    PHYSICS_JOINT[f'wrist{side}'] = _floats(re.search(rf"wrist{side}: \[([^\]]+)\]", SKELETON_JS).group(1))
PHYSICS_JOINT['crown'] = [0.0, 1.75, 0.01]

# Each bone: its body's name, the joint it hangs from and the one it reaches to.
BONE_JOINTS = {
    'pelvis': ('hips', 'lumbar'), 'abdomen': ('lumbar', 'thoracic'), 'chest': ('thoracic', 'neck'), 'head': ('neck', 'crown'),
    'upperArmL': ('shoulderL', 'elbowL'), 'forearmL': ('elbowL', 'wristL'),
    'upperArmR': ('shoulderR', 'elbowR'), 'forearmR': ('elbowR', 'wristR'),
    'thighL': ('hipL', 'kneeL'), 'shinL': ('kneeL', 'ankleL'), 'footL': ('ankleL', 'toeL'),
    'thighR': ('hipR', 'kneeR'), 'shinR': ('kneeR', 'ankleR'), 'footR': ('ankleR', 'toeR'),
}
assert set(BONE_JOINTS) == set(SEGMENT_NAMES)

# --- the scan's own joints, in the rider frame -----------------------------------------
# Measured from plane sections of the source (contour centroids, the creases' concave
# points, the narrowest wrist, the feet's principal axes). The man stands with his hips
# 2-3 cm to his right of his feet, arms held out 15° by his belly, forearms 22° forward,
# feet 23° out, the thighs pressed together from 0.62 m up.
SCAN_JOINT = {
    'hips': (-0.02, 0.93, 0.0), 'lumbar': (-0.03, 1.05, 0.0), 'thoracic': (-0.03, 1.21, 0.0), 'neck': (-0.02, 1.50, 0.0),
    'crown': (-0.025, 1.74, 0.03),
    'shoulderL': (0.167, 1.39, -0.02), 'elbowL': (0.222, 1.135, -0.035), 'wristL': (0.268, 0.875, 0.07), 'handL': (0.255, 0.725, 0.085),
    'shoulderR': (-0.223, 1.39, -0.01), 'elbowR': (-0.29, 1.125, 0.005), 'wristR': (-0.331, 0.865, 0.117), 'handR': (-0.32, 0.72, 0.144),
    'hipL': (0.075, 0.93, 0.0), 'kneeL': (0.14, 0.50, 0.005), 'ankleL': (0.177, 0.085, 0.02), 'toeL': (0.266, 0.02, 0.204),
    'hipR': (-0.115, 0.93, 0.0), 'kneeR': (-0.135, 0.50, 0.01), 'ankleR': (-0.176, 0.085, 0.03), 'toeR': (-0.261, 0.02, 0.218),
}

# The fusions. A crease (an arm along the chest, thigh against thigh): the creases' x
# in the rider frame by height, (y, back crease x, front crease x); above the last row
# a real armpit or crotch begins, below the first the parts stand apart. A touch: a
# point contact, split between seeds on either part (cut_touch).
CONTACTS = {
    'armR': {'rows': [(1.12, -0.237, -0.239), (1.16, -0.239, -0.236), (1.20, -0.241, -0.226), (1.24, -0.243, -0.229),
                      (1.28, -0.237, -0.227), (1.32, -0.235, -0.222)],
             'top': 1.315, 'width': 0.06, 'z': (-0.13, 0.12), 'outer': -1, 'parts': ('upperArmR', 'chest'), 'kind': 'crease'},
    'armL': {'rows': [(1.15, 0.155, 0.163), (1.20, 0.157, 0.162), (1.24, 0.161, 0.166), (1.28, 0.159, 0.164), (1.32, 0.160, 0.162)],
             'top': 1.315, 'width': 0.06, 'z': (-0.14, 0.10), 'outer': 1, 'parts': ('upperArmL', 'chest'), 'kind': 'crease'},
    'thighs': {'rows': [(0.60, -0.017, -0.012), (0.64, -0.021, -0.009), (0.68, -0.022, -0.019), (0.72, -0.025, -0.030),
                        (0.76, -0.023, -0.042), (0.80, -0.020, -0.032)],
               'top': 0.80, 'width': 0.07, 'z': (-0.17, 0.20), 'outer': 1, 'parts': ('thighL', 'thighR'), 'kind': 'crease'},
    # The left index fingertip rests on the shorts' side wall (x 0.2215) at 0.71-0.73 m.
    'fingersL': {'kind': 'touch', 'box': ((0.19, 0.26), (0.66, 0.78), (-0.05, 0.16)), 'plane': 0.2215, 'dip': 0.008, 'outer': 1,
                 'parts': ('forearmL', 'pelvis')},
}
# How far a patch bulges past the plane it spans, as a share of its half-width: a
# pressed arm or thigh rounds out an inch; a fingertip's contact is a dot.
CREASE_BULGE = 0.3
TOUCH_BULGE = 0.2

manifest = {'source': str(SOURCE.name)}
t_start = time.time()


def log(*args):
    print(f'[surfer {time.time() - t_start:5.1f}s]', *args, flush=True)


# --- 1. the scan -------------------------------------------------------------------------

def load_scan():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    material = parts[0].data.materials[0]
    bm = bmesh.new()
    for o in parts:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        bmesh.ops.transform(tmp, matrix=o.matrix_world, verts=tmp.verts)
        me = bpy.data.meshes.new('part')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    manifest['sourceTriangles'] = len(bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    # Glb to Blender turned the source's y-up frame to z-up: y -> z, z -> -y.
    k = RIDER_HEIGHT / SCAN_HEIGHT
    to_rider = (Matrix.Scale(k, 4) @ Matrix.Rotation(SCAN_TURN, 4, 'Z')
                @ Matrix.Translation((-SCAN_CENTRE[0], SCAN_CENTRE[1], -SCAN_FLOOR)))
    bmesh.ops.transform(bm, matrix=to_rider, verts=bm.verts)
    # The body is one piece; a few crumbs of hair float free of it.
    pieces = islands(bm)
    crumbs = [v for piece in pieces[1:] for v in piece]
    bmesh.ops.delete(bm, geom=crumbs, context='VERTS')
    manifest['droppedCrumbs'] = len(pieces) - 1
    me = bpy.data.meshes.new('surfer')
    bm.to_mesh(me)
    bm.free()
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o)
    obj = bpy.data.objects.new('surfer', me)
    bpy.context.scene.collection.objects.link(obj)
    me.materials.append(material)
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    clean_material(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    if me.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    return obj


def islands(bm):
    bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, piece = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop()
            piece.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        out.append(piece)
    return sorted(out, key=len, reverse=True)


def clean_material(material):
    """Base colour, roughness (the G of the scan's metal-rough map) and normals. The
    scan's emission map is black and its metal all but zero: both go."""
    nt = material.node_tree
    bsdf = nt.nodes['Principled BSDF']
    for name in ('Emission Color', 'Metallic'):
        for link in list(bsdf.inputs[name].links):
            nt.links.remove(link)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Emission Strength'].default_value = 0.0
    for node in list(nt.nodes):
        if node.type == 'UVMAP' or (node.type == 'TEX_IMAGE' and not node.outputs[0].links):
            nt.nodes.remove(node)
    material.use_backface_culling = True
    nt.nodes.active = bsdf.inputs['Base Color'].links[0].from_node


def decimate(obj):
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = TARGET_TRIANGLES / len(obj.data.polygons)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    manifest['triangles'] = len(obj.data.polygons)


# --- 2. the fusions cut and closed ------------------------------------------------------

CAPS = []


def cut_fusions(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # cap: the patch a face belongs to; part: the segment a patch's vertex (rim or
    # inside) belongs to, + 1; seam: the patches' shared top edge, the hinge of an
    # armpit or a crotch, which no limb's flood crosses (segment()).
    layers = {'cap': bm.faces.layers.int.new('cap'), 'part': bm.verts.layers.int.new('part'),
              'seam': bm.verts.layers.int.new('seam')}
    manifest['cuts'] = {}
    for key, contact in CONTACTS.items():
        cut = cut_crease if contact['kind'] == 'crease' else cut_touch
        manifest['cuts'][key] = cut(bm, key, contact, layers)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    manifest['patches'] = [{k: c[k] for k in ('key', 'part', 'faces')} for c in CAPS]


def crease_x(contact, y, z):
    """The crease plane's x at height y: the back crease's for z < 0, the front's for
    z > 0, blended across the middle."""
    rows = contact['rows']
    ys = [r[0] for r in rows]
    back = float(np.interp(y, ys, [r[1] for r in rows]))
    front = float(np.interp(y, ys, [r[2] for r in rows]))
    t = min(max((z + 0.03) / 0.06, 0.0), 1.0)
    return back + (front - back) * t


def cut_crease(bm, key, contact, layers):
    """A long contact: faces labelled by the side of the crease plane they lie on, cut
    along the one chain where the labels meet — from the front crease's top down round
    the lower tip and up the back crease — and each side closed by a patch up to a
    shared top edge, where the armpit or the crotch really begins."""
    y_low, top = contact['rows'][0][0] - 0.03, contact['top']
    z0, z1 = contact['z']

    def side(face):
        c = rider(face.calc_center_median())
        if not (y_low <= c[1] <= top and z0 <= c[2] <= z1):
            return None
        off = c[0] - crease_x(contact, c[1], c[2])
        if abs(off) > contact['width']:
            return None
        return 0 if off * contact['outer'] > 0 else 1

    label = {f: side(f) for f in bm.faces}
    cut = [e for e in bm.edges if len(e.link_faces) == 2 and None not in (label[e.link_faces[0]], label[e.link_faces[1]])
           and label[e.link_faces[0]] != label[e.link_faces[1]]]
    # The crease is one chain; stray crossings elsewhere in the box are dropped.
    chain = biggest_piece(cut)
    ends = chain_ends(chain)
    assert len(chain) > 10 and len(ends) == 2, f'{key}: the crease is not one open chain ({len(chain)} edges, {len(ends)} ends)'
    rims = split(bm, chain, label)
    front, back = sorted(ends, key=lambda v: rider(v.co)[2], reverse=True)
    closing = [bm.verts.new(back.co.lerp(front.co, i / n)) for n in [max(2, round((front.co - back.co).length / PATCH_STEP))] for i in range(1, n)]
    for v in closing + [front, back]:
        v[layers['seam']] = 1
    for part in (0, 1):
        rim = walk(rims[part], front, back)
        fill(bm, key, contact['parts'][part], rim + closing, len(rim), layers, CREASE_BULGE)
    return len(chain)


def cut_touch(bm, key, contact, layers):
    """A point contact: inside a small box, faces labelled by the side of the contact
    plane (the other part's surface) they lie on. Where a fingertip crosses into it
    the labels meet in a closed ring round the finger: every such ring is cut and both
    holes closed."""
    (x0, x1), (y0, y1), (z0, z1) = contact['box']
    label = {}
    for f in bm.faces:
        c = rider(f.calc_center_median())
        if x0 <= c[0] <= x1 and y0 <= c[1] <= y1 and z0 <= c[2] <= z1:
            # A finger lying along the wall dips a few millimetres past it: its
            # underside, facing the wall, is still the finger's.
            off = (c[0] - contact['plane']) * contact['outer']
            facing = rider(f.normal)[0] * contact['outer'] < -0.3
            label[f] = 0 if off > 0 or (facing and off > -contact['dip']) else 1
    cut = [e for e in bm.edges if len(e.link_faces) == 2 and all(f in label for f in e.link_faces)
           and label[e.link_faces[0]] != label[e.link_faces[1]]]
    # Open pieces run out of the box along the other part's own surface: not contacts.
    rings = [piece for piece in pieces(cut) if not chain_ends(piece)]
    assert rings, f'{key}: no contact ring'
    for ring in rings:
        rims = split(bm, ring, label)
        for part in (0, 1):
            rim = walk(rims[part])
            fill(bm, key, contact['parts'][part], rim, len(rim), layers, TOUCH_BULGE)
    return sum(len(ring) for ring in rings)


def split(bm, edges, label):
    """Disconnect the faces along these edges; the rim edges on each side, by the
    label of the one face each now borders."""
    result = bmesh.ops.split_edges(bm, edges=edges)
    rims = {0: [], 1: []}
    for e in result['edges']:
        if e.is_boundary:
            rims[label[e.link_faces[0]]].append(e)
    return rims


def biggest_piece(edges):
    """The biggest connected set of these edges."""
    return max(pieces(edges), key=len, default=[])


def pieces(edges):
    """The connected sets of these edges."""
    edges = set(edges)
    out = []
    while edges:
        start = edges.pop()
        piece, stack = [start], [start]
        while stack:
            e = stack.pop()
            for v in e.verts:
                for other in v.link_edges:
                    if other in edges:
                        edges.discard(other)
                        piece.append(other)
                        stack.append(other)
        out.append(piece)
    return out


def chain_ends(chain):
    count = {}
    for e in chain:
        for v in e.verts:
            count[v] = count.get(v, 0) + 1
    assert max(count.values()) <= 2, 'the cut branches'
    return [v for v, n in count.items() if n == 1]


def walk(edges, start=None, end=None):
    """The ordered vertices of a chain of edges from start to end, or round a ring."""
    by_vert = {}
    for e in edges:
        for v in e.verts:
            by_vert.setdefault(v, []).append(e)
    if start is None:
        start = end = edges[0].verts[0]
    path, used, v = [start], set(), start
    while True:
        e = next((e for e in by_vert[v] if e not in used), None)
        if e is None:
            break
        used.add(e)
        v = e.other_vert(v)
        if v is end:
            break
        path.append(v)
    assert len(used) == len(edges), 'the rim is not one chain'
    if end is not None and end is not start:
        path.append(end)
    return path


def fill(bm, key, part, loop, rim_count, layers, bulge):
    """Close a loop of vertices with a patch: a constrained Delaunay triangulation in
    the loop's own plane over an interior grid of PATCH_STEP, relaxed to the soap film
    the loop spans, then bulged outward — a pressed arm or thigh is flat where it
    touched and round a little in. The patch is wound as the surface it closes."""
    pts3 = [Vector(rider(v.co)) for v in loop]
    n = len(loop)
    centre = sum(pts3, Vector()) / n
    cov = np.cov(np.array([p - centre for p in pts3]).T)
    axes = np.linalg.eigh(cov)[1]
    u, w = Vector(axes[:, 2]), Vector(axes[:, 1])
    pts = [Vector(((p - centre).dot(u), (p - centre).dot(w))) for p in pts3]
    area = sum(pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y for i in range(n)) / 2
    order = list(range(n)) if area > 0 else list(reversed(range(n)))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts)))
    grid = []
    a = lo.x + PATCH_STEP / 2
    while a < hi.x:
        b = lo.y + PATCH_STEP / 2
        while b < hi.y:
            q = Vector((a, b))
            if inside(q, pts) and min((q - p).length for p in pts) > PATCH_STEP * 0.6:
                grid.append(q)
            b += PATCH_STEP
        a += PATCH_STEP
    out_verts, _, out_faces, orig_verts, _, _ = geometry.delaunay_2d_cdt(pts + grid, [], [order], 1, 1e-7, True)
    bverts = []
    for i, origin in enumerate(orig_verts):
        if origin and origin[0] < n:
            bverts.append(loop[origin[0]])
        else:
            p = out_verts[i]
            bverts.append(bm.verts.new(B(centre + u * p.x + w * p.y)))
    cap_id = len(CAPS) + 1
    faces = []
    for tri in out_faces:
        vs = [bverts[i] for i in tri]
        if len(set(vs)) == 3 and not bm.faces.get(vs):
            f = bm.faces.new(vs)
            f[layers['cap']] = cap_id
            f.smooth = True
            faces.append(f)
    wind_as_neighbours(faces)
    loop_set = set(loop)
    interior = list({v for f in faces for v in f.verts if v not in loop_set})
    for v in interior + loop[:rim_count]:
        if not v[layers['seam']]:
            v[layers['part']] = SEGMENT_NAMES.index(part) + 1
    relax(interior, faces, bulge, hi - lo)
    CAPS.append({'key': key, 'part': part, 'faces': len(faces), 'rim': [rider(v.co) for v in loop[:rim_count]],
                 'chain': n - rim_count, 'id': cap_id})


def wind_as_neighbours(faces):
    """Flip the patch if it is wound against the surface it closes: across a shared
    edge two faces of one surface run it in opposite directions."""
    own = set(faces)
    for f in faces:
        for l in f.loops:
            other = [g for g in l.edge.link_faces if g not in own]
            if other:
                theirs = next(m for m in other[0].loops if m.edge is l.edge)
                if theirs.vert is l.vert:
                    for g in faces:
                        g.normal_flip()
                for g in faces:
                    g.normal_update()
                return


def inside(q, poly):
    c = False
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if (a.y > q.y) != (b.y > q.y) and q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x:
            c = not c
    return c


def relax(interior, faces, bulge, size):
    """Laplacian sweeps of the interior with the rim fixed (the soap film), then a bulge
    along the patch's own outward normal by a bubble function (Δu = -1, zero on the
    rim), its height bulge × the patch's half-width, at most 2.2 cm."""
    if not interior:
        return
    neighbours = {v: set() for v in interior}
    for f in faces:
        for v in f.verts:
            if v in neighbours:
                neighbours[v].update(w for w in f.verts if w is not v)
    for _ in range(200):
        new = {v: sum((w.co for w in neighbours[v]), Vector()) / len(neighbours[v]) for v in interior}
        for v, p in new.items():
            v.co = p
    for f in faces:
        f.normal_update()
    out = sum((f.normal * f.calc_area() for f in faces), Vector()).normalized()
    u = {v: 0.0 for v in interior}
    for _ in range(300):
        u = {v: (sum(u.get(w, 0.0) for w in neighbours[v]) + 1.0) / len(neighbours[v]) for v in interior}
    peak = max(u.values()) or 1.0
    height = min(bulge * min(size.x, size.y) / 2, 0.022)
    for v in interior:
        v.co += out * (height * u[v] / peak)
    for f in faces:
        f.normal_update()


# --- 3. weights: the body in its segments, blended across each joint -------------------

# Bones scaled along their length to the physics bone's: the thigh and shin (their scan
# lengths differ from the physics' by 2-3%) and the upper arm, hung from the physics
# shoulder pivot. That pivot is 6 cm above the scan's joint (the physics shoulder
# sits on top of the shoulder): moving the scan's arm up to it would shrug him, so
# the arm keeps its place and the pivot is taken on its line extended upward; its
# 10% longer reach to the elbow is shortened back. The forearm with the hand and
# the foot stay rigid, so the hand ends where the physics forearm box ends.
SCALED = {'upperArmL', 'upperArmR', 'thighL', 'thighR', 'shinL', 'shinR'}
TRUNK = {'pelvis', 'abdomen', 'chest', 'head'}

# How far over the skin each joint's blend reaches on either side (m).
BLEND = {'abdomen': 0.10, 'chest': 0.10, 'head': 0.05, 'upperArm': 0.10, 'forearm': 0.05,
         'thigh': 0.10, 'shin': 0.05, 'foot': 0.035}
# Bones that are no body's, at the joints that swing furthest: halfway between
# the two bodies they join (riderBody.js turns each by half the angle between
# them, about their joint). A shoulder blend is chest to blade to arm, not chest
# to arm, as a real shoulder blade follows a raised arm halfway: blending two
# turns half as far apart, the skin over a shoulder or a hip neither folds nor
# thins. name: (the body on the trunk's side, the limb's, the joint).
MID_BONES = {
    'midShoulderL': ('chest', 'upperArmL', 'shoulderL'), 'midShoulderR': ('chest', 'upperArmR', 'shoulderR'),
    'midHipL': ('pelvis', 'thighL', 'hipL'), 'midHipR': ('pelvis', 'thighR', 'hipR'),
}
BONE_NAMES = SEGMENT_NAMES + list(MID_BONES)
# Over the shoulder the arm ends at a plane tilted 25° out from the vertical through
# the armpit's top (the deltoid is the arm's, the trapezius the chest's); below the
# armpit, at the crease plane. The hip: a plane through the trochanter, the groin and
# the fold under the buttock. The head: under the jaw and the beard, over the nape.
SHOULDER_TILT = math.radians(25)
HIP_PLANE = {'L': ((0.20, 0.95, 0.0), (0.08, 0.88, 0.16), (0.08, 0.80, -0.14))}
NECK_PLANE = ((-0.02, 1.47, 0.035), (0.0, 0.90, 0.43))
# The shorts come down to 0.44 m, over the knee (0.50): the knee's split is at their
# hem, so the cloth stays with the thigh and only bare shin turns with the shin.
KNEE_SPLIT = 0.44
TRUNK_SPLIT = {'lumbar': 1.05, 'thoracic': 1.21}


def scan_bone(name):
    """The scan's (head, tail) for a bone, rider frame; the upper arm's head is on its
    line at the physics shoulder's height."""
    a, b = BONE_JOINTS[name]
    head, tail = Vector(SCAN_JOINT[a]), Vector(SCAN_JOINT[b])
    if name.startswith('upperArm'):
        up = (head - tail).normalized()
        head = head + up * ((PHYSICS_JOINT[a][1] - head.y) / up.y)
    return head, tail


def plane_through(a, b, c, towards):
    n = (Vector(b) - Vector(a)).cross(Vector(c) - Vector(a)).normalized()
    return Vector(a), (n if n.dot(Vector(towards) - Vector(a)) > 0 else -n)


def hip_plane(side):
    points = HIP_PLANE['L']
    if side == 'R':
        # Mirrored about the pelvis's middle, x = -0.02.
        points = [(-0.04 - x, y, z) for x, y, z in points]
    return plane_through(*points, towards=SCAN_JOINT[f'knee{side}'])


def arm_side(p, side):
    contact = CONTACTS['arm' + side]
    top, outer = contact['top'], contact['outer']
    if p.y < top:
        return (p.x - crease_x(contact, p.y, p.z)) * outer > 0
    origin = Vector((crease_x(contact, top, 0.0), top, 0.0))
    normal = Vector((outer * math.cos(SHOULDER_TILT), math.sin(SHOULDER_TILT), 0.0))
    return (p - origin).dot(normal) > 0


def bend_plane(parent, child):
    """The plane at the joint between two limb bones: through the scan's joint,
    square to the mean of the two bones' directions, facing the child."""
    joint = Vector(SCAN_JOINT[BONE_JOINTS[child][0]])
    head, _ = scan_bone(parent)
    _, tail = scan_bone(child)
    if child.startswith('forearm'):
        tail = Vector(SCAN_JOINT['wrist' + child[-1]])
    return joint, ((joint - head).normalized() + (tail - joint).normalized()).normalized()


def segment(obj):
    """Each vertex's segment. The limbs are flooded from their tips over the skin,
    never across a patch's seam or the other side's patches, and bounded where they
    meet the trunk by the planes above; within a limb the joints' planes split it.
    The head is flooded from the crown under the neck plane. The rest is trunk,
    split at the physics lumbar and thoracic heights."""
    me = obj.data
    n = len(me.vertices)
    co = [Vector(rider(v.co)) for v in me.vertices]
    fixed = [a.value - 1 for a in me.attributes['part'].data]
    seam = [a.value == 1 for a in me.attributes['seam'].data]
    neighbours = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        neighbours[a].append(b)
        neighbours[b].append(a)
    seg = {name: i for i, name in enumerate(SEGMENT_NAMES)}
    label = [-1] * n

    def nearest(point):
        point = Vector(point)
        return min(range(n), key=lambda i: (co[i] - point).length_squared)

    def flood(seed, allowed):
        region, stack = {seed}, [seed]
        while stack:
            for w in neighbours[stack.pop()]:
                if w not in region and allowed(w):
                    region.add(w)
                    stack.append(w)
        return region

    def side_of(point, plane):
        return (point - plane[0]).dot(plane[1]) > 0

    for side in 'LR':
        arm = {seg['upperArm' + side], seg['forearm' + side]}
        region = flood(nearest(SCAN_JOINT['hand' + side]), lambda i: not seam[i] and (
            fixed[i] in arm or (fixed[i] < 0 and arm_side(co[i], side))))
        elbow = bend_plane('upperArm' + side, 'forearm' + side)
        for i in region:
            label[i] = seg[('forearm' if side_of(co[i], elbow) else 'upperArm') + side]
        leg = {seg[name + side] for name in ('thigh', 'shin', 'foot')}
        hip = hip_plane(side)
        region = flood(nearest(SCAN_JOINT['toe' + side]), lambda i: not seam[i] and (
            fixed[i] in leg or (fixed[i] < 0 and side_of(co[i], hip))))
        knee, ankle = bend_plane('thigh' + side, 'shin' + side), bend_plane('shin' + side, 'foot' + side)
        knee = (knee[0] + knee[1] * ((KNEE_SPLIT - knee[0].y) / knee[1].y), knee[1])
        for i in region:
            label[i] = seg[('foot' if side_of(co[i], ankle) else 'shin' if side_of(co[i], knee) else 'thigh') + side]
    neck = (Vector(NECK_PLANE[0]), Vector(NECK_PLANE[1]).normalized())
    for i in flood(nearest(SCAN_JOINT['crown']), lambda i: fixed[i] < 0 and not seam[i] and side_of(co[i], neck)):
        label[i] = seg['head']
    for i in range(n):
        if fixed[i] >= 0:
            label[i] = fixed[i]
        elif label[i] < 0:
            y = co[i].y
            label[i] = seg['pelvis' if y < TRUNK_SPLIT['lumbar'] else 'abdomen' if y < TRUNK_SPLIT['thoracic'] else 'chest']
    label = np.array(label)
    counts = {name: int((label == j).sum()) for j, name in enumerate(SEGMENT_NAMES)}
    manifest['segments'] = counts
    # A flood that found its way into the trunk would take a third of him.
    assert max(counts[k] for k in counts if k not in TRUNK) < n * 0.15, counts
    return label, neighbours


def blend(obj, label, neighbours):
    """Weights: 1 on a vertex's own segment; across each joint, the neighbouring
    segment's share falls from half at the boundary to nothing BLEND away over the
    skin (geodesic, so no share leaks through the air to a part that only touched)."""
    co = np.array([v.co for v in obj.data.vertices])
    n = len(co)
    weights = np.zeros((n, len(BONE_NAMES)))
    weights[np.arange(n), label] = 1.0
    for child, parent in JOINT_PARENT.items():
        reach = BLEND[child.rstrip('LR')]
        c, p = SEGMENT_NAMES.index(child), SEGMENT_NAMES.index(parent)
        for own, other in ((c, p), (p, c)):
            dist = geodesic(co, neighbours, np.flatnonzero(label == other), reach)
            near = np.flatnonzero((label == own) & (dist < reach))
            t = dist[near] / reach
            weights[near, other] += 1 - t * t * (3 - 2 * t)
    weights /= weights.sum(1, keepdims=True)
    # Across a shoulder and a hip the two bodies' shares, t the limb's, become
    # (1 - t)², 2t(1 - t) the mid bone's and t²: the same sum, three ways.
    for mid, (trunk, limb, _) in MID_BONES.items():
        a, b, m = SEGMENT_NAMES.index(trunk), SEGMENT_NAMES.index(limb), BONE_NAMES.index(mid)
        both = np.flatnonzero((weights[:, a] > 0) & (weights[:, b] > 0))
        total = weights[both, a] + weights[both, b]
        t = weights[both, b] / total
        weights[both, a] = total * (1 - t) ** 2
        weights[both, m] = total * 2 * t * (1 - t)
        weights[both, b] = total * t ** 2
        manifest.setdefault('midBoneVertices', {})[mid] = len(both)
    # At most MAX_INFLUENCES bones a vertex, the strongest.
    order = np.argsort(-weights, axis=1)
    weights[np.arange(n)[:, None], order[:, MAX_INFLUENCES:]] = 0
    weights /= weights.sum(1, keepdims=True)
    manifest['influences'] = int((weights > 0).sum(1).max())
    return weights


def geodesic(co, neighbours, sources, reach):
    dist = np.full(len(co), np.inf)
    dist[sources] = 0.0
    heap = [(0.0, int(v)) for v in sources]
    heapq.heapify(heap)
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for w in neighbours[v]:
            nd = d + float(np.linalg.norm(co[v] - co[w]))
            if nd < dist[w] and nd < reach:
                dist[w] = nd
                heapq.heappush(heap, (nd, w))
    return dist


def write_weights(obj, weights):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    for j, name in enumerate(BONE_NAMES):
        group = obj.vertex_groups.new(name=name)
        values = np.round(weights[:, j], 4)
        for w in np.unique(values):
            if w > 0:
                group.add(np.flatnonzero(values == w).tolist(), float(w), 'REPLACE')


# --- 4. the scan's pose moved into the physics rest pose --------------------------------

def bone_map(name):
    """The affine map taking this bone's part of the scan to its place in the physics
    rest pose (Blender frame). A mid bone's is its two bodies' mean: its share came
    out of theirs, so the rest pose is the one they alone gave."""
    if name in MID_BONES:
        trunk, limb, _ = MID_BONES[name]
        a, b = bone_map(trunk), bone_map(limb)
        return Matrix([[(a[i][j] + b[i][j]) / 2 for j in range(4)] for i in range(4)])
    a, b = BONE_JOINTS[name]
    head, tail = scan_bone(name)
    sa, sb = B(head), B(tail)
    pa, pb = B(PHYSICS_JOINT[a]), B(PHYSICS_JOINT[b])
    if name in TRUNK:
        # The trunk only shifts: its lean is the man's posture.
        return Matrix.Translation(pa - sa)
    ds, dp = sb - sa, pb - pa
    turn = ds.normalized().rotation_difference(dp.normalized()).to_matrix().to_4x4()
    stretch = Matrix.Identity(4)
    if name in SCALED:
        u = ds.normalized()
        k = dp.length / ds.length - 1
        for i in range(3):
            for j in range(3):
                stretch[i][j] += k * u[i] * u[j]
    return Matrix.Translation(pa) @ turn @ stretch @ Matrix.Translation(-sa)


def to_rest_pose(obj, weights):
    co = np.array([v.co for v in obj.data.vertices])
    out = np.zeros_like(co)
    for j, name in enumerate(BONE_NAMES):
        m = np.array(bone_map(name))
        out += weights[:, j:j + 1] * (co @ m[:3, :3].T + m[:3, 3])
    obj.data.vertices.foreach_set('co', out.ravel())
    obj.data.update()
    manifest['restPoseShift'] = round(float(np.linalg.norm(out - co, axis=1).max()), 4)


def physics_rig(obj):
    """The skeleton the glb carries: the physics rest pose, a bone per body from the
    joint it hangs from to the next, named as the bodies are."""
    data = bpy.data.armatures.new('rider')
    rig = bpy.data.objects.new('rider', data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in SEGMENT_NAMES:
        a, b = BONE_JOINTS[name]
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = B(PHYSICS_JOINT[a]), B(PHYSICS_JOINT[b])
    for child, parent in JOINT_PARENT.items():
        data.edit_bones[child].parent = data.edit_bones[parent]
    # A mid bone at its joint, a hand's length toward the limb, on the trunk's body.
    for name, (trunk, limb, joint) in MID_BONES.items():
        bone = data.edit_bones.new(name)
        head = B(PHYSICS_JOINT[joint])
        bone.head = head
        bone.tail = head + (B(PHYSICS_JOINT[BONE_JOINTS[limb][1]]) - head).normalized() * 0.1
        bone.parent = data.edit_bones[trunk]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.parent = rig
    mod = obj.modifiers.new('rider', 'ARMATURE')
    mod.object = rig
    return rig


# --- 5. the patches' texture ---------------------------------------------------------------

# The atlas (1024², 73% covered in slivers) grows by a strip above it; each patch gets
# a region of it at up to 3 texels a centimetre — plain skin and cloth — painted by
# harmonic interpolation of the scan's colours along its rim, so a patch meets the
# surface it closes without a seam of colour. The normal map is flat there.
STRIP = 64
PATCH_TEXELS = 300.0  # texels a metre
PAD = 2


def paint_patches(obj):
    me = obj.data
    nodes = me.materials[0].node_tree.nodes
    images = {n.image.name: n for n in nodes if n.type == 'TEX_IMAGE'}
    base_node = nodes.active
    size = base_node.image.size[0]
    assert all(n.image.size[:] == (size, size) for n in images.values()), 'the maps differ in size'
    height = size + STRIP
    old = {name: np.array(n.image.pixels[:]).reshape(size, size, 4) for name, n in images.items()}
    uv = me.uv_layers.active.data
    cap_of = [a.value for a in me.attributes['cap'].data]
    squeeze = size / height
    for poly in me.polygons:
        if not cap_of[poly.index]:
            for li in poly.loop_indices:
                u, v = uv[li].uv
                uv[li].uv = (u, v * squeeze)
    # Each vertex's colour in every map where the scan's own faces sample it.
    samples = {}
    for poly in me.polygons:
        if cap_of[poly.index]:
            continue
        for li in poly.loop_indices:
            u, v = uv[li].uv
            x = min(int(u * size), size - 1)
            y = min(int(v / squeeze * size), size - 1)
            samples.setdefault(me.loops[li].vertex_index, []).append({k: img[y, x] for k, img in old.items()})
    strips = {k: np.zeros((STRIP, size, 4)) for k in old}
    painted = np.zeros((STRIP, size), bool)
    # Each patch laid flat in its own plane, long side along the strip (metres).
    layouts = []
    for cap in CAPS:
        faces = [p for p in me.polygons if cap_of[p.index] == cap['id']]
        verts = sorted({v for p in faces for v in p.vertices})
        pts = np.array([me.vertices[v].co for v in verts])
        centre = pts.mean(0)
        axes = np.linalg.eigh(np.cov((pts - centre).T))[1]
        flat = (pts - centre) @ axes[:, [2, 1]]
        layouts.append((cap, faces, verts, flat - flat.min(0)))
    texels = min(PATCH_TEXELS, (STRIP - 2 * PAD - 1) / max(flat[:, 1].max() for *_, flat in layouts))
    cursor = PAD
    for cap, faces, verts, flat in layouts:
        flat = flat * texels
        w = flat[:, 0].max()
        assert cursor + w + PAD <= size, 'the strip is full'
        pixel = {v: (cursor + flat[i, 0], PAD + flat[i, 1]) for i, v in enumerate(verts)}
        cursor += int(math.ceil(w)) + 2 * PAD + 1
        # Colours: the rim's from the scan, the inside by Jacobi sweeps of the mean.
        colour = {k: {} for k in old}
        free = [v for v in verts if v not in samples]
        for v in verts:
            if v in samples:
                for k in old:
                    colour[k][v] = np.mean([s[k] for s in samples[v]], axis=0)
        rim_mean = {k: np.mean(list(colour[k].values()), axis=0) for k in old}
        links = {v: set() for v in free}
        for p in faces:
            for v in p.vertices:
                if v in links:
                    links[v].update(p.vertices)
        for k in old:
            for v in free:
                colour[k][v] = rim_mean[k]
            for _ in range(400):
                colour[k].update({v: np.mean([colour[k][x] for x in links[v] if x != v], axis=0) for v in free})
        for p in faces:
            tri = [pixel[v] for v in p.vertices]
            for li, v in zip(p.loop_indices, p.vertices):
                uv[li].uv = (pixel[v][0] / size, (size + pixel[v][1]) / height)
            raster(tri, [{k: colour[k][v] for k in old} for v in p.vertices], strips, painted)
    # Pad every patch outward over the whole strip, so mipmaps never reach bare strip.
    for _ in range(size):
        if painted.all():
            break
        grow = ~painted & (np.roll(painted, 1, 0) | np.roll(painted, -1, 0) | np.roll(painted, 1, 1) | np.roll(painted, -1, 1))
        for k in strips:
            acc = np.zeros_like(strips[k])
            cnt = np.zeros((STRIP, size, 1))
            for axis, shift in ((0, 1), (0, -1), (1, 1), (1, -1)):
                src = np.roll(painted, shift, axis)[..., None]
                acc += np.roll(strips[k], shift, axis) * src
                cnt += src
            strips[k][grow] = (acc / np.maximum(cnt, 1))[grow]
        painted |= grow
    normal_name = next(name for name, n in images.items() if n.outputs[0].links and n.outputs[0].links[0].to_node.type == 'NORMAL_MAP')
    strips[normal_name][...] = (0.5, 0.5, 1.0, 1.0)
    for name, node in images.items():
        image = bpy.data.images.new(f'surfer_{name}', size, height, alpha=False)
        image.colorspace_settings.name = node.image.colorspace_settings.name
        image.pixels.foreach_set(np.concatenate([old[name], strips[name]]).astype(np.float32).ravel())
        image.pack()
        node.image = image
    manifest['atlas'] = [size, height]
    manifest['strip'] = {'height': STRIP, 'used': cursor, 'texelsPerMetre': round(float(texels), 1)}


def raster(tri, colours, strips, painted):
    (ax, ay), (bx, by), (cx, cy) = tri
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9:
        return
    x0, x1 = int(math.floor(min(ax, bx, cx))), int(math.ceil(max(ax, bx, cx)))
    y0, y1 = int(math.floor(min(ay, by, cy))), int(math.ceil(max(ay, by, cy)))
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    px, py = xs + 0.5, ys + 0.5
    l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
    l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
    l3 = 1 - l1 - l2
    inside = (l1 >= -0.05) & (l2 >= -0.05) & (l3 >= -0.05) & (ys >= 0) & (ys < STRIP) & (xs >= 0) & (xs < painted.shape[1])
    for k, strip in strips.items():
        value = l1[..., None] * colours[0][k] + l2[..., None] * colours[1][k] + l3[..., None] * colours[2][k]
        strip[ys[inside], xs[inside]] = value[inside]
    painted[ys[inside], xs[inside]] = True


# --- 6. the glb ----------------------------------------------------------------------------

def export(obj, rig):
    me = obj.data
    for name in ('cap', 'part', 'seam'):
        me.attributes.remove(me.attributes[name])
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB), export_format='GLB', use_selection=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=90,
        export_skins=True, export_all_influences=False, export_def_bones=False, export_rest_position_armature=True,
        export_animations=False, export_morph=False, export_cameras=False, export_lights=False, export_extras=False,
        export_attributes=False)
    manifest['glbBytes'] = OUT_GLB.stat().st_size
    manifest['vertices'] = len(me.vertices)
    manifest['triangles'] = len(me.polygons)
    OUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    obj = load_scan()
    log('scan', len(obj.data.vertices), 'verts')
    decimate(obj)
    log('decimated', len(obj.data.polygons), 'triangles')
    cut_fusions(obj)
    for c in CAPS:
        rim = c['rim']
        log('cap', c['key'], c['part'], c['faces'], 'faces; rim', len(rim), 'verts, y', round(min(p[1] for p in rim), 3), '..', round(max(p[1] for p in rim), 3),
            'z', round(min(p[2] for p in rim), 3), '..', round(max(p[2] for p in rim), 3), 'x', round(min(p[0] for p in rim), 3), '..', round(max(p[0] for p in rim), 3),
            'ends', [tuple(round(q, 3) for q in rim[0]), tuple(round(q, 3) for q in rim[-1])], 'chain', c['chain'])
    label, neighbours = segment(obj)
    log('segments', manifest['segments'])
    weights = blend(obj, label, neighbours)
    write_weights(obj, weights)
    log('weights: up to', manifest['influences'], 'bones a vertex')
    to_rest_pose(obj, weights)
    rig = physics_rig(obj)
    log('rest pose: moved up to', manifest['restPoseShift'], 'm')
    paint_patches(obj)
    log('patches painted', manifest['strip'])
    if DEBUG_BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=DEBUG_BLEND)
    export(obj, rig)
    log('wrote', OUT_GLB, manifest['glbBytes'], 'bytes')
