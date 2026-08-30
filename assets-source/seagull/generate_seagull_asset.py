import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_FBX = ROOT / "assets-source/seagull/source/seagull-fly-source.fbx"
SOURCE_ALBEDO = ROOT / "assets-source/seagull/source/seagull-albedo-source.png"
OUTPUT_BLEND = ROOT / "assets-source/seagull/seagull_authoring.blend"
OUTPUT_MANIFEST = ROOT / "assets-source/seagull/seagull-authoring-manifest.json"
TARGET_WINGSPAN = 1.0
TARGET_BODY_LENGTH = 0.48
TARGET_HEIGHT = 0.24
DECIMATE_RATIO = 0.64
MAX_INFLUENCES = 4


def import_fbx(path):
    if hasattr(bpy.ops.wm, "fbx_import"):
        bpy.ops.wm.fbx_import(filepath=str(path))
    else:
        bpy.ops.import_scene.fbx(filepath=str(path))


def link_only(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def compact_group_name(name):
    if name.startswith("t_feather.L"):
        return "tail.L"
    if name.startswith("t_feather.R"):
        return "tail.R"
    if name.endswith(".L") and name.startswith(("pelvis", "thigh", "shin", "foot", "toe", "toes_parent", "t_ring", "t_index", "t_middle", "t_thumb")):
        return "leg.L"
    if name.endswith(".R") and name.startswith(("pelvis", "thigh", "shin", "foot", "toe", "toes_parent", "t_ring", "t_index", "t_middle", "t_thumb")):
        return "leg.R"
    if name in {"shoulder.L", "Wing.L"}:
        return "wing.shoulder.L"
    if name == "Wing.001.L":
        return "wing.inner.L"
    if name == "Wing.002.L" or (name.startswith("w_feather") and name.endswith(".L")):
        return "wing.outer.L"
    if name.startswith("w_feather") and ".L_end" in name:
        return "wing.tip.L"
    if name in {"shoulder.R", "Wing.R"}:
        return "wing.shoulder.R"
    if name == "Wing.001.R":
        return "wing.inner.R"
    if name == "Wing.002.R" or (name.startswith("w_feather") and name.endswith(".R")):
        return "wing.outer.R"
    if name.startswith("w_feather") and ".R_end" in name:
        return "wing.tip.R"
    if name.startswith(("neck", "n_feather", "skull")):
        return "neck"
    if name.startswith(("head", "beak", "tongue", "eye")):
        return "head"
    if name in {"spine.005", "spine.006"}:
        return "chest"
    return "root"


def configure_material():
    material = bpy.data.materials.new("Seagull_Feather_PBR")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.74
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["IOR"].default_value = 1.46
    shader.inputs["Coat Weight"].default_value = 0.08
    shader.inputs["Coat Roughness"].default_value = 0.48
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    albedo_image = bpy.data.images.load(str(SOURCE_ALBEDO), check_existing=True)
    albedo_image.colorspace_settings.name = "sRGB"
    albedo = nodes.new("ShaderNodeTexImage")
    albedo.image = albedo_image
    albedo.interpolation = "Linear"
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    return material


def evaluated_positions(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


def max_distance(first, second):
    return max(((a - b).length for a, b in zip(first, second)), default=0.0)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.scene.render.fps = 60
    import_fbx(SOURCE_FBX)

    source_mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    source_rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    source_mesh.name = "SOURCE_Seagull_High"
    source_rig.name = "SOURCE_Seagull_Rig_162"
    if source_rig.animation_data:
        source_rig.animation_data_clear()
    source_rig.data.pose_position = "REST"
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    source_vertices_world = [source_mesh.matrix_world @ vertex.co for vertex in source_mesh.data.vertices]
    raw_min = Vector((
        min(vertex.x for vertex in source_vertices_world),
        min(vertex.y for vertex in source_vertices_world),
        min(vertex.z for vertex in source_vertices_world),
    ))
    raw_max = Vector((
        max(vertex.x for vertex in source_vertices_world),
        max(vertex.y for vertex in source_vertices_world),
        max(vertex.z for vertex in source_vertices_world),
    ))
    anchor_bone = source_rig.data.bones.get("spine.004") or source_rig.data.bones[0]
    anchor = source_rig.matrix_world @ anchor_bone.head_local
    scale_forward = TARGET_BODY_LENGTH / max(1e-6, raw_max.y - raw_min.y)
    scale_up = TARGET_HEIGHT / max(1e-6, raw_max.z - raw_min.z)
    scale_wing = TARGET_WINGSPAN / max(1e-6, raw_max.x - raw_min.x)

    def transform_point(world):
        relative = world - anchor
        # Author in Blender's conventional Z-up space. The glTF exporter maps
        # (X, Y, Z) to runtime (X, Z, -Y), yielding +X forward, +Y up and
        # wings spread across runtime Z.
        return Vector((
            -relative.y * scale_forward,
            -relative.x * scale_wing,
            relative.z * scale_up,
        ))

    source_collection = bpy.data.collections.new("SOURCE_REFERENCE")
    bpy.context.scene.collection.children.link(source_collection)
    for obj in (source_mesh, source_rig):
        link_only(obj, source_collection)
        obj.hide_render = True
        obj.hide_set(True)
    source_collection.hide_render = True
    source_collection.hide_viewport = True

    web_collection = bpy.data.collections.new("WEB_ASSET")
    bpy.context.scene.collection.children.link(web_collection)
    web_mesh_data = source_mesh.data.copy()
    web_mesh_data.name = "seagull_web_mesh"
    web_mesh = bpy.data.objects.new("seagull_web", web_mesh_data)
    web_collection.objects.link(web_mesh)
    for vertex in web_mesh_data.vertices:
        world = source_mesh.matrix_world @ vertex.co
        vertex.co = transform_point(world)
    web_mesh_data.update(calc_edges=True, calc_edges_loose=True)

    source_group_names = {group.index: group.name for group in source_mesh.vertex_groups}
    accumulated_weights = []
    for vertex in source_mesh.data.vertices:
        weights = {}
        for assignment in vertex.groups:
            compact = compact_group_name(source_group_names[assignment.group])
            weights[compact] = weights.get(compact, 0.0) + assignment.weight
        if not weights:
            weights = {"root": 1.0}
        strongest = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:MAX_INFLUENCES]
        total = sum(weight for _, weight in strongest)
        accumulated_weights.append([(name, weight / total) for name, weight in strongest])

    compact_names = [
        "root", "chest", "neck", "head",
        "wing.shoulder.L", "wing.inner.L", "wing.outer.L", "wing.tip.L",
        "wing.shoulder.R", "wing.inner.R", "wing.outer.R", "wing.tip.R",
        "tail.L", "tail.R", "leg.L", "leg.R",
    ]
    output_groups = {name: web_mesh.vertex_groups.new(name=name) for name in compact_names}
    rigid_leg_vertices = 0
    for vertex_index, assignments in enumerate(accumulated_weights):
        lower_leg_assignments = [
            (name, weight)
            for name, weight in assignments
            if name in {"leg.L", "leg.R"} and weight > 0.045
        ]
        if web_mesh_data.vertices[vertex_index].co.z < -0.035 and lower_leg_assignments:
            assignments = [max(lower_leg_assignments, key=lambda item: item[1])]
            rigid_leg_vertices += 1
        for name, weight in assignments:
            output_groups[name].add([vertex_index], weight, "REPLACE")

    material = configure_material()
    web_mesh.data.materials.clear()
    web_mesh.data.materials.append(material)
    web_mesh.select_set(True)
    bpy.context.view_layer.objects.active = web_mesh
    decimate = web_mesh.modifiers.new("Web_LOD_Collapse", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = DECIMATE_RATIO
    decimate.use_collapse_triangulate = True
    if hasattr(decimate, "delimit"):
        decimate.delimit = {"UV", "MATERIAL", "SEAM"}
    bpy.ops.object.modifier_apply(modifier=decimate.name)

    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=MAX_INFLUENCES)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

    compact_armature = bpy.data.armatures.new("seagull_flight_rig")
    compact_rig = bpy.data.objects.new("seagull_flight_rig", compact_armature)
    web_collection.objects.link(compact_rig)
    compact_rig.show_in_front = True
    compact_rig.display_type = "WIRE"
    bpy.context.view_layer.objects.active = compact_rig
    compact_rig.select_set(True)
    web_mesh.select_set(False)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone_point(name, endpoint="head"):
        bone = source_rig.data.bones.get(name)
        if not bone:
            raise RuntimeError(f"Missing source bone: {name}")
        source_point = bone.head_local if endpoint == "head" else bone.tail_local
        return transform_point(source_rig.matrix_world @ source_point)

    def add_bone(name, head, tail, parent=None):
        bone = compact_armature.edit_bones.new(name)
        bone.head = head
        bone.tail = tail if (tail - head).length > 1e-5 else head + Vector((0.02, 0, 0))
        bone.parent = parent
        bone.use_connect = bool(parent and (bone.head - parent.tail).length < 1e-5)
        bone.use_deform = True
        return bone

    root = add_bone("root", bone_point("spine", "head"), bone_point("spine.004", "head"))
    chest = add_bone("chest", root.tail, bone_point("spine.006", "tail"), root)
    neck = add_bone("neck", chest.tail, bone_point("head", "head"), chest)
    head = add_bone("head", neck.tail, bone_point("beak.002.T", "tail"), neck)

    left_points = [
        bone_point("Wing.L", "head"),
        bone_point("Wing.001.L", "head"),
        bone_point("Wing.002.L", "head"),
        bone_point("w_feather.001.L_end", "head"),
        Vector((
            bone_point("w_feather.001.L_end", "tail").x,
            -TARGET_WINGSPAN * 0.5,
            bone_point("w_feather.001.L_end", "tail").z,
        )),
    ]
    right_points = [Vector((point.x, -point.y, point.z)) for point in left_points]
    wing_l_shoulder = add_bone("wing.shoulder.L", left_points[0], left_points[1], chest)
    wing_l_inner = add_bone("wing.inner.L", left_points[1], left_points[2], wing_l_shoulder)
    wing_l_outer = add_bone("wing.outer.L", left_points[2], left_points[3], wing_l_inner)
    add_bone("wing.tip.L", left_points[3], left_points[4], wing_l_outer)
    wing_r_shoulder = add_bone("wing.shoulder.R", right_points[0], right_points[1], chest)
    wing_r_inner = add_bone("wing.inner.R", right_points[1], right_points[2], wing_r_shoulder)
    wing_r_outer = add_bone("wing.outer.R", right_points[2], right_points[3], wing_r_inner)
    add_bone("wing.tip.R", right_points[3], right_points[4], wing_r_outer)

    add_bone("tail.L", bone_point("t_feather.L", "head"), bone_point("t_feather.L_end", "tail"), root)
    add_bone("tail.R", bone_point("t_feather.R", "head"), bone_point("t_feather.R_end", "tail"), root)
    add_bone("leg.L", bone_point("thigh.L", "head"), bone_point("foot.L", "tail"), root)
    add_bone("leg.R", bone_point("thigh.R", "head"), bone_point("foot.R", "tail"), root)
    bpy.ops.object.mode_set(mode="OBJECT")

    armature_modifier = web_mesh.modifiers.new("Seagull_Flight_Rig", "ARMATURE")
    armature_modifier.object = compact_rig
    web_mesh.parent = compact_rig
    web_mesh.matrix_parent_inverse = compact_rig.matrix_world.inverted()

    web_mesh.data.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(web_mesh.data)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    influence_counts = []
    weight_errors = []
    for vertex in web_mesh.data.vertices:
        weights = [assignment.weight for assignment in vertex.groups if assignment.weight > 1e-8]
        influence_counts.append(len(weights))
        weight_errors.append(abs(sum(weights) - 1.0))

    rest_positions = evaluated_positions(web_mesh)
    for name, angle in (
        ("wing.shoulder.L", 0.72),
        ("wing.inner.L", -0.24),
        ("wing.shoulder.R", -0.72),
        ("wing.inner.R", 0.24),
    ):
        pose_bone = compact_rig.pose.bones[name]
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler.x = angle
    deformed_positions = evaluated_positions(web_mesh)
    deformation_probe = max_distance(rest_positions, deformed_positions)
    for pose_bone in compact_rig.pose.bones:
        pose_bone.matrix_basis.identity()
    restored_positions = evaluated_positions(web_mesh)
    restore_error = max_distance(rest_positions, restored_positions)

    runtime_vertices = [Vector((vertex.co.x, vertex.co.z, -vertex.co.y)) for vertex in web_mesh.data.vertices]
    web_bounds_min = Vector((
        min(vertex.x for vertex in runtime_vertices),
        min(vertex.y for vertex in runtime_vertices),
        min(vertex.z for vertex in runtime_vertices),
    ))
    web_bounds_max = Vector((
        max(vertex.x for vertex in runtime_vertices),
        max(vertex.y for vertex in runtime_vertices),
        max(vertex.z for vertex in runtime_vertices),
    ))

    web_mesh["asset_role"] = "procedural_flight_mesh"
    web_mesh["forward_axis"] = "+X"
    compact_rig["asset_role"] = "compact_flight_rig"
    compact_rig["wingbeat_frequency_hz"] = 4.04

    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)

    report = {
        "source": {
            "file": "assets-source/seagull/source/seagull-fly-source.fbx",
            "license": "Creazilla Open-Source License",
            "vertices": len(source_mesh.data.vertices),
            "triangles": 8765,
            "bones": 162,
            "vertexGroups": 89,
            "maxInfluences": 9,
            "unweightedVertices": 6,
            "maxWeightError": 0.9635719368234277,
        },
        "web": {
            "object": web_mesh.name,
            "rig": compact_rig.name,
            "vertices": len(web_mesh.data.vertices),
            "triangles": len(web_mesh.data.loop_triangles),
            "bones": len(compact_armature.bones),
            "boneNames": [bone.name for bone in compact_armature.bones],
            "maxInfluences": max(influence_counts, default=0),
            "maxWeightError": max(weight_errors, default=0.0),
            "rigidLowerLegVertices": rigid_leg_vertices,
            "nonManifoldEdges": non_manifold_edges,
            "deformationProbeMeters": deformation_probe,
            "neutralRestoreError": restore_error,
            "wingspanMeters": TARGET_WINGSPAN,
            "bodyLengthMeters": TARGET_BODY_LENGTH,
            "bounds": {"min": list(web_bounds_min), "max": list(web_bounds_max)},
            "forwardAxis": "+X",
            "upAxis": "+Y",
            "authoringAxes": {"forward": "+X", "up": "+Z", "wing": "+/-Y"},
            "material": material.name,
            "decimateRatio": DECIMATE_RATIO,
        },
    }
    OUTPUT_MANIFEST.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
