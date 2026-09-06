"""Generate three low-poly, web-rigged European river fish in a clean Blender file.

The body is a watertight loft. Fins are separate skinned sheets so the body gate
can stay manifold while the silhouette remains cheap enough for a 50-fish scene.
The two body sides deliberately share one lateral UV atlas.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


ROOT_DIR = Path(__file__).resolve().parents[2]
FISH_SOURCE_DIR = ROOT_DIR / "assets-source" / "fish"
OUTPUT_BLEND = FISH_SOURCE_DIR / "river_fish_authoring.blend"
AUTHORING_MANIFEST = FISH_SOURCE_DIR / "fish-authoring-manifest.json"


SPECIES = (
    {
        "id": "pike",
        "display_name": "Northern pike",
        "scientific_name": "Esox lucius",
        "length": 0.92,
        "height": 0.155,
        "width": 0.105,
        "rings": 31,
        "radial_segments": 14,
        "spine_bones": 8,
        "profile": (
            (0.00, 0.22, 0.23),
            (0.13, 0.48, 0.50),
            (0.36, 0.78, 0.82),
            (0.62, 1.00, 1.00),
            (0.84, 0.78, 0.91),
            (1.00, 0.36, 0.68),
        ),
        "body_color": (0.32, 0.39, 0.20, 1.0),
        "fin_color": (0.33, 0.24, 0.13, 1.0),
        "dorsal_color": (0.24, 0.22, 0.13, 1.0),
        "fin_layout": "rear",
    },
    {
        "id": "perch",
        "display_name": "European perch",
        "scientific_name": "Perca fluviatilis",
        "length": 0.38,
        "height": 0.145,
        "width": 0.082,
        "rings": 26,
        "radial_segments": 12,
        "spine_bones": 7,
        "profile": (
            (0.00, 0.20, 0.20),
            (0.14, 0.58, 0.52),
            (0.36, 0.91, 0.84),
            (0.59, 1.00, 1.00),
            (0.82, 0.78, 0.86),
            (1.00, 0.31, 0.50),
        ),
        "body_color": (0.43, 0.48, 0.20, 1.0),
        "fin_color": (0.82, 0.24, 0.07, 1.0),
        "dorsal_color": (0.18, 0.22, 0.12, 1.0),
        "fin_layout": "spiny",
    },
    {
        "id": "roach",
        "display_name": "Common roach",
        "scientific_name": "Rutilus rutilus",
        "length": 0.18,
        "height": 0.064,
        "width": 0.038,
        "rings": 21,
        "radial_segments": 10,
        "spine_bones": 6,
        "profile": (
            (0.00, 0.18, 0.20),
            (0.14, 0.52, 0.50),
            (0.39, 0.88, 0.86),
            (0.61, 1.00, 1.00),
            (0.84, 0.70, 0.82),
            (1.00, 0.28, 0.46),
        ),
        "body_color": (0.62, 0.68, 0.62, 1.0),
        "fin_color": (0.78, 0.20, 0.09, 1.0),
        "dorsal_color": (0.34, 0.27, 0.18, 1.0),
        "fin_layout": "forked",
    },
)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.world = bpy.data.worlds.new("RiverFishStudioWorld")
    scene.world.color = (0.96, 0.96, 0.96)


def smootherstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value**3 * (value * (value * 6.0 - 15.0) + 10.0)


def profile_at(species: dict, u: float) -> tuple[float, float]:
    points = species["profile"]
    for index in range(len(points) - 1):
        left = points[index]
        right = points[index + 1]
        if u <= right[0]:
            amount = smootherstep((u - left[0]) / max(1e-8, right[0] - left[0]))
            height = left[1] + (right[1] - left[1]) * amount
            width = left[2] + (right[2] - left[2]) * amount
            return height, width
    return points[-1][1], points[-1][2]


def x_from_u(species: dict, u: float) -> float:
    # Ten percent of total length is reserved for the tail fin behind the body.
    return species["length"] * (-0.40 + 0.90 * u)


def u_from_x(species: dict, x: float) -> float:
    return max(0.0, min(1.0, (x / species["length"] + 0.40) / 0.90))


def radii_at(species: dict, u: float) -> tuple[float, float]:
    height_factor, width_factor = profile_at(species, u)
    return species["width"] * 0.5 * width_factor, species["height"] * 0.5 * height_factor


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    use_vertex_color: bool = False,
):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.use_backface_culling = False
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["IOR"].default_value = 1.39
    if use_vertex_color:
        vertex_color = material.node_tree.nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "Color"
        material.node_tree.links.new(vertex_color.outputs["Color"], principled.inputs["Base Color"])
    return material


def create_armature(species: dict, collection: bpy.types.Collection):
    species_id = species["id"]
    armature_data = bpy.data.armatures.new(f"{species_id}_rig_data")
    armature = bpy.data.objects.new(f"{species_id}_rig", armature_data)
    collection.objects.link(armature)
    armature.show_in_front = True
    armature.display_type = "WIRE"

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    body_tail = x_from_u(species, 0.0)
    body_head = x_from_u(species, 1.0)
    spine_names = []
    previous = None
    for index in range(species["spine_bones"]):
        # Head-to-tail hierarchy keeps the gaze stable while the wave grows
        # towards descendant tail bones.
        start = body_head - (body_head - body_tail) * index / species["spine_bones"]
        end = body_head - (body_head - body_tail) * (index + 1) / species["spine_bones"]
        bone = armature_data.edit_bones.new(f"{species_id}_spine_{index:02d}")
        bone.head = (start, 0.0, 0.0)
        bone.tail = (end, 0.0, 0.0)
        bone.parent = previous
        bone.use_connect = previous is not None
        previous = bone
        spine_names.append(bone.name)

    shoulder_u = 0.77
    shoulder_x = x_from_u(species, shoulder_u)
    _, shoulder_height = radii_at(species, shoulder_u)
    for side_name, side in (("L", 1.0), ("R", -1.0)):
        bone = armature_data.edit_bones.new(f"{species_id}_pectoral_{side_name}")
        bone.head = (
            shoulder_x,
            side * species["width"] * 0.34,
            -shoulder_height * 0.12,
        )
        bone.tail = (
            shoulder_x - species["length"] * 0.13,
            side * species["width"] * 0.77,
            -species["height"] * 0.25,
        )
        shoulder_index = min(
            species["spine_bones"] - 1,
            round((1.0 - shoulder_u) * (species["spine_bones"] - 1)),
        )
        bone.parent = armature_data.edit_bones[spine_names[shoulder_index]]
        bone.use_connect = False

    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["species"] = species_id
    armature["scientific_name"] = species["scientific_name"]
    armature["body_length_m"] = species["length"]
    armature["spine_bone_count"] = species["spine_bones"]
    armature["forward_axis"] = "+X"
    return armature, spine_names


def add_skinning(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    species: dict,
    spine_names: list[str],
    explicit_groups: list[str | None] | None = None,
) -> int:
    groups = {name: obj.vertex_groups.new(name=name) for name in spine_names}
    groups[f"{species['id']}_pectoral_L"] = obj.vertex_groups.new(
        name=f"{species['id']}_pectoral_L"
    )
    groups[f"{species['id']}_pectoral_R"] = obj.vertex_groups.new(
        name=f"{species['id']}_pectoral_R"
    )

    max_influences = 0
    for vertex in obj.data.vertices:
        explicit = explicit_groups[vertex.index] if explicit_groups else None
        if explicit:
            groups[explicit].add([vertex.index], 1.0, "REPLACE")
            max_influences = max(max_influences, 1)
            continue

        u = u_from_x(species, vertex.co.x)
        coordinate = (1.0 - u) * (len(spine_names) - 1)
        left = int(math.floor(coordinate))
        right = min(len(spine_names) - 1, left + 1)
        blend = coordinate - left
        if left == right or blend < 1e-5:
            groups[spine_names[left]].add([vertex.index], 1.0, "REPLACE")
            max_influences = max(max_influences, 1)
        else:
            groups[spine_names[left]].add([vertex.index], 1.0 - blend, "REPLACE")
            groups[spine_names[right]].add([vertex.index], blend, "REPLACE")
            max_influences = max(max_influences, 2)

    modifier = obj.modifiers.new(name="RiverFishRig", type="ARMATURE")
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    obj.parent = armature
    return max_influences


def create_body(species: dict, collection: bpy.types.Collection, armature, spine_names):
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    uv_hints: list[tuple[float, float]] = []
    rings = species["rings"]
    radial = species["radial_segments"]

    for ring_index in range(rings):
        u = ring_index / (rings - 1)
        x = x_from_u(species, u)
        width_radius, height_radius = radii_at(species, u)
        # A tiny dorsal offset avoids a perfectly mechanical ellipse.
        center_z = species["height"] * 0.012 * math.sin(math.pi * u)
        for radial_index in range(radial):
            theta = 2.0 * math.pi * radial_index / radial
            y = width_radius * math.cos(theta)
            z = center_z + height_radius * math.sin(theta)
            vertices.append((x, y, z))
            # v depends only on height: left and right lateral islands overlap.
            uv_hints.append((u, 0.5 + 0.5 * math.sin(theta)))

    for ring_index in range(rings - 1):
        for radial_index in range(radial):
            next_radial = (radial_index + 1) % radial
            a = ring_index * radial + radial_index
            b = (ring_index + 1) * radial + radial_index
            c = ring_index * radial + next_radial
            d = (ring_index + 1) * radial + next_radial
            faces.append((a, c, d, b))

    tail_center = len(vertices)
    vertices.append((x_from_u(species, 0.0), 0.0, 0.0))
    uv_hints.append((0.0, 0.5))
    head_center = len(vertices)
    vertices.append((x_from_u(species, 1.0), 0.0, 0.0))
    uv_hints.append((1.0, 0.5))
    for radial_index in range(radial):
        next_radial = (radial_index + 1) % radial
        faces.append((tail_center, next_radial, radial_index))
        current_head = (rings - 1) * radial + radial_index
        next_head = (rings - 1) * radial + next_radial
        faces.append((head_center, current_head, next_head))

    mesh = bpy.data.meshes.new(f"{species['id']}_body_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    uv_layer = mesh.uv_layers.new(name="LateralMirrorUV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uv_hints[loop.vertex_index]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    color_attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for loop in mesh.loops:
        color_attribute.data[loop.index].color = (1.0, 1.0, 1.0, 1.0)
    mesh.color_attributes.active_color = color_attribute

    obj = bpy.data.objects.new(f"{species['id']}_body", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(
        make_material(
            f"{species['id']}_body_PBR",
            species["body_color"],
            0.34,
            use_vertex_color=True,
        )
    )
    max_influences = add_skinning(obj, armature, species, spine_names)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return obj, max_influences, non_manifold_edges


def create_fins(species: dict, collection: bpy.types.Collection, armature, spine_names):
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    uv_hints: list[tuple[float, float]] = []
    explicit_groups: list[str | None] = []
    vertex_colors: list[tuple[float, float, float, float]] = []

    def add_fin(points, color, group=None):
        base = len(vertices)
        for point in points:
            vertices.append(tuple(point))
            total_u = max(0.0, min(1.0, point[0] / species["length"] + 0.5))
            total_v = max(0.0, min(1.0, 0.5 + point[2] / (species["height"] * 1.8)))
            uv_hints.append((total_u, total_v))
            explicit_groups.append(group)
            vertex_colors.append(color)
        for index in range(1, len(points) - 1):
            faces.append((base, base + index, base + index + 1))

    length = species["length"]
    height = species["height"]
    width = species["width"]
    fin_color = species["fin_color"]
    dorsal_color = species["dorsal_color"]
    body_tail = x_from_u(species, 0.0)

    # Forked caudal fin: two independent lobes leave a readable central notch.
    add_fin(
        (
            (body_tail + 0.01 * length, 0.0, 0.02 * height),
            (-0.50 * length, 0.0, 0.66 * height),
            (-0.47 * length, 0.0, 0.04 * height),
        ),
        fin_color,
    )
    add_fin(
        (
            (body_tail + 0.01 * length, 0.0, -0.02 * height),
            (-0.47 * length, 0.0, -0.04 * height),
            (-0.50 * length, 0.0, -0.62 * height),
        ),
        fin_color,
    )

    if species["fin_layout"] == "rear":
        dorsal_start, dorsal_end, dorsal_peak = -0.34, -0.16, 0.52
    elif species["fin_layout"] == "spiny":
        dorsal_start, dorsal_end, dorsal_peak = -0.16, 0.24, 0.65
    else:
        dorsal_start, dorsal_end, dorsal_peak = -0.15, 0.15, 0.46

    dorsal_u0 = u_from_x(species, dorsal_start * length)
    dorsal_u1 = u_from_x(species, dorsal_end * length)
    _, dorsal_h0 = radii_at(species, dorsal_u0)
    _, dorsal_h1 = radii_at(species, dorsal_u1)
    add_fin(
        (
            (dorsal_start * length, 0.0, dorsal_h0 * 0.88),
            ((dorsal_start * 0.45 + dorsal_end * 0.55) * length, 0.0, dorsal_peak * height),
            (dorsal_end * length, 0.0, dorsal_h1 * 0.9),
        ),
        dorsal_color,
    )

    # A lower anal fin balances the dorsal silhouette and shares the axial rig.
    anal_start = -0.28 if species["id"] == "pike" else -0.18
    anal_end = -0.08 if species["id"] == "pike" else 0.02
    _, anal_h0 = radii_at(species, u_from_x(species, anal_start * length))
    _, anal_h1 = radii_at(species, u_from_x(species, anal_end * length))
    add_fin(
        (
            (anal_start * length, 0.0, -anal_h0 * 0.86),
            ((anal_start + anal_end) * 0.5 * length, 0.0, -0.45 * height),
            (anal_end * length, 0.0, -anal_h1 * 0.86),
        ),
        fin_color,
    )

    # Pelvic fins are short and static; the paired pectorals get their own bones.
    for side in (-1.0, 1.0):
        add_fin(
            (
                (0.02 * length, side * width * 0.28, -height * 0.32),
                (-0.10 * length, side * width * 0.52, -height * 0.48),
                (0.09 * length, side * width * 0.44, -height * 0.35),
            ),
            fin_color,
        )

    shoulder_x = x_from_u(species, 0.77)
    for side_name, side in (("L", 1.0), ("R", -1.0)):
        group = f"{species['id']}_pectoral_{side_name}"
        add_fin(
            (
                (shoulder_x, side * width * 0.34, -height * 0.05),
                (shoulder_x - length * 0.18, side * width * 0.86, -height * 0.30),
                (shoulder_x - length * 0.07, side * width * 0.72, -height * 0.43),
            ),
            fin_color,
            group,
        )

    # Small embedded octahedral domes make the eyes survive web-scale viewing;
    # they stay in the single skinned primitive and inherit the head bone.
    eye_u = 0.875 if species["id"] == "pike" else 0.86
    eye_x = x_from_u(species, eye_u)
    eye_width, eye_height = radii_at(species, eye_u)
    eye_radius = length * (0.012 if species["id"] == "pike" else 0.018)
    eye_color = (0.018, 0.014, 0.009, 1.0)
    iris_color = {
        "pike": (0.42, 0.31, 0.08, 1.0),
        "perch": (0.52, 0.30, 0.055, 1.0),
        "roach": (0.48, 0.13, 0.055, 1.0),
    }[species["id"]]
    for side in (-1.0, 1.0):
        base = len(vertices)
        center_y = side * eye_width * 0.95
        center_z = eye_height * 0.26
        points = [
            (eye_x, center_y + side * eye_radius * 1.15, center_z),
            (eye_x, center_y - side * eye_radius * 0.42, center_z),
        ]
        eye_segments = 8
        for index in range(eye_segments):
            angle = 2.0 * math.pi * index / eye_segments
            points.append(
                (
                    eye_x + math.cos(angle) * eye_radius,
                    center_y,
                    center_z + math.sin(angle) * eye_radius,
                )
            )
        for index, point in enumerate(points):
            vertices.append(point)
            uv_hints.append((eye_u, 0.64))
            explicit_groups.append(spine_names[0])
            vertex_colors.append(eye_color if index < 2 else iris_color)
        ring = tuple(base + 2 + index for index in range(eye_segments))
        for index in range(eye_segments):
            current = ring[index]
            following = ring[(index + 1) % eye_segments]
            if side > 0:
                faces.append((base, following, current))
                faces.append((base + 1, current, following))
            else:
                faces.append((base, current, following))
                faces.append((base + 1, following, current))

    mesh = bpy.data.meshes.new(f"{species['id']}_fins_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    uv_layer = mesh.uv_layers.new(name="LateralMirrorUV")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uv_hints[loop.vertex_index]
    color_attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for loop in mesh.loops:
        color_attribute.data[loop.index].color = vertex_colors[loop.vertex_index]
    mesh.color_attributes.active_color = color_attribute

    for polygon in mesh.polygons:
        polygon.use_smooth = True

    obj = bpy.data.objects.new(f"{species['id']}_fins", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(
        make_material(
            f"{species['id']}_fins_PBR",
            species["fin_color"],
            0.42,
        )
    )
    max_influences = add_skinning(
        obj,
        armature,
        species,
        spine_names,
        explicit_groups=explicit_groups,
    )
    return obj, max_influences


def triangle_count(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def bounds_for_objects(objects: tuple[bpy.types.Object, ...]):
    points = []
    for obj in objects:
        points.extend(Vector(corner) for corner in obj.bound_box)
    minima = [min(point[index] for point in points) for index in range(3)]
    maxima = [max(point[index] for point in points) for index in range(3)]
    return {"min": minima, "max": maxima}


def weight_metrics(obj: bpy.types.Object):
    max_influences = 0
    max_error = 0.0
    for vertex in obj.data.vertices:
        weights = [membership.weight for membership in vertex.groups if membership.weight > 0.0]
        max_influences = max(max_influences, len(weights))
        max_error = max(max_error, abs(sum(weights) - 1.0))
    return max_influences, max_error


def deformation_probe(obj: bpy.types.Object, armature: bpy.types.Object, tail_bone_name: str):
    source_positions = [vertex.co.copy() for vertex in obj.data.vertices]
    pose_bone = armature.pose.bones[tail_bone_name]
    original_basis = pose_bone.matrix_basis.copy()
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler.z = math.radians(11.0)
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    movement = max(
        (evaluated_mesh.vertices[index].co - source).length
        for index, source in enumerate(source_positions)
    )
    evaluated.to_mesh_clear()

    pose_bone.matrix_basis = original_basis if original_basis else Matrix.Identity(4)
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(depsgraph)
    restored_mesh = evaluated.to_mesh()
    restore_error = max(
        (restored_mesh.vertices[index].co - source).length
        for index, source in enumerate(source_positions)
    )
    evaluated.to_mesh_clear()
    return movement, restore_error


def create_species(species: dict):
    collection = bpy.data.collections.new(f"FISH_{species['id'].upper()}")
    bpy.context.scene.collection.children.link(collection)
    armature, spine_names = create_armature(species, collection)
    body, body_max_influences, body_non_manifold_edges = create_body(
        species, collection, armature, spine_names
    )
    fins, fin_max_influences = create_fins(species, collection, armature, spine_names)
    stats = {
        "id": species["id"],
        "displayName": species["display_name"],
        "scientificName": species["scientific_name"],
        "lengthMeters": species["length"],
        "heightMeters": species["height"],
        "vertices": len(body.data.vertices) + len(fins.data.vertices),
        "triangles": triangle_count(body.data) + triangle_count(fins.data),
        "bodyTriangles": triangle_count(body.data),
        "finTriangles": triangle_count(fins.data),
        "spineBones": species["spine_bones"],
        "totalBones": species["spine_bones"] + 2,
        "maxInfluences": max(body_max_influences, fin_max_influences),
        "bodyNonManifoldEdges": body_non_manifold_edges,
        "bounds": bounds_for_objects((body, fins)),
        "forwardAxis": "+X",
        "uv": "overlapping bilateral lateral islands",
    }

    fins.data.materials.clear()
    fins.data.materials.append(body.data.materials[0])
    for polygon in fins.data.polygons:
        polygon.material_index = 0

    # Blender 5.2's selection exporter drops the second skinned sibling when
    # two meshes share one armature. Joining keeps both material primitives and
    # produces one portable SkinnedMesh with the same two-influence weights.
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    fins.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = f"{species['id']}_mesh"
    body.data.name = f"{species['id']}_mesh_data"
    stats["exportedMesh"] = body.name
    stats["materialSlots"] = [slot.material.name for slot in body.material_slots]
    measured_influences, weight_error = weight_metrics(body)
    movement, restore_error = deformation_probe(body, armature, spine_names[-1])
    stats["maxInfluences"] = measured_influences
    stats["maxWeightError"] = weight_error
    stats["deformationProbeMeters"] = movement
    stats["neutralRestoreError"] = restore_error
    if measured_influences > 4 or weight_error > 1e-6:
        raise RuntimeError(f"{species['id']} skin weights failed validation")
    if movement < 1e-5 or restore_error > 1e-6:
        raise RuntimeError(f"{species['id']} deformation probe failed")
    return stats


reset_scene()
FISH_SOURCE_DIR.mkdir(parents=True, exist_ok=True)
manifest = {
    "generator": str(Path(__file__).relative_to(ROOT_DIR)),
    "sourceBlend": str(OUTPUT_BLEND.relative_to(ROOT_DIR)),
    "units": "meters",
    "species": [create_species(species) for species in SPECIES],
}

for entry in manifest["species"]:
    if entry["bodyNonManifoldEdges"] != 0:
        raise RuntimeError(f"{entry['id']} body is not watertight")
    if entry["maxInfluences"] > 4:
        raise RuntimeError(f"{entry['id']} exceeds four skin influences")

AUTHORING_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)
print(json.dumps(manifest, indent=2))
