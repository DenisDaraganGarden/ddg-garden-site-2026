import json
import math
import os
import sys
from pathlib import Path

import bpy


def import_fbx(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if hasattr(bpy.ops.wm, "fbx_import"):
        bpy.ops.wm.fbx_import(filepath=str(path))
    else:
        bpy.ops.import_scene.fbx(filepath=str(path))


def finite_vector(values):
    return all(math.isfinite(value) for value in values)


def mesh_report(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    group_sizes = []
    weight_errors = []
    for vertex in mesh.vertices:
        weights = [item.weight for item in vertex.groups if item.weight > 1e-8]
        group_sizes.append(len(weights))
        if weights:
            weight_errors.append(abs(sum(weights) - 1.0))

    material_names = [slot.material.name if slot.material else None for slot in obj.material_slots]
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "uvLayers": [layer.name for layer in mesh.uv_layers],
        "colorAttributes": [layer.name for layer in mesh.color_attributes],
        "materials": material_names,
        "vertexGroups": len(obj.vertex_groups),
        "vertexGroupNames": [group.name for group in obj.vertex_groups],
        "maxInfluences": max(group_sizes, default=0),
        "unweightedVertices": sum(1 for size in group_sizes if size == 0),
        "maxWeightError": max(weight_errors, default=0.0),
        "shapeKeys": list(mesh.shape_keys.key_blocks.keys()) if mesh.shape_keys else [],
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "target": getattr(getattr(modifier, "object", None), "name", None),
            }
            for modifier in obj.modifiers
        ],
        "dimensions": list(obj.dimensions),
        "locationFinite": finite_vector(obj.location),
    }


def armature_report(obj):
    bones = list(obj.data.bones)
    role_names = {
        "spine": [bone.name for bone in bones if bone.name.startswith(("spine", "neck", "head"))],
        "leftWing": [bone.name for bone in bones if ".L" in bone.name and ("Wing" in bone.name or "w_feather" in bone.name)],
        "rightWing": [bone.name for bone in bones if ".R" in bone.name and ("Wing" in bone.name or "w_feather" in bone.name)],
        "tail": [bone.name for bone in bones if bone.name.startswith("t_feather")],
        "legs": [bone.name for bone in bones if bone.name.startswith(("thigh", "shin", "foot", "toe", "toes_parent", "t_ring", "t_index", "t_middle", "t_thumb"))],
    }
    return {
        "name": obj.name,
        "boneCount": len(bones),
        "deformBoneCount": sum(1 for bone in bones if bone.use_deform),
        "rootBones": [bone.name for bone in bones if bone.parent is None],
        "roles": role_names,
        "dimensions": list(obj.dimensions),
    }


def pose_samples(armature):
    sample_names = [
        "spine",
        "head",
        "Wing.L",
        "Wing.001.L",
        "Wing.002.L",
        "w_feather.001.L_end_end",
        "Wing.R",
        "Wing.001.R",
        "Wing.002.R",
        "w_feather.001.R_end_end",
        "t_feather.L_end_end_end",
        "t_feather.R_end_end_end",
    ]
    samples = []
    for frame in (1, 13, 25, 38, 50, 63, 75, 88, 100):
        bpy.context.scene.frame_set(frame)
        bones = {}
        for name in sample_names:
            bone = armature.pose.bones.get(name)
            if bone:
                bones[name] = {
                    "head": list(armature.matrix_world @ bone.head),
                    "tail": list(armature.matrix_world @ bone.tail),
                    "quaternionNorm": bone.matrix.to_quaternion().magnitude,
                }
        samples.append({"frame": frame, "bones": bones})
    return samples


def action_pose_samples(armature):
    if not armature.animation_data:
        armature.animation_data_create()
    original_action = armature.animation_data.action
    reports = {}
    for action in bpy.data.actions:
        try:
            armature.animation_data.action = action
            reports[action.name] = pose_samples(armature)
        except Exception as error:
            reports[action.name] = {"error": str(error)}
    armature.animation_data.action = original_action
    return reports


def action_report(action):
    report = {
        "name": action.name,
        "frameRange": list(action.frame_range),
        "slots": len(getattr(action, "slots", [])),
        "fcurves": 0,
        "keyframes": 0,
    }
    fcurves = getattr(action, "fcurves", None)
    if fcurves is not None:
        report["fcurves"] = len(fcurves)
        report["keyframes"] = sum(len(curve.keyframe_points) for curve in fcurves)
    return report


def material_report(material):
    images = []
    if material.use_nodes and material.node_tree:
        for node in material.node_tree.nodes:
            image = getattr(node, "image", None)
            if image:
                images.append({
                    "name": image.name,
                    "filepath": image.filepath,
                    "size": list(image.size),
                })
    return {
        "name": material.name,
        "useNodes": material.use_nodes,
        "blendMethod": getattr(material, "surface_render_method", None),
        "images": images,
    }


def inspect(path):
    import_fbx(path)
    meshes = [mesh_report(obj) for obj in bpy.context.scene.objects if obj.type == "MESH"]
    armatures = [armature_report(obj) for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    links = []
    for obj in bpy.context.scene.objects:
        animation = obj.animation_data
        if animation and animation.action:
            links.append({"object": obj.name, "action": animation.action.name})
    return {
        "source": str(path),
        "scene": {
            "fps": bpy.context.scene.render.fps,
            "frameStart": bpy.context.scene.frame_start,
            "frameEnd": bpy.context.scene.frame_end,
            "unitSystem": bpy.context.scene.unit_settings.system,
            "scaleLength": bpy.context.scene.unit_settings.scale_length,
        },
        "objectCount": len(bpy.context.scene.objects),
        "objectTypes": {
            kind: sum(1 for obj in bpy.context.scene.objects if obj.type == kind)
            for kind in sorted({obj.type for obj in bpy.context.scene.objects})
        },
        "meshes": meshes,
        "totals": {
            "vertices": sum(mesh["vertices"] for mesh in meshes),
            "triangles": sum(mesh["triangles"] for mesh in meshes),
        },
        "armatures": armatures,
        "actions": [action_report(action) for action in bpy.data.actions],
        "actionLinks": links,
        "poseSamples": pose_samples(next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)) if armatures else [],
        "actionPoseSamples": action_pose_samples(next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)) if armatures else {},
        "materials": [material_report(material) for material in bpy.data.materials],
    }


def main():
    paths = [Path(argument).expanduser().resolve() for argument in sys.argv[sys.argv.index("--") + 1:]]
    report = [inspect(path) for path in paths]
    output_path = os.environ.get("SEAGULL_REPORT_PATH")
    if output_path:
        Path(output_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("SEAGULL_SOURCE_REPORT_BEGIN")
    print(json.dumps(report, indent=2))
    print("SEAGULL_SOURCE_REPORT_END")


if __name__ == "__main__":
    main()
